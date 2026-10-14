package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
)

type CompanyService struct {
	companies *repository.CompanyRepo
	users     *repository.UserRepo
	audit     *repository.AuditRepo
	mono      bool // mono company mode: at most one company
}

func NewCompanyService(
	c *repository.CompanyRepo, u *repository.UserRepo, a *repository.AuditRepo, mono bool,
) *CompanyService {
	return &CompanyService{companies: c, users: u, audit: a, mono: mono}
}

// ErrMonoCompanyExists is returned when creating a second company in mono
// company mode.
var ErrMonoCompanyExists = fmt.Errorf("%w: a company already exists (mono company mode)", ErrConflict)

// ensureNoCompany fails with ErrMonoCompanyExists when a company exists.
// ponytail: check-then-insert, two concurrent first creates can both pass;
// add a DB-level guard if that ever matters.
func ensureNoCompany(ctx context.Context, companies *repository.CompanyRepo) error {
	c, err := companies.First(ctx)
	if err != nil {
		return err
	}
	if c != nil {
		return ErrMonoCompanyExists
	}
	return nil
}

// Create adds a company without members: it is super-admin only, and the
// super admin then adds the first admin. Onboarding creates the company
// together with its admin instead.
func (s *CompanyService) Create(
	ctx context.Context, actorID string, req *model.CreateCompanyRequest,
) (*model.Company, error) {
	if err := validateName(&req.DisplayName, "displayName"); err != nil {
		return nil, err
	}
	if s.mono {
		if err := ensureNoCompany(ctx, s.companies); err != nil {
			return nil, err
		}
	}
	c, err := s.companies.Create(ctx, req.DisplayName, req.Description)
	if err != nil {
		return nil, err
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &c.ID,
		Action: model.AuditActionCreate, TargetType: model.AuditTargetCompany, TargetID: c.ID, After: c,
	})
	return c, nil
}

func (s *CompanyService) Get(ctx context.Context, id string) (*model.Company, error) {
	c, err := s.companies.GetByID(ctx, id)
	if err == nil && c == nil {
		return nil, ErrNotFound
	}
	return c, err
}

// List returns visible companies. SuperAdmin sees all; otherwise the user's company.
func (s *CompanyService) List(ctx context.Context, userID string, superAdmin bool) ([]model.Company, error) {
	if superAdmin {
		return s.companies.List(ctx)
	}
	m, err := s.companies.Membership(ctx, userID)
	if err != nil {
		return nil, err
	}
	if m == nil {
		return []model.Company{}, nil
	}
	c, err := s.companies.GetByID(ctx, m.CompanyID)
	if err != nil || c == nil {
		return nil, err
	}
	return []model.Company{*c}, nil
}

// Update edits a company.
func (s *CompanyService) Update(
	ctx context.Context, actorID string, id string, req *model.UpdateCompanyRequest,
) (*model.Company, error) {
	before, err := s.companies.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if before == nil {
		return nil, ErrNotFound
	}
	if req.DisplayName != nil {
		if err := validateName(req.DisplayName, "displayName"); err != nil {
			return nil, err
		}
	}
	c, err := s.companies.Update(ctx, id, req.DisplayName, req.Description)
	if err != nil {
		return nil, writeError(err)
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &c.ID,
		Action: model.AuditActionUpdate, TargetType: model.AuditTargetCompany, TargetID: c.ID,
		Before: before, After: c,
	})
	return c, nil
}

func (s *CompanyService) Delete(ctx context.Context, actorID, id string) error {
	before, err := s.companies.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if before == nil {
		return ErrNotFound
	}
	if err := s.companies.Delete(ctx, id); err != nil {
		return writeError(err)
	}
	// Recorded after the delete so a failed delete leaves no entry; audit_log
	// has no foreign keys, so the entry outlives the company.
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &id,
		Action: model.AuditActionDelete, TargetType: model.AuditTargetCompany, TargetID: id, Before: before,
	})
	return nil
}

func (s *CompanyService) ListMembers(ctx context.Context, companyID string) ([]model.CompanyMember, error) {
	return s.companies.ListMembers(ctx, companyID)
}

// AddMember adds the user to the company, or sets their role when they are
// already a member. The bool reports whether the user was newly added, as
// returned by the write itself.
func (s *CompanyService) AddMember(
	ctx context.Context, actorID, companyID string, req *model.AddCompanyMemberRequest,
) (*model.CompanyMember, bool, error) {
	var errs model.ValidationErrors
	req.Email = strings.TrimSpace(req.Email)
	if req.Email == "" {
		errs = append(errs, model.ValidationError{Field: "email", Message: "email is required"})
	}
	if !req.Role.IsValid() {
		errs = append(errs, errInvalidRole)
	}
	if err := errs.Err(); err != nil {
		return nil, false, err
	}
	u, err := s.users.GetByEmail(ctx, req.Email)
	if err != nil {
		return nil, false, err
	}
	// A user of another company is reported as not found, like an unknown
	// email, so callers can't probe which accounts exist in other tenants.
	notFound := fmt.Errorf("%w: user with email %s not found", ErrNotFound, req.Email)
	if u == nil || (u.CompanyID != nil && *u.CompanyID != companyID) {
		return nil, false, notFound
	}
	if req.Role != model.CompanyRoleAdmin {
		if err := s.ensureNotLastAdmin(ctx, companyID, u.ID); err != nil {
			return nil, false, err
		}
	}
	m, prev, err := s.companies.SetMember(ctx, companyID, u.ID, req.Role)
	if err != nil {
		if errors.Is(err, repository.ErrConflictOrNotFound) {
			return nil, false, notFound
		}
		return nil, false, err
	}
	// An add records the member; a role change records the roles on both
	// sides, the same shape as UpdateMember.
	in := repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &companyID,
		Action: model.AuditActionCreate, TargetType: model.AuditTargetCompanyMember, TargetID: u.ID, After: m,
	}
	added := prev == ""
	if !added {
		in.Action, in.Before, in.After = model.AuditActionUpdate, memberRole{string(prev)}, memberRole{string(req.Role)}
	}
	_ = s.audit.Record(ctx, nil, in)
	return m, added, nil
}

// ensureNotLastAdmin fails with ErrConflict when userID is the company's only
// admin, so the company always keeps someone able to manage it.
// ponytail: check-then-act, concurrent demotes/removes of different admins can
// both pass and leave zero admins. Fix if that ever matters: one tx that locks
// the admin rows (SELECT id FROM users WHERE company_id=$1 AND
// company_role='admin' FOR UPDATE), counts them, then writes. A plain
// conditional UPDATE still races under READ COMMITTED.
func (s *CompanyService) ensureNotLastAdmin(ctx context.Context, companyID, userID string) error {
	members, err := s.companies.ListMembers(ctx, companyID)
	if err != nil {
		return err
	}
	admins, isAdmin := 0, false
	for _, m := range members {
		if m.Role == model.CompanyRoleAdmin {
			admins++
			isAdmin = isAdmin || m.UserID == userID
		}
	}
	if isAdmin && admins == 1 {
		return fmt.Errorf("%w: company must keep at least one admin", ErrConflict)
	}
	return nil
}

func (s *CompanyService) UpdateMember(
	ctx context.Context, actorID, companyID, userID string, role model.CompanyRole,
) error {
	if !role.IsValid() {
		return model.ValidationErrors{errInvalidRole}
	}
	if role != model.CompanyRoleAdmin {
		if err := s.ensureNotLastAdmin(ctx, companyID, userID); err != nil {
			return err
		}
	}
	_, prev, err := s.companies.UpdateMemberRole(ctx, companyID, userID, role)
	if err != nil {
		return writeError(err)
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &companyID,
		Action: model.AuditActionUpdate, TargetType: model.AuditTargetCompanyMember, TargetID: userID,
		Before: memberRole{string(prev)}, After: memberRole{string(role)},
	})
	return nil
}

func (s *CompanyService) RemoveMember(ctx context.Context, actorID, companyID, userID string) error {
	if err := s.ensureNotLastAdmin(ctx, companyID, userID); err != nil {
		return err
	}
	prev, err := s.companies.RemoveMember(ctx, companyID, userID)
	if err != nil {
		return writeError(err)
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &companyID,
		Action: model.AuditActionDelete, TargetType: model.AuditTargetCompanyMember, TargetID: userID,
		Before: memberRole{string(prev)},
	})
	return nil
}

func (s *CompanyService) Membership(ctx context.Context, userID string) (*model.CompanyMembership, error) {
	return s.companies.Membership(ctx, userID)
}

// Role returns the user's role in the given company, or empty if no membership.
func (s *CompanyService) Role(ctx context.Context, companyID, userID string) (model.CompanyRole, error) {
	m, err := s.companies.Membership(ctx, userID)
	if err != nil || m == nil {
		return "", err
	}
	if m.CompanyID != companyID {
		return "", nil
	}
	return m.Role, nil
}
