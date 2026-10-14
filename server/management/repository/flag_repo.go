package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// ErrFlagNameTaken means another live flag in the same flagset has the name.
var ErrFlagNameTaken = errors.New("flag name already used in this flagset")

type FlagRepo struct{ db *DB }

func NewFlagRepo(db *DB) *FlagRepo { return &FlagRepo{db: db} }

// Create returns ErrNotFound when the flagset is missing or deleted. FOR SHARE
// makes the insert wait for a concurrent FlagsetRepo.SoftDelete and then see
// the flagset as deleted; if the insert wins, the delete waits for tx and then
// soft-deletes the new flag too. The foreign key alone would let a live flag
// slip in under a deleted flagset.
func (r *FlagRepo) Create(ctx context.Context, tx pgx.Tx, flagsetID, name string) (*model.Flag, error) {
	var f model.Flag
	err := tx.QueryRow(ctx, `
		INSERT INTO flags (flagset_id, name)
		SELECT id, $2 FROM flagsets WHERE id = $1 AND deleted_at IS NULL FOR SHARE
		RETURNING id, flagset_id, name, current_version_id, disabled, created_at, updated_at`,
		flagsetID, name,
	).Scan(&f.ID, &f.FlagsetID, &f.Name, &f.CurrentVersionID, &f.Disabled, &f.CreatedAt, &f.UpdatedAt)
	if err != nil {
		if isNoRows(err) {
			return nil, ErrNotFound
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.ConstraintName == "flags_flagset_name_live_unique" {
			return nil, ErrFlagNameTaken
		}
		return nil, err
	}
	return &f, nil
}

func (r *FlagRepo) GetByID(ctx context.Context, id string) (*model.Flag, error) {
	return getFlag(ctx, r.db.Pool, id)
}

// GetForUpdate reads the live flag inside tx and locks its row until tx ends,
// so a save works from the current version and a concurrent delete or save
// waits. Returns (nil, nil) when the flag is missing or deleted.
func (r *FlagRepo) GetForUpdate(ctx context.Context, tx pgx.Tx, id string) (*model.Flag, error) {
	// Lock first, then read in a second statement: a single SELECT … FOR
	// UPDATE OF f that waited on the lock would re-check only the flag row and
	// keep the joined version from its old snapshot (NULL for a version
	// committed meanwhile).
	// A malformed id is returned as an error, not as not found: it aborts tx.
	tag, err := tx.Exec(ctx, `SELECT 1 FROM flags WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, id)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, nil
	}
	return getFlag(ctx, tx, id)
}

func getFlag(ctx context.Context, q queryRower, id string) (*model.Flag, error) {
	var f model.Flag
	err := q.QueryRow(ctx, `
		SELECT f.id, f.flagset_id, f.name, f.current_version_id, f.disabled, f.created_at, f.updated_at,
		       fv.payload, fv.version_number
		FROM flags f
		LEFT JOIN flag_versions fv ON fv.id = f.current_version_id
		WHERE f.id = $1 AND f.deleted_at IS NULL`, id,
	).Scan(&f.ID, &f.FlagsetID, &f.Name, &f.CurrentVersionID, &f.Disabled, &f.CreatedAt, &f.UpdatedAt,
		&f.Payload, &f.CurrentVersion)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}
	return &f, nil
}

// likeContains builds a LIKE pattern matching s as a literal substring: LIKE
// wildcards are escaped (backslash is Postgres's default LIKE escape).
func likeContains(s string) string {
	return "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(s) + "%"
}

func (r *FlagRepo) ListByFlagset(
	ctx context.Context, flagsetID string, filters model.FlagFilters,
) ([]model.FlagListItem, int, error) {
	// flagset_id is bound as $1 before these conditions, so the builder must
	// number its placeholders starting at $2.
	qb := NewQueryBuilder(1)
	if filters.Name != nil && *filters.Name != "" {
		qb.Add("f.name ILIKE $%d", likeContains(*filters.Name))
	}
	if filters.Disabled != nil {
		qb.Add("f.disabled = $%d", *filters.Disabled)
	}
	where, args := qb.Build()

	var total int
	countQ := `SELECT COUNT(*) FROM flags f WHERE f.flagset_id = $1 AND f.deleted_at IS NULL` + where
	countArgs := append([]any{flagsetID}, args...)
	if err := r.db.Pool.QueryRow(ctx, countQ, countArgs...).Scan(&total); err != nil {
		return nil, 0, err
	}

	filters.Page, filters.PageSize = model.ClampPage(filters.Page, filters.PageSize)
	limit, offset := qb.Arg(filters.PageSize), qb.Arg((filters.Page-1)*filters.PageSize)
	_, args = qb.Build()
	listQ := fmt.Sprintf(`
		SELECT f.id, f.flagset_id, f.name, fv.version_number AS current_version, f.disabled, f.updated_at
		FROM flags f
		LEFT JOIN flag_versions fv ON fv.id = f.current_version_id
		WHERE f.flagset_id = $1 AND f.deleted_at IS NULL%s
		ORDER BY f.name
		LIMIT %s OFFSET %s`, where, limit, offset)
	listArgs := append([]any{flagsetID}, args...)

	rows, err := r.db.Pool.Query(ctx, listQ, listArgs...)
	if err != nil {
		return nil, 0, err
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[model.FlagListItem])
	return out, total, err
}

// teamFlagsFrom is the shared FROM/WHERE of the team-wide flags list and its
// count; filter conditions are appended after it ($1 is the team id).
const teamFlagsFrom = `
		FROM flags f
		JOIN flagsets fs ON fs.id = f.flagset_id
		LEFT JOIN flag_versions fv ON fv.id = f.current_version_id
		LEFT JOIN users u ON u.id = fv.created_by
		WHERE fs.team_id = $1 AND f.deleted_at IS NULL`

// teamFlagOrders maps model.TeamFlagSorts keys to ORDER BY expressions; %[1]s
// is the direction. Only these fixed strings ever reach the SQL.
var teamFlagOrders = map[string]string{
	"updated": "f.updated_at %[1]s",
	"name":    "f.name %[1]s, fs.name %[1]s",
	"state":   "f.disabled %[1]s, f.name ASC", // ASC = enabled first
}

// ListByTeam returns one page of flags across every flagset of a team, enriched
// with the flagset name, type (flag_versions.flag_type) and owner (the current
// version's author), plus the total matching the filters. Tags use AND
// semantics against the flag_tags mirror.
func (r *FlagRepo) ListByTeam(
	ctx context.Context, teamID string, filters model.TeamFlagFilters,
) ([]model.FlagInstance, int, error) {
	qb := NewQueryBuilder(1)
	if len(filters.Tags) > 0 {
		// Case-insensitive, like the per-flag dedupe in model.FlagTagsFromPayload.
		qb.Add("ARRAY(SELECT lower(x) FROM unnest($%d::text[]) x)"+
			" <@ ARRAY(SELECT lower(ft.tag) FROM flag_tags ft WHERE ft.flag_id = f.id)", filters.Tags)
	}
	if filters.Name != nil && *filters.Name != "" {
		qb.Add("f.name ILIKE $%d", likeContains(*filters.Name))
	}
	if filters.FlagsetID != nil {
		qb.Add("f.flagset_id = $%d", *filters.FlagsetID)
	}
	if filters.Type != nil {
		// Same expression as the SELECT, so a version-less flag listed as
		// "unknown" is also found by that filter.
		qb.Add("COALESCE(fv.flag_type, 'unknown') = $%d", *filters.Type)
	}
	if filters.Owner != nil && !filters.Unassigned {
		qb.Add("u.name = $%d", *filters.Owner)
	}
	if filters.Disabled != nil {
		qb.Add("f.disabled = $%d", *filters.Disabled)
	}
	where, args := qb.Build()
	if filters.Unassigned {
		where += " AND u.name IS NULL"
	}
	countArgs := append([]any{teamID}, args...)

	var total int
	if err := r.db.Pool.QueryRow(ctx, `SELECT COUNT(*)`+teamFlagsFrom+where, countArgs...).Scan(&total); err != nil {
		return nil, 0, err
	}

	order, known := teamFlagOrders[filters.Sort]
	if !known {
		order, filters.Desc = teamFlagOrders["updated"], true
	}
	dir := "ASC"
	if filters.Desc {
		dir = "DESC"
	}
	// f.id breaks ties so pages never overlap or skip rows.
	order = fmt.Sprintf(order, dir) + ", f.id"

	filters.Page, filters.PageSize = model.ClampPage(filters.Page, filters.PageSize)
	limit, offset := qb.Arg(filters.PageSize), qb.Arg((filters.Page-1)*filters.PageSize)
	_, args = qb.Build()
	rows, err := r.db.Pool.Query(ctx, `
		SELECT f.id, f.flagset_id, fs.name, f.name, fv.payload, COALESCE(fv.flag_type, 'unknown'),
		       fv.version_number, f.disabled, u.name, f.updated_at`+teamFlagsFrom+where+`
		ORDER BY `+order+`
		LIMIT `+limit+` OFFSET `+offset,
		append([]any{teamID}, args...)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]model.FlagInstance, 0)
	for rows.Next() {
		var it model.FlagInstance
		var payload json.RawMessage
		if err := rows.Scan(&it.ID, &it.FlagsetID, &it.FlagsetName, &it.Name, &payload, &it.Type,
			&it.CurrentVersion, &it.Disabled, &it.Owner, &it.UpdatedAt); err != nil {
			return nil, 0, err
		}
		it.Variations, it.Distribution, it.TargetingRuleCount, it.Progressive = model.FlagSummaryFromPayload(payload)
		it.Tags = model.FlagTagsFromPayload(payload)
		out = append(out, it)
	}
	return out, total, rows.Err()
}

// ListTeamOwners returns the distinct authors of a team's current flag
// versions, sorted — the options of the flags list owner filter.
func (r *FlagRepo) ListTeamOwners(ctx context.Context, teamID string) ([]string, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT DISTINCT u.name
		FROM flags f
		JOIN flagsets fs ON fs.id = f.flagset_id
		JOIN flag_versions fv ON fv.id = f.current_version_id
		JOIN users u ON u.id = fv.created_by
		WHERE fs.team_id = $1 AND f.deleted_at IS NULL
		ORDER BY u.name`, teamID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// UpdateCurrentVersion points the flag at versionID and returns its new
// updated_at. ErrNotFound when the flag is deleted, so the caller rolls back
// instead of saving a version nobody can see.
func (r *FlagRepo) UpdateCurrentVersion(
	ctx context.Context, tx pgx.Tx, flagID, versionID string,
) (updatedAt time.Time, err error) {
	err = tx.QueryRow(ctx, `UPDATE flags SET current_version_id = $2, updated_at = NOW()
		WHERE id = $1 AND deleted_at IS NULL RETURNING updated_at`, flagID, versionID).Scan(&updatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return time.Time{}, ErrNotFound
	}
	return updatedAt, err
}

// ReplaceFlagTags rewrites the flag_tags rows for a flag to exactly the supplied
// set (the flag's current-version tags). It runs inside the caller's transaction
// so the tag mirror commits atomically with the new flag version. Passing an
// empty/nil slice clears the flag's tags.
func (r *FlagRepo) ReplaceFlagTags(ctx context.Context, tx pgx.Tx, flagID string, tags []string) error {
	if _, err := tx.Exec(ctx, `DELETE FROM flag_tags WHERE flag_id = $1`, flagID); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `INSERT INTO flag_tags (flag_id, tag) SELECT $1, unnest($2::text[])
		ON CONFLICT (flag_id, tag) DO NOTHING`, flagID, tags)
	return err
}

// ListTeamTags returns the distinct tags used across a team's non-deleted flags,
// sorted alphabetically, from the flag_tags mirror. Tags differing only in case
// are one tag (as in the ListByTeam filter); the first spelling in byte order
// is returned.
func (r *FlagRepo) ListTeamTags(ctx context.Context, teamID string) ([]string, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT DISTINCT ON (lower(ft.tag)) ft.tag
		FROM flag_tags ft
		JOIN flags f ON f.id = ft.flag_id
		JOIN flagsets fs ON fs.id = f.flagset_id
		WHERE fs.team_id = $1 AND f.deleted_at IS NULL
		ORDER BY lower(ft.tag), ft.tag COLLATE "C"`, teamID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// SetDisabled sets the flag's on/off state, inside tx when it is not nil.
func (r *FlagRepo) SetDisabled(ctx context.Context, tx pgx.Tx, flagID string, disabled bool) error {
	exec := r.db.Pool.Exec
	if tx != nil {
		exec = tx.Exec
	}
	tag, err := exec(ctx,
		`UPDATE flags SET disabled = $2, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, flagID, disabled)
	if err != nil {
		if isNoRows(err) {
			return ErrNotFound
		}
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SoftDelete marks the flag deleted and drops its flag_tags mirror rows in one
// transaction (tx, or its own when tx is nil), so a failure can't leave the
// flag deleted but report an error. The tags are dropped so the mirror and its
// index don't accumulate dead rows (reads already filter on deleted_at).
func (r *FlagRepo) SoftDelete(ctx context.Context, tx pgx.Tx, flagID string) error {
	if tx == nil {
		return pgx.BeginFunc(ctx, r.db.Pool, func(tx pgx.Tx) error { return softDeleteFlag(ctx, tx, flagID) })
	}
	return softDeleteFlag(ctx, tx, flagID)
}

func softDeleteFlag(ctx context.Context, tx pgx.Tx, flagID string) error {
	tag, err := tx.Exec(ctx,
		`UPDATE flags SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, flagID)
	if err != nil {
		if isNoRows(err) {
			return ErrNotFound
		}
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	_, err = tx.Exec(ctx, `DELETE FROM flag_tags WHERE flag_id = $1`, flagID)
	return err
}

func (r *FlagRepo) GetFlagsetID(ctx context.Context, flagID string) (string, error) {
	var fsID string
	err := r.db.Pool.QueryRow(ctx,
		`SELECT flagset_id FROM flags WHERE id = $1 AND deleted_at IS NULL`, flagID).Scan(&fsID)
	if err != nil {
		if isNoRows(err) {
			return "", ErrNotFound
		}
		return "", err
	}
	return fsID, nil
}
