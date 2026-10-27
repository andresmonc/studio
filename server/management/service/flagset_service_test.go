package service_test

import (
	"context"
	"encoding/json"
	"fmt"
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
	return service.NewFlagsetService(repository.NewFlagsetRepo(db), repository.NewAuditRepo(db))
}

func seedTeamForFlagset(t *testing.T, db *repository.DB) *model.Team {
	t.Helper()
	return testutil.SeedTeam(t, db, testutil.SeedCompany(t, db, "Acme").ID, "Platform")
}

func TestFlagsetServiceCRUD(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newFlagsetService(db)
	ctx := t.Context()
	team := seedTeamForFlagset(t, db)
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)

	created, err := svc.Create(ctx, actor.ID, team.ID, &model.CreateFlagsetRequest{Name: " default "})
	require.NoError(t, err)
	assert.Equal(t, "default", created.Name, "name is trimmed")
	assert.Equal(t, team.ID, created.TeamID)
	assert.Equal(t, 1, created.APIKeyCount, "a default key is provisioned")
	assert.Equal(t, 1, auditCount(t, db, model.AuditActionCreate, model.AuditTargetFlagset))
	assert.Equal(t, 1, auditCount(t, db, model.AuditActionCreate, model.AuditTargetAPIKey))
	keys, err := svc.ListAPIKeys(ctx, created.ID)
	require.NoError(t, err)
	require.Len(t, keys, 1)
	assert.Equal(t, "default", keys[0].Label)

	t.Run("duplicate name -> conflict", func(t *testing.T) {
		_, err := svc.Create(ctx, actor.ID, team.ID, &model.CreateFlagsetRequest{Name: "default"})
		assert.ErrorIs(t, err, service.ErrConflict)
	})

	t.Run("get and list", func(t *testing.T) {
		got, err := svc.Get(ctx, created.ID)
		require.NoError(t, err)
		assert.Equal(t, created.ID, got.ID)
		teamID, err := svc.TeamID(ctx, created.ID)
		require.NoError(t, err)
		assert.Equal(t, team.ID, teamID)
		_, err = svc.TeamID(ctx, "00000000-0000-0000-0000-000000000000")
		assert.ErrorIs(t, err, service.ErrNotFound)
		list, err := svc.ListByTeam(ctx, team.ID)
		require.NoError(t, err)
		assert.Len(t, list, 1)
	})

	t.Run("update with audit", func(t *testing.T) {
		fs, err := svc.Update(ctx, actor.ID, created.ID, &model.UpdateFlagsetRequest{
			Description:                     new("updated"),
			EvaluationContextEnrichment:     json.RawMessage(`null`),
			DefaultTestingEvaluationContext: json.RawMessage(`{"targetingKey":"k"}`),
		})
		require.NoError(t, err)
		assert.Equal(t, "updated", fs.Description)
		assert.JSONEq(t, `{"targetingKey":"k"}`, string(fs.DefaultTestingEvaluationContext))
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionUpdate, model.AuditTargetFlagset))
	})

	t.Run("update missing -> not found", func(t *testing.T) {
		_, err := svc.Update(ctx, actor.ID, "00000000-0000-0000-0000-000000000000",
			&model.UpdateFlagsetRequest{Description: new("x")})
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("delete with audit", func(t *testing.T) {
		require.NoError(t, svc.Delete(ctx, actor.ID, created.ID))
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionDelete, model.AuditTargetFlagset))
		_, err := svc.Get(ctx, created.ID)
		assert.ErrorIs(t, err, service.ErrNotFound)
		assert.ErrorIs(t, svc.Delete(ctx, actor.ID, created.ID), service.ErrNotFound)
	})
}

func TestFlagsetServiceValidation(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newFlagsetService(db)
	team := seedTeamForFlagset(t, db)
	fs := testutil.SeedFlagset(t, db, team.ID, "prod")

	createTests := []struct {
		name       string
		req        model.CreateFlagsetRequest
		wantFields []string
	}{
		{"empty name", model.CreateFlagsetRequest{}, []string{"name"}},
		{"non-object evaluation context", model.CreateFlagsetRequest{
			Name: "ctx", EvaluationContextEnrichment: json.RawMessage(`["a"]`),
		}, []string{"evaluationContextEnrichment"}},
		{"every problem at once", model.CreateFlagsetRequest{
			EvaluationContextEnrichment:     json.RawMessage(`42`),
			DefaultTestingEvaluationContext: json.RawMessage(`{`),
		}, []string{"name", "evaluationContextEnrichment", "defaultTestingEvaluationContext"}},
	}
	for _, tt := range createTests {
		t.Run("create: "+tt.name, func(t *testing.T) {
			_, err := svc.Create(t.Context(), "", team.ID, &tt.req)
			assert.Equal(t, tt.wantFields, validationFields(t, err))
		})
	}

	updateTests := []struct {
		name       string
		req        model.UpdateFlagsetRequest
		wantFields []string
	}{
		{"blank name", model.UpdateFlagsetRequest{Name: new("  ")}, []string{"name"}},
		{"string evaluation context", model.UpdateFlagsetRequest{
			DefaultTestingEvaluationContext: json.RawMessage(`"x"`),
		}, []string{"defaultTestingEvaluationContext"}},
	}
	for _, tt := range updateTests {
		t.Run("update: "+tt.name, func(t *testing.T) {
			_, err := svc.Update(t.Context(), "", fs.ID, &tt.req)
			assert.Equal(t, tt.wantFields, validationFields(t, err))
		})
	}
}

func TestFlagsetServiceAPIKeys(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newFlagsetService(db)
	ctx := t.Context()
	team := seedTeamForFlagset(t, db)
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)
	fs := testutil.SeedFlagset(t, db, team.ID, "default")
	otherFs := testutil.SeedFlagset(t, db, team.ID, "other")

	k, err := svc.CreateAPIKey(ctx, actor.ID, fs.ID, "ci")
	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(k.APIKey, "goff_"))
	assert.Len(t, k.APIKey, len("goff_")+64)
	assert.Equal(t, "ci", k.Label)
	assert.Equal(t, 1, auditCount(t, db, model.AuditActionCreate, model.AuditTargetAPIKey))
	assertLastAudit(t, db, model.AuditTargetAPIKey, k.ID, "", `{"label":"ci"}`)

	t.Run("blank label -> validation error", func(t *testing.T) {
		_, err := svc.CreateAPIKey(ctx, actor.ID, fs.ID, "  ")
		assert.Equal(t, []string{"label"}, validationFields(t, err))
	})

	t.Run("list keys of a missing flagset -> not found", func(t *testing.T) {
		_, err := svc.ListAPIKeys(ctx, "00000000-0000-0000-0000-000000000000")
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("missing or deleted flagset -> not found", func(t *testing.T) {
		_, err := svc.CreateAPIKey(ctx, actor.ID, "00000000-0000-0000-0000-000000000000", "x")
		assert.ErrorIs(t, err, service.ErrNotFound)
		gone := testutil.SeedFlagset(t, db, team.ID, "gone")
		require.NoError(t, svc.Delete(ctx, actor.ID, gone.ID))
		_, err = svc.CreateAPIKey(ctx, actor.ID, gone.ID, "x")
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("key of another flagset -> not found", func(t *testing.T) {
		assert.ErrorIs(t, svc.DeleteAPIKey(ctx, actor.ID, otherFs.ID, k.ID), service.ErrNotFound)
	})

	t.Run("delete with audit", func(t *testing.T) {
		require.NoError(t, svc.DeleteAPIKey(ctx, actor.ID, fs.ID, k.ID))
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionDelete, model.AuditTargetAPIKey))
		assertLastAudit(t, db, model.AuditTargetAPIKey, k.ID, `{"label":"ci"}`, "")
		keys, err := svc.ListAPIKeys(ctx, fs.ID)
		require.NoError(t, err)
		assert.Empty(t, keys)
		assert.ErrorIs(t, svc.DeleteAPIKey(ctx, actor.ID, fs.ID, k.ID), service.ErrNotFound)
	})

	t.Run("delete on missing flagset -> not found", func(t *testing.T) {
		err := svc.DeleteAPIKey(ctx, actor.ID, "00000000-0000-0000-0000-000000000000", k.ID)
		assert.ErrorIs(t, err, service.ErrNotFound)
	})
}

func TestFlagsetServiceQueryErrors(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newFlagsetService(db)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	id := "00000000-0000-0000-0000-000000000000"

	_, err := svc.Create(ctx, id, id, &model.CreateFlagsetRequest{Name: "x"})
	assert.ErrorIs(t, err, context.Canceled)
	_, err = svc.Update(ctx, id, id, &model.UpdateFlagsetRequest{})
	assert.ErrorIs(t, err, context.Canceled)
	assert.ErrorIs(t, svc.Delete(ctx, id, id), context.Canceled)
	_, err = svc.CreateAPIKey(ctx, id, id, "x")
	assert.ErrorIs(t, err, context.Canceled)
	assert.ErrorIs(t, svc.DeleteAPIKey(ctx, id, id, id), context.Canceled)
}

func TestFlagsetServiceRelayProxyConfig(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newFlagsetService(db)
	ctx := t.Context()
	team := seedTeamForFlagset(t, db)
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)
	fs, err := svc.Create(ctx, actor.ID, team.ID, &model.CreateFlagsetRequest{Name: "prod"})
	require.NoError(t, err)
	keys, err := svc.ListAPIKeys(ctx, fs.ID)
	require.NoError(t, err)
	require.Len(t, keys, 1)

	t.Run("renders the company's flagsets on Studio's database", func(t *testing.T) {
		out, err := svc.RelayProxyConfig(ctx, team.CompanyID)
		require.NoError(t, err)
		cfg := db.Pool.Config().ConnConfig
		assert.Contains(t, out, `- name: "`+fs.ID+`"`)
		assert.Contains(t, out, `- "`+keys[0].APIKey+`"`)
		assert.Contains(t, out, fmt.Sprintf("@%s:%d/%s", cfg.Host, cfg.Port, cfg.Database))
	})

	t.Run("unknown company -> not found", func(t *testing.T) {
		_, err := svc.RelayProxyConfig(ctx, "00000000-0000-0000-0000-000000000000")
		assert.ErrorIs(t, err, service.ErrNotFound)
	})
}
