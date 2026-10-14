package service

import (
	"context"
	"errors"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
)

type OnboardingService struct {
	companies *repository.CompanyRepo
	users     *repository.UserRepo
	audit     *repository.AuditRepo
	mono      bool // mono company mode: only a super admin creates the single company
}

func NewOnboardingService(
	c *repository.CompanyRepo, u *repository.UserRepo, a *repository.AuditRepo, mono bool,
) *OnboardingService {
	return &OnboardingService{companies: c, users: u, audit: a, mono: mono}
}

// CreateCompanyForNewUser lets a user with no company create a company and
// become its admin. Rejects users already attached to any company. In mono
// company mode only a super admin may do it, and only while no company exists;
// every other user without a company then joins it as a member. superAdmin
// must come from the authenticated session (AuthService.Authenticate), not
// the user row, so a revoked super admin can't use a live session for this.
func (s *OnboardingService) CreateCompanyForNewUser(
	ctx context.Context, userID string, superAdmin bool, req *model.CreateCompanyRequest,
) (*model.Company, error) {
	if err := validateName(&req.DisplayName, "displayName"); err != nil {
		return nil, err
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, ErrNotFound
	}
	if u.CompanyID != nil || (s.mono && !superAdmin) {
		return nil, ErrForbidden
	}
	if s.mono {
		if err := ensureNoCompany(ctx, s.companies); err != nil {
			return nil, err
		}
	}
	c, m, err := s.companies.CreateWithAdmin(ctx, req.DisplayName, req.Description, userID, s.mono)
	if err != nil {
		// The user joined a company (or was deleted) since the check above.
		if errors.Is(err, repository.ErrConflictOrNotFound) {
			return nil, ErrForbidden
		}
		return nil, err
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &userID, CompanyID: &c.ID,
		Action: model.AuditActionCreate, TargetType: model.AuditTargetCompany, TargetID: c.ID, After: c,
	})
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &userID, CompanyID: &c.ID,
		Action: model.AuditActionCreate, TargetType: model.AuditTargetCompanyMember, TargetID: userID, After: m,
	})
	return c, nil
}
