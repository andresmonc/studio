package repository

import (
	"context"
	"errors"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
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
			return nil, ErrNotFound
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

// Delete removes the company and its teams (by cascade). users.company_id has
// no ON DELETE action, because SET NULL would leave company_role behind and
// break users_company_role_pair, so members are detached first in the same
// transaction.
func (r *CompanyRepo) Delete(ctx context.Context, id string) error {
	err := pgx.BeginFunc(ctx, r.db.Pool, func(tx pgx.Tx) error {
		// Locking the company first makes a concurrent SetMember's foreign-key
		// check wait for the delete and then fail, instead of slipping a member
		// in between the detach and the delete.
		if err := tx.QueryRow(ctx, `SELECT id FROM companies WHERE id = $1 FOR UPDATE`, id).Scan(&id); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE users SET company_id = NULL, company_role = NULL, updated_at = NOW()
			WHERE company_id = $1`, id); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `DELETE FROM companies WHERE id = $1`, id)
		return err
	})
	if isNoRows(err) {
		return ErrNotFound
	}
	return err
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

const companyMemberCols = `id, company_id, id AS user_id, email, name, company_role AS role, created_at`

// SetMember assigns a user to a company with the given role and returns the
// membership plus the previous role ("" when newly added), both from the
// write itself. Fails with ErrConflictOrNotFound if the user doesn't exist or
// is attached to a different company (one company per user).
func (r *CompanyRepo) SetMember(
	ctx context.Context, companyID, userID string, role model.CompanyRole,
) (*model.CompanyMember, model.CompanyRole, error) {
	return r.memberWrite(ctx, `
		UPDATE users SET company_id = $1, company_role = $2, updated_at = NOW()
		WHERE id = $3 AND (company_id IS NULL OR company_id = $1)
		RETURNING `+companyMemberCols+`, old.company_role`,
		ErrConflictOrNotFound, companyID, role, userID)
}

// CreateWithAdmin creates a company in one transaction and, unless adminID is
// "", makes that user its admin, so a failed assignment leaves no empty
// company behind. The admin must not belong to any company yet
// (ErrConflictOrNotFound otherwise). attachUnassigned also makes every user
// without a company a member: in mono company mode everyone belongs to the
// single company, including those who logged in before it existed.
func (r *CompanyRepo) CreateWithAdmin(
	ctx context.Context, displayName, description, adminID string, attachUnassigned bool,
) (*model.Company, *model.CompanyMember, error) {
	var c model.Company
	var admin *model.CompanyMember
	err := pgx.BeginFunc(ctx, r.db.Pool, func(tx pgx.Tx) error {
		err := scanCompany(tx.QueryRow(ctx,
			`INSERT INTO companies (display_name, description) VALUES ($1, $2) RETURNING `+companyCols,
			displayName, description), &c)
		if err != nil {
			return err
		}
		if adminID != "" {
			var m model.CompanyMember
			err = tx.QueryRow(ctx, `
				UPDATE users SET company_id = $1, company_role = 'admin', updated_at = NOW()
				WHERE id = $2 AND company_id IS NULL
				RETURNING `+companyMemberCols, c.ID, adminID,
			).Scan(&m.ID, &m.CompanyID, &m.UserID, &m.Email, &m.Name, &m.Role, &m.CreatedAt)
			if isNoRows(err) {
				return ErrConflictOrNotFound
			}
			if err != nil {
				return err
			}
			admin = &m
		}
		if attachUnassigned {
			_, err = tx.Exec(ctx, `UPDATE users SET company_id = $1, company_role = 'member', updated_at = NOW()
				WHERE company_id IS NULL`, c.ID)
		}
		return err
	})
	if err != nil {
		return nil, nil, err
	}
	return &c, admin, nil
}

// UpdateMemberRole sets an existing member's role and returns the previous one.
func (r *CompanyRepo) UpdateMemberRole(
	ctx context.Context, companyID, userID string, role model.CompanyRole,
) (*model.CompanyMember, model.CompanyRole, error) {
	return r.memberWrite(ctx, `
		UPDATE users SET company_role = $3, updated_at = NOW()
		WHERE company_id = $1 AND id = $2
		RETURNING `+companyMemberCols+`, old.company_role`,
		ErrNotFound, companyID, userID, role)
}

// memberWrite runs a users write returning companyMemberCols plus the previous
// role; zero rows → notFound.
func (r *CompanyRepo) memberWrite(
	ctx context.Context, q string, notFound error, args ...any,
) (*model.CompanyMember, model.CompanyRole, error) {
	var m model.CompanyMember
	var prev *model.CompanyRole
	err := r.db.Pool.QueryRow(ctx, q, args...).
		Scan(&m.ID, &m.CompanyID, &m.UserID, &m.Email, &m.Name, &m.Role, &m.CreatedAt, &prev)
	if err != nil {
		// 23503: the company doesn't exist (or is being deleted).
		var pgErr *pgconn.PgError
		if isNoRows(err) || (errors.As(err, &pgErr) && pgErr.Code == "23503") {
			return nil, "", notFound
		}
		return nil, "", err
	}
	if prev == nil {
		return &m, "", nil
	}
	return &m, *prev, nil
}

// RemoveMember detaches the user from the company and, in the same
// transaction, drops their explicit roles on the company's teams so a former
// member keeps no team access. It returns the role the user had.
func (r *CompanyRepo) RemoveMember(ctx context.Context, companyID, userID string) (model.CompanyRole, error) {
	var prev model.CompanyRole
	err := pgx.BeginFunc(ctx, r.db.Pool, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx,
			`UPDATE users SET company_id = NULL, company_role = NULL, updated_at = NOW()
			 WHERE company_id = $1 AND id = $2 RETURNING old.company_role`, companyID, userID).Scan(&prev)
		if err != nil {
			if isNoRows(err) {
				return ErrNotFound
			}
			return err
		}
		_, err = tx.Exec(ctx,
			`DELETE FROM team_members
			 WHERE user_id = $2 AND team_id IN (SELECT id FROM teams WHERE company_id = $1)`, companyID, userID)
		return err
	})
	return prev, err
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
