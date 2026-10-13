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

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load(nil)
	require.NoError(t, err)
	// Values come straight from Default().
	assert.Equal(t, 8080, cfg.Server.Port)
	assert.Equal(t, 15*time.Second, cfg.Server.ShutdownTimeout)
	assert.False(t, cfg.Server.EnableSwagger)
	assert.Equal(t, int32(20), cfg.DB.MaxConns)
	assert.Equal(t, []string{"openid", "profile", "email"}, cfg.OIDC.Scopes)
	assert.Equal(t, "info", cfg.Log.Level)
	assert.Equal(t, "json", cfg.Log.Format)
}

func TestLoadEnvOverride(t *testing.T) {
	t.Setenv("GOFF_MGMT_SERVER_PORT", "9090")
	t.Setenv("GOFF_MGMT_DB_URL", "postgres://env/db")
	t.Setenv("GOFF_MGMT_LOG_LEVEL", "debug")

	cfg, err := Load(nil)
	require.NoError(t, err)
	assert.Equal(t, 9090, cfg.Server.Port)
	assert.Equal(t, "postgres://env/db", cfg.DB.URL)
	assert.Equal(t, "debug", cfg.Log.Level)
}

func TestLoadFlagOverride(t *testing.T) {
	fs := pflag.NewFlagSet("test", pflag.ContinueOnError)
	RegisterFlags(fs)
	require.NoError(t, fs.Parse([]string{"--server.port", "7000", "--db.url", "postgres://flag/db"}))

	cfg, err := Load(fs)
	require.NoError(t, err)
	assert.Equal(t, 7000, cfg.Server.Port)
	assert.Equal(t, "postgres://flag/db", cfg.DB.URL)
}

func TestLoadFlagOverridesEnv(t *testing.T) {
	t.Setenv("GOFF_MGMT_SERVER_PORT", "9090")

	fs := pflag.NewFlagSet("test", pflag.ContinueOnError)
	RegisterFlags(fs)
	require.NoError(t, fs.Parse([]string{"--server.port", "7000"}))

	cfg, err := Load(fs)
	require.NoError(t, err)
	assert.Equal(t, 7000, cfg.Server.Port, "explicit flag should win over env")
}

func TestLoadConfigFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	content := []byte("server:\n  port: 6543\ndb:\n  url: postgres://file/db\nlog:\n  level: warn\n")
	require.NoError(t, os.WriteFile(path, content, 0o600))

	fs := pflag.NewFlagSet("test", pflag.ContinueOnError)
	RegisterFlags(fs)
	require.NoError(t, fs.Parse([]string{"--config", path}))

	cfg, err := Load(fs)
	require.NoError(t, err)
	assert.Equal(t, 6543, cfg.Server.Port)
	assert.Equal(t, "postgres://file/db", cfg.DB.URL)
	assert.Equal(t, "warn", cfg.Log.Level)
}

func TestLoadConfigFileMissing(t *testing.T) {
	fs := pflag.NewFlagSet("test", pflag.ContinueOnError)
	RegisterFlags(fs)
	require.NoError(t, fs.Parse([]string{"--config", "/no/such/file.yaml"}))

	_, err := Load(fs)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "load config file")
}

func TestLoadEnvOverridesFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	require.NoError(t, os.WriteFile(path, []byte("server:\n  port: 6543\n"), 0o600))
	t.Setenv("GOFF_MGMT_SERVER_PORT", "9090")

	fs := pflag.NewFlagSet("test", pflag.ContinueOnError)
	RegisterFlags(fs)
	require.NoError(t, fs.Parse([]string{"--config", path}))

	cfg, err := Load(fs)
	require.NoError(t, err)
	assert.Equal(t, 9090, cfg.Server.Port, "env should win over config file")
}

func TestLoadMultiCompany(t *testing.T) {
	cfg, err := Load(nil)
	require.NoError(t, err)
	assert.False(t, cfg.Server.MultiCompany, "mono company is the default")

	t.Setenv("GOFF_MGMT_SERVER_MULTICOMPANY", "true")
	cfg, err = Load(nil)
	require.NoError(t, err)
	assert.True(t, cfg.Server.MultiCompany)
}

func TestLoadMultiCompanyFlag(t *testing.T) {
	fs := pflag.NewFlagSet("test", pflag.ContinueOnError)
	RegisterFlags(fs)
	require.NoError(t, fs.Parse([]string{"--server.multicompany"}))

	cfg, err := Load(fs)
	require.NoError(t, err)
	assert.True(t, cfg.Server.MultiCompany)
}
