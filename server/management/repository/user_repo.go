package repository

import (
	"context"
	"errors"
	"strings"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type UserRepo struct{ db *DB }

func NewUserRepo(db *DB) *UserRepo { return &UserRepo{db: db} }

const userCols = `id, email, name, avatar_url, oidc_sub, is_super_admin, company_id, company_role,
	created_at, updated_at, last_login_at`

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

// ErrMissingIdentity guards the binding: a blank sub would match every other
// blank-sub row and hand over that account.
var ErrMissingIdentity = errors.New("oidc login needs an email and a sub")

// UpsertFromOIDC finds the account by sub first, so an email changed at the
// provider follows the account. Otherwise it binds the account to the first sub
// seen for the email. Super admin follows the config on every login.
func (r *UserRepo) UpsertFromOIDC(
	ctx context.Context, email, name, avatarURL, sub string, isSuperAdmin bool,
) (*model.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || strings.TrimSpace(sub) == "" {
		return nil, ErrMissingIdentity
	}
	u, err := r.upsertFromOIDC(ctx, email, name, avatarURL, sub, isSuperAdmin)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.ConstraintName == "users_oidc_sub_key" {
		// A concurrent first login inserted this sub between our UPDATE and
		// INSERT; the retry's UPDATE now finds it.
		return r.upsertFromOIDC(ctx, email, name, avatarURL, sub, isSuperAdmin)
	}
	return u, err
}

func (r *UserRepo) upsertFromOIDC(
	ctx context.Context, email, name, avatarURL, sub string, isSuperAdmin bool,
) (*model.User, error) {
	var u model.User
	row := r.db.Pool.QueryRow(ctx, `
		UPDATE users
		SET email = $1, name = $2, avatar_url = $3, is_super_admin = $5,
		    last_login_at = NOW(), updated_at = NOW()
		WHERE oidc_sub = $4
		RETURNING `+userCols, email, name, avatarURL, sub, isSuperAdmin)
	err := scanUser(row, &u)
	if err == nil {
		return &u, nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
		// The new email already belongs to another account.
		return nil, ErrIdentityMismatch
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

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
	row = r.db.Pool.QueryRow(ctx, q, email, name, avatarURL, sub, isSuperAdmin)
	if err := scanUser(row, &u); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrIdentityMismatch
		}
		return nil, err
	}
	return &u, nil
}
