package repository

import (
	"context"
	"errors"
	"strings"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/jackc/pgx/v5"
)

type UserRepo struct{ db *DB }

func NewUserRepo(db *DB) *UserRepo { return &UserRepo{db: db} }

const userCols = `id, email, name, avatar_url, oidc_sub, is_super_admin, company_id, company_role, created_at, updated_at, last_login_at`

func scanUser(row pgx.Row, u *model.User) error {
	return row.Scan(
		&u.ID, &u.Email, &u.Name, &u.AvatarURL, &u.OIDCSub, &u.IsSuperAdmin,
		&u.CompanyID, &u.CompanyRole, &u.CreatedAt, &u.UpdatedAt, &u.LastLoginAt,
	)
}

func (r *UserRepo) GetByID(ctx context.Context, id string) (*model.User, error) {
	return r.scanOne(ctx, `SELECT `+userCols+` FROM users WHERE id = $1`, id)
}

func (r *UserRepo) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	return r.scanOne(ctx, `SELECT `+userCols+` FROM users WHERE email = $1`, email)
}

func (r *UserRepo) scanOne(ctx context.Context, q string, args ...any) (*model.User, error) {
	var u model.User
	if err := scanUser(r.db.Pool.QueryRow(ctx, q, args...), &u); err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

// ErrIdentityMismatch means the email belongs to an account already bound to a
// different OIDC subject.
var ErrIdentityMismatch = errors.New("account bound to a different identity")

// UpsertFromOIDC binds the account to the first sub seen for the email; super
// admin follows the config on every login.
func (r *UserRepo) UpsertFromOIDC(ctx context.Context, email, name, avatarURL, sub string, isSuperAdmin bool) (*model.User, error) {
	q := `
		INSERT INTO users (email, name, avatar_url, oidc_sub, is_super_admin, last_login_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		ON CONFLICT (email) DO UPDATE
		SET name = EXCLUDED.name,
		    avatar_url = EXCLUDED.avatar_url,
		    oidc_sub = EXCLUDED.oidc_sub,
		    is_super_admin = EXCLUDED.is_super_admin,
		    last_login_at = NOW(),
		    updated_at = NOW()
		WHERE users.oidc_sub IS NULL OR users.oidc_sub = EXCLUDED.oidc_sub
		RETURNING ` + userCols
	var u model.User
	if err := scanUser(r.db.Pool.QueryRow(ctx, q, strings.ToLower(email), name, avatarURL, sub, isSuperAdmin), &u); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrIdentityMismatch
		}
		return nil, err
	}
	return &u, nil
}
