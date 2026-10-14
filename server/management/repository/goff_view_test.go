package repository_test

import (
	"encoding/json"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// goffRow is one row of the goff_flags view, config decoded.
type goffRow struct {
	name   string
	config map[string]any
}

// queryGoff runs the exact query GO Feature Flag's postgresql retriever issues
// against the goff_flags view (default columns, flagset filter), keeping every
// row so duplicates show up.
func queryGoff(t *testing.T, db *repository.DB, flagsetID string) []goffRow {
	t.Helper()
	rows, err := db.Pool.Query(t.Context(),
		`SELECT "flag_name", "config" FROM "goff_flags" WHERE "flagset" = $1 ORDER BY "flag_name"`, flagsetID)
	require.NoError(t, err)
	defer rows.Close()
	var out []goffRow
	for rows.Next() {
		var r goffRow
		var config []byte
		require.NoError(t, rows.Scan(&r.name, &config))
		require.NoError(t, json.Unmarshal(config, &r.config))
		out = append(out, r)
	}
	require.NoError(t, rows.Err())
	return out
}

func decode(t *testing.T, payload string, disable bool) map[string]any {
	t.Helper()
	var m map[string]any
	require.NoError(t, json.Unmarshal([]byte(payload), &m))
	m["disable"] = disable
	return m
}

func TestGoffFlagsView(t *testing.T) {
	db := testutil.StartPostgres(t)
	flags := repository.NewFlagRepo(db)
	versions := repository.NewFlagVersionRepo(db)
	ctx := t.Context()

	team := testutil.SeedTeam(t, db, testutil.SeedCompany(t, db, "Acme").ID, "Platform")
	fs := testutil.SeedFlagset(t, db, team.ID, "prod")
	other := testutil.SeedFlagset(t, db, team.ID, "staging")

	// The payload's own "disable" must lose to the flags.disabled column.
	selfEnabling := `{"variations":{"on":true},"defaultRule":{"variation":"on"},"disable":false}`
	testutil.SeedFlag(t, db, fs.ID, "a-enabled", nil, nil)
	disabled := testutil.SeedFlag(t, db, fs.ID, "b-disabled", []byte(selfEnabling), nil)
	deleted := testutil.SeedFlag(t, db, fs.ID, "c-deleted", nil, nil)
	require.NoError(t, flags.SetDisabled(ctx, disabled.ID, true))
	require.NoError(t, flags.SoftDelete(ctx, deleted.ID))

	// A flag with a newer version than its current one: only the current
	// (pinned, e.g. after a rollback) version is served.
	pinned := testutil.SeedFlag(t, db, fs.ID, "d-pinned", nil, nil)
	newer := `{"variations":{"on":true,"off":false},"defaultRule":{"variation":"off"}}`
	require.NoError(t, pgx.BeginFunc(ctx, db.Pool, func(tx pgx.Tx) error {
		_, err := versions.Insert(ctx, tx, pinned.ID, []byte(newer), "not current", nil)
		return err
	}))
	// A flag without any version yet is not served.
	require.NoError(t, pgx.BeginFunc(ctx, db.Pool, func(tx pgx.Tx) error {
		_, err := flags.Create(ctx, tx, fs.ID, "e-no-version")
		return err
	}))
	testutil.SeedFlag(t, db, other.ID, "other-flagset-flag", nil, nil)

	assert.Equal(t, []goffRow{
		{"a-enabled", decode(t, testutil.DefaultFlagPayload, false)},
		{"b-disabled", decode(t, selfEnabling, true)},
		{"d-pinned", decode(t, testutil.DefaultFlagPayload, false)},
	}, queryGoff(t, db, fs.ID))

	// Only the parent is marked deleted, so the view's own flagset check is
	// what hides the still-live flag (SoftDelete would also delete the flag).
	require.Len(t, queryGoff(t, db, other.ID), 1, "served before the flagset is deleted")
	_, err := db.Pool.Exec(ctx, `UPDATE flagsets SET deleted_at = NOW() WHERE id = $1`, other.ID)
	require.NoError(t, err)
	assert.Empty(t, queryGoff(t, db, other.ID), "flags of a deleted flagset are excluded")
}
