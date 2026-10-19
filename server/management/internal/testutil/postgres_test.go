package testutil

import (
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// StartPostgres hands every test an empty database: each table the
// migrations created is truncated, whatever its foreign keys.
func TestStartPostgresEmptiesEveryTable(t *testing.T) {
	db := StartPostgres(t)
	ctx := t.Context()
	company := SeedCompany(t, db, "Acme")
	team := SeedTeam(t, db, company.ID, "Platform")
	user := SeedUser(t, db, "u@acme.com", "U", false)
	SetCompanyMember(t, db, company.ID, user.ID, model.CompanyRoleMember)
	AddTeamMember(t, db, team.ID, user.ID, model.RoleViewer)
	fs := SeedFlagset(t, db, team.ID, "prod")
	SeedFlag(t, db, fs.ID, "f", []byte(`{"variations":{"on":true,"off":false},"defaultRule":{"variation":"on"},"metadata":{"tags":["t"]}}`), &user.ID)
	_, err := repository.NewFlagsetRepo(db).InsertAPIKey(ctx, fs.ID, "k", "goff_k", user.ID)
	require.NoError(t, err)
	require.NoError(t, repository.NewAuditRepo(db).Record(ctx, nil, repository.AuditInput{
		CompanyID: &company.ID, Action: model.AuditActionCreate, TargetType: model.AuditTargetCompany, TargetID: company.ID,
	}))

	tables, err := migratedTables(ctx, db)
	require.NoError(t, err)
	count := func(table string) int {
		var n int
		require.NoError(t, db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM "+table).Scan(&n))
		return n
	}
	for _, table := range tables {
		require.Positive(t, count(table), "%s is seeded, so the check below means something", table)
	}

	db = StartPostgres(t)
	for _, table := range tables {
		assert.Zero(t, count(table), table)
	}
}
