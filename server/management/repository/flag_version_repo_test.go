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

func TestFlagVersionRepoInsertAndList(t *testing.T) {
	db := testutil.StartPostgres(t)
	versions := repository.NewFlagVersionRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	fs := testutil.SeedFlagset(t, db, team.ID, "prod")
	user := testutil.SeedUser(t, db, "u@acme.com", "Author", false)
	// SeedFlag creates version 1.
	flag := testutil.SeedFlag(t, db, fs.ID, "my-flag", nil, &user.ID)

	// Insert version 2 — version_number auto-increments.
	var v2 string
	require.NoError(t, pgx.BeginFunc(ctx, db.Pool, func(tx pgx.Tx) error {
		v, err := versions.Insert(ctx, tx, flag.ID, json.RawMessage(`{"variations":{"a":"x","b":"y"},"defaultRule":{"variation":"a"}}`), "second", &user.ID)
		if err != nil {
			return err
		}
		assert.Equal(t, 2, v.VersionNumber)
		v2 = v.ID
		return nil
	}))
	assert.NotEmpty(t, v2)

	// GetByFlagAndNumber resolves the author name via the join.
	got, err := versions.GetByFlagAndNumber(ctx, flag.ID, 2)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "second", got.Comment)
	require.NotNil(t, got.CreatedByName)
	assert.Equal(t, "Author", *got.CreatedByName)

	// Missing version -> nil, nil.
	missing, err := versions.GetByFlagAndNumber(ctx, flag.ID, 99)
	require.NoError(t, err)
	assert.Nil(t, missing)

	// ListByFlag is ordered version DESC with a correct total.
	list, total, err := versions.ListByFlag(ctx, flag.ID, 10, 0)
	require.NoError(t, err)
	assert.Equal(t, 2, total)
	require.Len(t, list, 2)
	assert.Equal(t, 2, list[0].VersionNumber, "newest first")
	assert.Equal(t, 1, list[1].VersionNumber)

	// Pagination via limit/offset.
	page2, total, err := versions.ListByFlag(ctx, flag.ID, 1, 1)
	require.NoError(t, err)
	assert.Equal(t, 2, total)
	require.Len(t, page2, 1)
	assert.Equal(t, 1, page2[0].VersionNumber)

	// A deleted flag's history is hidden.
	require.NoError(t, repository.NewFlagRepo(db).SoftDelete(ctx, flag.ID))
	gone, err := versions.GetByFlagAndNumber(ctx, flag.ID, 1)
	require.NoError(t, err)
	assert.Nil(t, gone)
	list, total, err = versions.ListByFlag(ctx, flag.ID, 10, 0)
	require.NoError(t, err)
	assert.Zero(t, total)
	assert.Empty(t, list)
}
