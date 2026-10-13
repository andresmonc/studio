package service

import (
	"context"
	"fmt"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
)

type OnboardingService struct {
	companies *repository.CompanyRepo
	users     *repository.UserRepo
	audit     *repository.AuditRepo
	mono      bool // mono company mode: only a super admin creates the single company
}

func NewOnboardingService(c *repository.CompanyRepo, u *repository.UserRepo, a *repository.AuditRepo, mono bool) *OnboardingService {
	return &OnboardingService{companies: c, users: u, audit: a, mono: mono}
}

// CreateCompanyForNewUser lets a user with no company create a company and
// become its admin. Rejects users already attached to any company. In mono
// company mode only a super admin may do it, and only while no company exists.
func (s *OnboardingService) CreateCompanyForNewUser(ctx context.Context, userID string, req *model.CreateCompanyRequest) (*model.Company, error) {
	domain, err := validateNewCompany(req)
	if err != nil {
		return nil, err
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, ErrNotFound
	}
	if u.CompanyID != nil || (s.mono && !u.IsSuperAdmin) {
		return nil, ErrForbidden
	}
	if s.mono {
		if err := ensureNoCompany(ctx, s.companies); err != nil {
			return nil, err
		}
	}
	c, err := s.companies.Create(ctx, req.DisplayName, domain, req.Description)
	if err != nil {
		if uniqueViolation(err) {
			return nil, fmt.Errorf("%w: domain already in use", ErrConflict)
		}
		return nil, err
	}
	if err := s.companies.SetMember(ctx, c.ID, userID, model.CompanyRoleAdmin); err != nil {
		return nil, err
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &userID, CompanyID: &c.ID,
		Action: "company.onboarding.create", TargetType: "company", TargetID: c.ID, After: c,
	})
	return c, nil
}
