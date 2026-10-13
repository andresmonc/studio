package repository

import (
	"context"
	"errors"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/jackc/pgx/v5"
)

type FlagsetRepo struct{ db *DB }

func NewFlagsetRepo(db *DB) *FlagsetRepo { return &FlagsetRepo{db: db} }

const flagsetCols = `id, team_id, name, description, (SELECT COUNT(*) FROM flagset_api_keys k WHERE k.flagset_id = flagsets.id) AS api_key_count, (SELECT COUNT(*) FROM flags f WHERE f.flagset_id = flagsets.id AND f.deleted_at IS NULL) AS flag_count, (SELECT COUNT(*) FROM flags f WHERE f.flagset_id = flagsets.id AND f.deleted_at IS NULL AND f.disabled = FALSE) AS enabled_flag_count, polling_interval_ms, file_format, retrievers, exporters, notifiers, evaluation_context_enrichment, default_testing_evaluation_context, created_at, updated_at`

func scanFlagset(row pgx.Row, fs *model.Flagset) error {
	return row.Scan(
		&fs.ID, &fs.TeamID, &fs.Name, &fs.Description, &fs.APIKeyCount, &fs.FlagCount, &fs.EnabledFlagCount, &fs.PollingIntervalMs, &fs.FileFormat,
		&fs.Retrievers, &fs.Exporters, &fs.Notifiers, &fs.EvaluationContextEnrichment, &fs.DefaultTestingEvaluationContext, &fs.CreatedAt, &fs.UpdatedAt,
	)
}

func (r *FlagsetRepo) Create(ctx context.Context, teamID string, req *model.CreateFlagsetRequest) (*model.Flagset, error) {
	var fs model.Flagset
	err := scanFlagset(r.db.Pool.QueryRow(ctx, `
		INSERT INTO flagsets (team_id, name, description, polling_interval_ms, file_format, retrievers, exporters, notifiers, evaluation_context_enrichment, default_testing_evaluation_context)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		RETURNING `+flagsetCols,
		teamID, req.Name, req.Description, req.PollingIntervalMs, req.FileFormat,
		marshalAny(req.Retrievers), marshalAny(req.Exporters), marshalAny(req.Notifiers),
		marshalAny(req.EvaluationContextEnrichment), marshalAny(req.DefaultTestingEvaluationContext),
	), &fs)
	if err != nil {
		return nil, err
	}
	return &fs, nil
}

func (r *FlagsetRepo) GetByID(ctx context.Context, id string) (*model.Flagset, error) {
	var fs model.Flagset
	err := scanFlagset(r.db.Pool.QueryRow(ctx,
		`SELECT `+flagsetCols+` FROM flagsets WHERE id = $1 AND deleted_at IS NULL`, id,
	), &fs)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}
	return &fs, nil
}

func (r *FlagsetRepo) ListByTeam(ctx context.Context, teamID string) ([]model.Flagset, error) {
	rows, err := r.db.Pool.Query(ctx,
		`SELECT `+flagsetCols+` FROM flagsets WHERE team_id = $1 AND deleted_at IS NULL ORDER BY name`, teamID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[model.Flagset])
}

func (r *FlagsetRepo) Update(ctx context.Context, id string, req *model.UpdateFlagsetRequest) (*model.Flagset, error) {
	var fs model.Flagset
	err := scanFlagset(r.db.Pool.QueryRow(ctx, `
		UPDATE flagsets SET
			name = COALESCE($2, name),
			description = COALESCE($3, description),
			polling_interval_ms = COALESCE($4, polling_interval_ms),
			file_format = COALESCE($5, file_format),
			retrievers = COALESCE($6, retrievers),
			exporters = COALESCE($7, exporters),
			notifiers = COALESCE($8, notifiers),
			evaluation_context_enrichment = COALESCE($9, evaluation_context_enrichment),
			default_testing_evaluation_context = COALESCE($10, default_testing_evaluation_context),
			updated_at = NOW()
		WHERE id = $1 AND deleted_at IS NULL
		RETURNING `+flagsetCols,
		id, req.Name, req.Description, req.PollingIntervalMs, req.FileFormat,
		marshalAny(req.Retrievers), marshalAny(req.Exporters), marshalAny(req.Notifiers),
		marshalAny(req.EvaluationContextEnrichment), marshalAny(req.DefaultTestingEvaluationContext),
	), &fs)
	if err != nil {
		// Not isNoRows: 22P02 here is usually invalid jsonb input, not a bad id.
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &fs, nil
}

// SoftDelete marks the flagset and all its live flags deleted in one
// transaction, so the flags are retained (not cascaded away) but disappear from
// every read path and from the goff_flags view. API keys are credentials, so
// they are revoked for real.
func (r *FlagsetRepo) SoftDelete(ctx context.Context, id string) error {
	return pgx.BeginFunc(ctx, r.db.Pool, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx,
			`UPDATE flagsets SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, id)
		if err != nil {
			if isNoRows(err) {
				return ErrNotFound
			}
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		// Same tag-mirror hygiene as FlagRepo.SoftDelete.
		if _, err := tx.Exec(ctx,
			`DELETE FROM flag_tags WHERE flag_id IN (SELECT id FROM flags WHERE flagset_id = $1 AND deleted_at IS NULL)`, id); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx,
			`UPDATE flags SET deleted_at = NOW(), updated_at = NOW() WHERE flagset_id = $1 AND deleted_at IS NULL`, id); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `DELETE FROM flagset_api_keys WHERE flagset_id = $1`, id)
		return err
	})
}

func (r *FlagsetRepo) InsertAPIKey(ctx context.Context, flagsetID, label, apiKey, createdBy string) (*model.FlagsetAPIKey, error) {
	var k model.FlagsetAPIKey
	err := r.db.Pool.QueryRow(ctx, `
		INSERT INTO flagset_api_keys (flagset_id, label, api_key, created_by)
		VALUES ($1,$2,$3,$4)
		RETURNING id, flagset_id, label, api_key, created_by, created_at`,
		flagsetID, label, apiKey, createdBy,
	).Scan(&k.ID, &k.FlagsetID, &k.Label, &k.APIKey, &k.CreatedBy, &k.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &k, nil
}

func (r *FlagsetRepo) ListAPIKeys(ctx context.Context, flagsetID string) ([]model.FlagsetAPIKey, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT k.id, k.flagset_id, k.label, k.api_key, k.created_by, COALESCE(u.name, '') AS created_by_name, k.created_at
		FROM flagset_api_keys k
		LEFT JOIN users u ON u.id = k.created_by
		WHERE k.flagset_id = $1 ORDER BY k.created_at DESC`, flagsetID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[model.FlagsetAPIKey])
}

// GetAPIKeyFlagset returns the flagset id owning the given key (for authz/existence).
func (r *FlagsetRepo) GetAPIKeyFlagset(ctx context.Context, keyID string) (string, error) {
	var flagsetID string
	err := r.db.Pool.QueryRow(ctx, `SELECT flagset_id FROM flagset_api_keys WHERE id = $1`, keyID).Scan(&flagsetID)
	if err != nil {
		if isNoRows(err) {
			return "", ErrNotFound
		}
		return "", err
	}
	return flagsetID, nil
}

func (r *FlagsetRepo) DeleteAPIKeyByID(ctx context.Context, keyID string) error {
	return r.db.execOne(ctx, `DELETE FROM flagset_api_keys WHERE id = $1`, keyID)
}
