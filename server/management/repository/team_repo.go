package repository

import (
	"context"
	"errors"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// ErrTeamNameTaken means another team in the same company already has the name.
var ErrTeamNameTaken = errors.New("team name already used in this company")

type TeamRepo struct{ db *DB }

func NewTeamRepo(db *DB) *TeamRepo { return &TeamRepo{db: db} }

const teamCols = `id, company_id, name, description, created_at, updated_at`

func scanTeam(row pgx.Row, t *model.Team) error {
	return row.Scan(&t.ID, &t.CompanyID, &t.Name, &t.Description, &t.CreatedAt, &t.UpdatedAt)
}

func mapTeamNameTaken(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.ConstraintName == "teams_company_name_unique" {
		return ErrTeamNameTaken
	}
	return err
}

func (r *TeamRepo) Create(ctx context.Context, companyID, name, description string) (*model.Team, error) {
	var t model.Team
	err := scanTeam(r.db.Pool.QueryRow(ctx,
		`INSERT INTO teams (company_id, name, description) VALUES ($1, $2, $3)
		 RETURNING `+teamCols,
		companyID, name, description,
	), &t)
	if err != nil {
		return nil, mapTeamNameTaken(err)
	}
	return &t, nil
}

func (r *TeamRepo) GetByID(ctx context.Context, id string) (*model.Team, error) {
	var t model.Team
	err := scanTeam(r.db.Pool.QueryRow(ctx,
		`SELECT `+teamCols+` FROM teams WHERE id = $1`, id,
	), &t)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}
	return &t, nil
}

// List returns teams visible to the user: all of them for a super admin,
// otherwise the teams of the user's company.
func (r *TeamRepo) List(ctx context.Context, userID string, superAdmin bool) ([]model.Team, error) {
	if superAdmin {
		return r.queryTeams(ctx,
			`SELECT `+teamCols+` FROM teams ORDER BY name`)
	}
	return r.queryTeams(ctx, `SELECT `+teamCols+` FROM teams
		WHERE company_id = (SELECT company_id FROM users WHERE id = $1)
		ORDER BY name`, userID)
}

// ListByCompany returns all teams in the given company.
func (r *TeamRepo) ListByCompany(ctx context.Context, companyID string) ([]model.Team, error) {
	return r.queryTeams(ctx,
		`SELECT `+teamCols+` FROM teams WHERE company_id = $1 ORDER BY name`, companyID)
}

func (r *TeamRepo) queryTeams(ctx context.Context, q string, args ...any) ([]model.Team, error) {
	rows, err := r.db.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[model.Team])
}

func (r *TeamRepo) Update(ctx context.Context, id string, name, description *string) (*model.Team, error) {
	var t model.Team
	err := scanTeam(r.db.Pool.QueryRow(ctx, `
		UPDATE teams SET
			name = COALESCE($2, name),
			description = COALESCE($3, description),
			updated_at = NOW()
		WHERE id = $1
		RETURNING `+teamCols, id, name, description,
	), &t)
	if err != nil {
		if isNoRows(err) {
			return nil, ErrNotFound
		}
		return nil, mapTeamNameTaken(err)
	}
	return &t, nil
}

func (r *TeamRepo) Delete(ctx context.Context, id string) error {
	return r.db.execOne(ctx, `DELETE FROM teams WHERE id = $1`, id)
}

// GetRole returns the user's role in the team, or "" if none. A membership only
// counts while the user belongs to the team's company.
func (r *TeamRepo) GetRole(ctx context.Context, teamID, userID string) (model.Role, error) {
	var role model.Role
	err := r.db.Pool.QueryRow(ctx, `
		SELECT tm.role
		FROM team_members tm JOIN teams t ON t.id = tm.team_id
		JOIN users u ON u.id = tm.user_id AND u.company_id = t.company_id
		WHERE tm.team_id = $1 AND tm.user_id = $2`, teamID, userID,
	).Scan(&role)
	if err != nil {
		if isNoRows(err) {
			return "", nil
		}
		return "", err
	}
	return role, nil
}

func (r *TeamRepo) ListMembers(ctx context.Context, teamID string) ([]model.TeamMember, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT tm.user_id AS id, tm.team_id, tm.user_id, u.email, u.name, tm.role, tm.created_at
		FROM team_members tm
		JOIN users u ON u.id = tm.user_id
		WHERE tm.team_id = $1
		ORDER BY u.email`, teamID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[model.TeamMember])
}

// AddMember adds the user to the team, or updates their role if already a
// member. Fails with ErrConflictOrNotFound unless the team and user exist and
// the user belongs to the team's company.
func (r *TeamRepo) AddMember(ctx context.Context, teamID, userID string, role model.Role) error {
	ct, err := r.db.Pool.Exec(ctx, `
		INSERT INTO team_members (team_id, user_id, role)
		SELECT t.id, u.id, $3
		FROM teams t JOIN users u ON u.company_id = t.company_id
		WHERE t.id = $1 AND u.id = $2
		ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
		teamID, userID, role)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrConflictOrNotFound
	}
	return nil
}

func (r *TeamRepo) UpdateMemberRole(ctx context.Context, teamID, userID string, role model.Role) error {
	return r.db.execOne(ctx,
		`UPDATE team_members SET role = $3 WHERE team_id = $1 AND user_id = $2`, teamID, userID, role)
}

func (r *TeamRepo) RemoveMember(ctx context.Context, teamID, userID string) error {
	return r.db.execOne(ctx,
		`DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`, teamID, userID)
}

func (r *TeamRepo) Memberships(ctx context.Context, userID string) ([]model.TeamMembership, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT t.id AS team_id, t.name AS team_name, tm.role
		FROM team_members tm JOIN teams t ON t.id = tm.team_id
		JOIN users u ON u.id = tm.user_id AND u.company_id = t.company_id
		WHERE tm.user_id = $1
		ORDER BY t.name`, userID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[model.TeamMembership])
}
