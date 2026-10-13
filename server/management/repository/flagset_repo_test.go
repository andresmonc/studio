package repository_test

import (
	"encoding/json"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFlagsetRepoCRUD(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagsetRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme", nil)
	team := testutil.SeedTeam(t, db, company.ID, "Platform")

	created, err := repo.Create(ctx, team.ID, &model.CreateFlagsetRequest{
		Name:                        "prod",
		Description:                 "production",
		PollingIntervalMs:           new(3000),
		EvaluationContextEnrichment: json.RawMessage(`{"env":"prod"}`),
	})
	require.NoError(t, err)
	assert.NotEmpty(t, created.ID)
	assert.Equal(t, "prod", created.Name)
	assert.Equal(t, 0, created.APIKeyCount)
	require.NotNil(t, created.PollingIntervalMs)
	assert.Equal(t, 3000, *created.PollingIntervalMs)
	assert.JSONEq(t, `{"env":"prod"}`, string(created.EvaluationContextEnrichment))

	got, err := repo.GetByID(ctx, created.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, created.ID, got.ID)

	missing, err := repo.GetByID(ctx, "00000000-0000-0000-0000-000000000000")
	require.NoError(t, err)
	assert.Nil(t, missing)

	_ = testutil.SeedFlagset(t, db, team.ID, "staging")
	list, err := repo.ListByTeam(ctx, team.ID)
	require.NoError(t, err)
	assert.Len(t, list, 2)
	assert.Equal(t, "prod", list[0].Name, "ordered by name")

	updated, err := repo.Update(ctx, created.ID, &model.UpdateFlagsetRequest{Description: new("updated")})
	require.NoError(t, err)
	assert.Equal(t, "updated", updated.Description)
	assert.Equal(t, "prod", updated.Name, "nil name preserved")

	_, err = repo.Update(ctx, "00000000-0000-0000-0000-000000000000", &model.UpdateFlagsetRequest{Name: new("x")})
	assert.ErrorIs(t, err, repository.ErrNotFound)

	// Go's JSON accepts a lone surrogate, Postgres jsonb rejects it (22P02):
	// that must surface as the pg error, not as not found.
	_, err = repo.Update(ctx, created.ID, &model.UpdateFlagsetRequest{Notifiers: json.RawMessage(`{"x":"\ud800"}`)})
	var pgErr *pgconn.PgError
	require.ErrorAs(t, err, &pgErr)
	assert.Equal(t, "22P02", pgErr.Code)

	require.NoError(t, repo.SoftDelete(ctx, created.ID))
	assert.ErrorIs(t, repo.SoftDelete(ctx, created.ID), repository.ErrNotFound)
}

// TestFlagsetRepoSoftDelete: deleting a flagset retains it and its flags as
// soft-deleted rows, hides them from reads, revokes the API keys and frees the
// name for reuse.
func TestFlagsetRepoSoftDelete(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagsetRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme", nil)
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)
	fs := testutil.SeedFlagset(t, db, team.ID, "prod")
	flag := testutil.SeedFlag(t, db, fs.ID, "my-flag", nil, nil)
	_, err := repo.InsertAPIKey(ctx, fs.ID, "sdk", "key-123", user.ID)
	require.NoError(t, err)

	require.NoError(t, repo.SoftDelete(ctx, fs.ID))

	got, err := repo.GetByID(ctx, fs.ID)
	require.NoError(t, err)
	assert.Nil(t, got)
	list, err := repo.ListByTeam(ctx, team.ID)
	require.NoError(t, err)
	assert.Empty(t, list)
	_, err = repo.Update(ctx, fs.ID, &model.UpdateFlagsetRequest{Description: new("x")})
	assert.ErrorIs(t, err, repository.ErrNotFound)

	var fsDeleted, flagDeleted bool
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT deleted_at IS NOT NULL FROM flagsets WHERE id = $1`, fs.ID).Scan(&fsDeleted))
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT deleted_at IS NOT NULL FROM flags WHERE id = $1`, flag.ID).Scan(&flagDeleted))
	assert.True(t, fsDeleted, "flagset row retained")
	assert.True(t, flagDeleted, "flag row retained, soft-deleted")

	var keyCount int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM flagset_api_keys WHERE flagset_id = $1`, fs.ID).Scan(&keyCount))
	assert.Zero(t, keyCount, "api keys revoked")

	_, err = repo.Create(ctx, team.ID, &model.CreateFlagsetRequest{Name: "prod"})
	assert.NoError(t, err, "deleted flagset's name can be reused")
}

func TestFlagsetRepoAPIKeys(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagsetRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme", nil)
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)
	fs := testutil.SeedFlagset(t, db, team.ID, "prod")

	key, err := repo.InsertAPIKey(ctx, fs.ID, "ci", "secret-key", user.ID)
	require.NoError(t, err)
	assert.NotEmpty(t, key.ID)
	assert.Equal(t, "secret-key", key.APIKey)

	// api_key_count is reflected on the flagset.
	withKey, err := repo.GetByID(ctx, fs.ID)
	require.NoError(t, err)
	assert.Equal(t, 1, withKey.APIKeyCount)

	keys, err := repo.ListAPIKeys(ctx, fs.ID)
	require.NoError(t, err)
	require.Len(t, keys, 1)
	assert.Equal(t, "U", keys[0].CreatedByName)

	owner, err := repo.GetAPIKeyFlagset(ctx, key.ID)
	require.NoError(t, err)
	assert.Equal(t, fs.ID, owner)

	_, err = repo.GetAPIKeyFlagset(ctx, "00000000-0000-0000-0000-000000000000")
	assert.ErrorIs(t, err, repository.ErrNotFound)

	require.NoError(t, repo.DeleteAPIKeyByID(ctx, key.ID))
	assert.ErrorIs(t, repo.DeleteAPIKeyByID(ctx, key.ID), repository.ErrNotFound)
}
