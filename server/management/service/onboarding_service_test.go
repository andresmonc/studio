package service_test

import (
	"context"
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
			DisplayName: "Acme",
		})
		require.NoError(t, err)
		assert.Equal(t, "Acme", c.DisplayName)

		m, err := companySvc.Membership(ctx, u.ID)
		require.NoError(t, err)
		require.NotNil(t, m)
		assert.Equal(t, c.ID, m.CompanyID)
		assert.Equal(t, model.CompanyRoleAdmin, m.Role)
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionCreate, model.AuditTargetCompany))
		assert.Equal(t, 1, auditCount(t, db, model.AuditActionCreate, model.AuditTargetCompanyMember))
	})

	t.Run("empty display name -> validation error", func(t *testing.T) {
		u := testutil.SeedUser(t, db, "x@x.com", "X", false)
		_, err := svc.CreateCompanyForNewUser(ctx, u.ID, &model.CreateCompanyRequest{DisplayName: ""})
		assert.Equal(t, []string{"displayName"}, validationFields(t, err))
	})

	t.Run("unknown user -> not found", func(t *testing.T) {
		_, err := svc.CreateCompanyForNewUser(ctx, "00000000-0000-0000-0000-000000000000",
			&model.CreateCompanyRequest{DisplayName: "X"})
		assert.ErrorIs(t, err, service.ErrNotFound)
	})

	t.Run("user already in a company -> forbidden", func(t *testing.T) {
		company := testutil.SeedCompany(t, db, "Existing")
		u := testutil.SeedUser(t, db, "member@existing.com", "M", false)
		testutil.SetCompanyMember(t, db, company.ID, u.ID, model.CompanyRoleMember)

		_, err := svc.CreateCompanyForNewUser(ctx, u.ID, &model.CreateCompanyRequest{DisplayName: "New"})
		assert.ErrorIs(t, err, service.ErrForbidden)
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
	var n int
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM companies`).Scan(&n))
	assert.Equal(t, 1, n, "rejected creates leave no company")
}

func TestOnboardingQueryErrors(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newOnboardingService(db)
	super := testutil.SeedUser(t, db, "super@x.com", "S", true)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	_, err := svc.CreateCompanyForNewUser(ctx, super.ID, &model.CreateCompanyRequest{DisplayName: "X"})
	assert.ErrorIs(t, err, context.Canceled)
}
