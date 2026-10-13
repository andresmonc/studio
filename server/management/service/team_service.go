package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
)

var (
	ErrForbidden = errors.New("forbidden")
	ErrNotFound  = errors.New("not found")
	ErrConflict  = errors.New("conflict")
)

type TeamService struct {
	teams     *repository.TeamRepo
	users     *repository.UserRepo
	companies *repository.CompanyRepo
	audit     *repository.AuditRepo
}

func NewTeamService(teams *repository.TeamRepo, users *repository.UserRepo, companies *repository.CompanyRepo, audit *repository.AuditRepo) *TeamService {
	return &TeamService{teams: teams, users: users, companies: companies, audit: audit}
}

func (s *TeamService) Create(ctx context.Context, actorID, companyID string, req *model.CreateTeamRequest) (*model.Team, error) {
	if err := validateName(&req.Name); err != nil {
		return nil, err
	}
	if companyID == "" {
		return nil, model.ValidationErrors{{Field: "companyId", Message: "companyId is required"}}
	}
	if req.AdminEmail == "" {
		return nil, model.ValidationErrors{{Field: "adminEmail", Message: "team admin is required"}}
	}
	// Validate the team admin before creating the team so we never leave an
	// admin-less team behind. The admin must already belong to the company.
	admin, err := s.users.GetByEmail(ctx, req.AdminEmail)
	if err != nil {
		return nil, err
	}
	// A user of another company is reported as not found, like an unknown
	// email, so callers can't probe which accounts exist in other tenants.
	if admin == nil || admin.CompanyID == nil || *admin.CompanyID != companyID {
		return nil, fmt.Errorf("%w: user with email %s not found", ErrNotFound, req.AdminEmail)
	}
	t, err := s.teams.Create(ctx, companyID, req.Name, req.Description)
	if err != nil {
		return nil, err
	}
	if err := s.teams.AddMember(ctx, t.ID, admin.ID, model.RoleAdmin); err != nil {
		return nil, err
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &companyID, TeamID: &t.ID,
		Action: "team.create", TargetType: "team", TargetID: t.ID, After: t,
	})
	m := &model.TeamMember{ID: admin.ID, TeamID: t.ID, UserID: admin.ID, Email: admin.Email, Name: admin.Name, Role: model.RoleAdmin}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &companyID, TeamID: &t.ID,
		Action: "team.member.add", TargetType: "user", TargetID: admin.ID, After: m,
	})
	return t, nil
}

func (s *TeamService) List(ctx context.Context, userID string, superAdmin bool) ([]model.Team, error) {
	return s.teams.List(ctx, userID, superAdmin)
}

func (s *TeamService) ListByCompany(ctx context.Context, companyID string) ([]model.Team, error) {
	return s.teams.ListByCompany(ctx, companyID)
}

func (s *TeamService) Get(ctx context.Context, id string) (*model.Team, error) {
	return s.teams.GetByID(ctx, id)
}

func (s *TeamService) Update(ctx context.Context, actorID, id string, req *model.UpdateTeamRequest) (*model.Team, error) {
	before, err := s.teams.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if before == nil {
		return nil, ErrNotFound
	}
	if req.Name != nil {
		if err := validateName(req.Name); err != nil {
			return nil, err
		}
	}
	t, err := s.teams.Update(ctx, id, req.Name, req.Description)
	if err != nil {
		return nil, err
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &t.CompanyID, TeamID: &t.ID,
		Action: "team.update", TargetType: "team", TargetID: t.ID, Before: before, After: t,
	})
	return t, nil
}

func (s *TeamService) Delete(ctx context.Context, actorID, id string) error {
	before, err := s.teams.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if before == nil {
		return ErrNotFound
	}
	// Record the audit event *before* deleting: audit_log's team_id is
	// ON DELETE SET NULL, so an entry written first survives the delete (its
	// team_id is nulled by the cascade), whereas an insert after the delete
	// would fail the foreign-key check and be silently lost.
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &before.CompanyID, TeamID: &id,
		Action: "team.delete", TargetType: "team", TargetID: id, Before: before,
	})
	if err := s.teams.Delete(ctx, id); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotFound
		}
		return err
	}
	return nil
}

func (s *TeamService) ListMembers(ctx context.Context, teamID string) ([]model.TeamMember, error) {
	return s.teams.ListMembers(ctx, teamID)
}

// AddableMembers returns the company members eligible to be added to the team,
// i.e. members of the team's company who are not already on the team.
func (s *TeamService) AddableMembers(ctx context.Context, teamID string) ([]model.CompanyMember, error) {
	team, err := s.teams.GetByID(ctx, teamID)
	if err != nil {
		return nil, err
	}
	if team == nil {
		return nil, ErrNotFound
	}
	companyMembers, err := s.companies.ListMembers(ctx, team.CompanyID)
	if err != nil {
		return nil, err
	}
	teamMembers, err := s.teams.ListMembers(ctx, teamID)
	if err != nil {
		return nil, err
	}
	inTeam := make(map[string]struct{}, len(teamMembers))
	for _, m := range teamMembers {
		inTeam[m.UserID] = struct{}{}
	}
	out := make([]model.CompanyMember, 0, len(companyMembers))
	for _, cm := range companyMembers {
		if _, ok := inTeam[cm.UserID]; !ok {
			out = append(out, cm)
		}
	}
	return out, nil
}

// AddMember adds the user to the team, or sets their role when they are
// already on it. The bool reports whether the user was newly added.
func (s *TeamService) AddMember(ctx context.Context, actorID, teamID string, req *model.AddMemberRequest) (*model.TeamMember, bool, error) {
	if !req.Role.IsValid() {
		return nil, false, model.ValidationErrors{{Field: "role", Message: "invalid role"}}
	}
	u, err := s.users.GetByEmail(ctx, req.Email)
	if err != nil {
		return nil, false, err
	}
	team, err := s.teams.GetByID(ctx, teamID)
	if err != nil {
		return nil, false, err
	}
	if team == nil {
		return nil, false, ErrNotFound
	}
	// User must belong to the team's company. Anyone else is "not found", like
	// an unknown email, so callers can't probe accounts in other tenants.
	if u == nil || u.CompanyID == nil || *u.CompanyID != team.CompanyID {
		return nil, false, fmt.Errorf("%w: user with email %s not found", ErrNotFound, req.Email)
	}
	prev, err := s.teams.GetRole(ctx, teamID, u.ID)
	if err != nil {
		return nil, false, err
	}
	if err := s.teams.AddMember(ctx, teamID, u.ID, req.Role); err != nil {
		return nil, false, err
	}
	m := &model.TeamMember{ID: u.ID, TeamID: teamID, UserID: u.ID, Email: u.Email, Name: u.Name, Role: req.Role}
	in := repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &team.CompanyID, TeamID: &teamID,
		Action: "team.member.add", TargetType: "user", TargetID: u.ID, After: m,
	}
	if prev != "" {
		in.Action, in.Before = "team.member.update", map[string]any{"role": prev}
	}
	_ = s.audit.Record(ctx, nil, in)
	return m, prev == "", nil
}

func (s *TeamService) UpdateMember(ctx context.Context, actorID, teamID, userID string, role model.Role) error {
	if !role.IsValid() {
		return model.ValidationErrors{{Field: "role", Message: "invalid role"}}
	}
	if err := s.teams.UpdateMemberRole(ctx, teamID, userID, role); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotFound
		}
		return err
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, TeamID: &teamID,
		Action: "team.member.update", TargetType: "user", TargetID: userID,
		After: map[string]any{"role": role},
	})
	return nil
}

func (s *TeamService) RemoveMember(ctx context.Context, actorID, teamID, userID string) error {
	if err := s.teams.RemoveMember(ctx, teamID, userID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotFound
		}
		return err
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, TeamID: &teamID,
		Action: "team.member.remove", TargetType: "user", TargetID: userID,
	})
	return nil
}

// Role returns the user's effective role on the team, considering both explicit
// team membership and inherited company role. Returns "" if neither applies, or
// if the user is not a member of the team's company: an explicit team role left
// over from a former company membership grants nothing.
func (s *TeamService) Role(ctx context.Context, teamID, userID string) (model.Role, error) {
	team, err := s.teams.GetByID(ctx, teamID)
	if err != nil {
		return "", err
	}
	if team == nil {
		return "", nil
	}

	cm, err := s.companies.Membership(ctx, userID)
	if err != nil {
		return "", err
	}
	if cm == nil || cm.CompanyID != team.CompanyID {
		return "", nil
	}

	explicit, err := s.teams.GetRole(ctx, teamID, userID)
	if err != nil {
		return "", err
	}
	inherited := cm.Role.AsTeamRole()

	if explicit.AtLeast(inherited) {
		return explicit, nil
	}
	return inherited, nil
}

func (s *TeamService) Memberships(ctx context.Context, userID string) ([]model.TeamMembership, error) {
	return s.teams.Memberships(ctx, userID)
}
