package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/jackc/pgx/v5/pgconn"
)

var domainRegex = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$`)

// normalizeDomain trims, lowercases, and validates a domain. Returns:
//   - (nil, nil)        when input is empty (i.e. clear / unset)
//   - (*string, nil)    when valid
//   - (nil, error)      when invalid format
func normalizeDomain(s string) (*string, error) {
	d := strings.ToLower(strings.TrimSpace(s))
	if d == "" {
		return nil, nil
	}
	if !domainRegex.MatchString(d) {
		return nil, model.ValidationErrors{{Field: "domain", Message: "invalid domain"}}
	}
	return &d, nil
}

func uniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

type CompanyService struct {
	companies *repository.CompanyRepo
	users     *repository.UserRepo
	audit     *repository.AuditRepo
	mono      bool // mono company mode: at most one company
}

func NewCompanyService(c *repository.CompanyRepo, u *repository.UserRepo, a *repository.AuditRepo, mono bool) *CompanyService {
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

// validateNewCompany checks a create-company request and returns its normalized
// domain (nil when none was supplied).
func validateNewCompany(req *model.CreateCompanyRequest) (*string, error) {
	if strings.TrimSpace(req.DisplayName) == "" {
		return nil, model.ValidationErrors{{Field: "displayName", Message: "displayName is required"}}
	}
	if utf8.RuneCountInString(req.DisplayName) > 120 {
		return nil, model.ValidationErrors{{Field: "displayName", Message: "max 120 characters"}}
	}
	if req.Domain == nil {
		return nil, nil
	}
	return normalizeDomain(*req.Domain)
}

func (s *CompanyService) Create(ctx context.Context, actorID string, req *model.CreateCompanyRequest) (*model.Company, error) {
	domain, err := validateNewCompany(req)
	if err != nil {
		return nil, err
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
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &c.ID,
		Action: "company.create", TargetType: "company", TargetID: c.ID, After: c,
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
		return nil, nil
	}
	c, err := s.companies.GetByID(ctx, m.CompanyID)
	if err != nil || c == nil {
		return nil, err
	}
	return []model.Company{*c}, nil
}

// Update edits a company. Only a super admin may change the domain: domain
// auto-join would otherwise let a company admin claim someone else's domain and
// pull its users into their tenant. Re-sending the current domain is allowed.
func (s *CompanyService) Update(ctx context.Context, actorID string, isSuperAdmin bool, id string, req *model.UpdateCompanyRequest) (*model.Company, error) {
	before, err := s.companies.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if before == nil {
		return nil, ErrNotFound
	}
	if req.DisplayName != nil {
		trimmed := strings.TrimSpace(*req.DisplayName)
		if trimmed == "" {
			return nil, model.ValidationErrors{{Field: "displayName", Message: "displayName cannot be empty"}}
		}
		if utf8.RuneCountInString(trimmed) > 120 {
			return nil, model.ValidationErrors{{Field: "displayName", Message: "max 120 characters"}}
		}
		req.DisplayName = &trimmed
	}
	var domain *string
	domainSet := false
	if req.Domain != nil {
		domainSet = true
		d, err := normalizeDomain(*req.Domain)
		if err != nil {
			return nil, err
		}
		domain = d
		changed := (domain == nil) != (before.Domain == nil) || (domain != nil && *domain != *before.Domain)
		if changed && !isSuperAdmin {
			return nil, fmt.Errorf("%w: only a super admin can change the company domain", ErrForbidden)
		}
	}
	c, err := s.companies.Update(ctx, id, req.DisplayName, req.Description, domain, domainSet)
	if err != nil {
		if uniqueViolation(err) {
			return nil, fmt.Errorf("%w: domain already in use", ErrConflict)
		}
		return nil, err
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &c.ID,
		Action: "company.update", TargetType: "company", TargetID: c.ID, Before: before, After: c,
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
	// Record the audit event *before* deleting: audit_log's FK columns are
	// ON DELETE SET NULL, so an entry written first survives the delete (its
	// company_id is nulled by the cascade), whereas an insert after the delete
	// would fail the foreign-key check and be silently lost.
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &id,
		Action: "company.delete", TargetType: "company", TargetID: id, Before: before,
	})
	if err := s.companies.Delete(ctx, id); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotFound
		}
		return err
	}
	return nil
}

func (s *CompanyService) ListMembers(ctx context.Context, companyID string) ([]model.CompanyMember, error) {
	return s.companies.ListMembers(ctx, companyID)
}

// AddMember adds the user to the company, or sets their role when they are
// already a member. The bool reports whether the user was newly added.
func (s *CompanyService) AddMember(ctx context.Context, actorID, companyID string, req *model.AddCompanyMemberRequest) (*model.CompanyMember, bool, error) {
	if !req.Role.IsValid() {
		return nil, false, model.ValidationErrors{{Field: "role", Message: "invalid role"}}
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
	existed := u.CompanyID != nil && u.CompanyRole != nil
	if existed && req.Role != model.CompanyRoleAdmin {
		if err := s.ensureNotLastAdmin(ctx, companyID, u.ID); err != nil {
			return nil, false, err
		}
	}
	if err := s.companies.SetMember(ctx, companyID, u.ID, req.Role); err != nil {
		if errors.Is(err, repository.ErrConflictOrNotFound) {
			return nil, false, notFound
		}
		return nil, false, err
	}
	m := &model.CompanyMember{ID: u.ID, CompanyID: companyID, UserID: u.ID, Email: u.Email, Name: u.Name, Role: req.Role}
	in := repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &companyID,
		Action: "company.member.add", TargetType: "user", TargetID: u.ID, After: m,
	}
	if existed {
		in.Action, in.Before = "company.member.update", map[string]any{"role": *u.CompanyRole}
	}
	_ = s.audit.Record(ctx, nil, in)
	return m, !existed, nil
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

func (s *CompanyService) UpdateMember(ctx context.Context, actorID, companyID, userID string, role model.CompanyRole) error {
	if !role.IsValid() {
		return model.ValidationErrors{{Field: "role", Message: "invalid role"}}
	}
	if role != model.CompanyRoleAdmin {
		if err := s.ensureNotLastAdmin(ctx, companyID, userID); err != nil {
			return err
		}
	}
	if err := s.companies.UpdateMemberRole(ctx, companyID, userID, role); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotFound
		}
		return err
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &companyID,
		Action: "company.member.update", TargetType: "user", TargetID: userID,
		After: map[string]any{"role": role},
	})
	return nil
}

func (s *CompanyService) RemoveMember(ctx context.Context, actorID, companyID, userID string) error {
	if err := s.ensureNotLastAdmin(ctx, companyID, userID); err != nil {
		return err
	}
	if err := s.companies.RemoveMember(ctx, companyID, userID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotFound
		}
		return err
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &companyID,
		Action: "company.member.remove", TargetType: "user", TargetID: userID,
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
