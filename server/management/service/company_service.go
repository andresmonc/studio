package service

import (
	"context"
	"errors"
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
var ErrMonoCompanyExists = newPublicError(ErrConflict, "a company already exists (mono company mode)")

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

// Create adds a company with its first admin (super admin only), in one
// transaction, so no company is ever admin-less. The admin must be an existing
// user without a company. In mono company mode every other user without a
// company joins it as a member.
func (s *CompanyService) Create(
	ctx context.Context, actorID string, req *model.CreateCompanyWithAdminRequest,
) (*model.Company, error) {
	errs := validateName(&req.DisplayName, "displayName")
	if strings.TrimSpace(req.AdminEmail) == "" {
		errs = append(errs, model.ValidationError{Field: "adminEmail", Message: "company admin is required"})
	}
	if err := errs.Err(); err != nil {
		return nil, err
	}
	admin, err := s.users.GetByEmail(ctx, req.AdminEmail)
	if errors.Is(err, ErrNotFound) {
		return nil, newPublicError(ErrNotFound, "user with email "+req.AdminEmail+" not found")
	}
	if err != nil {
		return nil, err
	}
	if admin.CompanyID != nil {
		return nil, newPublicError(ErrConflict, "user with email "+req.AdminEmail+" already belongs to a company")
	}
	if s.mono {
		if err := ensureNoCompany(ctx, s.companies); err != nil {
			return nil, err
		}
	}
	c, m, err := s.companies.CreateWithAdmin(ctx, req.DisplayName, req.Description, admin.ID, s.mono)
	if err != nil {
		// The user joined a company or was deleted since the check above.
		return nil, writeError(err)
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &c.ID,
		Action: model.AuditActionCreate, TargetType: model.AuditTargetCompany, TargetID: c.ID, After: c,
	})
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &c.ID,
		Action: model.AuditActionCreate, TargetType: model.AuditTargetCompanyMember, TargetID: admin.ID, After: m,
	})
	return c, nil
}

func (s *CompanyService) Get(ctx context.Context, id string) (*model.Company, error) {
	return s.companies.GetByID(ctx, id)
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
	if errors.Is(err, ErrNotFound) { // deleted since the membership read
		return []model.Company{}, nil
	}
	if err != nil {
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
	if req.DisplayName != nil {
		if err := validateName(req.DisplayName, "displayName"); err != nil {
			return nil, err
		}
	}
	if !changes(req.DisplayName, before.DisplayName) && !changes(req.Description, before.Description) {
		return before, nil
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
	// A user of another company is reported as not found, like an unknown
	// email, so callers can't probe which accounts exist in other tenants.
	notFound := newPublicError(ErrNotFound, "user with email "+req.Email+" not found")
	u, err := s.users.GetByEmail(ctx, req.Email)
	if errors.Is(err, ErrNotFound) {
		return nil, false, notFound
	}
	if err != nil {
		return nil, false, err
	}
	if u.CompanyID != nil && *u.CompanyID != companyID {
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
		if string(prev) == string(req.Role) {
			return m, false, nil // same role: nothing changed, nothing to audit
		}
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
		return newPublicError(ErrConflict, "company must keep at least one admin")
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
	if prev == role {
		return nil
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &companyID,
		Action: model.AuditActionUpdate, TargetType: model.AuditTargetCompanyMember, TargetID: userID,
		Before: memberRole{string(prev)}, After: memberRole{string(role)},
	})
	return nil
}

// ErrMonoRemoveMember refuses a removal that wouldn't stick: in mono company
// mode the next login re-joins every user without a company.
var ErrMonoRemoveMember = newPublicError(ErrConflict,
	"members can't be removed in mono company mode: revoke their access at the identity provider")

func (s *CompanyService) RemoveMember(ctx context.Context, actorID, companyID, userID string) error {
	if s.mono {
		return ErrMonoRemoveMember
	}
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
