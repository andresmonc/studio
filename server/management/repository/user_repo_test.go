package repository_test

import (
	"context"
	"fmt"
	"sync"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type oidcLogin struct {
	email, name, sub string
	superAdmin       bool
}

func TestUserRepoUpsertFromOIDC(t *testing.T) {
	tests := []struct {
		name   string
		seeded bool        // pre-provisioned seeded@example.com row with no sub yet
		before []oidcLogin // earlier logins; the first one is "the account"
		login  oidcLogin
		// wantErr is the error from login; on error the stored row for
		// wantEmail must still hold the other want* values.
		wantErr        error
		wantEmail      string
		wantName       string
		wantSub        string
		wantSuperAdmin bool
		sameAccount    bool // the stored row is the first `before` account
	}{
		{
			name:      "new user, email lowercased",
			login:     oidcLogin{"Alice@Example.com", "Alice", "sub-1", false},
			wantEmail: "alice@example.com", wantName: "Alice", wantSub: "sub-1",
		},
		{
			name:      "re-login updates profile and promotes super admin",
			before:    []oidcLogin{{"alice@example.com", "Alice", "sub-1", false}},
			login:     oidcLogin{"alice@example.com", "Alice B", "sub-1", true},
			wantEmail: "alice@example.com", wantName: "Alice B", wantSub: "sub-1", wantSuperAdmin: true,
			sameAccount: true,
		},
		{
			name:      "super admin is not sticky",
			before:    []oidcLogin{{"alice@example.com", "Alice", "sub-1", true}},
			login:     oidcLogin{"alice@example.com", "Alice", "sub-1", false},
			wantEmail: "alice@example.com", wantName: "Alice", wantSub: "sub-1",
			sameAccount: true,
		},
		{
			name:      "first login binds the sub of a seeded user",
			seeded:    true,
			login:     oidcLogin{"seeded@example.com", "Seeded", "sub-a", false},
			wantEmail: "seeded@example.com", wantName: "Seeded", wantSub: "sub-a",
		},
		{
			name:      "another identity on a bound email is rejected",
			before:    []oidcLogin{{"alice@example.com", "Alice", "sub-a", false}},
			login:     oidcLogin{"alice@example.com", "Mallory", "sub-b", true},
			wantErr:   repository.ErrIdentityMismatch,
			wantEmail: "alice@example.com", wantName: "Alice", wantSub: "sub-a",
			sameAccount: true,
		},
		{
			name:      "email change at the provider follows the sub",
			before:    []oidcLogin{{"old@example.com", "Bob", "sub-bob", false}},
			login:     oidcLogin{"New@example.com", "Bob", "sub-bob", false},
			wantEmail: "new@example.com", wantName: "Bob", wantSub: "sub-bob",
			sameAccount: true,
		},
		{
			name: "email change onto another account's email is rejected",
			before: []oidcLogin{
				{"taken@example.com", "Carol", "sub-carol", false},
				{"old@example.com", "Bob", "sub-bob", false},
			},
			login:     oidcLogin{"taken@example.com", "Bob", "sub-bob", false},
			wantErr:   repository.ErrIdentityMismatch,
			wantEmail: "taken@example.com", wantName: "Carol", wantSub: "sub-carol",
			sameAccount: true,
		},
		{
			name:      "blank sub cannot take over a blank-sub account",
			before:    []oidcLogin{{"alice@example.com", "Alice", "sub-1", false}},
			login:     oidcLogin{"mallory@example.com", "Mallory", " ", true},
			wantErr:   repository.ErrMissingIdentity,
			wantEmail: "alice@example.com", wantName: "Alice", wantSub: "sub-1",
			sameAccount: true,
		},
		{
			name:      "blank email is rejected",
			before:    []oidcLogin{{"alice@example.com", "Alice", "sub-1", false}},
			login:     oidcLogin{"  ", "Alice", "sub-1", true},
			wantErr:   repository.ErrMissingIdentity,
			wantEmail: "alice@example.com", wantName: "Alice", wantSub: "sub-1",
			sameAccount: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db := testutil.StartPostgres(t)
			repo := repository.NewUserRepo(db)
			ctx := t.Context()

			if tt.seeded {
				_, err := db.Pool.Exec(ctx, `INSERT INTO users (email, name) VALUES ('seeded@example.com', 'Seeded')`)
				require.NoError(t, err)
			}
			var first *model.User
			for i, l := range tt.before {
				u, err := repo.UpsertFromOIDC(ctx, l.email, l.name, "", l.sub, l.superAdmin)
				require.NoError(t, err)
				if i == 0 {
					first = u
				}
			}

			got, err := repo.UpsertFromOIDC(ctx, tt.login.email, tt.login.name, "", tt.login.sub, tt.login.superAdmin)
			if tt.wantErr != nil {
				require.ErrorIs(t, err, tt.wantErr)
				assert.Nil(t, got)
			} else {
				require.NoError(t, err)
			}

			stored, err := repo.GetByEmail(ctx, tt.wantEmail)
			require.NoError(t, err)
			require.NotNil(t, stored)
			assert.Equal(t, tt.wantEmail, stored.Email)
			assert.Equal(t, tt.wantName, stored.Name)
			require.NotNil(t, stored.OIDCSub)
			assert.Equal(t, tt.wantSub, *stored.OIDCSub)
			assert.Equal(t, tt.wantSuperAdmin, stored.IsSuperAdmin)
			if got != nil {
				assert.Equal(t, stored.ID, got.ID)
			}
			if tt.sameAccount {
				assert.Equal(t, first.ID, stored.ID)
			}
		})
	}
}

// Simultaneous first logins (double click, retried callback) race on the
// oidc_sub unique index; every one must resolve to the same account.
func TestUserRepoUpsertFromOIDCConcurrentFirstLogin(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewUserRepo(db)
	for round := range 10 {
		email, sub := fmt.Sprintf("user%d@example.com", round), fmt.Sprintf("sub-%d", round)
		ids := make([]string, 8)
		errs := make([]error, 8)
		var wg sync.WaitGroup
		for i := range ids {
			wg.Go(func() {
				u, err := repo.UpsertFromOIDC(t.Context(), email, "User", "", sub, false)
				errs[i] = err
				if u != nil {
					ids[i] = u.ID
				}
			})
		}
		wg.Wait()
		for i := range ids {
			require.NoError(t, errs[i], "round %d login %d", round, i)
			assert.Equal(t, ids[0], ids[i], "round %d login %d", round, i)
		}
	}
}

func TestUserRepoLookups(t *testing.T) {
	byID := func(id string) func(context.Context, *repository.UserRepo, *model.User) (*model.User, error) {
		return func(ctx context.Context, r *repository.UserRepo, _ *model.User) (*model.User, error) {
			return r.GetByID(ctx, id)
		}
	}
	byEmail := func(email string) func(context.Context, *repository.UserRepo, *model.User) (*model.User, error) {
		return func(ctx context.Context, r *repository.UserRepo, _ *model.User) (*model.User, error) {
			return r.GetByEmail(ctx, email)
		}
	}
	tests := []struct {
		name      string
		lookup    func(context.Context, *repository.UserRepo, *model.User) (*model.User, error)
		wantFound bool
	}{
		{
			name: "by id",
			lookup: func(ctx context.Context, r *repository.UserRepo, u *model.User) (*model.User, error) {
				return r.GetByID(ctx, u.ID)
			},
			wantFound: true,
		},
		{name: "by email", lookup: byEmail("alice@example.com"), wantFound: true},
		{name: "missing id", lookup: byID("00000000-0000-0000-0000-000000000000")},
		// A malformed id can't match a row: not found, not a server error.
		{name: "malformed id", lookup: byID("not-a-uuid")},
		{name: "missing email", lookup: byEmail("nobody@example.com")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db := testutil.StartPostgres(t)
			repo := repository.NewUserRepo(db)
			alice, err := repo.UpsertFromOIDC(t.Context(), "alice@example.com", "Alice", "", "sub-1", false)
			require.NoError(t, err)

			got, err := tt.lookup(t.Context(), repo, alice)
			require.NoError(t, err)
			if !tt.wantFound {
				assert.Nil(t, got)
				return
			}
			require.NotNil(t, got)
			assert.Equal(t, alice.ID, got.ID)
		})
	}
}
