package api_test

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/api"
	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/gofeatureflag/flag-management-system/server/management/handler"
	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const platformWebui = "http://goff.local:5173"

// platformServer builds the real router. Only the handlers these tests reach
// are wired; the rest are bound as nil method values and never called.
func platformServer(cfg config.Config) *echo.Echo {
	h := api.Handlers{Auth: handler.NewAuthHandler(cfg, nil, nil, nil, nil), Config: handler.NewConfigHandler(cfg)}
	return api.New(cfg, slog.New(slog.DiscardHandler), h, api.Services{})
}

func platformWebuiConfig() config.Config {
	return config.Config{Auth: config.AuthConfig{PostLoginRedirect: platformWebui + "/"}}
}

func platformServe(e *echo.Echo, req *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

func TestLogoutUnderAPIPrefixWithoutSession(t *testing.T) {
	rec := platformServe(platformServer(config.Config{}), httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil))

	assert.Equal(t, http.StatusNoContent, rec.Code)
	var cleared *http.Cookie
	for _, ck := range rec.Result().Cookies() {
		if ck.Name == middleware.SessionCookieName(config.AuthConfig{}) {
			cleared = ck
		}
	}
	require.NotNil(t, cleared, "session cookie must be cleared")
	assert.Less(t, cleared.MaxAge, 0)
}

func TestCORSAllowsOnlyTheWebuiOrigin(t *testing.T) {
	get := func(e *echo.Echo, origin string) http.Header {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		req.Header.Set(echo.HeaderOrigin, origin)
		return platformServe(e, req).Header()
	}
	e := platformServer(platformWebuiConfig())

	h := get(e, platformWebui)
	assert.Equal(t, platformWebui, h.Get(echo.HeaderAccessControlAllowOrigin))
	assert.Equal(t, "true", h.Get(echo.HeaderAccessControlAllowCredentials))
	assert.Equal(t, echo.HeaderXRequestID, h.Get(echo.HeaderAccessControlExposeHeaders))

	assert.Empty(t, get(e, "http://evil.example").Get(echo.HeaderAccessControlAllowOrigin), "other origin")

	// A relative redirect is a same-origin deployment: no CORS at all.
	sameOrigin := platformServer(config.Config{Auth: config.AuthConfig{PostLoginRedirect: "/"}})
	assert.Empty(t, get(sameOrigin, platformWebui).Get(echo.HeaderAccessControlAllowOrigin), "same-origin deployment")

	// Preflight advertises only what the webui uses.
	req := httptest.NewRequest(http.MethodOptions, "/api/v1/flags/x", nil)
	req.Header.Set(echo.HeaderOrigin, platformWebui)
	req.Header.Set(echo.HeaderAccessControlRequestMethod, http.MethodPut)
	pre := platformServe(e, req)
	assert.Equal(t, http.StatusNoContent, pre.Code)
	assert.Equal(t, "GET,POST,PUT,PATCH,DELETE,OPTIONS", pre.Header().Get(echo.HeaderAccessControlAllowMethods))
	assert.Equal(t, "Content-Type,Accept", pre.Header().Get(echo.HeaderAccessControlAllowHeaders))
}

func TestCrossOriginWritesAreRejected(t *testing.T) {
	e := platformServer(platformWebuiConfig())
	post := func(site, origin string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/auth/logout", nil)
		if site != "" {
			req.Header.Set("Sec-Fetch-Site", site)
		}
		if origin != "" {
			req.Header.Set(echo.HeaderOrigin, origin)
		}
		return platformServe(e, req)
	}

	rec := post("cross-site", "http://evil.example")
	assert.Equal(t, http.StatusForbidden, rec.Code)
	assert.JSONEq(t, `{"message":"cross-origin request rejected"}`, rec.Body.String())

	assert.Equal(t, http.StatusNoContent, post("same-origin", "").Code, "same-origin")
	assert.Equal(t, http.StatusNoContent, post("same-site", platformWebui).Code, "trusted webui origin")
	assert.Equal(t, http.StatusNoContent, post("", "").Code, "non-browser client")
}

func TestWebuiOriginIsNormalized(t *testing.T) {
	// Browsers send "https://goff.example": lowercase, no default port.
	e := platformServer(config.Config{Auth: config.AuthConfig{PostLoginRedirect: "https://Goff.Example:443/"}})
	req := httptest.NewRequest(http.MethodPost, "/auth/logout", nil)
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	req.Header.Set(echo.HeaderOrigin, "https://goff.example")
	rec := platformServe(e, req)

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Equal(t, "https://goff.example", rec.Header().Get(echo.HeaderAccessControlAllowOrigin))
}

// Pins the api.New order: CORS runs before BodyLimit, so the webui can read the 413.
func TestBodyLimit413CarriesCORS(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", bytes.NewReader(make([]byte, 256*1024+1)))
	req.Header.Set(echo.HeaderOrigin, platformWebui)
	req.Header.Set("Sec-Fetch-Site", "same-site")
	rec := platformServe(platformServer(platformWebuiConfig()), req)

	assert.Equal(t, http.StatusRequestEntityTooLarge, rec.Code)
	assert.Equal(t, platformWebui, rec.Header().Get(echo.HeaderAccessControlAllowOrigin))
	assert.JSONEq(t, `{"message":"Request Entity Too Large"}`, rec.Body.String())
}

// Pins the api.New order: RequestID and RequestLogger wrap Recover, so a
// recovered panic is logged as a 500 with its stack and request id.
func TestPanicIsLoggedWithRequestID(t *testing.T) {
	var buf bytes.Buffer
	e := api.New(config.Config{}, slog.New(slog.NewTextHandler(&buf, nil)), api.Handlers{}, api.Services{})
	e.GET("/boom", func(c *echo.Context) error { panic("kaboom") })
	rec := platformServe(e, httptest.NewRequest(http.MethodGet, "/boom", nil))

	assert.Equal(t, http.StatusInternalServerError, rec.Code)
	out := buf.String()
	assert.Contains(t, out, "level=ERROR")
	assert.Contains(t, out, "status=500")
	assert.Contains(t, out, "request_id="+rec.Header().Get(echo.HeaderXRequestID))
	assert.Contains(t, out, "PANIC RECOVER")
}

func TestSecurityHeaders(t *testing.T) {
	rec := platformServe(platformServer(config.Config{}), httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil))

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
	assert.Equal(t, "nosniff", rec.Header().Get(echo.HeaderXContentTypeOptions))
	assert.Equal(t, "DENY", rec.Header().Get(echo.HeaderXFrameOptions))
	assert.Equal(t, "no-store", rec.Header().Get(echo.HeaderCacheControl))
	assert.Equal(t, "default-src 'none'; frame-ancestors 'none'", rec.Header().Get(echo.HeaderContentSecurityPolicy))
	assert.Equal(t, "no-referrer", rec.Header().Get(echo.HeaderReferrerPolicy))
	assert.NotEmpty(t, rec.Header().Get(echo.HeaderXRequestID))
	assert.Empty(t, rec.Header().Get(echo.HeaderStrictTransportSecurity), "no HSTS without CookieSecure")

	secure := platformServer(config.Config{Auth: config.AuthConfig{CookieSecure: true}})
	rec = platformServe(secure, httptest.NewRequest(http.MethodGet, "https://goff.example/health", nil))
	assert.Equal(t, "max-age=31536000; includeSubdomains", rec.Header().Get(echo.HeaderStrictTransportSecurity))
}

// The login redirects carry the one-time code (callback) or set cookies:
// caches must not keep them, even when the request is refused.
func TestAuthRoutesAreNotCached(t *testing.T) {
	e := platformServer(config.Config{})
	tests := []struct {
		method, path string
		want         int
	}{
		{http.MethodGet, "/auth/callback?state=s&code=c", http.StatusBadRequest}, // no state cookie
		{http.MethodPost, "/auth/logout", http.StatusNoContent},
		{http.MethodPost, "/api/v1/auth/logout", http.StatusNoContent},
	}
	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			rec := platformServe(e, httptest.NewRequest(tt.method, tt.path, nil))
			assert.Equal(t, tt.want, rec.Code)
			assert.Equal(t, "no-store", rec.Header().Get(echo.HeaderCacheControl))
			assert.Equal(t, "no-referrer", rec.Header().Get(echo.HeaderReferrerPolicy))
		})
	}

	// A rate-limited login is not cached either.
	for range 6 {
		platformServe(e, httptest.NewRequest(http.MethodGet, "/auth/callback", nil))
	}
	rec := platformServe(e, httptest.NewRequest(http.MethodGet, "/auth/login", nil))
	require.Equal(t, http.StatusTooManyRequests, rec.Code)
	assert.Equal(t, "no-store", rec.Header().Get(echo.HeaderCacheControl))
}

// RBAC lookups: a genuine miss (incl. a malformed id) answers 403 like a
// missing role, so ids can't be probed; a failing lookup is a 500, not a
// misleading denial.
func TestRBACLookupErrors(t *testing.T) {
	db := testutil.StartPostgres(t)
	audit := repository.NewAuditRepo(db)
	flagsetRepo := repository.NewFlagsetRepo(db)
	flagsets := service.NewFlagsetService(flagsetRepo, audit)
	flags := service.NewFlagService(db, repository.NewFlagRepo(db), repository.NewFlagVersionRepo(db), flagsetRepo, audit)
	// teams is only reached once the resource exists, which no case here needs.
	flagMW := middleware.RequireFlagRole(nil, flags, "id", model.RoleViewer)
	flagsetMW := middleware.RequireFlagsetRole(nil, flagsets, "id", model.RoleViewer)

	run := func(mw echo.MiddlewareFunc, ctx context.Context, id string) int {
		e := echo.New()
		e.Logger = slog.New(slog.DiscardHandler)
		rec := httptest.NewRecorder()
		c := e.NewContext(httptest.NewRequestWithContext(ctx, http.MethodGet, "/", nil), rec)
		c.Set(middleware.ContextClaimsKey, &service.Claims{UserID: "u1"})
		c.SetPathValues(echo.PathValues{{Name: "id", Value: id}})
		_ = mw(func(c *echo.Context) error { return c.NoContent(http.StatusOK) })(c)
		return rec.Code
	}
	const missing = "00000000-0000-0000-0000-000000000000"
	canceled, cancel := context.WithCancel(t.Context())
	cancel()

	assert.Equal(t, http.StatusForbidden, run(flagMW, t.Context(), missing), "flag: missing")
	assert.Equal(t, http.StatusForbidden, run(flagMW, t.Context(), "not-a-uuid"), "flag: malformed id")
	assert.Equal(t, http.StatusInternalServerError, run(flagMW, canceled, missing), "flag: lookup failure")
	assert.Equal(t, http.StatusForbidden, run(flagsetMW, t.Context(), "not-a-uuid"), "flagset: malformed id")
	assert.Equal(t, http.StatusInternalServerError, run(flagsetMW, canceled, missing), "flagset: lookup failure")
}

func TestSwaggerOffByDefaultAndRequiresSession(t *testing.T) {
	req := func() *http.Request { return httptest.NewRequest(http.MethodGet, "/swagger/index.html", nil) }

	rec := platformServe(platformServer(config.Config{}), req())
	assert.Equal(t, http.StatusNotFound, rec.Code)

	rec = platformServe(platformServer(config.Config{Server: config.ServerConfig{EnableSwagger: true}}), req())
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestLoginIsRateLimited(t *testing.T) {
	e := platformServer(config.Config{})
	for i := range 5 {
		rec := platformServe(e, httptest.NewRequest(http.MethodGet, "/auth/callback", nil))
		assert.NotEqual(t, http.StatusTooManyRequests, rec.Code, "request %d", i+1)
	}
	rec := platformServe(e, httptest.NewRequest(http.MethodGet, "/auth/login", nil))
	assert.Equal(t, http.StatusTooManyRequests, rec.Code)
	assert.Contains(t, rec.Body.String(), "too many requests")

	// Another client is not affected.
	req := httptest.NewRequest(http.MethodGet, "/auth/callback", nil)
	req.RemoteAddr = "198.51.100.7:1234"
	assert.NotEqual(t, http.StatusTooManyRequests, platformServe(e, req).Code)
}

// Behind a reverse proxy the login limit must key on the client, read from
// X-Forwarded-For only when the direct peer is a configured trusted proxy.
func TestLoginRateLimitBehindProxy(t *testing.T) {
	const proxy = "10.0.0.5:4000"
	trusted := config.Config{Server: config.ServerConfig{TrustedProxies: []string{"10.0.0.0/8"}}}
	tests := []struct {
		name     string
		cfg      config.Config
		peer     string // socket address of every request
		drainXFF string // client of the 5 requests that use up a bucket
		probeXFF string // client of the 6th request
		want429  bool
	}{
		{"trusted proxy: another client has its own bucket", trusted, proxy, "198.51.100.1", "198.51.100.2", false},
		{"trusted proxy: the same client is limited", trusted, proxy, "198.51.100.1", "198.51.100.1", true},
		{"no trusted proxies: clients share the proxy's bucket", config.Config{}, proxy,
			"198.51.100.1", "198.51.100.2", true},
		{"untrusted peer can't pick its key with the header", trusted, "203.0.113.9:4000",
			"198.51.100.1", "198.51.100.2", true},
		{"private peer outside the ranges isn't trusted", trusted, "192.168.1.1:4000",
			"198.51.100.1", "198.51.100.2", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := platformServer(tt.cfg)
			get := func(xff string) int {
				req := httptest.NewRequest(http.MethodGet, "/auth/login", nil)
				req.RemoteAddr = tt.peer
				req.Header.Set(echo.HeaderXForwardedFor, xff)
				return platformServe(e, req).Code
			}
			for range 5 {
				require.NotEqual(t, http.StatusTooManyRequests, get(tt.drainXFF))
			}
			assert.Equal(t, tt.want429, get(tt.probeXFF) == http.StatusTooManyRequests)
		})
	}
}
