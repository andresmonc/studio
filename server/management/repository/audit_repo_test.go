package repository_test

import (
	"bytes"
	"context"
	"log/slog"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAuditRepoRecordAndList(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewAuditRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme", nil)
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", false)

	// Record (no tx) with structured before/after.
	require.NoError(t, repo.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actor.ID,
		CompanyID:   &company.ID,
		TeamID:      &team.ID,
		Action:      "team.create",
		TargetType:  "team",
		TargetID:    team.ID,
		After:       map[string]any{"name": "Platform"},
	}))
	require.NoError(t, repo.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actor.ID,
		CompanyID:   &company.ID,
		Action:      "company.update",
		TargetType:  "company",
		TargetID:    company.ID,
	}))

	// List all for the company.
	entries, total, err := repo.List(ctx, model.AuditFilters{CompanyID: &company.ID})
	require.NoError(t, err)
	assert.Equal(t, 2, total)
	require.Len(t, entries, 2)
	// Joined actor email is populated.
	assert.Equal(t, "actor@acme.com", *entries[0].ActorEmail)

	// Filter by action.
	action := "team.create"
	entries, total, err = repo.List(ctx, model.AuditFilters{CompanyID: &company.ID, Action: &action})
	require.NoError(t, err)
	assert.Equal(t, 1, total)
	require.Len(t, entries, 1)
	assert.Equal(t, "team.create", entries[0].Action)
	assert.JSONEq(t, `{"name":"Platform"}`, string(entries[0].After))

	// Filter by team.
	_, total, err = repo.List(ctx, model.AuditFilters{TeamID: &team.ID})
	require.NoError(t, err)
	assert.Equal(t, 1, total)

	// ScopeCompanyID also matches team-scoped events owned by the company.
	_, total, err = repo.List(ctx, model.AuditFilters{ScopeCompanyID: &company.ID})
	require.NoError(t, err)
	assert.Equal(t, 2, total)

	// Entries sharing a timestamp page deterministically, newest id first.
	_, err = db.Pool.Exec(ctx, `UPDATE audit_log SET occurred_at = '2026-01-01T00:00:00Z'`)
	require.NoError(t, err)
	page1, _, err := repo.List(ctx, model.AuditFilters{Page: 1, PageSize: 1})
	require.NoError(t, err)
	page2, _, err := repo.List(ctx, model.AuditFilters{Page: 2, PageSize: 1})
	require.NoError(t, err)
	require.Len(t, page1, 1)
	require.Len(t, page2, 1)
	assert.Greater(t, page1[0].ID, page2[0].ID)
}

func TestAuditRepoRecordLogsFailure(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewAuditRepo(db)

	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })

	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	err := repo.Record(ctx, nil, repository.AuditInput{Action: "team.create", TargetType: "team", TargetID: "t1"})

	require.Error(t, err)
	assert.Contains(t, buf.String(), "audit write failed")
	assert.Contains(t, buf.String(), "action=team.create")
}
