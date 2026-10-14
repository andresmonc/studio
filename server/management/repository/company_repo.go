package repository

import (
	"context"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/jackc/pgx/v5"
)

type CompanyRepo struct{ db *DB }

func NewCompanyRepo(db *DB) *CompanyRepo { return &CompanyRepo{db: db} }

const companyCols = `id, display_name, description, created_at, updated_at`

func scanCompany(row pgx.Row, c *model.Company) error {
	return row.Scan(&c.ID, &c.DisplayName, &c.Description, &c.CreatedAt, &c.UpdatedAt)
}

func (r *CompanyRepo) Create(ctx context.Context, displayName, description string) (*model.Company, error) {
	var c model.Company
	err := scanCompany(r.db.Pool.QueryRow(ctx,
		`INSERT INTO companies (display_name, description) VALUES ($1, $2)
		 RETURNING `+companyCols,
		displayName, description,
	), &c)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *CompanyRepo) GetByID(ctx context.Context, id string) (*model.Company, error) {
	var c model.Company
	err := scanCompany(r.db.Pool.QueryRow(ctx,
		`SELECT `+companyCols+` FROM companies WHERE id = $1`, id,
	), &c)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}
	return &c, nil
}

// First returns the oldest company, or nil, nil when there is none. In mono
// company mode it is THE company.
func (r *CompanyRepo) First(ctx context.Context) (*model.Company, error) {
	var c model.Company
	err := scanCompany(r.db.Pool.QueryRow(ctx,
		`SELECT `+companyCols+` FROM companies ORDER BY created_at, id LIMIT 1`,
	), &c)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}
	return &c, nil
}

func (r *CompanyRepo) List(ctx context.Context) ([]model.Company, error) {
	rows, err := r.db.Pool.Query(ctx,
		`SELECT `+companyCols+` FROM companies ORDER BY display_name`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[model.Company])
}

// Update applies optional patches. displayName/description are COALESCE'd.
func (r *CompanyRepo) Update(ctx context.Context, id string, displayName, description *string) (*model.Company, error) {
	var c model.Company
	err := scanCompany(r.db.Pool.QueryRow(ctx, `
		UPDATE companies SET
			display_name = COALESCE($2, display_name),
			description  = COALESCE($3, description),
			updated_at   = NOW()
		WHERE id = $1
		RETURNING `+companyCols, id, displayName, description,
	), &c)
	if err != nil {
		if isNoRows(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &c, nil
}

func (r *CompanyRepo) Delete(ctx context.Context, id string) error {
	return r.db.execOne(ctx, `DELETE FROM companies WHERE id = $1`, id)
}

func (r *CompanyRepo) ListMembers(ctx context.Context, companyID string) ([]model.CompanyMember, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT u.id, u.company_id, u.id AS user_id, u.email, u.name, u.company_role AS role, u.created_at
		FROM users u
		WHERE u.company_id = $1 AND u.company_role IS NOT NULL
		ORDER BY u.email`, companyID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[model.CompanyMember])
}

// SetMember assigns a user to a company with the given role. Fails if user
// already attached to a different company (one company per user).
func (r *CompanyRepo) SetMember(ctx context.Context, companyID, userID string, role model.CompanyRole) error {
	ct, err := r.db.Pool.Exec(ctx, `
		UPDATE users SET company_id = $1, company_role = $2, updated_at = NOW()
		WHERE id = $3 AND (company_id IS NULL OR company_id = $1)`,
		companyID, role, userID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrConflictOrNotFound
	}
	return nil
}

func (r *CompanyRepo) UpdateMemberRole(ctx context.Context, companyID, userID string, role model.CompanyRole) error {
	return r.db.execOne(ctx,
		`UPDATE users SET company_role = $3, updated_at = NOW()
		 WHERE company_id = $1 AND id = $2`, companyID, userID, role)
}

// RemoveMember detaches the user from the company and, in the same
// transaction, drops their explicit roles on the company's teams so a former
// member keeps no team access.
func (r *CompanyRepo) RemoveMember(ctx context.Context, companyID, userID string) error {
	return pgx.BeginFunc(ctx, r.db.Pool, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx,
			`UPDATE users SET company_id = NULL, company_role = NULL, updated_at = NOW()
			 WHERE company_id = $1 AND id = $2`, companyID, userID)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrNotFound
		}
		_, err = tx.Exec(ctx,
			`DELETE FROM team_members
			 WHERE user_id = $2 AND team_id IN (SELECT id FROM teams WHERE company_id = $1)`, companyID, userID)
		return err
	})
}

// Membership returns the user's company role and id, if any.
func (r *CompanyRepo) Membership(ctx context.Context, userID string) (*model.CompanyMembership, error) {
	var m model.CompanyMembership
	err := r.db.Pool.QueryRow(ctx, `
		SELECT c.id, c.display_name, u.company_role
		FROM users u JOIN companies c ON c.id = u.company_id
		WHERE u.id = $1 AND u.company_role IS NOT NULL`, userID,
	).Scan(&m.CompanyID, &m.CompanyDisplayName, &m.Role)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}
	return &m, nil
}
