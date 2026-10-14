package repository_test

import (
	"context"
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
	company := testutil.SeedCompany(t, db, "Acme")

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

	// Names are unique per company, on create and on rename.
	other, err := repo.Create(ctx, company.ID, "Data", "")
	require.NoError(t, err)
	_, err = repo.Create(ctx, company.ID, "Data", "")
	assert.ErrorIs(t, err, repository.ErrTeamNameTaken)
	_, err = repo.Update(ctx, other.ID, new("Platform Eng"), nil)
	assert.ErrorIs(t, err, repository.ErrTeamNameTaken)
	_, err = repo.Create(ctx, testutil.SeedCompany(t, db, "Globex").ID, "Data", "")
	assert.NoError(t, err, "same name in another company is fine")

	require.NoError(t, repo.Delete(ctx, created.ID))
	assert.ErrorIs(t, repo.Delete(ctx, created.ID), repository.ErrNotFound)
}

func TestTeamRepoListVisibility(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewTeamRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
	testutil.SeedTeam(t, db, company.ID, "A-Team")
	testutil.SeedTeam(t, db, company.ID, "B-Team")
	globex := testutil.SeedCompany(t, db, "Globex")
	testutil.SeedTeam(t, db, globex.ID, "C-Team")

	// A super admin sees every team.
	admin := testutil.SeedUser(t, db, "admin@acme.com", "Admin", true)
	all, err := repo.List(ctx, admin.ID, true)
	require.NoError(t, err)
	assert.Len(t, all, 3)
	assert.Equal(t, "A-Team", all[0].Name, "ordered by name")

	// A user outside any company sees nothing.
	member := testutil.SeedUser(t, db, "member@acme.com", "Member", false)
	visible, err := repo.List(ctx, member.ID, false)
	require.NoError(t, err)
	assert.Empty(t, visible)

	// A company member sees only their company's teams.
	testutil.SetCompanyMember(t, db, company.ID, member.ID, model.CompanyRoleMember)
	visible, err = repo.List(ctx, member.ID, false)
	require.NoError(t, err)
	assert.Len(t, visible, 2)

	byCompany, err := repo.ListByCompany(ctx, company.ID)
	require.NoError(t, err)
	assert.Len(t, byCompany, 2)
}

func TestTeamRepoMembers(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewTeamRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)
	testutil.SetCompanyMember(t, db, company.ID, user.ID, model.CompanyRoleMember)

	// No role before joining.
	role, err := repo.GetRole(ctx, team.ID, user.ID)
	require.NoError(t, err)
	assert.Equal(t, model.Role(""), role)

	// SetMember adds, then read back.
	m, prev, err := repo.SetMember(ctx, team.ID, user.ID, model.RoleViewer)
	require.NoError(t, err)
	assert.Equal(t, model.Role(""), prev, "newly added")
	assert.Equal(t, "u@acme.com", m.Email)
	assert.Equal(t, model.RoleViewer, m.Role)
	assert.False(t, m.CreatedAt.IsZero())
	role, err = repo.GetRole(ctx, team.ID, user.ID)
	require.NoError(t, err)
	assert.Equal(t, model.RoleViewer, role)

	// SetMember again upserts the role and reports the previous one.
	_, prev, err = repo.SetMember(ctx, team.ID, user.ID, model.RoleEditor)
	require.NoError(t, err)
	assert.Equal(t, model.RoleViewer, prev)
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

	prev, err = repo.UpdateMemberRole(ctx, team.ID, user.ID, model.RoleAdmin)
	require.NoError(t, err)
	assert.Equal(t, model.RoleEditor, prev)
	role, _ = repo.GetRole(ctx, team.ID, user.ID)
	assert.Equal(t, model.RoleAdmin, role)

	stranger := testutil.SeedUser(t, db, "s@acme.com", "S", false)
	_, err = repo.UpdateMemberRole(ctx, team.ID, stranger.ID, model.RoleAdmin)
	assert.ErrorIs(t, err, repository.ErrNotFound)

	// Only users of the team's company can join it.
	_, _, err = repo.SetMember(ctx, team.ID, stranger.ID, model.RoleEditor)
	assert.ErrorIs(t, err, repository.ErrConflictOrNotFound)
	missingTeam := "00000000-0000-0000-0000-000000000000"
	_, _, err = repo.SetMember(ctx, missingTeam, user.ID, model.RoleEditor)
	assert.ErrorIs(t, err, repository.ErrConflictOrNotFound)

	// A membership row outside the user's company grants no role and isn't listed.
	_, err = db.Pool.Exec(ctx,
		`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'admin')`, team.ID, stranger.ID)
	require.NoError(t, err)
	role, err = repo.GetRole(ctx, team.ID, stranger.ID)
	require.NoError(t, err)
	assert.Equal(t, model.Role(""), role)
	memberships, err = repo.Memberships(ctx, stranger.ID)
	require.NoError(t, err)
	assert.Empty(t, memberships)

	prev, err = repo.RemoveMember(ctx, team.ID, user.ID)
	require.NoError(t, err)
	assert.Equal(t, model.RoleAdmin, prev)
	_, err = repo.RemoveMember(ctx, team.ID, user.ID)
	assert.ErrorIs(t, err, repository.ErrNotFound)
}

func TestTeamRepoQueryErrors(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewTeamRepo(db)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	id := "00000000-0000-0000-0000-000000000000"

	_, err := repo.Create(ctx, id, "x", "")
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.GetByID(ctx, id)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.List(ctx, id, false)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.Update(ctx, id, nil, nil)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.GetRole(ctx, id, id)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.ListMembers(ctx, id)
	assert.ErrorIs(t, err, context.Canceled)
	_, _, err = repo.SetMember(ctx, id, id, model.RoleViewer)
	assert.ErrorIs(t, err, context.Canceled)
	_, _, err = repo.CreateWithAdmin(ctx, id, "x", "", id)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.Memberships(ctx, id)
	assert.ErrorIs(t, err, context.Canceled)
}

func TestTeamRepoCreateWithAdmin(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewTeamRepo(db)
	ctx := t.Context()
	company := testutil.SeedCompany(t, db, "Acme")
	admin := testutil.SeedUser(t, db, "a@acme.com", "A", false)
	testutil.SetCompanyMember(t, db, company.ID, admin.ID, model.CompanyRoleMember)
	outsider := testutil.SeedUser(t, db, "o@x.com", "O", false)
	countTeams := func() int {
		var n int
		require.NoError(t, db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM teams`).Scan(&n))
		return n
	}

	team, m, err := repo.CreateWithAdmin(ctx, company.ID, "Platform", "", admin.ID)
	require.NoError(t, err)
	assert.Equal(t, team.ID, m.TeamID)
	assert.Equal(t, model.RoleAdmin, m.Role)

	tests := []struct {
		name    string
		team    string
		adminID string
		wantErr error
	}{
		{"admin outside the company rolls the team back", "T1", outsider.ID, repository.ErrConflictOrNotFound},
		{"name taken", "Platform", admin.ID, repository.ErrTeamNameTaken},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, _, err := repo.CreateWithAdmin(ctx, company.ID, tt.team, "", tt.adminID)
			assert.ErrorIs(t, err, tt.wantErr)
			assert.Equal(t, 1, countTeams(), "no team left behind")
		})
	}
}
