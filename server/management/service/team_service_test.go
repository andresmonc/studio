package service_test

import (
	"context"
	"strings"
	"sync"
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
	company := testutil.SeedCompany(t, db, "Acme")
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)
	admin := testutil.SeedUser(t, db, "admin@acme.com", "Admin", false)
	testutil.SetCompanyMember(t, db, company.ID, admin.ID, model.CompanyRoleMember)

	t.Run("happy path creates team, admin membership, two audit rows", func(t *testing.T) {
		team, err := svc.Create(ctx, actor.ID, company.ID, &model.CreateTeamRequest{
			Name: "Platform", AdminEmail: "admin@acme.com",
		})
		require.NoError(t, err)
		assert.Equal(t, "Platform", team.Name)

		role, err := svc.Role(ctx, team.ID, admin.ID)
		require.NoError(t, err)
		assert.Equal(t, model.RoleAdmin, role)

		assert.Equal(t, 1, auditCount(t, db, model.AuditActionCreate, model.AuditTargetTeam))
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionCreate, model.AuditTargetTeamMember))
	})

	t.Run("duplicate name -> conflict, no team left behind", func(t *testing.T) {
		_, err := svc.Create(ctx, actor.ID, company.ID, &model.CreateTeamRequest{
			Name: "Platform", AdminEmail: "admin@acme.com",
		})
		assert.ErrorIs(t, err, service.ErrConflict)
		assert.ErrorIs(t, err, repository.ErrTeamNameTaken)
	})

	validation := []struct {
		name       string
		companyID  string
		req        model.CreateTeamRequest
		wantFields []string
	}{
		{"missing name", company.ID, model.CreateTeamRequest{AdminEmail: "admin@acme.com"}, []string{"name"}},
		{"blank name", company.ID, model.CreateTeamRequest{Name: "  ", AdminEmail: "admin@acme.com"}, []string{"name"}},
		{"over-long name", company.ID, model.CreateTeamRequest{Name: strings.Repeat("x", 121), AdminEmail: "a@acme.com"},
			[]string{"name"}},
		{"missing admin email", company.ID, model.CreateTeamRequest{Name: "X"}, []string{"adminEmail"}},
		{"everything missing reports every field", "", model.CreateTeamRequest{},
			[]string{"name", "companyId", "adminEmail"}},
	}
	for _, tt := range validation {
		t.Run(tt.name+" -> validation error", func(t *testing.T) {
			_, err := svc.Create(ctx, actor.ID, tt.companyID, &tt.req)
			assert.Equal(t, tt.wantFields, validationFields(t, err))
		})
	}

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
	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)

	t.Run("update happy path with audit", func(t *testing.T) {
		updated, err := svc.Update(ctx, actor.ID, team.ID, &model.UpdateTeamRequest{Name: new("Core")})
		require.NoError(t, err)
		assert.Equal(t, "Core", updated.Name)
		got, err := svc.Get(ctx, team.ID)
		require.NoError(t, err)
		assert.Equal(t, "Core", got.Name)
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionUpdate, model.AuditTargetTeam))
	})

	t.Run("update missing -> not found", func(t *testing.T) {
		_, err := svc.Update(ctx, actor.ID, "00000000-0000-0000-0000-000000000000",
			&model.UpdateTeamRequest{Name: new("X")})
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("update blank name -> validation error, name is trimmed", func(t *testing.T) {
		_, err := svc.Update(ctx, actor.ID, team.ID, &model.UpdateTeamRequest{Name: new("  ")})
		assert.Equal(t, []string{"name"}, validationFields(t, err))

		updated, err := svc.Update(ctx, actor.ID, team.ID, &model.UpdateTeamRequest{Name: new(" Core ")})
		require.NoError(t, err)
		assert.Equal(t, "Core", updated.Name)
	})

	t.Run("delete happy path records audit and removes the team", func(t *testing.T) {
		require.NoError(t, svc.Delete(ctx, actor.ID, team.ID))
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionDelete, model.AuditTargetTeam))
		_, err := svc.Get(ctx, team.ID)
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("delete missing -> not found, no audit", func(t *testing.T) {
		assert.ErrorIs(t, svc.Delete(ctx, actor.ID, team.ID), service.ErrNotFound)
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionDelete, model.AuditTargetTeam))
	})
}

func TestTeamServiceMembers(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newTeamService(db)
	ctx := t.Context()
	company := testutil.SeedCompany(t, db, "Acme")
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)
	// Each subtest gets its own team and company member, so it runs alone.
	seed := func(t *testing.T) (*model.Team, *model.User) {
		t.Helper()
		team := testutil.SeedTeam(t, db, company.ID, t.Name())
		user := testutil.SeedUser(t, db, strings.ReplaceAll(t.Name(), "/", "-")+"@acme.com", "U", false)
		testutil.SetCompanyMember(t, db, company.ID, user.ID, model.CompanyRoleMember)
		return team, user
	}
	type counts struct{ add, update, remove int }
	audited := func(t *testing.T) counts {
		return counts{
			add:    auditCount(t, db, model.AuditActionCreate, model.AuditTargetTeamMember),
			update: auditCount(t, db, model.AuditActionUpdate, model.AuditTargetTeamMember),
			remove: auditCount(t, db, model.AuditActionDelete, model.AuditTargetTeamMember),
		}
	}

	t.Run("add member is audited as an add", func(t *testing.T) {
		team, user := seed(t)
		before := audited(t)
		m, added, err := svc.AddMember(ctx, actor.ID, team.ID, &model.AddMemberRequest{
			Email: user.Email, Role: model.RoleEditor,
		})
		require.NoError(t, err)
		assert.True(t, added)
		assert.Equal(t, user.ID, m.UserID)
		assert.Equal(t, model.RoleEditor, m.Role)
		assert.False(t, m.CreatedAt.IsZero())
		assert.Equal(t, counts{before.add + 1, before.update, before.remove}, audited(t))
		members, err := svc.ListMembers(ctx, team.ID)
		require.NoError(t, err)
		require.Len(t, members, 1)
		assert.Equal(t, user.Email, members[0].Email)
	})

	t.Run("re-add existing member is audited as a role update", func(t *testing.T) {
		team, user := seed(t)
		testutil.AddTeamMember(t, db, team.ID, user.ID, model.RoleViewer)
		before := audited(t)
		_, added, err := svc.AddMember(ctx, actor.ID, team.ID, &model.AddMemberRequest{
			Email: user.Email, Role: model.RoleEditor,
		})
		require.NoError(t, err)
		assert.False(t, added)
		assert.Equal(t, counts{before.add, before.update + 1, before.remove}, audited(t))
		assertLastAudit(t, db, model.AuditTargetTeamMember, user.ID, `{"role":"viewer"}`, `{"role":"editor"}`)
	})

	t.Run("concurrent adds report one addition", func(t *testing.T) {
		team, user := seed(t)
		const n = 5
		results := make(chan bool, n)
		var wg sync.WaitGroup
		for range n {
			wg.Go(func() {
				_, added, err := svc.AddMember(ctx, actor.ID, team.ID, &model.AddMemberRequest{
					Email: user.Email, Role: model.RoleEditor,
				})
				assert.NoError(t, err)
				results <- added
			})
		}
		wg.Wait()
		close(results)
		var adds int
		for added := range results {
			if added {
				adds++
			}
		}
		assert.Equal(t, 1, adds)
	})

	errTests := []struct {
		name    string
		teamID  string // "" means the subtest's own team
		email   string // "" means the subtest's own user
		role    model.Role
		wantErr error
	}{
		{name: "invalid role", role: "bogus", wantErr: model.ValidationErrors{{Field: "role"}}},
		{name: "blank email", email: " ", role: model.RoleViewer, wantErr: model.ValidationErrors{{Field: "email"}}},
		{name: "unknown user", email: "nobody@acme.com", role: model.RoleViewer, wantErr: service.ErrNotFound},
		{name: "missing team", teamID: "00000000-0000-0000-0000-000000000000", role: model.RoleViewer,
			wantErr: service.ErrNotFound},
		{name: "user not in company", email: "out@x.com", role: model.RoleViewer, wantErr: service.ErrNotFound},
	}
	testutil.SeedUser(t, db, "out@x.com", "Out", false)
	for _, tt := range errTests {
		t.Run("add: "+tt.name, func(t *testing.T) {
			team, user := seed(t)
			teamID, email := team.ID, user.Email
			if tt.teamID != "" {
				teamID = tt.teamID
			}
			if tt.email != "" {
				email = tt.email
			}
			_, _, err := svc.AddMember(ctx, actor.ID, teamID, &model.AddMemberRequest{Email: email, Role: tt.role})
			if want, ok := tt.wantErr.(model.ValidationErrors); ok {
				assert.Equal(t, []string{want[0].Field}, validationFields(t, err))
				return
			}
			assert.ErrorIs(t, err, tt.wantErr)
		})
	}

	t.Run("update member role", func(t *testing.T) {
		team, user := seed(t)
		testutil.AddTeamMember(t, db, team.ID, user.ID, model.RoleViewer)
		before := audited(t)
		require.NoError(t, svc.UpdateMember(ctx, actor.ID, team.ID, user.ID, model.RoleAdmin))
		assert.Equal(t, counts{before.add, before.update + 1, before.remove}, audited(t))
		assertLastAudit(t, db, model.AuditTargetTeamMember, user.ID, `{"role":"viewer"}`, `{"role":"admin"}`)
		role, err := svc.Role(ctx, team.ID, user.ID)
		require.NoError(t, err)
		assert.Equal(t, model.RoleAdmin, role)

		assert.Equal(t, []string{"role"}, validationFields(t, svc.UpdateMember(ctx, actor.ID, team.ID, user.ID, "bogus")))
	})

	t.Run("update role of a non-member -> not found", func(t *testing.T) {
		team, user := seed(t)
		assert.ErrorIs(t, svc.UpdateMember(ctx, actor.ID, team.ID, user.ID, model.RoleAdmin), service.ErrNotFound)
	})

	t.Run("remove member", func(t *testing.T) {
		team, user := seed(t)
		testutil.AddTeamMember(t, db, team.ID, user.ID, model.RoleViewer)
		before := audited(t)
		require.NoError(t, svc.RemoveMember(ctx, actor.ID, team.ID, user.ID))
		assert.Equal(t, counts{before.add, before.update, before.remove + 1}, audited(t))
		assertLastAudit(t, db, model.AuditTargetTeamMember, user.ID, `{"role":"viewer"}`, "")
		assert.ErrorIs(t, svc.RemoveMember(ctx, actor.ID, team.ID, user.ID), service.ErrNotFound)
	})
}

func TestTeamServiceAddableMembers(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newTeamService(db)
	ctx := t.Context()
	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")

	onTeam := testutil.SeedUser(t, db, "onteam@acme.com", "OnTeam", false)
	notOnTeam := testutil.SeedUser(t, db, "free@acme.com", "Free", false)
	testutil.SetCompanyMember(t, db, company.ID, onTeam.ID, model.CompanyRoleMember)
	testutil.SetCompanyMember(t, db, company.ID, notOnTeam.ID, model.CompanyRoleMember)
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
// on every team in their company, and that the higher of the explicit team role
// and the inherited one wins.
func TestTeamServiceRoleInheritance(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newTeamService(db)
	ctx := t.Context()
	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")

	companyAdmin := testutil.SeedUser(t, db, "ca@acme.com", "CA", false)
	companyMember := testutil.SeedUser(t, db, "cm@acme.com", "CM", false)
	testutil.SetCompanyMember(t, db, company.ID, companyAdmin.ID, model.CompanyRoleAdmin)
	testutil.SetCompanyMember(t, db, company.ID, companyMember.ID, model.CompanyRoleMember)

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
		// SetMember refuses outsiders, so plant the stale row directly.
		_, err := db.Pool.Exec(ctx, `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'editor')`,
			team.ID, outsider.ID)
		require.NoError(t, err)
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
	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)
	testutil.SetCompanyMember(t, db, company.ID, user.ID, model.CompanyRoleMember)
	testutil.AddTeamMember(t, db, team.ID, user.ID, model.RoleEditor)

	_, err := companies.RemoveMember(ctx, company.ID, user.ID)
	require.NoError(t, err)

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
	company := testutil.SeedCompany(t, db, "Acme")
	teamA := testutil.SeedTeam(t, db, company.ID, "A")
	_ = testutil.SeedTeam(t, db, company.ID, "B")

	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)
	testutil.SetCompanyMember(t, db, company.ID, user.ID, model.CompanyRoleMember)
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

func TestTeamServiceQueryErrors(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newTeamService(db)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	id := "00000000-0000-0000-0000-000000000000"

	_, err := svc.Create(ctx, id, id, &model.CreateTeamRequest{Name: "x", AdminEmail: "a@x.com"})
	assert.ErrorIs(t, err, context.Canceled)
	_, err = svc.Update(ctx, id, id, &model.UpdateTeamRequest{})
	assert.ErrorIs(t, err, context.Canceled)
	assert.ErrorIs(t, svc.Delete(ctx, id, id), context.Canceled)
	_, err = svc.AddableMembers(ctx, id)
	assert.ErrorIs(t, err, context.Canceled)
	_, _, err = svc.AddMember(ctx, id, id, &model.AddMemberRequest{Email: "a@x.com", Role: model.RoleViewer})
	assert.ErrorIs(t, err, context.Canceled)
	assert.ErrorIs(t, svc.UpdateMember(ctx, id, id, id, model.RoleViewer), context.Canceled)
	assert.ErrorIs(t, svc.RemoveMember(ctx, id, id, id), context.Canceled)
	_, err = svc.Role(ctx, id, id)
	assert.ErrorIs(t, err, context.Canceled)
}
