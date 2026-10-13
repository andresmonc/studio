package repository_test

import (
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUserRepoUpsertAndLookups(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewUserRepo(db)
	ctx := t.Context()

	// Insert via OIDC upsert.
	u, err := repo.UpsertFromOIDC(ctx, "Alice@Example.com", "Alice", "http://a/avatar.png", "sub-1", false)
	require.NoError(t, err)
	assert.NotEmpty(t, u.ID)
	assert.Equal(t, "alice@example.com", u.Email, "email is lowercased")
	assert.False(t, u.IsSuperAdmin)

	// Upsert again with same email promotes super admin and updates name.
	u2, err := repo.UpsertFromOIDC(ctx, "alice@example.com", "Alice B", "", "sub-1", true)
	require.NoError(t, err)
	assert.Equal(t, u.ID, u2.ID, "same email upserts the same row")
	assert.Equal(t, "Alice B", u2.Name)
	assert.True(t, u2.IsSuperAdmin)

	// Super admin follows the config on every login: dropped from it -> demoted.
	u3, err := repo.UpsertFromOIDC(ctx, "alice@example.com", "Alice B", "", "sub-1", false)
	require.NoError(t, err)
	assert.False(t, u3.IsSuperAdmin, "is_super_admin is not sticky")

	// Lookups.
	byID, err := repo.GetByID(ctx, u.ID)
	require.NoError(t, err)
	require.NotNil(t, byID)
	assert.Equal(t, u.ID, byID.ID)

	byEmail, err := repo.GetByEmail(ctx, "alice@example.com")
	require.NoError(t, err)
	require.NotNil(t, byEmail)
	assert.Equal(t, u.ID, byEmail.ID)

	// Missing lookups return nil, nil.
	missing, err := repo.GetByID(ctx, "00000000-0000-0000-0000-000000000000")
	require.NoError(t, err)
	assert.Nil(t, missing)

	missingEmail, err := repo.GetByEmail(ctx, "nobody@example.com")
	require.NoError(t, err)
	assert.Nil(t, missingEmail)
}

func TestUserRepoUpsertBindsSub(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewUserRepo(db)
	ctx := t.Context()

	// Seeded users have no sub yet: the first login binds it.
	_, err := db.Pool.Exec(ctx, `INSERT INTO users (email, name) VALUES ('seeded@example.com', 'Seeded')`)
	require.NoError(t, err)
	u, err := repo.UpsertFromOIDC(ctx, "seeded@example.com", "Seeded", "", "sub-a", false)
	require.NoError(t, err)
	require.NotNil(t, u.OIDCSub)
	assert.Equal(t, "sub-a", *u.OIDCSub)

	// Another identity claiming the same email is rejected and changes nothing.
	_, err = repo.UpsertFromOIDC(ctx, "seeded@example.com", "Mallory", "", "sub-b", true)
	require.ErrorIs(t, err, repository.ErrIdentityMismatch)
	got, err := repo.GetByEmail(ctx, "seeded@example.com")
	require.NoError(t, err)
	assert.Equal(t, "sub-a", *got.OIDCSub)
	assert.False(t, got.IsSuperAdmin)
}
