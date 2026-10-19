package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// ErrFlagsetNameTaken means another live flagset in the same team has the name.
var ErrFlagsetNameTaken = errors.New("flagset name already used in this team")

type FlagsetRepo struct{ db *DB }

func NewFlagsetRepo(db *DB) *FlagsetRepo { return &FlagsetRepo{db: db} }

const flagsetCols = `id, team_id, name, description,
	(SELECT COUNT(*) FROM flagset_api_keys k WHERE k.flagset_id = flagsets.id) AS api_key_count,
	(SELECT COUNT(*) FROM flags f WHERE f.flagset_id = flagsets.id AND f.deleted_at IS NULL) AS flag_count,
	(SELECT COUNT(*) FROM flags f
	 WHERE f.flagset_id = flagsets.id AND f.deleted_at IS NULL AND f.disabled = FALSE) AS enabled_flag_count,
	evaluation_context_enrichment, default_testing_evaluation_context, created_at, updated_at`

func scanFlagset(row pgx.Row, fs *model.Flagset) error {
	return row.Scan(
		&fs.ID, &fs.TeamID, &fs.Name, &fs.Description, &fs.APIKeyCount, &fs.FlagCount, &fs.EnabledFlagCount,
		&fs.EvaluationContextEnrichment, &fs.DefaultTestingEvaluationContext, &fs.CreatedAt, &fs.UpdatedAt,
	)
}

func mapFlagsetNameTaken(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.ConstraintName == "flagsets_team_name_live_unique" {
		return ErrFlagsetNameTaken
	}
	return err
}

func (r *FlagsetRepo) Create(
	ctx context.Context, teamID string, req *model.CreateFlagsetRequest,
) (*model.Flagset, error) {
	return createFlagset(ctx, r.db.Pool, teamID, req)
}

// CreateWithAPIKey creates the flagset and its first API key in one
// transaction, so a failed key insert leaves no key-less flagset (whose name
// would then block a retry).
func (r *FlagsetRepo) CreateWithAPIKey(
	ctx context.Context, teamID string, req *model.CreateFlagsetRequest, label, apiKey, createdBy string,
) (*model.Flagset, *model.FlagsetAPIKey, error) {
	var fs *model.Flagset
	var k *model.FlagsetAPIKey
	err := pgx.BeginFunc(ctx, r.db.Pool, func(tx pgx.Tx) error {
		var err error
		if fs, err = createFlagset(ctx, tx, teamID, req); err != nil {
			return err
		}
		k, err = insertAPIKey(ctx, tx, fs.ID, label, apiKey, createdBy)
		return err
	})
	if err != nil {
		return nil, nil, err
	}
	fs.APIKeyCount = 1
	return fs, k, nil
}

func createFlagset(
	ctx context.Context, q queryRower, teamID string, req *model.CreateFlagsetRequest,
) (*model.Flagset, error) {
	j, err := flagsetJSON(req.EvaluationContextEnrichment, req.DefaultTestingEvaluationContext)
	if err != nil {
		return nil, err
	}
	var fs model.Flagset
	err = scanFlagset(q.QueryRow(ctx, `
		INSERT INTO flagsets (team_id, name, description, evaluation_context_enrichment,
		                      default_testing_evaluation_context)
		VALUES ($1,$2,$3,$4,$5)
		RETURNING `+flagsetCols,
		teamID, req.Name, req.Description, j[0], j[1],
	), &fs)
	if err != nil {
		return nil, mapFlagsetNameTaken(err)
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
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &fs, nil
}

// TeamID returns the team owning the live flagset, without the counts
// flagsetCols computes: RBAC and audit only need the team.
func (r *FlagsetRepo) TeamID(ctx context.Context, id string) (string, error) {
	var teamID string
	err := r.db.Pool.QueryRow(ctx,
		`SELECT team_id FROM flagsets WHERE id = $1 AND deleted_at IS NULL`, id).Scan(&teamID)
	if isNoRows(err) {
		return "", ErrNotFound
	}
	return teamID, err
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
	j, err := flagsetJSON(req.EvaluationContextEnrichment, req.DefaultTestingEvaluationContext)
	if err != nil {
		return nil, err
	}
	// An absent JSON setting (empty RawMessage) leaves the column unchanged; an
	// explicit null clears it.
	var fs model.Flagset
	err = scanFlagset(r.db.Pool.QueryRow(ctx, `
		UPDATE flagsets SET
			name = COALESCE($2, name),
			description = COALESCE($3, description),
			evaluation_context_enrichment = CASE WHEN $4 THEN $5 ELSE evaluation_context_enrichment END,
			default_testing_evaluation_context = CASE WHEN $6 THEN $7 ELSE default_testing_evaluation_context END,
			updated_at = NOW()
		WHERE id = $1 AND deleted_at IS NULL
		RETURNING `+flagsetCols,
		id, req.Name, req.Description,
		len(req.EvaluationContextEnrichment) > 0, j[0], len(req.DefaultTestingEvaluationContext) > 0, j[1],
	), &fs)
	if err != nil {
		if isNoRows(err) {
			return nil, ErrNotFound
		}
		return nil, mapFlagsetNameTaken(err)
	}
	return &fs, nil
}

// flagsetJSONFields names the flagsetJSON arguments, in order, for errors.
var flagsetJSONFields = []string{"evaluationContextEnrichment", "defaultTestingEvaluationContext"}

// flagsetJSON encodes the flagset's JSON settings; empty or null ones become SQL
// NULL.
func flagsetJSON(raws ...json.RawMessage) ([]any, error) {
	out := make([]any, len(raws))
	errs := make([]error, 0, len(raws))
	for i, raw := range raws {
		var err error
		if out[i], err = marshalAny(raw); err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", flagsetJSONFields[i], err))
		}
	}
	if err := errors.Join(errs...); err != nil {
		return nil, fmt.Errorf("invalid flagset JSON setting: %w", err)
	}
	return out, nil
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
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		// Flags before their tags: a flag save locks the flag row and then its
		// tags, so the same order avoids a deadlock, and the later DELETE sees
		// the tags a racing save committed. flag_tags only mirrors live flags.
		rows, _ := tx.Query(ctx, `UPDATE flags SET deleted_at = NOW(), updated_at = NOW()
			WHERE flagset_id = $1 AND deleted_at IS NULL RETURNING id`, id)
		flagIDs, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM flag_tags WHERE flag_id = ANY($1::uuid[])`, flagIDs); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `DELETE FROM flagset_api_keys WHERE flagset_id = $1`, id)
		return err
	})
}

// InsertAPIKey returns ErrNotFound when the flagset is missing or deleted.
// FOR SHARE makes the insert wait for a concurrent SoftDelete and then see the
// flagset as deleted; the foreign key alone would let a key slip in after the
// delete revoked the others.
func (r *FlagsetRepo) InsertAPIKey(
	ctx context.Context, flagsetID, label, apiKey, createdBy string,
) (*model.FlagsetAPIKey, error) {
	return insertAPIKey(ctx, r.db.Pool, flagsetID, label, apiKey, createdBy)
}

func insertAPIKey(
	ctx context.Context, q queryRower, flagsetID, label, apiKey, createdBy string,
) (*model.FlagsetAPIKey, error) {
	var k model.FlagsetAPIKey
	err := q.QueryRow(ctx, `
		INSERT INTO flagset_api_keys (flagset_id, label, api_key, created_by)
		SELECT id, $2, $3, $4 FROM flagsets WHERE id = $1 AND deleted_at IS NULL FOR SHARE
		RETURNING id, flagset_id, label, api_key, created_by, created_at`,
		flagsetID, label, apiKey, createdBy,
	).Scan(&k.ID, &k.FlagsetID, &k.Label, &k.APIKey, &k.CreatedBy, &k.CreatedAt)
	if err != nil {
		if isNoRows(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &k, nil
}

func (r *FlagsetRepo) ListAPIKeys(ctx context.Context, flagsetID string) ([]model.FlagsetAPIKey, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT k.id, k.flagset_id, k.label, k.api_key, k.created_by, u.name AS created_by_name, k.created_at
		FROM flagset_api_keys k
		LEFT JOIN users u ON u.id = k.created_by
		WHERE k.flagset_id = $1 ORDER BY k.created_at DESC`, flagsetID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[model.FlagsetAPIKey])
}

// DeleteAPIKey revokes a key of the given flagset and returns it. Scoping by flagset means a
// key id from another tenant's flagset is not found rather than deleted.
func (r *FlagsetRepo) DeleteAPIKey(ctx context.Context, flagsetID, keyID string) (*model.FlagsetAPIKey, error) {
	var k model.FlagsetAPIKey
	err := r.db.Pool.QueryRow(ctx, `DELETE FROM flagset_api_keys WHERE id = $1 AND flagset_id = $2
		RETURNING id, flagset_id, label, api_key, created_by, created_at`, keyID, flagsetID,
	).Scan(&k.ID, &k.FlagsetID, &k.Label, &k.APIKey, &k.CreatedBy, &k.CreatedAt)
	if err != nil {
		if isNoRows(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &k, nil
}
