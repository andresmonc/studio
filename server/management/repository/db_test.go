package repository_test

import (
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A malformed id makes Postgres fail the uuid cast (22P02); lookups must report
// it as not found, not as a server error.
func TestLookupMalformedIDIsNotFound(t *testing.T) {
	db := testutil.StartPostgres(t)
	ctx := t.Context()

	team, err := repository.NewTeamRepo(db).GetByID(ctx, "not-a-uuid")
	require.NoError(t, err)
	assert.Nil(t, team)

	_, err = repository.NewFlagRepo(db).GetFlagsetID(ctx, "not-a-uuid")
	assert.ErrorIs(t, err, repository.ErrNotFound)
}
