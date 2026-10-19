package repository_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

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

	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")

	created, err := repo.Create(ctx, team.ID, &model.CreateFlagsetRequest{
		Name:                        "prod",
		Description:                 "production",
		EvaluationContextEnrichment: json.RawMessage(`{"env":"prod"}`),
	})
	require.NoError(t, err)
	assert.NotEmpty(t, created.ID)
	assert.Equal(t, "prod", created.Name)
	assert.Equal(t, 0, created.APIKeyCount)
	assert.JSONEq(t, `{"env":"prod"}`, string(created.EvaluationContextEnrichment))

	got, err := repo.GetByID(ctx, created.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, created.ID, got.ID)

	_, err = repo.GetByID(ctx, "00000000-0000-0000-0000-000000000000")
	assert.ErrorIs(t, err, repository.ErrNotFound)
	teamID, err := repo.TeamID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, team.ID, teamID)
	_, err = repo.TeamID(ctx, "00000000-0000-0000-0000-000000000000")
	assert.ErrorIs(t, err, repository.ErrNotFound)

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
	_, err = repo.Update(ctx, created.ID, &model.UpdateFlagsetRequest{
		EvaluationContextEnrichment: json.RawMessage(`{"x":"\ud800"}`),
	})
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
	team := testutil.SeedTeam(t, db, testutil.SeedCompany(t, db, "Acme").ID, "Platform")
	fs := testutil.SeedFlagset(t, db, team.ID, "prod")
	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)

	var flagID string
	require.NoError(t, db.Pool.QueryRow(ctx,
		`INSERT INTO flags (flagset_id, name) VALUES ($1, 'f1') RETURNING id`, fs.ID).Scan(&flagID))
	_, err := db.Pool.Exec(ctx, `INSERT INTO flag_tags (flag_id, tag) VALUES ($1, 'beta')`, flagID)
	require.NoError(t, err)
	_, err = repo.InsertAPIKey(ctx, fs.ID, "ci", "k1", user.ID)
	require.NoError(t, err)

	require.NoError(t, repo.SoftDelete(ctx, fs.ID))

	count := func(q string) int {
		var n int
		require.NoError(t, db.Pool.QueryRow(ctx, q, fs.ID).Scan(&n))
		return n
	}
	assert.Equal(t, 1, count(`SELECT COUNT(*) FROM flagsets WHERE id = $1 AND deleted_at IS NOT NULL`),
		"flagset is retained as soft-deleted")
	assert.Equal(t, 1, count(`SELECT COUNT(*) FROM flags WHERE flagset_id = $1 AND deleted_at IS NOT NULL`),
		"flag is retained as soft-deleted")
	assert.Equal(t, 0, count(`SELECT COUNT(*) FROM flag_tags t JOIN flags f ON f.id = t.flag_id WHERE f.flagset_id = $1`))
	assert.Equal(t, 0, count(`SELECT COUNT(*) FROM flagset_api_keys WHERE flagset_id = $1`))

	_, err = repo.GetByID(ctx, fs.ID)
	assert.ErrorIs(t, err, repository.ErrNotFound)
	_, err = repo.TeamID(ctx, fs.ID)
	assert.ErrorIs(t, err, repository.ErrNotFound, "a deleted flagset has no team")
	list, err := repo.ListByTeam(ctx, team.ID)
	require.NoError(t, err)
	assert.Empty(t, list)
	_, err = repo.Update(ctx, fs.ID, &model.UpdateFlagsetRequest{Description: new("x")})
	assert.ErrorIs(t, err, repository.ErrNotFound)
	assert.ErrorIs(t, repo.SoftDelete(ctx, fs.ID), repository.ErrNotFound)
	_, err = repo.Create(ctx, team.ID, &model.CreateFlagsetRequest{Name: "prod"})
	assert.NoError(t, err, "the name is free again")
}

func TestFlagsetRepoNameTaken(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagsetRepo(db)
	ctx := t.Context()
	team := testutil.SeedTeam(t, db, testutil.SeedCompany(t, db, "Acme").ID, "Platform")
	testutil.SeedFlagset(t, db, team.ID, "prod")
	staging := testutil.SeedFlagset(t, db, team.ID, "staging")

	_, err := repo.Create(ctx, team.ID, &model.CreateFlagsetRequest{Name: "prod"})
	assert.ErrorIs(t, err, repository.ErrFlagsetNameTaken)
	_, err = repo.Update(ctx, staging.ID, &model.UpdateFlagsetRequest{Name: new("prod")})
	assert.ErrorIs(t, err, repository.ErrFlagsetNameTaken)
	_, err = repo.Create(ctx, testutil.SeedTeam(t, db, testutil.SeedCompany(t, db, "Globex").ID, "B").ID,
		&model.CreateFlagsetRequest{Name: "prod"})
	assert.NoError(t, err, "same name in another team is fine")
	_, err = repo.Create(ctx, team.ID, &model.CreateFlagsetRequest{
		Name: "x", DefaultTestingEvaluationContext: json.RawMessage(`{`),
	})
	assert.ErrorContains(t, err, "invalid flagset JSON setting: defaultTestingEvaluationContext:")
}

func TestFlagsetRepoAPIKeys(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagsetRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
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
	require.NotNil(t, keys[0].CreatedByName)
	assert.Equal(t, "U", *keys[0].CreatedByName)

	other := testutil.SeedFlagset(t, db, team.ID, "staging")
	_, err = repo.DeleteAPIKey(ctx, other.ID, key.ID)
	assert.ErrorIs(t, err, repository.ErrNotFound, "a key of another flagset is not deleted")
	deleted, err := repo.DeleteAPIKey(ctx, fs.ID, key.ID)
	require.NoError(t, err)
	assert.Equal(t, "ci", deleted.Label)
	_, err = repo.DeleteAPIKey(ctx, fs.ID, key.ID)
	assert.ErrorIs(t, err, repository.ErrNotFound)
}

func TestFlagsetRepoInsertAPIKeyDeletedFlagset(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagsetRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)

	t.Run("deleted flagset is not found", func(t *testing.T) {
		fs := testutil.SeedFlagset(t, db, team.ID, "gone")
		require.NoError(t, repo.SoftDelete(ctx, fs.ID))
		_, err := repo.InsertAPIKey(ctx, fs.ID, "ci", "k1", user.ID)
		assert.ErrorIs(t, err, repository.ErrNotFound)
	})

	t.Run("insert racing a delete waits and sees it deleted", func(t *testing.T) {
		fs := testutil.SeedFlagset(t, db, team.ID, "racing")
		tx, err := db.Pool.Begin(ctx)
		require.NoError(t, err)
		// Keeps the row lock from blocking the next test's truncate if this one fails.
		t.Cleanup(func() { _ = tx.Rollback(context.Background()) })
		_, err = tx.Exec(ctx, `UPDATE flagsets SET deleted_at = NOW() WHERE id = $1`, fs.ID)
		require.NoError(t, err)

		done := make(chan error, 1)
		go func() {
			_, err := repo.InsertAPIKey(ctx, fs.ID, "ci", "k2", user.ID)
			done <- err
		}()
		select {
		case err := <-done:
			t.Fatalf("insert did not wait for the delete: %v", err)
		case <-time.After(200 * time.Millisecond):
		}
		require.NoError(t, tx.Commit(ctx))
		assert.ErrorIs(t, <-done, repository.ErrNotFound)
	})
}

// A PATCH body leaves an absent JSON setting unchanged, clears it on null and
// replaces it on a value. The body is decoded like the handler does.
func TestFlagsetRepoUpdateJSONSettings(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagsetRepo(db)
	ctx := t.Context()
	team := testutil.SeedTeam(t, db, testutil.SeedCompany(t, db, "Acme").ID, "Platform")

	const enrich, testCtx = `{"env":"prod"}`, `{"targetingKey":"k"}`
	tests := []struct {
		name                    string
		body                    string
		wantEnrich, wantTesting string // "" means NULL
	}{
		{"absent leaves both", `{"description":"d"}`, enrich, testCtx},
		{"null clears one", `{"evaluationContextEnrichment":null}`, "", testCtx},
		{"null clears both", `{"evaluationContextEnrichment":null,"defaultTestingEvaluationContext":null}`, "", ""},
		{"value replaces", `{"defaultTestingEvaluationContext":{"targetingKey":"other"}}`,
			enrich, `{"targetingKey":"other"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fs, err := repo.Create(ctx, team.ID, &model.CreateFlagsetRequest{
				Name: tt.name, EvaluationContextEnrichment: json.RawMessage(enrich),
				DefaultTestingEvaluationContext: json.RawMessage(testCtx),
			})
			require.NoError(t, err)
			var req model.UpdateFlagsetRequest
			require.NoError(t, json.Unmarshal([]byte(tt.body), &req))

			got, err := repo.Update(ctx, fs.ID, &req)
			require.NoError(t, err)
			for _, c := range []struct {
				want string
				got  json.RawMessage
			}{{tt.wantEnrich, got.EvaluationContextEnrichment}, {tt.wantTesting, got.DefaultTestingEvaluationContext}} {
				if c.want == "" {
					assert.Empty(t, c.got)
				} else {
					assert.JSONEq(t, c.want, string(c.got))
				}
			}
		})
	}
}

func TestFlagsetRepoQueryErrors(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagsetRepo(db)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	id := "00000000-0000-0000-0000-000000000000"

	_, err := repo.GetByID(ctx, id)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.ListByTeam(ctx, id)
	assert.ErrorIs(t, err, context.Canceled)
	assert.ErrorIs(t, repo.SoftDelete(ctx, id), context.Canceled)
	_, err = repo.InsertAPIKey(ctx, id, "ci", "k", id)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.ListAPIKeys(ctx, id)
	assert.ErrorIs(t, err, context.Canceled)
}

func TestFlagsetRepoCreateWithAPIKey(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagsetRepo(db)
	ctx := t.Context()
	team := testutil.SeedTeam(t, db, testutil.SeedCompany(t, db, "Acme").ID, "Platform")
	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)

	fs, k, err := repo.CreateWithAPIKey(ctx, team.ID, &model.CreateFlagsetRequest{Name: "prod"}, "default", "k1", user.ID)
	require.NoError(t, err)
	assert.Equal(t, fs.ID, k.FlagsetID)
	assert.Equal(t, 1, fs.APIKeyCount)

	// A key collision (api_key is UNIQUE) fails the key insert: the flagset is
	// rolled back with it, so its name stays free.
	_, _, err = repo.CreateWithAPIKey(ctx, team.ID, &model.CreateFlagsetRequest{Name: "staging"}, "default", "k1", user.ID)
	require.Error(t, err)
	list, err := repo.ListByTeam(ctx, team.ID)
	require.NoError(t, err)
	assert.Len(t, list, 1)

	_, _, err = repo.CreateWithAPIKey(ctx, team.ID, &model.CreateFlagsetRequest{Name: "prod"}, "default", "k2", user.ID)
	assert.ErrorIs(t, err, repository.ErrFlagsetNameTaken)
}
