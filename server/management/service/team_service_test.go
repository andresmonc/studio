package service_test

import (
	"strings"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTeamService(db *repository.DB) *service.TeamService {
	return service.NewTeamService(
		repository.NewTeamRepo(db),
		repository.NewUserRepo(db),
		repository.NewCompanyRepo(db),
		repository.NewAuditRepo(db),
	)
}

func TestTeamServiceCreate(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newTeamService(db)
	ctx := t.Context()
	company := testutil.SeedCompany(t, db, "Acme", new("acme.com"))
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)
	admin := testutil.SeedUser(t, db, "admin@acme.com", "Admin", false)
	require.NoError(t, repository.NewCompanyRepo(db).SetMember(ctx, company.ID, admin.ID, model.CompanyRoleMember))

	t.Run("happy path creates team, admin membership, two audit rows", func(t *testing.T) {
		team, err := svc.Create(ctx, actor.ID, company.ID, &model.CreateTeamRequest{
			Name: "Platform", AdminEmail: "admin@acme.com",
		})
		require.NoError(t, err)
		assert.Equal(t, "Platform", team.Name)

		role, err := svc.Role(ctx, team.ID, admin.ID)
		require.NoError(t, err)
		assert.Equal(t, model.RoleAdmin, role)

		assert.Equal(t, 1, auditCount(t, db, "team.create"))
		assert.Equal(t, 1, auditCount(t, db, "team.member.add"))
	})

	t.Run("missing name -> validation error", func(t *testing.T) {
		_, err := svc.Create(ctx, actor.ID, company.ID, &model.CreateTeamRequest{AdminEmail: "admin@acme.com"})
		var ve model.ValidationErrors
		assert.ErrorAs(t, err, &ve)
	})

	t.Run("blank or over-long name -> validation error", func(t *testing.T) {
		for _, name := range []string{"   ", strings.Repeat("x", 121)} {
			_, err := svc.Create(ctx, actor.ID, company.ID, &model.CreateTeamRequest{Name: name, AdminEmail: "admin@acme.com"})
			var ve model.ValidationErrors
			assert.ErrorAs(t, err, &ve, "name %q", name)
		}
	})

	t.Run("missing admin email -> validation error", func(t *testing.T) {
		_, err := svc.Create(ctx, actor.ID, company.ID, &model.CreateTeamRequest{Name: "X"})
		var ve model.ValidationErrors
		assert.ErrorAs(t, err, &ve)
	})

	t.Run("admin user not found -> not found", func(t *testing.T) {
		_, err := svc.Create(ctx, actor.ID, company.ID, &model.CreateTeamRequest{
			Name: "X", AdminEmail: "nobody@acme.com",
		})
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("admin not in company -> not found", func(t *testing.T) {
		outsider := testutil.SeedUser(t, db, "outsider@x.com", "Out", false)
		_ = outsider
		_, err := svc.Create(ctx, actor.ID, company.ID, &model.CreateTeamRequest{
			Name: "X", AdminEmail: "outsider@x.com",
		})
		assert.ErrorIs(t, err, service.ErrNotFound)
	})
}

func TestTeamServiceUpdateDelete(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newTeamService(db)
	ctx := t.Context()
	company := testutil.SeedCompany(t, db, "Acme", nil)
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)

	t.Run("update happy path with audit", func(t *testing.T) {
		updated, err := svc.Update(ctx, actor.ID, team.ID, &model.UpdateTeamRequest{Name: new("Core")})
		require.NoError(t, err)
		assert.Equal(t, "Core", updated.Name)
		assert.Equal(t, 1, auditCount(t, db, "team.update"))
	})

	t.Run("update missing -> not found", func(t *testing.T) {
		_, err := svc.Update(ctx, actor.ID, "00000000-0000-0000-0000-000000000000",
			&model.UpdateTeamRequest{Name: new("X")})
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("update blank name -> validation error, name is trimmed", func(t *testing.T) {
		_, err := svc.Update(ctx, actor.ID, team.ID, &model.UpdateTeamRequest{Name: new("  ")})
		var ve model.ValidationErrors
		assert.ErrorAs(t, err, &ve)

		updated, err := svc.Update(ctx, actor.ID, team.ID, &model.UpdateTeamRequest{Name: new(" Core ")})
		require.NoError(t, err)
		assert.Equal(t, "Core", updated.Name)
	})

	t.Run("delete happy path records audit and removes the team", func(t *testing.T) {
		require.NoError(t, svc.Delete(ctx, actor.ID, team.ID))
		// Delete records the audit event before removing the team, so the
		// team.delete event persists (team_id nulled by the cascade, row survives).
		assert.Equal(t, 1, auditCount(t, db, "team.delete"))
		got, err := svc.Get(ctx, team.ID)
		require.NoError(t, err)
		assert.Nil(t, got)
	})

	t.Run("delete missing -> not found", func(t *testing.T) {
		assert.ErrorIs(t, svc.Delete(ctx, actor.ID, team.ID), service.ErrNotFound)
	})
}

func TestTeamServiceMembers(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newTeamService(db)
	ctx := t.Context()
	company := testutil.SeedCompany(t, db, "Acme", nil)
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)

	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)
	require.NoError(t, repository.NewCompanyRepo(db).SetMember(ctx, company.ID, user.ID, model.CompanyRoleMember))

	t.Run("add member happy path with audit", func(t *testing.T) {
		m, added, err := svc.AddMember(ctx, actor.ID, team.ID, &model.AddMemberRequest{
			Email: "u@acme.com", Role: model.RoleEditor,
		})
		require.NoError(t, err)
		assert.True(t, added)
		assert.Equal(t, user.ID, m.UserID)
		assert.Equal(t, model.RoleEditor, m.Role)
		assert.Equal(t, 1, auditCount(t, db, "team.member.add"))
	})

	t.Run("re-add existing member reports not added", func(t *testing.T) {
		_, added, err := svc.AddMember(ctx, actor.ID, team.ID, &model.AddMemberRequest{
			Email: "u@acme.com", Role: model.RoleEditor,
		})
		require.NoError(t, err)
		assert.False(t, added)
		assert.Equal(t, 1, auditCount(t, db, "team.member.add"), "a re-add is audited as a role update")
		assert.Equal(t, 1, auditCount(t, db, "team.member.update"))
	})

	t.Run("add member invalid role -> validation error", func(t *testing.T) {
		_, _, err := svc.AddMember(ctx, actor.ID, team.ID, &model.AddMemberRequest{
			Email: "u@acme.com", Role: model.Role("bogus"),
		})
		var ve model.ValidationErrors
		assert.ErrorAs(t, err, &ve)
	})

	t.Run("add unknown user -> not found", func(t *testing.T) {
		_, _, err := svc.AddMember(ctx, actor.ID, team.ID, &model.AddMemberRequest{
			Email: "nobody@acme.com", Role: model.RoleViewer,
		})
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("add member to missing team -> not found", func(t *testing.T) {
		_, _, err := svc.AddMember(ctx, actor.ID, "00000000-0000-0000-0000-000000000000",
			&model.AddMemberRequest{Email: "u@acme.com", Role: model.RoleViewer})
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("add user not in company -> not found", func(t *testing.T) {
		outsider := testutil.SeedUser(t, db, "out@x.com", "Out", false)
		_ = outsider
		_, _, err := svc.AddMember(ctx, actor.ID, team.ID, &model.AddMemberRequest{
			Email: "out@x.com", Role: model.RoleViewer,
		})
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("list members", func(t *testing.T) {
		members, err := svc.ListMembers(ctx, team.ID)
		require.NoError(t, err)
		require.Len(t, members, 1)
		assert.Equal(t, "u@acme.com", members[0].Email)
	})

	t.Run("update member role happy path", func(t *testing.T) {
		err := svc.UpdateMember(ctx, actor.ID, team.ID, user.ID, model.RoleAdmin)
		require.NoError(t, err)
		assert.Equal(t, 2, auditCount(t, db, "team.member.update"))
	})

	t.Run("update member invalid role -> validation error", func(t *testing.T) {
		err := svc.UpdateMember(ctx, actor.ID, team.ID, user.ID, model.Role("bogus"))
		var ve model.ValidationErrors
		assert.ErrorAs(t, err, &ve)
	})

	t.Run("update role of a non-member -> not found", func(t *testing.T) {
		stranger := testutil.SeedUser(t, db, "stranger-upd@acme.com", "S", false)
		err := svc.UpdateMember(ctx, actor.ID, team.ID, stranger.ID, model.RoleAdmin)
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("remove member happy path", func(t *testing.T) {
		err := svc.RemoveMember(ctx, actor.ID, team.ID, user.ID)
		require.NoError(t, err)
		assert.Equal(t, 1, auditCount(t, db, "team.member.remove"))
	})
}

func TestTeamServiceAddableMembers(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newTeamService(db)
	ctx := t.Context()
	company := testutil.SeedCompany(t, db, "Acme", nil)
	team := testutil.SeedTeam(t, db, company.ID, "Platform")

	onTeam := testutil.SeedUser(t, db, "onteam@acme.com", "OnTeam", false)
	notOnTeam := testutil.SeedUser(t, db, "free@acme.com", "Free", false)
	require.NoError(t, repository.NewCompanyRepo(db).SetMember(ctx, company.ID, onTeam.ID, model.CompanyRoleMember))
	require.NoError(t, repository.NewCompanyRepo(db).SetMember(ctx, company.ID, notOnTeam.ID, model.CompanyRoleMember))
	testutil.AddTeamMember(t, db, team.ID, onTeam.ID, model.RoleViewer)

	t.Run("excludes existing team members", func(t *testing.T) {
		addable, err := svc.AddableMembers(ctx, team.ID)
		require.NoError(t, err)
		require.Len(t, addable, 1)
		assert.Equal(t, notOnTeam.ID, addable[0].UserID)
	})

	t.Run("missing team -> not found", func(t *testing.T) {
		_, err := svc.AddableMembers(ctx, "00000000-0000-0000-0000-000000000000")
		assert.ErrorIs(t, err, service.ErrNotFound)
	})
}

// TestTeamServiceRoleInheritance verifies a company admin inherits the admin role
// on every team in their company, and that an explicit team role takes the higher
// of the two via maxRole.
func TestTeamServiceRoleInheritance(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newTeamService(db)
	ctx := t.Context()
	company := testutil.SeedCompany(t, db, "Acme", nil)
	team := testutil.SeedTeam(t, db, company.ID, "Platform")

	companyAdmin := testutil.SeedUser(t, db, "ca@acme.com", "CA", false)
	companyMember := testutil.SeedUser(t, db, "cm@acme.com", "CM", false)
	require.NoError(t, repository.NewCompanyRepo(db).SetMember(ctx, company.ID, companyAdmin.ID, model.CompanyRoleAdmin))
	require.NoError(t, repository.NewCompanyRepo(db).SetMember(ctx, company.ID, companyMember.ID, model.CompanyRoleMember))

	t.Run("company admin inherits team admin", func(t *testing.T) {
		role, err := svc.Role(ctx, team.ID, companyAdmin.ID)
		require.NoError(t, err)
		assert.Equal(t, model.RoleAdmin, role)
	})

	t.Run("plain company member inherits nothing", func(t *testing.T) {
		role, err := svc.Role(ctx, team.ID, companyMember.ID)
		require.NoError(t, err)
		assert.Equal(t, model.Role(""), role)
	})

	t.Run("explicit team membership grants role", func(t *testing.T) {
		testutil.AddTeamMember(t, db, team.ID, companyMember.ID, model.RoleEditor)
		role, err := svc.Role(ctx, team.ID, companyMember.ID)
		require.NoError(t, err)
		assert.Equal(t, model.RoleEditor, role)
	})

	t.Run("max of explicit and inherited wins", func(t *testing.T) {
		// company admin (inherits admin) with explicit viewer keeps admin.
		testutil.AddTeamMember(t, db, team.ID, companyAdmin.ID, model.RoleViewer)
		role, err := svc.Role(ctx, team.ID, companyAdmin.ID)
		require.NoError(t, err)
		assert.Equal(t, model.RoleAdmin, role)
	})

	t.Run("no role on missing team", func(t *testing.T) {
		role, err := svc.Role(ctx, "00000000-0000-0000-0000-000000000000", companyAdmin.ID)
		require.NoError(t, err)
		assert.Equal(t, model.Role(""), role)
	})

	t.Run("explicit role outside the team's company grants nothing", func(t *testing.T) {
		outsider := testutil.SeedUser(t, db, "out@x.com", "Out", false)
		testutil.AddTeamMember(t, db, team.ID, outsider.ID, model.RoleEditor)
		role, err := svc.Role(ctx, team.ID, outsider.ID)
		require.NoError(t, err)
		assert.Equal(t, model.Role(""), role)
	})
}

// TestTeamServiceRemovedFromCompany verifies that removing a user from the
// company revokes their explicit team access.
func TestTeamServiceRemovedFromCompany(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newTeamService(db)
	companies := repository.NewCompanyRepo(db)
	ctx := t.Context()
	company := testutil.SeedCompany(t, db, "Acme", nil)
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)
	require.NoError(t, companies.SetMember(ctx, company.ID, user.ID, model.CompanyRoleMember))
	testutil.AddTeamMember(t, db, team.ID, user.ID, model.RoleEditor)

	require.NoError(t, companies.RemoveMember(ctx, company.ID, user.ID))

	role, err := svc.Role(ctx, team.ID, user.ID)
	require.NoError(t, err)
	assert.Equal(t, model.Role(""), role)
	teams, err := svc.List(ctx, user.ID, false)
	require.NoError(t, err)
	assert.Empty(t, teams)
	ms, err := svc.Memberships(ctx, user.ID)
	require.NoError(t, err)
	assert.Empty(t, ms, "team_members rows are deleted with the company membership")
}

func TestTeamServiceListAndMemberships(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newTeamService(db)
	ctx := t.Context()
	company := testutil.SeedCompany(t, db, "Acme", nil)
	teamA := testutil.SeedTeam(t, db, company.ID, "A")
	_ = testutil.SeedTeam(t, db, company.ID, "B")

	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)
	require.NoError(t, repository.NewCompanyRepo(db).SetMember(ctx, company.ID, user.ID, model.CompanyRoleMember))
	testutil.AddTeamMember(t, db, teamA.ID, user.ID, model.RoleViewer)

	t.Run("super admin lists all teams", func(t *testing.T) {
		teams, err := svc.List(ctx, "irrelevant", true)
		require.NoError(t, err)
		assert.Len(t, teams, 2)
	})

	t.Run("list by company", func(t *testing.T) {
		teams, err := svc.ListByCompany(ctx, company.ID)
		require.NoError(t, err)
		assert.Len(t, teams, 2)
	})

	t.Run("memberships for explicit team member", func(t *testing.T) {
		ms, err := svc.Memberships(ctx, user.ID)
		require.NoError(t, err)
		require.Len(t, ms, 1)
		assert.Equal(t, teamA.ID, ms[0].TeamID)
	})
}
