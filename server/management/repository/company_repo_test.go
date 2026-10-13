package repository_test

import (
	"errors"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCompanyRepoCRUD(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewCompanyRepo(db)
	ctx := t.Context()

	// Create
	created, err := repo.Create(ctx, "Acme", new("acme.com"), "desc")
	require.NoError(t, err)
	assert.NotEmpty(t, created.ID)
	assert.Equal(t, "Acme", created.DisplayName)
	require.NotNil(t, created.Domain)
	assert.Equal(t, "acme.com", *created.Domain)

	// GetByID
	got, err := repo.GetByID(ctx, created.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, created.ID, got.ID)

	// GetByID missing -> nil, nil
	missing, err := repo.GetByID(ctx, "00000000-0000-0000-0000-000000000000")
	require.NoError(t, err)
	assert.Nil(t, missing)

	// FindByDomain (citext, case-insensitive)
	byDomain, err := repo.FindByDomain(ctx, "ACME.COM")
	require.NoError(t, err)
	require.NotNil(t, byDomain)
	assert.Equal(t, created.ID, byDomain.ID)

	// FindByDomain empty -> nil
	none, err := repo.FindByDomain(ctx, "")
	require.NoError(t, err)
	assert.Nil(t, none)

	// List
	_ = testutil.SeedCompany(t, db, "Beta", nil)
	list, err := repo.List(ctx)
	require.NoError(t, err)
	assert.Len(t, list, 2)
	assert.Equal(t, "Acme", list[0].DisplayName) // ordered by display_name

	// Update display name + clear domain
	updated, err := repo.Update(ctx, created.ID, new("Acme Inc"), nil, nil, true)
	require.NoError(t, err)
	assert.Equal(t, "Acme Inc", updated.DisplayName)
	assert.Nil(t, updated.Domain)

	// Update missing -> ErrNotFound
	_, err = repo.Update(ctx, "00000000-0000-0000-0000-000000000000", new("x"), nil, nil, false)
	assert.ErrorIs(t, err, repository.ErrNotFound)

	// Delete
	require.NoError(t, repo.Delete(ctx, created.ID))
	assert.ErrorIs(t, repo.Delete(ctx, created.ID), repository.ErrNotFound)
}

func TestCompanyRepoMembership(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewCompanyRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme", nil)
	other := testutil.SeedCompany(t, db, "Beta", nil)
	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)

	// SetMember attaches a user with no company.
	require.NoError(t, repo.SetMember(ctx, company.ID, user.ID, model.CompanyRoleMember))

	mem, err := repo.Membership(ctx, user.ID)
	require.NoError(t, err)
	require.NotNil(t, mem)
	assert.Equal(t, company.ID, mem.CompanyID)
	assert.Equal(t, model.CompanyRoleMember, mem.Role)

	// SetMember to a different company conflicts (one company per user).
	err = repo.SetMember(ctx, other.ID, user.ID, model.CompanyRoleMember)
	assert.ErrorIs(t, err, repository.ErrConflictOrNotFound)

	// ListMembers
	members, err := repo.ListMembers(ctx, company.ID)
	require.NoError(t, err)
	require.Len(t, members, 1)
	assert.Equal(t, "u@acme.com", members[0].Email)

	// UpdateMemberRole
	require.NoError(t, repo.UpdateMemberRole(ctx, company.ID, user.ID, model.CompanyRoleAdmin))
	mem, _ = repo.Membership(ctx, user.ID)
	assert.Equal(t, model.CompanyRoleAdmin, mem.Role)

	// UpdateMemberRole on a non-member -> ErrNotFound
	stranger := testutil.SeedUser(t, db, "s@x.com", "S", false)
	assert.ErrorIs(t, repo.UpdateMemberRole(ctx, company.ID, stranger.ID, model.CompanyRoleAdmin), repository.ErrNotFound)

	// RemoveMember
	require.NoError(t, repo.RemoveMember(ctx, company.ID, user.ID))
	mem, err = repo.Membership(ctx, user.ID)
	require.NoError(t, err)
	assert.Nil(t, mem)
	assert.True(t, errors.Is(repo.RemoveMember(ctx, company.ID, user.ID), repository.ErrNotFound))
}
