package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/spf13/pflag"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// camelCaseYAML is spelled with the struct's camelCase koanf tags; it must not
// shadow the lowercase keys produced by env vars and flags.
const camelCaseYAML = "server:\n  multiCompany: false\nauth:\n  cookieSecure: false\n  jwtSecret: yamlsecret\n  adminEmails:\n    - yaml@example.test\n"

// listsAndDurationsYAML exercises koanf's decode hooks (comma split,
// time.ParseDuration), not the plain scalar path ports and booleans take.
const listsAndDurationsYAML = "server:\n  shutdownTimeout: 30s\noidc:\n  scopes:\n    - openid\n    - groups\nauth:\n  adminEmails:\n    - a@example.test\n    - b@example.test\n"

func TestLoad(t *testing.T) {
	tests := []struct {
		name string
		// yaml, when set, is written to a temp file and passed via --config.
		yaml string
		env  map[string]string
		// args nil and no yaml means Load(nil): no flag set at all.
		args    []string
		wantErr string
		// want edits Default() into the expected config.
		want func(c *Config)
	}{
		{
			name: "defaults",
			want: func(c *Config) {},
		},
		{
			name: "env overrides defaults",
			env: map[string]string{
				"GOFF_MGMT_SERVER_PORT":         "9090",
				"GOFF_MGMT_DB_URL":              "postgres://env/db",
				"GOFF_MGMT_LOG_LEVEL":           "debug",
				"GOFF_MGMT_SERVER_MULTICOMPANY": "true",
			},
			want: func(c *Config) {
				c.Server.Port = 9090
				c.DB.URL = "postgres://env/db"
				c.Log.Level = "debug"
				c.Server.MultiCompany = true
			},
		},
		{
			name: "flags override defaults",
			args: []string{"--server.port", "7000", "--db.url", "postgres://flag/db", "--server.multicompany"},
			want: func(c *Config) {
				c.Server.Port = 7000
				c.DB.URL = "postgres://flag/db"
				c.Server.MultiCompany = true
			},
		},
		{
			name: "flag overrides env",
			env:  map[string]string{"GOFF_MGMT_SERVER_PORT": "9090"},
			args: []string{"--server.port", "7000"},
			want: func(c *Config) { c.Server.Port = 7000 },
		},
		{
			name: "config file",
			yaml: "server:\n  port: 6543\ndb:\n  url: postgres://file/db\nlog:\n  level: warn\n",
			want: func(c *Config) {
				c.Server.Port = 6543
				c.DB.URL = "postgres://file/db"
				c.Log.Level = "warn"
			},
		},
		{
			name:    "missing config file",
			args:    []string{"--config", "/no/such/file.yaml"},
			wantErr: "load config file",
		},
		{
			name:    "invalid value fails unmarshal",
			env:     map[string]string{"GOFF_MGMT_SERVER_PORT": "notaport"},
			wantErr: "unmarshal config",
		},
		{
			name: "env overrides config file",
			yaml: "server:\n  port: 6543\n",
			env:  map[string]string{"GOFF_MGMT_SERVER_PORT": "9090"},
			want: func(c *Config) { c.Server.Port = 9090 },
		},
		{
			name: "camelCase file keys override defaults",
			yaml: camelCaseYAML,
			want: func(c *Config) {
				c.Auth.CookieSecure = false
				c.Auth.JWTSecret = "yamlsecret"
				c.Auth.AdminEmails = []string{"yaml@example.test"}
			},
		},
		{
			name: "env and flags override camelCase file keys",
			yaml: camelCaseYAML,
			env: map[string]string{
				"GOFF_MGMT_AUTH_COOKIESECURE": "true",
				"GOFF_MGMT_AUTH_JWTSECRET":    "envsecret",
				"GOFF_MGMT_AUTH_ADMINEMAILS":  "env@example.test",
			},
			args: []string{"--server.multicompany"},
			want: func(c *Config) {
				c.Server.MultiCompany = true
				c.Auth.CookieSecure = true
				c.Auth.JWTSecret = "envsecret"
				c.Auth.AdminEmails = []string{"env@example.test"}
			},
		},
		{
			name: "lists and durations from file",
			yaml: listsAndDurationsYAML,
			want: func(c *Config) {
				c.Server.ShutdownTimeout = 30 * time.Second
				c.OIDC.Scopes = []string{"openid", "groups"}
				c.Auth.AdminEmails = []string{"a@example.test", "b@example.test"}
			},
		},
		{
			name: "comma-separated lists and durations from env",
			yaml: listsAndDurationsYAML,
			env: map[string]string{
				"GOFF_MGMT_SERVER_SHUTDOWNTIMEOUT": "15s",
				"GOFF_MGMT_AUTH_SESSIONMAXAGE":     "2h",
				"GOFF_MGMT_OIDC_SCOPES":            "openid,email,groups",
				"GOFF_MGMT_AUTH_ADMINEMAILS":       "c@example.test,d@example.test",
			},
			want: func(c *Config) {
				c.Server.ShutdownTimeout = 15 * time.Second
				c.Auth.SessionMaxAge = 2 * time.Hour
				c.OIDC.Scopes = []string{"openid", "email", "groups"}
				c.Auth.AdminEmails = []string{"c@example.test", "d@example.test"}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for k, v := range tt.env {
				t.Setenv(k, v)
			}

			var fs *pflag.FlagSet
			if tt.args != nil || tt.yaml != "" {
				fs = pflag.NewFlagSet("test", pflag.ContinueOnError)
				RegisterFlags(fs)
				args := tt.args
				if tt.yaml != "" {
					path := filepath.Join(t.TempDir(), "config.yaml")
					require.NoError(t, os.WriteFile(path, []byte(tt.yaml), 0o600))
					args = append([]string{"--config", path}, args...)
				}
				require.NoError(t, fs.Parse(args))
			}

			cfg, err := Load(fs)
			if tt.wantErr != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.wantErr)
				return
			}
			require.NoError(t, err)
			want := Default()
			tt.want(&want)
			assert.Equal(t, want, *cfg)
		})
	}
}
