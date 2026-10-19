package service_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newVersionService(db *repository.DB) *service.VersionService {
	return service.NewVersionService(
		db,
		repository.NewFlagRepo(db),
		repository.NewFlagVersionRepo(db),
		repository.NewFlagsetRepo(db),
		repository.NewAuditRepo(db),
	)
}

func TestVersionServiceListAndGet(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newVersionService(db)
	flagSvc := newFlagService(db)
	ctx := t.Context()
	fs := flagsetWithTeam(t, db)
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)
	flag := testutil.SeedFlag(t, db, fs.ID, "my-flag", nil, &actor.ID)

	// produce a second version via the flag service
	_, err := flagSvc.Update(ctx, actor.ID, flag.ID, &model.UpdateFlagRequest{
		Comment: "v2",
		Payload: json.RawMessage(`{"variations":{"on":true,"off":false},"defaultRule":{"variation":"off"}}`),
	})
	require.NoError(t, err)

	t.Run("list returns versions newest first", func(t *testing.T) {
		versions, total, err := svc.List(ctx, flag.ID, 1, 50)
		require.NoError(t, err)
		assert.Equal(t, 2, total)
		require.Len(t, versions, 2)
		assert.Equal(t, 2, versions[0].VersionNumber)
		assert.Equal(t, 1, versions[1].VersionNumber)
	})

	t.Run("get specific version", func(t *testing.T) {
		v, err := svc.Get(ctx, flag.ID, 1)
		require.NoError(t, err)
		require.NotNil(t, v)
		assert.Equal(t, 1, v.VersionNumber)
	})

	t.Run("get missing version -> not found", func(t *testing.T) {
		_, err := svc.Get(ctx, flag.ID, 99)
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("list on a missing flag -> not found", func(t *testing.T) {
		_, _, err := svc.List(ctx, "00000000-0000-0000-0000-000000000000", 1, 50)
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("pagination clamps invalid params", func(t *testing.T) {
		versions, total, err := svc.List(ctx, flag.ID, 0, 99999)
		require.NoError(t, err)
		assert.Equal(t, 2, total)
		assert.Len(t, versions, 2)
	})
}

func TestVersionServiceRollback(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newVersionService(db)
	flagSvc := newFlagService(db)
	ctx := t.Context()
	fs := flagsetWithTeam(t, db)
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)
	flag := testutil.SeedFlag(t, db, fs.ID, "my-flag", nil, &actor.ID)

	// v2 with a different default rule
	_, err := flagSvc.Update(ctx, actor.ID, flag.ID, &model.UpdateFlagRequest{
		Comment: "v2",
		Payload: json.RawMessage(`{"variations":{"on":true,"off":false},"defaultRule":{"variation":"off"}}`),
	})
	require.NoError(t, err)

	t.Run("rollback to v1 creates v3 with copied payload and audit", func(t *testing.T) {
		v, _, err := svc.Rollback(ctx, actor.ID, flag.ID, 1, "")
		require.NoError(t, err)
		require.NotNil(t, v)
		assert.Equal(t, 3, v.VersionNumber)
		assert.Contains(t, v.Comment, "rollback to version 1")

		// new current version should be the rollback version; payload matches v1
		v1, err := svc.Get(ctx, flag.ID, 1)
		require.NoError(t, err)
		assert.JSONEq(t, string(v1.Payload), string(v.Payload))

		stored, err := flagSvc.Get(ctx, flag.ID)
		require.NoError(t, err)
		require.NotNil(t, stored.CurrentVersion)
		assert.Equal(t, 3, *stored.CurrentVersion)

		assert.Equal(t, 1, auditCount(t, db, model.AuditActionRollback, model.AuditTargetFlag))
		var meta string
		var from, to int
		var teamID string
		require.NoError(t, db.Pool.QueryRow(ctx, `SELECT metadata::text, (before->>'currentVersion')::int,
			(after->>'currentVersion')::int, team_id::text FROM audit_log WHERE action = 'rollback'`,
		).Scan(&meta, &from, &to, &teamID))
		assert.JSONEq(t, `{"restoredVersion":1}`, meta)
		assert.Equal(t, [2]int{2, 3}, [2]int{from, to}, "before/after are the replaced and new versions")
		assert.Equal(t, fs.TeamID, teamID)
	})

	t.Run("explicit comment is kept", func(t *testing.T) {
		v, _, err := svc.Rollback(ctx, actor.ID, flag.ID, 2, "back to off")
		require.NoError(t, err)
		assert.Equal(t, "back to off", v.Comment)
		assert.Equal(t, 4, v.VersionNumber)
	})

	t.Run("rollback to the served payload writes nothing", func(t *testing.T) {
		before := auditCount(t, db, model.AuditActionRollback, model.AuditTargetFlag)
		v, created, err := svc.Rollback(ctx, actor.ID, flag.ID, 2, "")
		require.NoError(t, err)
		assert.False(t, created)
		assert.Equal(t, 4, v.VersionNumber, "the current version, which serves v2's payload")
		assert.Equal(t, 4, versionRowCount(t, db, flag.ID))
		assert.Equal(t, before, auditCount(t, db, model.AuditActionRollback, model.AuditTargetFlag))
	})

	t.Run("rollback to missing version -> not found", func(t *testing.T) {
		_, _, err := svc.Rollback(ctx, actor.ID, flag.ID, 99, "")
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("rollback on missing flag -> not found", func(t *testing.T) {
		_, _, err := svc.Rollback(ctx, actor.ID, "00000000-0000-0000-0000-000000000000", 1, "")
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("rollback racing a delete -> not found, nothing written", func(t *testing.T) {
		tx, err := db.Pool.Begin(ctx)
		require.NoError(t, err)
		t.Cleanup(func() { _ = tx.Rollback(context.Background()) })
		_, err = tx.Exec(ctx, `UPDATE flags SET deleted_at = NOW() WHERE id = $1`, flag.ID)
		require.NoError(t, err)
		done := make(chan error, 1)
		go func() {
			_, _, err := svc.Rollback(ctx, actor.ID, flag.ID, 1, "")
			done <- err
		}()
		select {
		case err := <-done:
			t.Fatalf("rollback did not wait for the delete: %v", err)
		case <-time.After(200 * time.Millisecond):
		}
		require.NoError(t, tx.Commit(ctx))
		assert.ErrorIs(t, <-done, service.ErrNotFound)
		assert.Equal(t, 4, versionRowCount(t, db, flag.ID))
		assert.Equal(t, 2, auditCount(t, db, model.AuditActionRollback, model.AuditTargetFlag), "no entry for it")
	})
}

func TestVersionServiceRollbackRefreshesTags(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newVersionService(db)
	flagSvc := newFlagService(db)
	ctx := t.Context()
	fs := flagsetWithTeam(t, db)
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)

	f, err := flagSvc.Create(ctx, actor.ID, fs.ID, &model.CreateFlagRequest{
		Name:    "tagged",
		Payload: json.RawMessage(`{"variations":{"on":true,"off":false},"defaultRule":{"variation":"on"},"metadata":{"tags":["a"]}}`),
	})
	require.NoError(t, err)
	_, err = flagSvc.Update(ctx, actor.ID, f.ID, &model.UpdateFlagRequest{
		Payload: json.RawMessage(`{"variations":{"on":true,"off":false},"defaultRule":{"variation":"on"},"metadata":{"tags":["b"]}}`),
	})
	require.NoError(t, err)

	_, _, err = svc.Rollback(ctx, actor.ID, f.ID, 1, "")
	require.NoError(t, err)

	tags, err := flagSvc.ListTeamTags(ctx, fs.TeamID)
	require.NoError(t, err)
	assert.Equal(t, []string{"a"}, tags)
	flags, _, err := flagSvc.ListByTeam(ctx, fs.TeamID, model.TeamFlagFilters{Tags: []string{"a"}})
	require.NoError(t, err)
	require.Len(t, flags, 1)
	assert.Equal(t, f.ID, flags[0].ID)
}

func TestVersionServiceQueryErrors(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newVersionService(db)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	id := "00000000-0000-0000-0000-000000000000"

	_, _, err := svc.List(ctx, id, 1, 50)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = svc.Get(ctx, id, 1)
	assert.ErrorIs(t, err, context.Canceled)
	_, _, err = svc.Rollback(ctx, id, id, 1, "")
	assert.ErrorIs(t, err, context.Canceled)
}

func TestVersionServiceRollbackIsAtomic(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newVersionService(db)
	ctx := t.Context()
	fs := flagsetWithTeam(t, db)
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)
	flag := testutil.SeedFlag(t, db, fs.ID, "f", nil, &actor.ID)
	// v2 differs from v1, so rolling back to v1 really writes.
	_, err := newFlagService(db).Update(ctx, actor.ID, flag.ID, &model.UpdateFlagRequest{
		Payload: json.RawMessage(`{"variations":{"on":true,"off":false},"defaultRule":{"variation":"off"}}`),
	})
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, `
		CREATE FUNCTION fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN RAISE EXCEPTION 'audit down'; END $$;
		CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION fail_audit();`)
	require.NoError(t, err)

	_, _, err = svc.Rollback(ctx, actor.ID, flag.ID, 1, "")
	require.ErrorContains(t, err, "audit down")
	assert.Equal(t, 2, versionRowCount(t, db, flag.ID), "no version left behind")
}
