package service_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newFlagsetService(db *repository.DB) *service.FlagsetService {
	return service.NewFlagsetService(
		repository.NewFlagsetRepo(db),
		repository.NewAuditRepo(db),
	)
}

func seedTeamForFlagset(t *testing.T, db *repository.DB) *model.Team {
	t.Helper()
	company := testutil.SeedCompany(t, db, "Acme", nil)
	return testutil.SeedTeam(t, db, company.ID, "Platform")
}

func TestFlagsetServiceCRUD(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newFlagsetService(db)
	ctx := t.Context()
	team := seedTeamForFlagset(t, db)
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)

	var created *model.Flagset

	t.Run("create happy path with audit", func(t *testing.T) {
		fs, err := svc.Create(ctx, actor.ID, team.ID, &model.CreateFlagsetRequest{Name: "default"})
		require.NoError(t, err)
		assert.Equal(t, "default", fs.Name)
		assert.Equal(t, team.ID, fs.TeamID)
		assert.Equal(t, 1, auditCount(t, db, "flagset.create"))
		created = fs
	})

	t.Run("create empty name -> validation error", func(t *testing.T) {
		_, err := svc.Create(ctx, actor.ID, team.ID, &model.CreateFlagsetRequest{Name: ""})
		var ve model.ValidationErrors
		assert.ErrorAs(t, err, &ve)
	})

	t.Run("create non-object evaluation context -> validation error", func(t *testing.T) {
		_, err := svc.Create(ctx, actor.ID, team.ID, &model.CreateFlagsetRequest{
			Name: "ctx", EvaluationContextEnrichment: json.RawMessage(`["a"]`),
		})
		var ve model.ValidationErrors
		require.ErrorAs(t, err, &ve)
		assert.Contains(t, ve.ToMap(), "evaluationContextEnrichment")
	})

	t.Run("get and list", func(t *testing.T) {
		got, err := svc.Get(ctx, created.ID)
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, created.ID, got.ID)

		list, err := svc.ListByTeam(ctx, team.ID)
		require.NoError(t, err)
		assert.Len(t, list, 1)
	})

	t.Run("update happy path with audit", func(t *testing.T) {
		fs, err := svc.Update(ctx, actor.ID, created.ID, &model.UpdateFlagsetRequest{
			Description: new("updated"),
		})
		require.NoError(t, err)
		assert.Equal(t, "updated", fs.Description)
		assert.Equal(t, 1, auditCount(t, db, "flagset.update"))
	})

	t.Run("update missing -> not found", func(t *testing.T) {
		_, err := svc.Update(ctx, actor.ID, "00000000-0000-0000-0000-000000000000",
			&model.UpdateFlagsetRequest{Description: new("x")})
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("update blank name or non-object context -> validation error", func(t *testing.T) {
		for _, req := range []*model.UpdateFlagsetRequest{
			{Name: new("  ")},
			{DefaultTestingEvaluationContext: json.RawMessage(`"x"`)},
			{PollingIntervalMs: new(0)},
			{PollingIntervalMs: new(-5)},
			{FileFormat: new("xml")},
			{Retrievers: json.RawMessage(`"s3"`)},
			{Exporters: json.RawMessage(`42`)},
			{Notifiers: json.RawMessage(`true`)},
		} {
			_, err := svc.Update(ctx, actor.ID, created.ID, req)
			var ve model.ValidationErrors
			assert.ErrorAs(t, err, &ve)
		}
		fs, err := svc.Update(ctx, actor.ID, created.ID, &model.UpdateFlagsetRequest{
			DefaultTestingEvaluationContext: json.RawMessage(`{"targetingKey":"k"}`),
		})
		require.NoError(t, err)
		assert.JSONEq(t, `{"targetingKey":"k"}`, string(fs.DefaultTestingEvaluationContext))

		fs, err = svc.Update(ctx, actor.ID, created.ID, &model.UpdateFlagsetRequest{
			PollingIntervalMs: new(30000), FileFormat: new("toml"),
			Retrievers: json.RawMessage(`[{"kind":"s3"}]`), Exporters: json.RawMessage(`{"kind":"file"}`), Notifiers: json.RawMessage(`null`),
		})
		require.NoError(t, err)
		assert.Equal(t, 30000, *fs.PollingIntervalMs)
		assert.Equal(t, "toml", *fs.FileFormat)
	})

	t.Run("delete happy path records audit and removes the flagset", func(t *testing.T) {
		require.NoError(t, svc.Delete(ctx, actor.ID, created.ID))
		assert.Equal(t, 1, auditCount(t, db, "flagset.delete"))
		got, err := svc.Get(ctx, created.ID)
		require.NoError(t, err)
		assert.Nil(t, got)
	})

	t.Run("delete missing -> not found", func(t *testing.T) {
		assert.ErrorIs(t, svc.Delete(ctx, actor.ID, created.ID), service.ErrNotFound)
	})
}

func TestFlagsetServiceAPIKeys(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newFlagsetService(db)
	ctx := t.Context()
	team := seedTeamForFlagset(t, db)
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)
	fs := testutil.SeedFlagset(t, db, team.ID, "default")
	otherFs := testutil.SeedFlagset(t, db, team.ID, "other")

	var keyID string

	t.Run("create api key happy path with audit", func(t *testing.T) {
		k, err := svc.CreateAPIKey(ctx, actor.ID, fs.ID, "ci")
		require.NoError(t, err)
		assert.True(t, strings.HasPrefix(k.APIKey, "goff_"))
		assert.Equal(t, "ci", k.Label)
		assert.Equal(t, 1, auditCount(t, db, "flagset.apikey.create"))
		keyID = k.ID
	})

	t.Run("create api key for missing flagset -> not found", func(t *testing.T) {
		_, err := svc.CreateAPIKey(ctx, actor.ID, "00000000-0000-0000-0000-000000000000", "x")
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("list api keys", func(t *testing.T) {
		keys, err := svc.ListAPIKeys(ctx, fs.ID)
		require.NoError(t, err)
		require.Len(t, keys, 1)
		assert.Equal(t, keyID, keys[0].ID)
	})

	t.Run("delete api key owned by another flagset -> not found (IDOR guard)", func(t *testing.T) {
		err := svc.DeleteAPIKey(ctx, actor.ID, otherFs.ID, keyID)
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("delete api key happy path with audit", func(t *testing.T) {
		require.NoError(t, svc.DeleteAPIKey(ctx, actor.ID, fs.ID, keyID))
		assert.Equal(t, 1, auditCount(t, db, "flagset.apikey.delete"))

		keys, err := svc.ListAPIKeys(ctx, fs.ID)
		require.NoError(t, err)
		assert.Empty(t, keys)
	})

	t.Run("delete api key on missing flagset -> not found", func(t *testing.T) {
		err := svc.DeleteAPIKey(ctx, actor.ID, "00000000-0000-0000-0000-000000000000", keyID)
		assert.ErrorIs(t, err, service.ErrNotFound)
	})
}
