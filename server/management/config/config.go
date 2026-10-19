package config

import (
	"fmt"
	"net"
	"strings"
	"time"
)

// Config is the server configuration. Durations are Go duration strings with a
// unit (30s, 5m, 1h): a bare number would be nanoseconds, which Validate
// rejects.
type Config struct {
	Server ServerConfig `koanf:"server"`
	DB     DBConfig     `koanf:"db"`
	OIDC   OIDCConfig   `koanf:"oidc"`
	Auth   AuthConfig   `koanf:"auth"`
	Log    LogConfig    `koanf:"log"`
}

type ServerConfig struct {
	Port            int           `koanf:"port"`
	ShutdownTimeout time.Duration `koanf:"shutdownTimeout"`
	EnableSwagger   bool          `koanf:"enableSwagger"`
	// MultiCompany enables multi-tenancy. Off by default: a mono-company
	// install holds a single company that every user joins on login.
	MultiCompany bool `koanf:"multiCompany"`
	// TrustedProxies lists the CIDR ranges of the reverse proxies in front of
	// the server (GOFF_MGMT_SERVER_TRUSTEDPROXIES=10.0.0.0/8,172.16.0.0/12).
	// When set, the client IP (rate limits, logs) is the nearest
	// X-Forwarded-For hop outside these ranges; when empty, it is the socket
	// address, which behind a proxy is the proxy's for every client.
	TrustedProxies []string `koanf:"trustedProxies"`
}

// TrustedProxyNets parses TrustedProxies, reporting every entry that isn't a
// CIDR range.
func (s ServerConfig) TrustedProxyNets() ([]*net.IPNet, error) {
	nets := make([]*net.IPNet, 0, len(s.TrustedProxies))
	var bad []string
	for _, r := range s.TrustedProxies {
		_, n, err := net.ParseCIDR(r)
		if err != nil {
			bad = append(bad, fmt.Sprintf("%q", r))
			continue
		}
		nets = append(nets, n)
	}
	if len(bad) > 0 {
		return nil, fmt.Errorf("server.trustedProxies must be CIDR ranges (e.g. 10.0.0.0/8), got %s",
			strings.Join(bad, ", "))
	}
	return nets, nil
}

type DBConfig struct {
	URL             string        `koanf:"url"`
	MaxConns        int32         `koanf:"maxConns"`
	MinConns        int32         `koanf:"minConns"`
	ConnMaxLifetime time.Duration `koanf:"connMaxLifetime"`
	// Migrate applies the embedded schema migrations at startup (default). Turn
	// it off to run them separately, e.g. with the goose CLI on db/migrations.
	Migrate bool `koanf:"migrate"`
}

type OIDCConfig struct {
	Issuer       string   `koanf:"issuer"`
	ClientID     string   `koanf:"clientId"`
	ClientSecret string   `koanf:"clientSecret"`
	RedirectURL  string   `koanf:"redirectUrl"`
	Scopes       []string `koanf:"scopes"`
}

type AuthConfig struct {
	JWTSecret         string        `koanf:"jwtSecret"`
	SessionMaxAge     time.Duration `koanf:"sessionMaxAge"`
	CookieDomain      string        `koanf:"cookieDomain"`
	CookieSecure      bool          `koanf:"cookieSecure"`
	AdminEmails       []string      `koanf:"adminEmails"`
	PostLoginRedirect string        `koanf:"postLoginRedirect"`
	// AllowUnverifiedEmail accepts ID tokens without `email_verified: true`
	// (for IdPs that omit the claim). Off by default: the email identifies the
	// account and drives adminEmails, so an unverified one could impersonate.
	AllowUnverifiedEmail bool `koanf:"allowUnverifiedEmail"`
}

type LogConfig struct {
	Level  string `koanf:"level"`
	Format string `koanf:"format"`
}

func Default() Config {
	return Config{
		Server: ServerConfig{
			Port:            8080,
			ShutdownTimeout: 15 * time.Second,
			EnableSwagger:   false,
		},
		DB: DBConfig{
			MaxConns:        20,
			MinConns:        2,
			ConnMaxLifetime: time.Hour,
			Migrate:         true,
		},
		OIDC: OIDCConfig{
			Scopes: []string{"openid", "profile", "email"},
		},
		Auth: AuthConfig{
			SessionMaxAge:     24 * time.Hour,
			CookieSecure:      true,
			PostLoginRedirect: "/",
		},
		Log: LogConfig{
			Level:  "info",
			Format: "json",
		},
	}
}
