package service_test

import (
	"context"
	"strings"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newCompanyService(db *repository.DB) *service.CompanyService {
	return service.NewCompanyService(
		repository.NewCompanyRepo(db),
		repository.NewUserRepo(db),
		repository.NewAuditRepo(db),
		false,
	)
}

func TestCompanyServiceCreate(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newCompanyService(db)
	ctx := t.Context()
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)

	// founder seeds a user without a company to be a new company's admin.
	founder := func(t *testing.T) *model.User {
		t.Helper()
		return testutil.SeedUser(t, db, strings.ReplaceAll(t.Name(), "/", "-")+"@acme.com", "F", false)
	}

	t.Run("happy path with audit", func(t *testing.T) {
		f := founder(t)
		req := companyReq("Acme", f.Email)
		req.Description = "desc"
		c, err := svc.Create(ctx, actor.ID, req)
		require.NoError(t, err)
		assert.Equal(t, "Acme", c.DisplayName)
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionCreate, model.AuditTargetCompany))
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionCreate, model.AuditTargetCompanyMember), "admin added")
		role, err := svc.Role(ctx, c.ID, f.ID)
		require.NoError(t, err)
		assert.Equal(t, model.CompanyRoleAdmin, role, "created with its admin")
	})

	errTests := []struct {
		name       string
		req        *model.CreateCompanyWithAdminRequest
		wantFields []string
		wantErr    error
		wantMsg    string
	}{
		{name: "blank name and admin", req: companyReq("  ", " "), wantFields: []string{"displayName", "adminEmail"}},
		{name: "unknown admin", req: companyReq("X", "nobody@acme.com"), wantErr: service.ErrNotFound,
			wantMsg: "user with email nobody@acme.com not found"},
		{name: "admin already in a company", req: companyReq("X", "actor@acme.com"), wantErr: service.ErrConflict,
			wantMsg: "user with email actor@acme.com already belongs to a company"},
	}
	testutil.SetCompanyMember(t, db, testutil.SeedCompany(t, db, "Taken").ID, actor.ID, model.CompanyRoleAdmin)
	for _, tt := range errTests {
		t.Run(tt.name, func(t *testing.T) {
			before := auditCount(t, db, model.AuditActionCreate, model.AuditTargetCompany)
			_, err := svc.Create(ctx, actor.ID, tt.req)
			if tt.wantFields != nil {
				assert.Equal(t, tt.wantFields, validationFields(t, err))
			} else {
				assert.ErrorIs(t, err, tt.wantErr)
				assert.Equal(t, tt.wantMsg, service.PublicMessage(err))
			}
			assert.Equal(t, before, auditCount(t, db, model.AuditActionCreate, model.AuditTargetCompany))
		})
	}

	t.Run("a failed insert leaves no company, admin or audit entry", func(t *testing.T) {
		f := founder(t)
		_, err := db.Pool.Exec(ctx, `
			CREATE FUNCTION fail_company() RETURNS trigger LANGUAGE plpgsql AS $$
			BEGIN RAISE EXCEPTION 'companies down'; END $$;
			CREATE TRIGGER fail_company BEFORE INSERT ON companies FOR EACH STATEMENT EXECUTE FUNCTION fail_company();`)
		require.NoError(t, err)
		t.Cleanup(func() {
			_, _ = db.Pool.Exec(context.Background(),
				`DROP TRIGGER fail_company ON companies; DROP FUNCTION fail_company();`)
		})
		before := auditCount(t, db, model.AuditActionCreate, model.AuditTargetCompany)
		_, err = svc.Create(ctx, actor.ID, companyReq("Down", f.Email))
		require.ErrorContains(t, err, "companies down")
		assert.Equal(t, before, auditCount(t, db, model.AuditActionCreate, model.AuditTargetCompany))
		m, err := svc.Membership(ctx, f.ID)
		require.NoError(t, err)
		assert.Nil(t, m, "the admin was not attached")
	})

	t.Run("display name limit counts characters, not bytes", func(t *testing.T) {
		_, err := svc.Create(ctx, actor.ID, companyReq(strings.Repeat("é", 120), founder(t).Email))
		require.NoError(t, err)
		_, err = svc.Create(ctx, actor.ID, companyReq(strings.Repeat("é", 121), founder(t).Email))
		assert.Equal(t, []string{"displayName"}, validationFields(t, err))
	})
}

func TestCompanyServiceGetUpdateDelete(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newCompanyService(db)
	ctx := t.Context()
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)
	company := testutil.SeedCompany(t, db, "Acme")

	t.Run("get existing", func(t *testing.T) {
		got, err := svc.Get(ctx, company.ID)
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, company.ID, got.ID)
	})

	t.Run("update happy path with audit", func(t *testing.T) {
		c, err := svc.Update(ctx, actor.ID, company.ID, &model.UpdateCompanyRequest{
			DisplayName: new("Acme Inc"),
		})
		require.NoError(t, err)
		assert.Equal(t, "Acme Inc", c.DisplayName)
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionUpdate, model.AuditTargetCompany))
	})

	t.Run("update missing -> not found", func(t *testing.T) {
		_, err := svc.Update(ctx, actor.ID, "00000000-0000-0000-0000-000000000000",
			&model.UpdateCompanyRequest{DisplayName: new("X")})
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("update empty display name -> validation error", func(t *testing.T) {
		_, err := svc.Update(ctx, actor.ID, company.ID, &model.UpdateCompanyRequest{
			DisplayName: new("   "),
		})
		assert.Equal(t, []string{"displayName"}, validationFields(t, err))
	})

	t.Run("delete a company with members records audit and removes it", func(t *testing.T) {
		member := testutil.SeedUser(t, db, "m@acme.com", "M", false)
		testutil.SetCompanyMember(t, db, company.ID, member.ID, model.CompanyRoleAdmin)
		require.NoError(t, svc.Delete(ctx, actor.ID, company.ID))
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionDelete, model.AuditTargetCompany))
		_, err := svc.Get(ctx, company.ID)
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("delete missing -> not found, no audit", func(t *testing.T) {
		assert.ErrorIs(t, svc.Delete(ctx, actor.ID, company.ID), service.ErrNotFound)
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionDelete, model.AuditTargetCompany))
	})
}

func TestCompanyServiceList(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newCompanyService(db)
	ctx := t.Context()

	acme := testutil.SeedCompany(t, db, "Acme")
	_ = testutil.SeedCompany(t, db, "Beta")
	member := testutil.SeedUser(t, db, "m@acme.com", "Member", false)
	testutil.SetCompanyMember(t, db, acme.ID, member.ID, model.CompanyRoleMember)

	t.Run("super admin sees all", func(t *testing.T) {
		list, err := svc.List(ctx, "irrelevant", true)
		require.NoError(t, err)
		assert.Len(t, list, 2)
	})

	t.Run("member sees only own company", func(t *testing.T) {
		list, err := svc.List(ctx, member.ID, false)
		require.NoError(t, err)
		require.Len(t, list, 1)
		assert.Equal(t, acme.ID, list[0].ID)
	})

	t.Run("unattached user sees nothing", func(t *testing.T) {
		stranger := testutil.SeedUser(t, db, "s@x.com", "S", false)
		list, err := svc.List(ctx, stranger.ID, false)
		require.NoError(t, err)
		assert.Empty(t, list)
	})
}

func TestCompanyServiceMembers(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newCompanyService(db)
	ctx := t.Context()
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)
	company := testutil.SeedCompany(t, db, "Acme")
	other := testutil.SeedCompany(t, db, "Beta")

	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)

	t.Run("add member happy path with audit", func(t *testing.T) {
		m, added, err := svc.AddMember(ctx, actor.ID, company.ID, &model.AddCompanyMemberRequest{
			Email: "u@acme.com", Role: model.CompanyRoleMember,
		})
		require.NoError(t, err)
		assert.True(t, added)
		assert.Equal(t, user.ID, m.UserID)
		assert.Equal(t, model.CompanyRoleMember, m.Role)
		assert.False(t, m.CreatedAt.IsZero())
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionCreate, model.AuditTargetCompanyMember))
	})

	t.Run("re-add existing member reports not added", func(t *testing.T) {
		_, added, err := svc.AddMember(ctx, actor.ID, company.ID, &model.AddCompanyMemberRequest{
			Email: "u@acme.com", Role: model.CompanyRoleMember,
		})
		require.NoError(t, err)
		assert.False(t, added)
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionCreate, model.AuditTargetCompanyMember))
		assert.Equal(t, 0, auditCount(t, db, model.AuditActionUpdate, model.AuditTargetCompanyMember),
			"same role: nothing changed, nothing audited")
	})

	t.Run("add member invalid request -> every field reported", func(t *testing.T) {
		_, _, err := svc.AddMember(ctx, actor.ID, company.ID, &model.AddCompanyMemberRequest{
			Email: " ", Role: model.CompanyRole("bogus"),
		})
		assert.Equal(t, []string{"email", "role"}, validationFields(t, err))
	})

	t.Run("add unknown email -> not found", func(t *testing.T) {
		_, _, err := svc.AddMember(ctx, actor.ID, company.ID, &model.AddCompanyMemberRequest{
			Email: "nobody@acme.com", Role: model.CompanyRoleMember,
		})
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("add user already in another company -> not found", func(t *testing.T) {
		u2 := testutil.SeedUser(t, db, "u2@beta.com", "U2", false)
		testutil.SetCompanyMember(t, db, other.ID, u2.ID, model.CompanyRoleMember)
		_, _, err := svc.AddMember(ctx, actor.ID, company.ID, &model.AddCompanyMemberRequest{
			Email: "u2@beta.com", Role: model.CompanyRoleMember,
		})
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("list members", func(t *testing.T) {
		members, err := svc.ListMembers(ctx, company.ID)
		require.NoError(t, err)
		require.Len(t, members, 1)
		assert.Equal(t, "u@acme.com", members[0].Email)
	})

	t.Run("update member role happy path", func(t *testing.T) {
		err := svc.UpdateMember(ctx, actor.ID, company.ID, user.ID, model.CompanyRoleAdmin)
		require.NoError(t, err)
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionUpdate, model.AuditTargetCompanyMember))
		assertLastAudit(t, db, model.AuditTargetCompanyMember, user.ID, `{"role":"member"}`, `{"role":"admin"}`)
		require.NoError(t, svc.UpdateMember(ctx, actor.ID, company.ID, user.ID, model.CompanyRoleAdmin))
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionUpdate, model.AuditTargetCompanyMember),
			"same role again: not audited")
	})

	t.Run("update member invalid role -> validation error", func(t *testing.T) {
		err := svc.UpdateMember(ctx, actor.ID, company.ID, user.ID, model.CompanyRole("bogus"))
		assert.Equal(t, []string{"role"}, validationFields(t, err))
	})

	t.Run("update role of a non-member -> not found", func(t *testing.T) {
		stranger := testutil.SeedUser(t, db, "stranger-upd@acme.com", "S", false)
		err := svc.UpdateMember(ctx, actor.ID, company.ID, stranger.ID, model.CompanyRoleAdmin)
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	// user is now the company's only admin.
	t.Run("demote the last admin -> conflict", func(t *testing.T) {
		err := svc.UpdateMember(ctx, actor.ID, company.ID, user.ID, model.CompanyRoleMember)
		assert.ErrorIs(t, err, service.ErrConflict)
		_, _, err = svc.AddMember(ctx, actor.ID, company.ID, &model.AddCompanyMemberRequest{
			Email: "u@acme.com", Role: model.CompanyRoleMember,
		})
		assert.ErrorIs(t, err, service.ErrConflict, "re-add as member is a demotion too")
	})

	t.Run("remove the last admin -> conflict", func(t *testing.T) {
		err := svc.RemoveMember(ctx, actor.ID, company.ID, user.ID)
		assert.ErrorIs(t, err, service.ErrConflict)
	})

	t.Run("remove member happy path", func(t *testing.T) {
		admin2 := testutil.SeedUser(t, db, "admin2@acme.com", "A2", false)
		testutil.SetCompanyMember(t, db, company.ID, admin2.ID, model.CompanyRoleAdmin)
		err := svc.RemoveMember(ctx, actor.ID, company.ID, user.ID)
		require.NoError(t, err)
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionDelete, model.AuditTargetCompanyMember))
		assertLastAudit(t, db, model.AuditTargetCompanyMember, user.ID, `{"role":"admin"}`, "")
		assert.ErrorIs(t, svc.RemoveMember(ctx, actor.ID, company.ID, user.ID), service.ErrNotFound)
	})
}

func TestCompanyServiceRoleAndMembership(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newCompanyService(db)
	ctx := t.Context()
	company := testutil.SeedCompany(t, db, "Acme")
	other := testutil.SeedCompany(t, db, "Beta")
	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)
	testutil.SetCompanyMember(t, db, company.ID, user.ID, model.CompanyRoleAdmin)

	t.Run("membership returns role", func(t *testing.T) {
		m, err := svc.Membership(ctx, user.ID)
		require.NoError(t, err)
		require.NotNil(t, m)
		assert.Equal(t, company.ID, m.CompanyID)
	})

	t.Run("role in own company", func(t *testing.T) {
		role, err := svc.Role(ctx, company.ID, user.ID)
		require.NoError(t, err)
		assert.Equal(t, model.CompanyRoleAdmin, role)
	})

	t.Run("role in foreign company is empty", func(t *testing.T) {
		role, err := svc.Role(ctx, other.ID, user.ID)
		require.NoError(t, err)
		assert.Equal(t, model.CompanyRole(""), role)
	})
}

func TestCompanyServiceMonoCompany(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := service.NewCompanyService(
		repository.NewCompanyRepo(db), repository.NewUserRepo(db), repository.NewAuditRepo(db), true)
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)

	_, err := svc.Create(t.Context(), actor.ID, companyReq("Acme", actor.Email))
	require.NoError(t, err)
	_, err = svc.Create(t.Context(), actor.ID, companyReq("Beta", testutil.SeedUser(t, db, "b@acme.com", "B", false).Email))
	assert.ErrorIs(t, err, service.ErrMonoCompanyExists)
	assert.ErrorIs(t, err, service.ErrConflict)

	// The next login would re-join a removed user, so removal is refused and
	// the member is left in place.
	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)
	co, err := repository.NewCompanyRepo(db).First(t.Context())
	require.NoError(t, err)
	testutil.SetCompanyMember(t, db, co.ID, user.ID, model.CompanyRoleMember)
	err = svc.RemoveMember(t.Context(), actor.ID, co.ID, user.ID)
	assert.ErrorIs(t, err, service.ErrMonoRemoveMember)
	assert.ErrorIs(t, err, service.ErrConflict)
	role, err := svc.Role(t.Context(), co.ID, user.ID)
	require.NoError(t, err)
	assert.Equal(t, model.CompanyRoleMember, role)
	assert.Equal(t, 0, auditCount(t, db, model.AuditActionDelete, model.AuditTargetCompanyMember))
}

func TestCompanyServiceQueryErrors(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newCompanyService(db)
	mono := service.NewCompanyService(
		repository.NewCompanyRepo(db), repository.NewUserRepo(db), repository.NewAuditRepo(db), true)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	id := "00000000-0000-0000-0000-000000000000"

	_, err := svc.Create(ctx, id, companyReq("x", "a@x.com"))
	assert.ErrorIs(t, err, context.Canceled)
	_, err = mono.Create(ctx, id, companyReq("x", "a@x.com"))
	assert.ErrorIs(t, err, context.Canceled)
	_, err = svc.List(ctx, id, false)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = svc.Update(ctx, id, id, &model.UpdateCompanyRequest{})
	assert.ErrorIs(t, err, context.Canceled)
	assert.ErrorIs(t, svc.Delete(ctx, id, id), context.Canceled)
	_, _, err = svc.AddMember(ctx, id, id, &model.AddCompanyMemberRequest{Email: "a@x.com", Role: model.CompanyRoleMember})
	assert.ErrorIs(t, err, context.Canceled)
	assert.ErrorIs(t, svc.UpdateMember(ctx, id, id, id, model.CompanyRoleMember), context.Canceled)
	assert.ErrorIs(t, svc.RemoveMember(ctx, id, id, id), context.Canceled)
	_, err = svc.Role(ctx, id, id)
	assert.ErrorIs(t, err, context.Canceled)
}
