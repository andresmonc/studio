package config

import (
	"errors"
	"fmt"
	"net/url"
	"slices"
	"strings"
	"time"
)

// Validate reports every invalid or missing value in c, joined into one error.
func (c *Config) Validate() error {
	var errs []error
	if c.Server.Port <= 0 || c.Server.Port > 65535 {
		errs = append(errs, errors.New("server.port must be between 1 and 65535"))
	}
	if _, err := c.Server.TrustedProxyNets(); err != nil {
		errs = append(errs, err)
	}
	errs = appendDurationError(errs, "server.shutdownTimeout", c.Server.ShutdownTimeout)
	if blank(c.DB.URL) {
		errs = append(errs, errors.New("db.url is required"))
	}
	if c.DB.MaxConns < 1 {
		errs = append(errs, errors.New("db.maxConns must be at least 1"))
	}
	if c.DB.MinConns < 0 || c.DB.MinConns > c.DB.MaxConns {
		errs = append(errs, errors.New("db.minConns must be between 0 and db.maxConns"))
	}
	errs = appendDurationError(errs, "db.connMaxLifetime", c.DB.ConnMaxLifetime)
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
	errs = appendDurationError(errs, "auth.sessionMaxAge", c.Auth.SessionMaxAge)
	if !validRedirect(c.Auth.PostLoginRedirect) {
		errs = append(errs, errors.New("auth.postLoginRedirect must be a path starting with a single / "+
			"or an absolute http(s) URL"))
	}
	if !slices.Contains([]string{"debug", "info", "warn", "error"}, c.Log.Level) {
		errs = append(errs, errors.New("log.level must be one of debug|info|warn|error"))
	}
	if !slices.Contains([]string{"json", "text"}, c.Log.Format) {
		errs = append(errs, errors.New("log.format must be one of json|text"))
	}
	return errors.Join(errs...)
}

// appendDurationError rejects a duration under a second, which no setting
// means: it is almost always a bare number (shutdownTimeout: 30), which
// mapstructure reads as nanoseconds.
func appendDurationError(errs []error, field string, d time.Duration) []error {
	if d < time.Second {
		return append(errs, fmt.Errorf("%s must be at least 1s; durations need a unit, e.g. 30s, 5m or 1h", field))
	}
	return errs
}

// validRedirect accepts "" (the callback then uses "/"), a same-origin path, or
// an absolute http(s) URL with a host. A path must not start with "//" or
// contain a backslash: browsers read "//host" and "/\host" as another host,
// turning a typo into a protocol-relative redirect.
func validRedirect(s string) bool {
	if s == "" {
		return true
	}
	u, err := url.Parse(s)
	if err != nil {
		return false
	}
	if u.Scheme == "" && u.Host == "" {
		return strings.HasPrefix(s, "/") && !strings.HasPrefix(s, "//") && !strings.Contains(s, `\`)
	}
	return (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

func blank(s string) bool { return strings.TrimSpace(s) == "" }
