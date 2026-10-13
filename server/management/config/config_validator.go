package config

import (
	"errors"
	"slices"
	"strings"
)

// Validate reports every invalid or missing value in c, joined into one error.
func (c *Config) Validate() error {
	var errs []error
	if c.Server.Port <= 0 || c.Server.Port > 65535 {
		errs = append(errs, errors.New("server.port must be between 1 and 65535"))
	}
	if c.Server.ShutdownTimeout <= 0 {
		errs = append(errs, errors.New("server.shutdownTimeout must be positive"))
	}
	if blank(c.DB.URL) {
		errs = append(errs, errors.New("db.url is required"))
	}
	if c.DB.MaxConns < 1 {
		errs = append(errs, errors.New("db.maxConns must be at least 1"))
	}
	if c.DB.MinConns < 0 || c.DB.MinConns > c.DB.MaxConns {
		errs = append(errs, errors.New("db.minConns must be between 0 and db.maxConns"))
	}
	if c.DB.ConnMaxLifetime <= 0 {
		errs = append(errs, errors.New("db.connMaxLifetime must be positive"))
	}
	if blank(c.OIDC.Issuer) {
		errs = append(errs, errors.New("oidc.issuer is required"))
	}
	if blank(c.OIDC.ClientID) {
		errs = append(errs, errors.New("oidc.clientId is required"))
	}
	if blank(c.OIDC.ClientSecret) {
		errs = append(errs, errors.New("oidc.clientSecret is required"))
	}
	if blank(c.OIDC.RedirectURL) {
		errs = append(errs, errors.New("oidc.redirectUrl is required"))
	}
	if !slices.Contains(c.OIDC.Scopes, "openid") {
		errs = append(errs, errors.New("oidc.scopes must include openid"))
	}
	if blank(c.Auth.JWTSecret) {
		errs = append(errs, errors.New("auth.jwtSecret is required"))
	} else if len(c.Auth.JWTSecret) < 32 {
		errs = append(errs, errors.New("auth.jwtSecret must be at least 32 chars"))
	}
	if c.Auth.SessionMaxAge <= 0 {
		errs = append(errs, errors.New("auth.sessionMaxAge must be positive"))
	}
	if !slices.Contains([]string{"debug", "info", "warn", "error"}, c.Log.Level) {
		errs = append(errs, errors.New("log.level must be one of debug|info|warn|error"))
	}
	if !slices.Contains([]string{"json", "text"}, c.Log.Format) {
		errs = append(errs, errors.New("log.format must be one of json|text"))
	}
	return errors.Join(errs...)
}

func blank(s string) bool { return strings.TrimSpace(s) == "" }
