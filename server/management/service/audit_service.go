package service

import (
	"context"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
)

type AuditService struct {
	repo      *repository.AuditRepo
	companies *repository.CompanyRepo
}

func NewAuditService(repo *repository.AuditRepo, companies *repository.CompanyRepo) *AuditService {
	return &AuditService{repo: repo, companies: companies}
}

// List returns one page of the entries userID may see, and their total. Tenant
// isolation is decided here, from the user, never from the filters: a super
// admin sees every company, a company admin their company, any other company
// member their teams plus company-level events, and a user with no company
// nothing. Team scoping follows current membership: a member no longer sees
// a team's history after leaving it, including its deletion.
func (s *AuditService) List(
	ctx context.Context, userID string, superAdmin bool, f model.AuditFilters,
) ([]model.AuditEntry, int, error) {
	var scope model.AuditScope
	if !superAdmin {
		m, err := s.companies.Membership(ctx, userID)
		if err != nil {
			return nil, 0, err
		}
		if m == nil {
			return []model.AuditEntry{}, 0, nil
		}
		scope.CompanyID = &m.CompanyID
		if m.Role != model.CompanyRoleAdmin {
			scope.MemberUserID = &userID
		}
	}
	return s.repo.List(ctx, scope, f)
}
