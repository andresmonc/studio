package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/jackc/pgx/v5/pgconn"
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

func TestRequireServerVersion(t *testing.T) {
	tests := []struct {
		name    string
		num     int
		version string
		wantErr string
	}{
		{"18.0", 180000, "18.0", ""},
		{"later major", 190002, "19.2 (Debian 19.2-1)", ""},
		{"17 lacks uuidv7 and virtual columns", 170006, "17.6", "PostgreSQL 18 or later is required, found 17.6"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := repository.RequireServerVersion(tt.num, tt.version)
			if tt.wantErr == "" {
				assert.NoError(t, err)
				return
			}
			assert.ErrorContains(t, err, tt.wantErr)
		})
	}
}

// A malformed id makes Postgres fail the uuid cast (22P02). The API rejects
// those before any query (middleware.ValidIDs), so a lookup must surface the
// error instead of passing it off as not found.
func TestLookupMalformedIDIsAnError(t *testing.T) {
	db := testutil.StartPostgres(t)
	const bad = "not-a-uuid"

	tests := []struct {
		name   string
		lookup func(ctx context.Context) error
	}{
		{"TeamRepo.GetByID", func(ctx context.Context) error {
			_, err := repository.NewTeamRepo(db).GetByID(ctx, bad)
			return err
		}},
		{"TeamRepo.GetRole", func(ctx context.Context) error {
			_, err := repository.NewTeamRepo(db).GetRole(ctx, bad, bad)
			return err
		}},
		{"CompanyRepo.GetByID", func(ctx context.Context) error {
			_, err := repository.NewCompanyRepo(db).GetByID(ctx, bad)
			return err
		}},
		{"CompanyRepo.Membership", func(ctx context.Context) error {
			_, err := repository.NewCompanyRepo(db).Membership(ctx, bad)
			return err
		}},
		{"FlagsetRepo.GetByID", func(ctx context.Context) error {
			_, err := repository.NewFlagsetRepo(db).GetByID(ctx, bad)
			return err
		}},
		{"FlagRepo.GetByID", func(ctx context.Context) error {
			_, err := repository.NewFlagRepo(db).GetByID(ctx, bad)
			return err
		}},
		{"FlagRepo.TeamID", func(ctx context.Context) error {
			_, err := repository.NewFlagRepo(db).TeamID(ctx, bad)
			return err
		}},
		{"FlagsetRepo.TeamID", func(ctx context.Context) error {
			_, err := repository.NewFlagsetRepo(db).TeamID(ctx, bad)
			return err
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var pgErr *pgconn.PgError
			require.ErrorAs(t, tt.lookup(t.Context()), &pgErr)
			assert.Equal(t, "22P02", pgErr.Code)
		})
	}
}
