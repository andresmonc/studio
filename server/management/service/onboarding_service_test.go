package service_test

import (
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newOnboardingService(db *repository.DB) *service.OnboardingService {
	return service.NewOnboardingService(
		repository.NewCompanyRepo(db),
		repository.NewUserRepo(db),
		repository.NewAuditRepo(db),
		false,
	)
}

func TestOnboardingCreateCompanyForNewUser(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newOnboardingService(db)
	companySvc := newCompanyService(db)
	ctx := t.Context()

	t.Run("happy path: user becomes company admin with audit", func(t *testing.T) {
		u := testutil.SeedUser(t, db, "founder@acme.com", "Founder", false)
		c, err := svc.CreateCompanyForNewUser(ctx, u.ID, &model.CreateCompanyRequest{
			DisplayName: "Acme", Domain: new("acme.com"),
		})
		require.NoError(t, err)
		assert.Equal(t, "Acme", c.DisplayName)

		m, err := companySvc.Membership(ctx, u.ID)
		require.NoError(t, err)
		require.NotNil(t, m)
		assert.Equal(t, c.ID, m.CompanyID)
		assert.Equal(t, model.CompanyRoleAdmin, m.Role)
		assert.Equal(t, 1, auditCount(t, db, "company.onboarding.create"))
	})

	t.Run("empty display name -> validation error", func(t *testing.T) {
		u := testutil.SeedUser(t, db, "x@x.com", "X", false)
		_, err := svc.CreateCompanyForNewUser(ctx, u.ID, &model.CreateCompanyRequest{DisplayName: ""})
		var ve model.ValidationErrors
		assert.ErrorAs(t, err, &ve)
	})

	t.Run("unknown user -> not found", func(t *testing.T) {
		_, err := svc.CreateCompanyForNewUser(ctx, "00000000-0000-0000-0000-000000000000",
			&model.CreateCompanyRequest{DisplayName: "X"})
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("user already in a company -> forbidden", func(t *testing.T) {
		company := testutil.SeedCompany(t, db, "Existing", nil)
		u := testutil.SeedUser(t, db, "member@existing.com", "M", false)
		require.NoError(t, repository.NewCompanyRepo(db).SetMember(ctx, company.ID, u.ID, model.CompanyRoleMember))

		_, err := svc.CreateCompanyForNewUser(ctx, u.ID, &model.CreateCompanyRequest{DisplayName: "New"})
		assert.ErrorIs(t, err, service.ErrForbidden)
	})

	t.Run("duplicate domain -> conflict", func(t *testing.T) {
		_ = testutil.SeedCompany(t, db, "Taken", new("taken.com"))
		u := testutil.SeedUser(t, db, "dup@x.com", "Dup", false)
		_, err := svc.CreateCompanyForNewUser(ctx, u.ID, &model.CreateCompanyRequest{
			DisplayName: "Dup Co", Domain: new("taken.com"),
		})
		assert.ErrorIs(t, err, service.ErrConflict)
		assert.ErrorContains(t, err, "domain already in use")
	})

	t.Run("invalid domain -> validation error", func(t *testing.T) {
		u := testutil.SeedUser(t, db, "baddomain@x.com", "BD", false)
		_, err := svc.CreateCompanyForNewUser(ctx, u.ID, &model.CreateCompanyRequest{
			DisplayName: "X", Domain: new("not a domain"),
		})
		var ve model.ValidationErrors
		assert.ErrorAs(t, err, &ve)
	})
}

func TestOnboardingMonoCompany(t *testing.T) {
	db := testutil.StartPostgres(t)
	companyRepo := repository.NewCompanyRepo(db)
	userRepo := repository.NewUserRepo(db)
	auditRepo := repository.NewAuditRepo(db)
	svc := service.NewOnboardingService(companyRepo, userRepo, auditRepo, true)
	companySvc := service.NewCompanyService(companyRepo, userRepo, auditRepo, true)
	ctx := t.Context()

	user := testutil.SeedUser(t, db, "user@acme.com", "User", false)
	_, err := svc.CreateCompanyForNewUser(ctx, user.ID, &model.CreateCompanyRequest{DisplayName: "Acme"})
	require.ErrorIs(t, err, service.ErrForbidden, "non-super-admin cannot create the company")

	admin := testutil.SeedUser(t, db, "admin@acme.com", "Admin", true)
	c, err := svc.CreateCompanyForNewUser(ctx, admin.ID, &model.CreateCompanyRequest{DisplayName: "Acme"})
	require.NoError(t, err)
	m, err := companySvc.Membership(ctx, admin.ID)
	require.NoError(t, err)
	require.NotNil(t, m)
	assert.Equal(t, c.ID, m.CompanyID)
	assert.Equal(t, model.CompanyRoleAdmin, m.Role)

	admin2 := testutil.SeedUser(t, db, "admin2@acme.com", "Admin2", true)
	_, err = svc.CreateCompanyForNewUser(ctx, admin2.ID, &model.CreateCompanyRequest{DisplayName: "Second"})
	assert.ErrorIs(t, err, service.ErrConflict, "onboarding: second company")
	_, err = companySvc.Create(ctx, admin2.ID, &model.CreateCompanyRequest{DisplayName: "Second"})
	assert.ErrorIs(t, err, service.ErrConflict, "POST /companies: second company")
}
