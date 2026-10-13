package config

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// validConfig returns a Config that passes Validate, so individual tests can
// mutate a single field to exercise one validation rule at a time.
func validConfig() Config {
	c := Default()
	c.DB.URL = "postgres://localhost:5432/goff"
	c.OIDC.Issuer = "https://issuer.example.com"
	c.OIDC.ClientID = "client-id"
	c.OIDC.ClientSecret = "client-secret"
	c.OIDC.RedirectURL = "https://app.example.com/callback"
	c.Auth.JWTSecret = strings.Repeat("x", 32)
	return c
}

func TestConfigValidate(t *testing.T) {
	t.Run("valid config passes", func(t *testing.T) {
		c := validConfig()
		assert.NoError(t, c.Validate())
	})

	tests := []struct {
		name    string
		mutate  func(c *Config)
		wantMsg string
	}{
		{"port zero", func(c *Config) { c.Server.Port = 0 }, "server.port"},
		{"port negative", func(c *Config) { c.Server.Port = -1 }, "server.port"},
		{"missing db url", func(c *Config) { c.DB.URL = "" }, "db.url"},
		{"missing issuer", func(c *Config) { c.OIDC.Issuer = "" }, "oidc.issuer"},
		{"missing client id", func(c *Config) { c.OIDC.ClientID = "" }, "oidc.clientId"},
		{"missing client secret", func(c *Config) { c.OIDC.ClientSecret = "" }, "oidc.clientSecret"},
		{"missing redirect url", func(c *Config) { c.OIDC.RedirectURL = "" }, "oidc.redirectUrl"},
		{"missing jwt secret", func(c *Config) { c.Auth.JWTSecret = "" }, "auth.jwtSecret is required"},
		{"short jwt secret", func(c *Config) { c.Auth.JWTSecret = "too-short" }, "at least 32 chars"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := validConfig()
			tt.mutate(&c)
			err := c.Validate()
			require.Error(t, err)
			assert.Contains(t, err.Error(), tt.wantMsg)
		})
	}
}
