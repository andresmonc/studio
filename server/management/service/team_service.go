package service

import (
	"context"
	"errors"
	"strings"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
)

// memberRole is the audit payload of a team or company member role change.
type memberRole struct {
	Role string `json:"role"`
}

type TeamService struct {
	teams     *repository.TeamRepo
	users     *repository.UserRepo
	companies *repository.CompanyRepo
	audit     *repository.AuditRepo
}

func NewTeamService(
	teams *repository.TeamRepo, users *repository.UserRepo, companies *repository.CompanyRepo,
	audit *repository.AuditRepo,
) *TeamService {
	return &TeamService{teams: teams, users: users, companies: companies, audit: audit}
}

func (s *TeamService) Create(
	ctx context.Context, actorID, companyID string, req *model.CreateTeamRequest,
) (*model.Team, error) {
	errs := validateName(&req.Name, "name")
	if companyID == "" {
		errs = append(errs, model.ValidationError{Field: "companyId", Message: "companyId is required"})
	}
	if req.AdminEmail == "" {
		errs = append(errs, model.ValidationError{Field: "adminEmail", Message: "team admin is required"})
	}
	if err := errs.Err(); err != nil {
		return nil, err
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
		return nil, newPublicError(ErrNotFound, "user with email "+req.AdminEmail+" not found")
	}
	t, m, err := s.teams.CreateWithAdmin(ctx, companyID, req.Name, req.Description, admin.ID)
	if err != nil {
		return nil, writeError(err)
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &companyID, TeamID: &t.ID,
		Action: model.AuditActionCreate, TargetType: model.AuditTargetTeam, TargetID: t.ID, After: t,
	})
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &companyID, TeamID: &t.ID,
		Action: model.AuditActionCreate, TargetType: model.AuditTargetTeamMember, TargetID: admin.ID, After: m,
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
	t, err := s.teams.GetByID(ctx, id)
	if err == nil && t == nil {
		return nil, ErrNotFound
	}
	return t, err
}

func (s *TeamService) Update(
	ctx context.Context, actorID, id string, req *model.UpdateTeamRequest,
) (*model.Team, error) {
	before, err := s.teams.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if before == nil {
		return nil, ErrNotFound
	}
	if req.Name != nil {
		if err := validateName(req.Name, "name"); err != nil {
			return nil, err
		}
	}
	t, err := s.teams.Update(ctx, id, req.Name, req.Description)
	if err != nil {
		return nil, writeError(err)
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &t.CompanyID, TeamID: &t.ID,
		Action: model.AuditActionUpdate, TargetType: model.AuditTargetTeam, TargetID: t.ID, Before: before, After: t,
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
	if err := s.teams.Delete(ctx, id); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotFound
		}
		return err
	}
	// Recorded after the delete so a failed delete leaves no entry. audit_log
	// has no foreign keys, and CompanyID is passed because the team is gone.
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &before.CompanyID, TeamID: &id,
		Action: model.AuditActionDelete, TargetType: model.AuditTargetTeam, TargetID: id, Before: before,
	})
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
func (s *TeamService) AddMember(
	ctx context.Context, actorID, teamID string, req *model.AddMemberRequest,
) (*model.TeamMember, bool, error) {
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
		return nil, false, newPublicError(ErrNotFound, "user with email "+req.Email+" not found")
	}
	m, prev, err := s.teams.SetMember(ctx, teamID, u.ID, req.Role)
	if err != nil {
		return nil, false, writeError(err)
	}
	// An add records the member; a role change records the roles on both
	// sides, the same shape as UpdateMember.
	in := repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &team.CompanyID, TeamID: &teamID,
		Action: model.AuditActionCreate, TargetType: model.AuditTargetTeamMember, TargetID: u.ID, After: m,
	}
	added := prev == ""
	if !added {
		in.Action, in.Before, in.After = model.AuditActionUpdate, memberRole{string(prev)}, memberRole{string(req.Role)}
	}
	_ = s.audit.Record(ctx, nil, in)
	return m, added, nil
}

func (s *TeamService) UpdateMember(ctx context.Context, actorID, teamID, userID string, role model.Role) error {
	if !role.IsValid() {
		return model.ValidationErrors{errInvalidRole}
	}
	prev, err := s.teams.UpdateMemberRole(ctx, teamID, userID, role)
	if err != nil {
		return writeError(err)
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, TeamID: &teamID,
		Action: model.AuditActionUpdate, TargetType: model.AuditTargetTeamMember, TargetID: userID,
		Before: memberRole{string(prev)}, After: memberRole{string(role)},
	})
	return nil
}

func (s *TeamService) RemoveMember(ctx context.Context, actorID, teamID, userID string) error {
	prev, err := s.teams.RemoveMember(ctx, teamID, userID)
	if err != nil {
		return writeError(err)
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, TeamID: &teamID,
		Action: model.AuditActionDelete, TargetType: model.AuditTargetTeamMember, TargetID: userID,
		Before: memberRole{string(prev)},
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

	// AtLeast("") is false (unknown roles are denied), so check for no
	// inherited role first.
	if inherited == "" || explicit.AtLeast(inherited) {
		return explicit, nil
	}
	return inherited, nil
}

func (s *TeamService) Memberships(ctx context.Context, userID string) ([]model.TeamMembership, error) {
	return s.teams.Memberships(ctx, userID)
}
