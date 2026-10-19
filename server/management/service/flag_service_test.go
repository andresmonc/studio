package service_test

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/jackc/pgx/v5"
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
	company := testutil.SeedCompany(t, db, "Acme")
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
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionCreate, model.AuditTargetFlag))
	})

	validation := []struct {
		name       string
		req        model.CreateFlagRequest
		wantFields []string
	}{
		{"invalid name", model.CreateFlagRequest{Payload: json.RawMessage(testutil.DefaultFlagPayload)},
			[]string{"name"}},
		{"payload not JSON", model.CreateFlagRequest{Name: "x", Payload: json.RawMessage(`{not json`)},
			[]string{"payload"}},
		{"name, payload and tags at once", model.CreateFlagRequest{Payload: json.RawMessage(
			`{"defaultRule":{"variation":"on"},"metadata":{"tags":["a,b"]}}`)},
			[]string{"name", "payload.variations", "payload.metadata.tags"}},
	}
	for _, tt := range validation {
		t.Run(tt.name+" -> validation error", func(t *testing.T) {
			_, err := svc.Create(ctx, actor.ID, fs.ID, &tt.req)
			fields := validationFields(t, err)
			for _, f := range tt.wantFields {
				assert.Contains(t, fields, f)
			}
		})
	}

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
		stored, err := svc.Get(ctx, flag.ID)
		require.NoError(t, err)
		assert.Equal(t, stored.UpdatedAt, updated.UpdatedAt, "the returned flag carries the new updatedAt")
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionUpdate, model.AuditTargetFlag))
	})

	updateValidation := []struct {
		name      string
		payload   string
		wantField string
	}{
		{"changing flag type (immutable)", `{"variations":{"a":"x","b":"y"},"defaultRule":{"variation":"a"}}`,
			"payload.variations"},
		{"payload without default rule", `{"variations":{"on":true}}`, "payload.defaultRule"},
	}
	for _, tt := range updateValidation {
		t.Run(tt.name+" -> validation error", func(t *testing.T) {
			_, err := svc.Update(ctx, actor.ID, flag.ID, &model.UpdateFlagRequest{Payload: json.RawMessage(tt.payload)})
			assert.Contains(t, validationFields(t, err), tt.wantField)
		})
	}

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
		assertLastAudit(t, db, model.AuditTargetFlag, flag.ID, `{"disabled":false}`, `{"disabled":true}`)
	})

	t.Run("re-enabling is audited the other way", func(t *testing.T) {
		require.NoError(t, svc.SetDisabled(ctx, actor.ID, flag.ID, false))
		assertLastAudit(t, db, model.AuditTargetFlag, flag.ID, `{"disabled":true}`, `{"disabled":false}`)
	})

	t.Run("set disabled missing flag -> not found", func(t *testing.T) {
		err := svc.SetDisabled(ctx, actor.ID, "00000000-0000-0000-0000-000000000000", true)
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("delete (soft) happy path with audit", func(t *testing.T) {
		require.NoError(t, svc.Delete(ctx, actor.ID, flag.ID))
		_, err := svc.Get(ctx, flag.ID)
		assert.ErrorIs(t, err, service.ErrNotFound, "soft-deleted flag should not be returned by Get")
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionDelete, model.AuditTargetFlag))
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
		assert.ErrorIs(t, err, service.ErrConflict)
		assert.ErrorIs(t, err, repository.ErrFlagNameTaken)
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
	for i := range n {
		go func() {
			// Distinct payloads: an identical save is a no-op.
			_, err := svc.Update(ctx, actor.ID, flag.ID, &model.UpdateFlagRequest{
				Payload: json.RawMessage(fmt.Sprintf(
					`{"variations":{"on":true,"off":false},"defaultRule":{"variation":"on"},"metadata":{"n":%d}}`, i)),
			})
			errs <- err
		}()
	}
	for range n {
		require.NoError(t, <-errs)
	}
	assert.Equal(t, n+1, versionRowCount(t, db, flag.ID))

	// Saves serialize on the flag row, so each audit entry's before is the
	// version it actually replaced.
	rows, err := db.Pool.Query(ctx, `SELECT (before->>'currentVersion')::int, (after->>'currentVersion')::int
		FROM audit_log WHERE action = 'update' AND target_id = $1`, flag.ID)
	require.NoError(t, err)
	pairs, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) ([2]int, error) {
		var p [2]int
		return p, r.Scan(&p[0], &p[1])
	})
	require.NoError(t, err)
	require.Len(t, pairs, n)
	for _, p := range pairs {
		assert.Equal(t, p[0]+1, p[1], "update from v%d recorded as v%d", p[0], p[1])
	}
}

// TestFlagServiceWritesAreAtomic: whichever write of a flag save, toggle or
// delete fails (forced with a statement trigger on its table), the whole
// operation rolls back: no flag, version, current pointer, tag or state change
// is left behind.
func TestFlagServiceWritesAreAtomic(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newFlagService(db)
	ctx := t.Context()
	fs := flagsetWithTeam(t, db)
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)
	tagged := json.RawMessage(`{"variations":{"on":true,"off":false},"defaultRule":{"variation":"on"},` +
		`"metadata":{"tags":["t"]}}`)
	flag := testutil.SeedFlag(t, db, fs.ID, "existing", tagged, &actor.ID)
	_, err := db.Pool.Exec(ctx, `CREATE FUNCTION fail_write() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN RAISE EXCEPTION 'write down'; END $$`)
	require.NoError(t, err)

	tests := []struct {
		table, event              string
		disableFails, deleteFails bool
	}{
		{table: "audit_log", event: "INSERT", disableFails: true, deleteFails: true},
		{table: "flag_versions", event: "INSERT"},
		{table: "flags", event: "UPDATE", disableFails: true, deleteFails: true},
		{table: "flag_tags", event: "INSERT"},
		{table: "flag_tags", event: "DELETE", deleteFails: true},
	}
	for _, tt := range tests {
		t.Run(tt.event+" "+tt.table, func(t *testing.T) {
			_, err := db.Pool.Exec(ctx, fmt.Sprintf(`CREATE TRIGGER fail_write BEFORE %s ON %s
				FOR EACH STATEMENT EXECUTE FUNCTION fail_write()`, tt.event, tt.table))
			require.NoError(t, err)
			t.Cleanup(func() {
				_, _ = db.Pool.Exec(context.Background(), "DROP TRIGGER fail_write ON "+tt.table)
			})

			_, err = svc.Create(ctx, actor.ID, fs.ID, &model.CreateFlagRequest{Name: "new", Payload: tagged})
			require.ErrorContains(t, err, "write down")
			_, err = svc.Update(ctx, actor.ID, flag.ID, &model.UpdateFlagRequest{
				Payload: json.RawMessage(testutil.DefaultFlagPayload)})
			require.ErrorContains(t, err, "write down")
			if tt.disableFails {
				require.ErrorContains(t, svc.SetDisabled(ctx, actor.ID, flag.ID, true), "write down")
			}
			if tt.deleteFails {
				require.ErrorContains(t, svc.Delete(ctx, actor.ID, flag.ID), "write down")
			}

			var created int
			require.NoError(t, db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM flags WHERE name = 'new'`).Scan(&created))
			assert.Zero(t, created, "no flag left behind")
			got, err := svc.Get(ctx, flag.ID)
			require.NoError(t, err, "not deleted")
			assert.False(t, got.Disabled, "not disabled")
			assert.Equal(t, 1, *got.CurrentVersion, "current pointer unchanged")
			assert.Equal(t, 1, versionRowCount(t, db, flag.ID))
			assert.Equal(t, []string{"t"}, tagRowsFor(t, db, flag.ID))
		})
	}
}

// TestFlagServiceUpdateRacingDelete: a save that waits on a delete holding
// the flag's lock fails with not found instead of writing to the deleted flag.
func TestFlagServiceUpdateRacingDelete(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newFlagService(db)
	ctx := t.Context()
	fs := flagsetWithTeam(t, db)
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)
	flag := testutil.SeedFlag(t, db, fs.ID, "f", nil, &actor.ID)

	tx, err := db.Pool.Begin(ctx)
	require.NoError(t, err)
	t.Cleanup(func() { _ = tx.Rollback(context.Background()) })
	_, err = tx.Exec(ctx, `UPDATE flags SET deleted_at = NOW() WHERE id = $1`, flag.ID)
	require.NoError(t, err)

	done := make(chan error, 1)
	go func() {
		_, err := svc.Update(ctx, actor.ID, flag.ID, &model.UpdateFlagRequest{
			Payload: json.RawMessage(testutil.DefaultFlagPayload),
		})
		done <- err
	}()
	select {
	case err := <-done:
		t.Fatalf("update did not wait for the delete: %v", err)
	case <-time.After(200 * time.Millisecond):
	}
	require.NoError(t, tx.Commit(ctx))
	assert.ErrorIs(t, <-done, service.ErrNotFound)
	assert.Equal(t, 1, versionRowCount(t, db, flag.ID))
}

func TestFlagAuditKeepsCompanyAfterTeamDelete(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newFlagService(db)
	ctx := t.Context()
	company := testutil.SeedCompany(t, db, "Acme")
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
		`SELECT company_id FROM audit_log WHERE action = 'create' AND target_type = 'flag'`).Scan(&companyID))
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
		owners, err := svc.ListTeamOwners(ctx, fs.TeamID)
		require.NoError(t, err)
		assert.Equal(t, []model.FlagOwner{{ID: actor.ID, Name: "Actor"}}, owners)
	})

	t.Run("team id for flag", func(t *testing.T) {
		got, err := svc.TeamID(ctx, f1.ID)
		require.NoError(t, err)
		assert.Equal(t, fs.TeamID, got)
		_, err = svc.TeamID(ctx, "00000000-0000-0000-0000-000000000000")
		assert.ErrorIs(t, err, service.ErrNotFound)
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

	t.Run("the flag's disabled state wins over the payload, both ways", func(t *testing.T) {
		// A top-level disable can't be saved through the service, so plant it.
		_, err := db.Pool.Exec(ctx, `UPDATE flag_versions SET payload = payload::jsonb || '{"disable":true}'
			WHERE id = $1`, *flag.CurrentVersionID)
		require.NoError(t, err)
		req := &model.EvaluateFlagRequest{EvaluationContext: model.EvaluationContextInput{TargetingKey: "u"}}
		res, err := svc.Evaluate(ctx, flag.ID, req)
		require.NoError(t, err)
		assert.NotEqual(t, "DISABLED", res.Reason, "enabled flag")
		require.NoError(t, svc.SetDisabled(ctx, actor.ID, flag.ID, true))
		res, err = svc.Evaluate(ctx, flag.ID, req)
		require.NoError(t, err)
		assert.Equal(t, "DISABLED", res.Reason)
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

func TestFlagServiceQueryErrors(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newFlagService(db)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	id := "00000000-0000-0000-0000-000000000000"
	payload := json.RawMessage(testutil.DefaultFlagPayload)

	_, err := svc.Create(ctx, id, id, &model.CreateFlagRequest{Name: "f", Payload: payload})
	assert.ErrorIs(t, err, context.Canceled)
	_, err = svc.Update(ctx, id, id, &model.UpdateFlagRequest{Payload: payload})
	assert.ErrorIs(t, err, context.Canceled)
	assert.ErrorIs(t, svc.SetDisabled(ctx, id, id, true), context.Canceled)
	assert.ErrorIs(t, svc.Delete(ctx, id, id), context.Canceled)
	_, err = svc.Evaluate(ctx, id, &model.EvaluateFlagRequest{})
	assert.ErrorIs(t, err, context.Canceled)
	_, err = svc.ListTeamOwners(ctx, id)
	assert.ErrorIs(t, err, context.Canceled)
}
