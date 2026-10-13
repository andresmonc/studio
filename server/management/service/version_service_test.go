package service_test

import (
	"encoding/json"
	"testing"

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

	t.Run("get missing version -> nil", func(t *testing.T) {
		v, err := svc.Get(ctx, flag.ID, 99)
		require.NoError(t, err)
		assert.Nil(t, v)
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
		v, err := svc.Rollback(ctx, actor.ID, flag.ID, 1, "")
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

		assert.Equal(t, 1, auditCount(t, db, "flag.rollback"))
	})

	t.Run("rollback to missing version -> not found", func(t *testing.T) {
		_, err := svc.Rollback(ctx, actor.ID, flag.ID, 99, "")
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("rollback on missing flag -> not found", func(t *testing.T) {
		_, err := svc.Rollback(ctx, actor.ID, "00000000-0000-0000-0000-000000000000", 1, "")
		assert.ErrorIs(t, err, service.ErrNotFound)
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

	_, err = svc.Rollback(ctx, actor.ID, f.ID, 1, "")
	require.NoError(t, err)

	tags, err := flagSvc.ListTeamTags(ctx, fs.TeamID)
	require.NoError(t, err)
	assert.Equal(t, []string{"a"}, tags)
	flags, _, err := flagSvc.ListByTeam(ctx, fs.TeamID, model.TeamFlagFilters{Tags: []string{"a"}})
	require.NoError(t, err)
	require.Len(t, flags, 1)
	assert.Equal(t, f.ID, flags[0].ID)
}
