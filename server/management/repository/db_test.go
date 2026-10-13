package repository_test

import (
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
