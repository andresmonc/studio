package service_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newFlagService(db *repository.DB) *service.FlagService {
	return service.NewFlagService(
		db,
		repository.NewFlagRepo(db),
		repository.NewFlagVersionRepo(db),
		repository.NewFlagsetRepo(db),
		repository.NewAuditRepo(db),
	)
}

// flagsetWithTeam seeds a company, team and flagset, returning the flagset.
func flagsetWithTeam(t *testing.T, db *repository.DB) *model.Flagset {
	t.Helper()
	company := testutil.SeedCompany(t, db, "Acme", nil)
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	return testutil.SeedFlagset(t, db, team.ID, "default")
}

// versionRowCount returns the number of flag_versions rows for a flag.
func versionRowCount(t *testing.T, db *repository.DB, flagID string) int {
	t.Helper()
	var n int
	err := db.Pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM flag_versions WHERE flag_id = $1`, flagID).Scan(&n)
	require.NoError(t, err)
	return n
}

func TestFlagServiceCreate(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newFlagService(db)
	ctx := t.Context()
	fs := flagsetWithTeam(t, db)
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)

	t.Run("happy path creates flag + version transactionally", func(t *testing.T) {
		f, err := svc.Create(ctx, actor.ID, fs.ID, &model.CreateFlagRequest{
			Name:    "my-flag",
			Comment: "initial",
			Payload: json.RawMessage(testutil.DefaultFlagPayload),
		})
		require.NoError(t, err)
		assert.Equal(t, "my-flag", f.Name)
		// version row created and set as current
		require.NotNil(t, f.CurrentVersionID)
		require.NotNil(t, f.CurrentVersion)
		assert.Equal(t, 1, *f.CurrentVersion)
		assert.Equal(t, 1, versionRowCount(t, db, f.ID))

		// current_version_id persisted on the flag row
		stored, err := svc.Get(ctx, f.ID)
		require.NoError(t, err)
		require.NotNil(t, stored.CurrentVersionID)
		assert.Equal(t, *f.CurrentVersionID, *stored.CurrentVersionID)

		// flagType metadata injected into stored payload
		assert.Contains(t, string(stored.Payload), "flagType")
		assert.Equal(t, 1, auditCount(t, db, "flag.create"))
	})

	t.Run("invalid flag name -> validation error", func(t *testing.T) {
		_, err := svc.Create(ctx, actor.ID, fs.ID, &model.CreateFlagRequest{
			Name: "", Payload: json.RawMessage(testutil.DefaultFlagPayload),
		})
		var ve model.ValidationErrors
		assert.ErrorAs(t, err, &ve)
	})

	t.Run("invalid payload json -> validation error", func(t *testing.T) {
		_, err := svc.Create(ctx, actor.ID, fs.ID, &model.CreateFlagRequest{
			Name: "x", Payload: json.RawMessage(`{not json`),
		})
		var ve model.ValidationErrors
		assert.ErrorAs(t, err, &ve)
	})

	t.Run("payload missing variations -> validation error", func(t *testing.T) {
		_, err := svc.Create(ctx, actor.ID, fs.ID, &model.CreateFlagRequest{
			Name: "x", Payload: json.RawMessage(`{"defaultRule":{"variation":"on"}}`),
		})
		var ve model.ValidationErrors
		assert.ErrorAs(t, err, &ve)
	})

	t.Run("missing flagset -> not found", func(t *testing.T) {
		_, err := svc.Create(ctx, actor.ID, "00000000-0000-0000-0000-000000000000",
			&model.CreateFlagRequest{Name: "x", Payload: json.RawMessage(testutil.DefaultFlagPayload)})
		assert.ErrorIs(t, err, service.ErrNotFound)
	})
}

func TestFlagServiceUpdate(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newFlagService(db)
	ctx := t.Context()
	fs := flagsetWithTeam(t, db)
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)
	flag := testutil.SeedFlag(t, db, fs.ID, "my-flag", nil, &actor.ID)

	t.Run("happy path adds a new version and bumps current", func(t *testing.T) {
		updated, err := svc.Update(ctx, actor.ID, flag.ID, &model.UpdateFlagRequest{
			Comment: "tweak",
			Payload: json.RawMessage(`{"variations":{"on":true,"off":false},"defaultRule":{"variation":"off"}}`),
		})
		require.NoError(t, err)
		require.NotNil(t, updated.CurrentVersion)
		assert.Equal(t, 2, *updated.CurrentVersion)
		assert.Equal(t, 2, versionRowCount(t, db, flag.ID))
		assert.Equal(t, 1, auditCount(t, db, "flag.update"))
	})

	t.Run("changing flag type -> validation error (immutable type)", func(t *testing.T) {
		_, err := svc.Update(ctx, actor.ID, flag.ID, &model.UpdateFlagRequest{
			Payload: json.RawMessage(`{"variations":{"a":"x","b":"y"},"defaultRule":{"variation":"a"}}`),
		})
		var ve model.ValidationErrors
		assert.ErrorAs(t, err, &ve)
	})

	t.Run("invalid payload -> validation error", func(t *testing.T) {
		_, err := svc.Update(ctx, actor.ID, flag.ID, &model.UpdateFlagRequest{
			Payload: json.RawMessage(`{"variations":{"on":true}}`),
		})
		var ve model.ValidationErrors
		assert.ErrorAs(t, err, &ve)
	})

	t.Run("missing flag -> not found", func(t *testing.T) {
		_, err := svc.Update(ctx, actor.ID, "00000000-0000-0000-0000-000000000000",
			&model.UpdateFlagRequest{Payload: json.RawMessage(testutil.DefaultFlagPayload)})
		assert.ErrorIs(t, err, service.ErrNotFound)
	})
}

func TestFlagServiceDisableAndDelete(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newFlagService(db)
	ctx := t.Context()
	fs := flagsetWithTeam(t, db)
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)
	flag := testutil.SeedFlag(t, db, fs.ID, "my-flag", nil, &actor.ID)

	t.Run("set disabled happy path with audit", func(t *testing.T) {
		require.NoError(t, svc.SetDisabled(ctx, actor.ID, flag.ID, true))
		got, err := svc.Get(ctx, flag.ID)
		require.NoError(t, err)
		assert.True(t, got.Disabled)
		assert.Equal(t, 1, auditCount(t, db, "flag.disable"))
	})

	t.Run("re-enabling records flag.enable", func(t *testing.T) {
		require.NoError(t, svc.SetDisabled(ctx, actor.ID, flag.ID, false))
		assert.Equal(t, 1, auditCount(t, db, "flag.enable"))
		assert.Equal(t, 1, auditCount(t, db, "flag.disable"))
	})

	t.Run("set disabled missing flag -> not found", func(t *testing.T) {
		err := svc.SetDisabled(ctx, actor.ID, "00000000-0000-0000-0000-000000000000", true)
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("delete (soft) happy path with audit", func(t *testing.T) {
		require.NoError(t, svc.Delete(ctx, actor.ID, flag.ID))
		got, err := svc.Get(ctx, flag.ID)
		require.NoError(t, err)
		assert.Nil(t, got, "soft-deleted flag should not be returned by Get")
		assert.Equal(t, 1, auditCount(t, db, "flag.delete"))
	})

	t.Run("delete missing flag -> not found", func(t *testing.T) {
		err := svc.Delete(ctx, actor.ID, "00000000-0000-0000-0000-000000000000")
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("deleted flag's name can be reused", func(t *testing.T) {
		f, err := svc.Create(ctx, actor.ID, fs.ID, &model.CreateFlagRequest{
			Name: "my-flag", Payload: json.RawMessage(testutil.DefaultFlagPayload),
		})
		require.NoError(t, err)
		assert.NotEqual(t, flag.ID, f.ID)

		// ...but two live flags still can't share a name.
		_, err = svc.Create(ctx, actor.ID, fs.ID, &model.CreateFlagRequest{
			Name: "my-flag", Payload: json.RawMessage(testutil.DefaultFlagPayload),
		})
		var pgErr *pgconn.PgError
		require.ErrorAs(t, err, &pgErr)
		assert.Equal(t, "23505", pgErr.Code)
	})
}

func TestFlagServiceConcurrentUpdates(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newFlagService(db)
	ctx := t.Context()
	fs := flagsetWithTeam(t, db)
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)
	flag := testutil.SeedFlag(t, db, fs.ID, "my-flag", nil, &actor.ID)

	const n = 10
	errs := make(chan error, n)
	for range n {
		go func() {
			_, err := svc.Update(ctx, actor.ID, flag.ID, &model.UpdateFlagRequest{
				Payload: json.RawMessage(testutil.DefaultFlagPayload),
			})
			errs <- err
		}()
	}
	for range n {
		require.NoError(t, <-errs)
	}
	assert.Equal(t, n+1, versionRowCount(t, db, flag.ID))
}

func TestFlagAuditKeepsCompanyAfterTeamDelete(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newFlagService(db)
	ctx := t.Context()
	company := testutil.SeedCompany(t, db, "Acme", nil)
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	fs := testutil.SeedFlagset(t, db, team.ID, "default")
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)

	_, err := svc.Create(ctx, actor.ID, fs.ID, &model.CreateFlagRequest{
		Name: "my-flag", Payload: json.RawMessage(testutil.DefaultFlagPayload),
	})
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, `DELETE FROM teams WHERE id = $1`, team.ID)
	require.NoError(t, err)

	var companyID *string
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT company_id FROM audit_log WHERE action = 'flag.create'`).Scan(&companyID))
	require.NotNil(t, companyID)
	assert.Equal(t, company.ID, *companyID)
}

func TestFlagServiceListAndFlagsetID(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newFlagService(db)
	ctx := t.Context()
	fs := flagsetWithTeam(t, db)
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)
	f1 := testutil.SeedFlag(t, db, fs.ID, "flag-a", nil, &actor.ID)
	_ = testutil.SeedFlag(t, db, fs.ID, "flag-b", nil, &actor.ID)

	t.Run("list by flagset", func(t *testing.T) {
		items, total, err := svc.List(ctx, fs.ID, model.FlagFilters{Page: 1, PageSize: 50})
		require.NoError(t, err)
		assert.Equal(t, 2, total)
		assert.Len(t, items, 2)
	})

	t.Run("list by team", func(t *testing.T) {
		instances, _, err := svc.ListByTeam(ctx, fs.TeamID, model.TeamFlagFilters{})
		require.NoError(t, err)
		assert.Len(t, instances, 2)
	})

	t.Run("flagset id for flag", func(t *testing.T) {
		got, err := svc.FlagsetID(ctx, f1.ID)
		require.NoError(t, err)
		assert.Equal(t, fs.ID, got)
	})
}

func TestFlagServiceEvaluate(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newFlagService(db)
	ctx := t.Context()
	fs := flagsetWithTeam(t, db)
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)
	flag := testutil.SeedFlag(t, db, fs.ID, "my-flag", nil, &actor.ID)

	t.Run("evaluate returns a result", func(t *testing.T) {
		res, err := svc.Evaluate(ctx, flag.ID, &model.EvaluateFlagRequest{
			EvaluationContext: model.EvaluationContextInput{TargetingKey: "user-1"},
		})
		require.NoError(t, err)
		require.NotNil(t, res)
	})

	t.Run("evaluate missing flag -> not found", func(t *testing.T) {
		_, err := svc.Evaluate(ctx, "00000000-0000-0000-0000-000000000000",
			&model.EvaluateFlagRequest{EvaluationContext: model.EvaluationContextInput{TargetingKey: "u"}})
		assert.ErrorIs(t, err, service.ErrNotFound)
	})
}

// tagRowsFor returns the flag_tags rows (as a set) for a flag.
func tagRowsFor(t *testing.T, db *repository.DB, flagID string) []string {
	t.Helper()
	rows, err := db.Pool.Query(context.Background(),
		`SELECT tag FROM flag_tags WHERE flag_id = $1 ORDER BY tag`, flagID)
	require.NoError(t, err)
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		require.NoError(t, rows.Scan(&s))
		out = append(out, s)
	}
	return out
}

func TestFlagServiceTagSyncAndNormalization(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newFlagService(db)
	ctx := t.Context()
	fs := flagsetWithTeam(t, db)
	actor := testutil.SeedUser(t, db, "tags@acme.com", "Tagger", true)

	// Create normalizes metadata.tags in the stored payload AND mirrors them.
	f, err := svc.Create(ctx, actor.ID, fs.ID, &model.CreateFlagRequest{
		Name: "tagged",
		Payload: json.RawMessage(
			`{"variations":{"on":true,"off":false},"defaultRule":{"variation":"on"},"metadata":{"tags":["Prod","prod","  beta  "]}}`),
	})
	require.NoError(t, err)

	// Mirror rows = normalized set (case-insensitive dedupe, first casing kept).
	assert.ElementsMatch(t, []string{"Prod", "beta"}, tagRowsFor(t, db, f.ID))
	// Stored payload is normalized too (the exported config matches the mirror).
	stored, err := svc.Get(ctx, f.ID)
	require.NoError(t, err)
	assert.Contains(t, string(stored.Payload), `"tags":["Prod","beta"]`)

	// Update replaces the mirror set.
	_, err = svc.Update(ctx, actor.ID, f.ID, &model.UpdateFlagRequest{
		Payload: json.RawMessage(
			`{"variations":{"on":true,"off":false},"defaultRule":{"variation":"on"},"metadata":{"tags":["canary"]}}`),
	})
	require.NoError(t, err)
	assert.Equal(t, []string{"canary"}, tagRowsFor(t, db, f.ID))

	// CRITICAL regression: removing all tags clears the mirror rows.
	_, err = svc.Update(ctx, actor.ID, f.ID, &model.UpdateFlagRequest{
		Payload: json.RawMessage(`{"variations":{"on":true,"off":false},"defaultRule":{"variation":"on"}}`),
	})
	require.NoError(t, err)
	assert.Empty(t, tagRowsFor(t, db, f.ID))

	// Validation rejects an over-long tag before anything is written.
	_, err = svc.Create(ctx, actor.ID, fs.ID, &model.CreateFlagRequest{
		Name: "bad",
		Payload: json.RawMessage(
			`{"variations":{"on":true,"off":false},"defaultRule":{"variation":"on"},"metadata":{"tags":["a,b"]}}`),
	})
	var ve model.ValidationErrors
	assert.ErrorAs(t, err, &ve)

	// ListTeamTags surfaces distinct team tags via the service.
	_, err = svc.Update(ctx, actor.ID, f.ID, &model.UpdateFlagRequest{
		Payload: json.RawMessage(
			`{"variations":{"on":true,"off":false},"defaultRule":{"variation":"on"},"metadata":{"tags":["x","y"]}}`),
	})
	require.NoError(t, err)
	tags, err := svc.ListTeamTags(ctx, fs.TeamID)
	require.NoError(t, err)
	assert.Equal(t, []string{"x", "y"}, tags)

	// D4:A end-to-end: a flag carrying a legacy scalar metadata.tags (authored via
	// the old metadata editor) is accepted, stays editable, keeps the scalar
	// verbatim, and mirrors no rows — validation must NOT reject the non-array
	// value, or the flag would become uneditable.
	legacy, err := svc.Create(ctx, actor.ID, fs.ID, &model.CreateFlagRequest{
		Name: "legacy-scalar",
		Payload: json.RawMessage(
			`{"variations":{"on":true,"off":false},"defaultRule":{"variation":"on"},"metadata":{"tags":"legacy"}}`),
	})
	require.NoError(t, err)
	assert.Empty(t, tagRowsFor(t, db, legacy.ID))
	_, err = svc.Update(ctx, actor.ID, legacy.ID, &model.UpdateFlagRequest{
		Payload: json.RawMessage(
			`{"variations":{"on":true,"off":false},"defaultRule":{"variation":"on"},"metadata":{"tags":"legacy"}}`),
	})
	require.NoError(t, err)
	legacyStored, err := svc.Get(ctx, legacy.ID)
	require.NoError(t, err)
	assert.Contains(t, string(legacyStored.Payload), `"tags":"legacy"`)
	assert.Empty(t, tagRowsFor(t, db, legacy.ID))
}
