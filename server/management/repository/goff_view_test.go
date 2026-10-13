package repository_test

import (
	"encoding/json"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestGoffFlagsView runs the exact query GO Feature Flag's postgresql retriever
// issues against the goff_flags view (default columns, flagset filter).
func TestGoffFlagsView(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme", nil)
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	fs := testutil.SeedFlagset(t, db, team.ID, "prod")
	other := testutil.SeedFlagset(t, db, team.ID, "staging")

	testutil.SeedFlag(t, db, fs.ID, "enabled-flag", nil, nil)
	disabled := testutil.SeedFlag(t, db, fs.ID, "disabled-flag", nil, nil)
	deleted := testutil.SeedFlag(t, db, fs.ID, "deleted-flag", nil, nil)
	testutil.SeedFlag(t, db, other.ID, "other-flagset-flag", nil, nil)
	require.NoError(t, repo.SetDisabled(ctx, disabled.ID, true))
	require.NoError(t, repo.SoftDelete(ctx, deleted.ID))

	rows, err := db.Pool.Query(ctx,
		`SELECT "flag_name", "config" FROM "goff_flags" WHERE "flagset" = $1 ORDER BY "flag_name"`, fs.ID)
	require.NoError(t, err)
	defer rows.Close()

	got := map[string]map[string]any{}
	for rows.Next() {
		var name string
		var config []byte
		require.NoError(t, rows.Scan(&name, &config))
		var m map[string]any
		require.NoError(t, json.Unmarshal(config, &m))
		got[name] = m
	}
	require.NoError(t, rows.Err())

	require.Len(t, got, 2, "deleted and other-flagset flags are excluded")
	assert.Equal(t, false, got["enabled-flag"]["disable"])
	assert.Equal(t, true, got["disabled-flag"]["disable"])
	assert.Contains(t, got["enabled-flag"], "variations", "payload is passed through")

	require.NoError(t, repository.NewFlagsetRepo(db).SoftDelete(ctx, other.ID))
	var n int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM "goff_flags" WHERE "flagset" = $1`, other.ID).Scan(&n))
	assert.Zero(t, n, "flags of a deleted flagset are excluded")
}
