package repository_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewDB(t *testing.T) {
	tests := []struct {
		name    string
		cfg     func(t *testing.T) config.DBConfig
		wantErr string
	}{
		{
			name:    "invalid url",
			cfg:     func(*testing.T) config.DBConfig { return config.DBConfig{URL: "://bad"} },
			wantErr: "parse db url",
		},
		{
			// Nothing listens on port 1, so the pool is created but the ping fails.
			name: "unreachable server",
			cfg: func(*testing.T) config.DBConfig {
				return config.DBConfig{URL: "postgres://u:p@127.0.0.1:1/db?connect_timeout=1"}
			},
			wantErr: "ping db",
		},
		{
			name: "pool settings applied",
			cfg: func(t *testing.T) config.DBConfig {
				return config.DBConfig{
					URL:             testutil.StartPostgres(t).Pool.Config().ConnString(),
					MaxConns:        3,
					MinConns:        1,
					ConnMaxLifetime: time.Minute,
				}
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := tt.cfg(t)
			db, err := repository.NewDB(t.Context(), cfg)
			if tt.wantErr != "" {
				require.ErrorContains(t, err, tt.wantErr)
				return
			}
			require.NoError(t, err)
			defer db.Close()
			got := db.Pool.Config()
			assert.Equal(t, cfg.MaxConns, got.MaxConns)
			assert.Equal(t, cfg.MinConns, got.MinConns)
			assert.Equal(t, cfg.ConnMaxLifetime, got.MaxConnLifetime)
		})
	}
}

// A malformed id makes Postgres fail the uuid cast (22P02); lookups must report
// it as not found, not as a server error.
func TestLookupMalformedIDIsNotFound(t *testing.T) {
	db := testutil.StartPostgres(t)
	const bad = "not-a-uuid"
	// nilOrNotFound folds the two "not found" conventions of the repos: (nil, nil)
	// and ErrNotFound.
	nilOrNotFound := func(isNil bool, err error) error {
		if errors.Is(err, repository.ErrNotFound) || (err == nil && isNil) {
			return nil
		}
		return fmt.Errorf("want not found, got isNil=%v err=%v", isNil, err)
	}

	tests := []struct {
		name   string
		lookup func(ctx context.Context) error
	}{
		{"TeamRepo.GetByID", func(ctx context.Context) error {
			v, err := repository.NewTeamRepo(db).GetByID(ctx, bad)
			return nilOrNotFound(v == nil, err)
		}},
		{"TeamRepo.GetRole", func(ctx context.Context) error {
			v, err := repository.NewTeamRepo(db).GetRole(ctx, bad, bad)
			return nilOrNotFound(v == "", err)
		}},
		{"CompanyRepo.GetByID", func(ctx context.Context) error {
			v, err := repository.NewCompanyRepo(db).GetByID(ctx, bad)
			return nilOrNotFound(v == nil, err)
		}},
		{"CompanyRepo.Membership", func(ctx context.Context) error {
			v, err := repository.NewCompanyRepo(db).Membership(ctx, bad)
			return nilOrNotFound(v == nil, err)
		}},
		{"FlagsetRepo.GetByID", func(ctx context.Context) error {
			v, err := repository.NewFlagsetRepo(db).GetByID(ctx, bad)
			return nilOrNotFound(v == nil, err)
		}},
		{"FlagRepo.GetByID", func(ctx context.Context) error {
			v, err := repository.NewFlagRepo(db).GetByID(ctx, bad)
			return nilOrNotFound(v == nil, err)
		}},
		{"FlagRepo.GetFlagsetID", func(ctx context.Context) error {
			_, err := repository.NewFlagRepo(db).GetFlagsetID(ctx, bad)
			return nilOrNotFound(false, err)
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.NoError(t, tt.lookup(t.Context()))
		})
	}
}
