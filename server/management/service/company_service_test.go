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

// auditCount returns the number of audit_log rows matching the given action.
func auditCount(t *testing.T, db *repository.DB, action string) int {
	t.Helper()
	var n int
	err := db.Pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM audit_log WHERE action = $1`, action).Scan(&n)
	require.NoError(t, err)
	return n
}

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

	t.Run("happy path with audit", func(t *testing.T) {
		c, err := svc.Create(ctx, actor.ID, &model.CreateCompanyRequest{
			DisplayName: "Acme",
			Domain:      new("Acme.COM"),
			Description: "desc",
		})
		require.NoError(t, err)
		assert.Equal(t, "Acme", c.DisplayName)
		require.NotNil(t, c.Domain)
		assert.Equal(t, "acme.com", *c.Domain) // normalized
		assert.Equal(t, 1, auditCount(t, db, "company.create"))
	})

	t.Run("empty display name -> validation error", func(t *testing.T) {
		_, err := svc.Create(ctx, actor.ID, &model.CreateCompanyRequest{DisplayName: "  "})
		var ve model.ValidationErrors
		assert.ErrorAs(t, err, &ve)
	})

	t.Run("display name limit counts characters, not bytes", func(t *testing.T) {
		_, err := svc.Create(ctx, actor.ID, &model.CreateCompanyRequest{DisplayName: strings.Repeat("é", 120)})
		require.NoError(t, err)
		_, err = svc.Create(ctx, actor.ID, &model.CreateCompanyRequest{DisplayName: strings.Repeat("é", 121)})
		var ve model.ValidationErrors
		assert.ErrorAs(t, err, &ve)
	})

	t.Run("invalid domain -> validation error", func(t *testing.T) {
		_, err := svc.Create(ctx, actor.ID, &model.CreateCompanyRequest{
			DisplayName: "X", Domain: new("not a domain"),
		})
		var ve model.ValidationErrors
		assert.ErrorAs(t, err, &ve)
	})

	t.Run("duplicate domain -> conflict", func(t *testing.T) {
		_, err := svc.Create(ctx, actor.ID, &model.CreateCompanyRequest{
			DisplayName: "Dup", Domain: new("acme.com"),
		})
		assert.ErrorIs(t, err, service.ErrConflict)
	})
}

func TestCompanyServiceGetUpdateDelete(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newCompanyService(db)
	ctx := t.Context()
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)
	company := testutil.SeedCompany(t, db, "Acme", new("acme.com"))

	t.Run("get existing", func(t *testing.T) {
		got, err := svc.Get(ctx, company.ID)
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, company.ID, got.ID)
	})

	t.Run("update happy path with audit", func(t *testing.T) {
		c, err := svc.Update(ctx, actor.ID, true, company.ID, &model.UpdateCompanyRequest{
			DisplayName: new("Acme Inc"),
		})
		require.NoError(t, err)
		assert.Equal(t, "Acme Inc", c.DisplayName)
		assert.Equal(t, 1, auditCount(t, db, "company.update"))
	})

	t.Run("domain change needs super admin", func(t *testing.T) {
		// Re-sending the current domain (the webui always sends it) is fine.
		_, err := svc.Update(ctx, actor.ID, false, company.ID, &model.UpdateCompanyRequest{
			DisplayName: new("Acme Co"), Domain: new("ACME.com"),
		})
		require.NoError(t, err)

		for _, d := range []string{"evil.com", ""} {
			_, err = svc.Update(ctx, actor.ID, false, company.ID, &model.UpdateCompanyRequest{Domain: new(d)})
			assert.ErrorIs(t, err, service.ErrForbidden, d)
		}

		c, err := svc.Update(ctx, actor.ID, true, company.ID, &model.UpdateCompanyRequest{Domain: new("acme.io")})
		require.NoError(t, err)
		assert.Equal(t, "acme.io", *c.Domain)
		_, err = svc.Update(ctx, actor.ID, true, company.ID, &model.UpdateCompanyRequest{Domain: new("acme.com")})
		require.NoError(t, err)
	})

	t.Run("update missing -> not found", func(t *testing.T) {
		_, err := svc.Update(ctx, actor.ID, true, "00000000-0000-0000-0000-000000000000",
			&model.UpdateCompanyRequest{DisplayName: new("X")})
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("update empty display name -> validation error", func(t *testing.T) {
		_, err := svc.Update(ctx, actor.ID, true, company.ID, &model.UpdateCompanyRequest{
			DisplayName: new("   "),
		})
		var ve model.ValidationErrors
		assert.ErrorAs(t, err, &ve)
	})

	t.Run("delete happy path records audit and removes the company", func(t *testing.T) {
		require.NoError(t, svc.Delete(ctx, actor.ID, company.ID))
		// Delete records the audit event before removing the company, so the
		// company.delete event persists (its company_id is nulled by the
		// ON DELETE SET NULL cascade, but the row survives).
		assert.Equal(t, 1, auditCount(t, db, "company.delete"))
		// the company is actually gone
		got, err := svc.Get(ctx, company.ID)
		require.NoError(t, err)
		assert.Nil(t, got)
	})

	t.Run("delete missing -> not found", func(t *testing.T) {
		assert.ErrorIs(t, svc.Delete(ctx, actor.ID, company.ID), service.ErrNotFound)
	})
}

func TestCompanyServiceList(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newCompanyService(db)
	ctx := t.Context()

	acme := testutil.SeedCompany(t, db, "Acme", new("acme.com"))
	_ = testutil.SeedCompany(t, db, "Beta", new("beta.com"))
	member := testutil.SeedUser(t, db, "m@acme.com", "Member", false)
	require.NoError(t, repository.NewCompanyRepo(db).SetMember(ctx, acme.ID, member.ID, model.CompanyRoleMember))

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
	company := testutil.SeedCompany(t, db, "Acme", new("acme.com"))
	other := testutil.SeedCompany(t, db, "Beta", new("beta.com"))

	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)

	t.Run("add member happy path with audit", func(t *testing.T) {
		m, added, err := svc.AddMember(ctx, actor.ID, company.ID, &model.AddCompanyMemberRequest{
			Email: "u@acme.com", Role: model.CompanyRoleMember,
		})
		require.NoError(t, err)
		assert.True(t, added)
		assert.Equal(t, user.ID, m.UserID)
		assert.Equal(t, model.CompanyRoleMember, m.Role)
		assert.Equal(t, 1, auditCount(t, db, "company.member.add"))
	})

	t.Run("re-add existing member reports not added", func(t *testing.T) {
		_, added, err := svc.AddMember(ctx, actor.ID, company.ID, &model.AddCompanyMemberRequest{
			Email: "u@acme.com", Role: model.CompanyRoleMember,
		})
		require.NoError(t, err)
		assert.False(t, added)
		assert.Equal(t, 1, auditCount(t, db, "company.member.add"), "a re-add is audited as a role update")
		assert.Equal(t, 1, auditCount(t, db, "company.member.update"))
	})

	t.Run("add member invalid role -> validation error", func(t *testing.T) {
		_, _, err := svc.AddMember(ctx, actor.ID, company.ID, &model.AddCompanyMemberRequest{
			Email: "u@acme.com", Role: model.CompanyRole("bogus"),
		})
		var ve model.ValidationErrors
		assert.ErrorAs(t, err, &ve)
	})

	t.Run("add unknown email -> not found", func(t *testing.T) {
		_, _, err := svc.AddMember(ctx, actor.ID, company.ID, &model.AddCompanyMemberRequest{
			Email: "nobody@acme.com", Role: model.CompanyRoleMember,
		})
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("add user already in another company -> not found", func(t *testing.T) {
		u2 := testutil.SeedUser(t, db, "u2@beta.com", "U2", false)
		require.NoError(t, repository.NewCompanyRepo(db).SetMember(ctx, other.ID, u2.ID, model.CompanyRoleMember))
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
		assert.Equal(t, 2, auditCount(t, db, "company.member.update"))
	})

	t.Run("update member invalid role -> validation error", func(t *testing.T) {
		err := svc.UpdateMember(ctx, actor.ID, company.ID, user.ID, model.CompanyRole("bogus"))
		var ve model.ValidationErrors
		assert.ErrorAs(t, err, &ve)
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
		require.NoError(t, repository.NewCompanyRepo(db).SetMember(ctx, company.ID, admin2.ID, model.CompanyRoleAdmin))
		err := svc.RemoveMember(ctx, actor.ID, company.ID, user.ID)
		require.NoError(t, err)
		assert.Equal(t, 1, auditCount(t, db, "company.member.remove"))
	})
}

func TestCompanyServiceRoleAndMembership(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newCompanyService(db)
	ctx := t.Context()
	company := testutil.SeedCompany(t, db, "Acme", new("acme.com"))
	other := testutil.SeedCompany(t, db, "Beta", new("beta.com"))
	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)
	require.NoError(t, repository.NewCompanyRepo(db).SetMember(ctx, company.ID, user.ID, model.CompanyRoleAdmin))

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
