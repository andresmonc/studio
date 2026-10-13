package repository_test

import (
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTeamRepoCRUD(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewTeamRepo(db)
	ctx := t.Context()
	company := testutil.SeedCompany(t, db, "Acme", nil)

	created, err := repo.Create(ctx, company.ID, "Platform", "the platform team")
	require.NoError(t, err)
	assert.NotEmpty(t, created.ID)
	assert.Equal(t, "Platform", created.Name)

	got, err := repo.GetByID(ctx, created.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "the platform team", got.Description)

	missing, err := repo.GetByID(ctx, "00000000-0000-0000-0000-000000000000")
	require.NoError(t, err)
	assert.Nil(t, missing)

	updated, err := repo.Update(ctx, created.ID, new("Platform Eng"), nil)
	require.NoError(t, err)
	assert.Equal(t, "Platform Eng", updated.Name)
	assert.Equal(t, "the platform team", updated.Description, "nil description is preserved")

	_, err = repo.Update(ctx, "00000000-0000-0000-0000-000000000000", new("x"), nil)
	assert.ErrorIs(t, err, repository.ErrNotFound)

	require.NoError(t, repo.Delete(ctx, created.ID))
	assert.ErrorIs(t, repo.Delete(ctx, created.ID), repository.ErrNotFound)
}

func TestTeamRepoListVisibility(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewTeamRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme", nil)
	teamA := testutil.SeedTeam(t, db, company.ID, "A-Team")
	teamB := testutil.SeedTeam(t, db, company.ID, "B-Team")

	// A super admin sees every team.
	admin := testutil.SeedUser(t, db, "admin@acme.com", "Admin", true)
	all, err := repo.List(ctx, admin.ID, true)
	require.NoError(t, err)
	assert.Len(t, all, 2)
	assert.Equal(t, "A-Team", all[0].Name, "ordered by name")

	// An explicit membership in teamA without belonging to the company shows nothing.
	member := testutil.SeedUser(t, db, "member@acme.com", "Member", false)
	testutil.AddTeamMember(t, db, teamA.ID, member.ID, model.RoleEditor)
	visible, err := repo.List(ctx, member.ID, false)
	require.NoError(t, err)
	assert.Empty(t, visible)
	ms, err := repo.Memberships(ctx, member.ID)
	require.NoError(t, err)
	assert.Empty(t, ms)

	// A company member sees every team of the company.
	require.NoError(t, repository.NewCompanyRepo(db).SetMember(ctx, company.ID, member.ID, model.CompanyRoleMember))
	visible, err = repo.List(ctx, member.ID, false)
	require.NoError(t, err)
	assert.Len(t, visible, 2)
	ms, err = repo.Memberships(ctx, member.ID)
	require.NoError(t, err)
	assert.Len(t, ms, 1)

	// ListByCompany returns both teams.
	byCompany, err := repo.ListByCompany(ctx, company.ID)
	require.NoError(t, err)
	assert.Len(t, byCompany, 2)
	_ = teamB
}

func TestTeamRepoMembers(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewTeamRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme", nil)
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)
	require.NoError(t, repository.NewCompanyRepo(db).SetMember(ctx, company.ID, user.ID, model.CompanyRoleMember))

	// No role before joining.
	role, err := repo.GetRole(ctx, team.ID, user.ID)
	require.NoError(t, err)
	assert.Equal(t, model.Role(""), role)

	// AddMember then read back.
	require.NoError(t, repo.AddMember(ctx, team.ID, user.ID, model.RoleViewer))
	role, err = repo.GetRole(ctx, team.ID, user.ID)
	require.NoError(t, err)
	assert.Equal(t, model.RoleViewer, role)

	// AddMember again upserts the role (no duplicate-key error).
	require.NoError(t, repo.AddMember(ctx, team.ID, user.ID, model.RoleEditor))
	role, _ = repo.GetRole(ctx, team.ID, user.ID)
	assert.Equal(t, model.RoleEditor, role)

	members, err := repo.ListMembers(ctx, team.ID)
	require.NoError(t, err)
	require.Len(t, members, 1)
	assert.Equal(t, "u@acme.com", members[0].Email)

	memberships, err := repo.Memberships(ctx, user.ID)
	require.NoError(t, err)
	require.Len(t, memberships, 1)
	assert.Equal(t, team.ID, memberships[0].TeamID)

	require.NoError(t, repo.UpdateMemberRole(ctx, team.ID, user.ID, model.RoleAdmin))
	role, _ = repo.GetRole(ctx, team.ID, user.ID)
	assert.Equal(t, model.RoleAdmin, role)

	stranger := testutil.SeedUser(t, db, "s@acme.com", "S", false)
	assert.ErrorIs(t, repo.UpdateMemberRole(ctx, team.ID, stranger.ID, model.RoleAdmin), repository.ErrNotFound)

	require.NoError(t, repo.RemoveMember(ctx, team.ID, user.ID))
	assert.ErrorIs(t, repo.RemoveMember(ctx, team.ID, user.ID), repository.ErrNotFound)
}
