package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The no-cookie / empty-cookie branches of RequireAuth return before the
// AuthService is dereferenced, so they can be exercised with a nil service.
func TestRequireAuthNoCookie(t *testing.T) {
	mw := RequireAuth(nil)
	handler := mw(func(c *echo.Context) error { return c.NoContent(http.StatusOK) })

	t.Run("no cookie", func(t *testing.T) {
		e := echo.New()
		rec := httptest.NewRecorder()
		c := e.NewContext(httptest.NewRequest(http.MethodGet, "/", nil), rec)
		assert.NoError(t, handler(c))
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("empty cookie value", func(t *testing.T) {
		e := echo.New()
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.AddCookie(&http.Cookie{Name: SessionCookieName, Value: ""})
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		assert.NoError(t, handler(c))
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
}

// authTestService builds a real AuthService against a stub OIDC discovery
// endpoint (NewAuthService only fetches the discovery document).
func authTestService(t *testing.T) *service.AuthService {
	t.Helper()
	var issuer string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"issuer":"` + issuer + `"}`))
	}))
	t.Cleanup(srv.Close)
	issuer = srv.URL
	cfg := config.Config{
		OIDC: config.OIDCConfig{Issuer: issuer},
		Auth: config.AuthConfig{JWTSecret: strings.Repeat("x", 32), SessionMaxAge: time.Hour},
	}
	auth, err := service.NewAuthService(t.Context(), cfg, nil, nil)
	require.NoError(t, err)
	return auth
}

func TestRequireAuthCookie(t *testing.T) {
	auth := authTestService(t)
	// run returns the recorder, the claims next saw, and whether next ran.
	run := func(token string) (*httptest.ResponseRecorder, *service.Claims, bool) {
		var got *service.Claims
		called := false
		handler := RequireAuth(auth)(func(c *echo.Context) error {
			called, got = true, MustClaims(c)
			return c.NoContent(http.StatusOK)
		})
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.AddCookie(&http.Cookie{Name: SessionCookieName, Value: token})
		rec := httptest.NewRecorder()
		assert.NoError(t, handler(echo.New().NewContext(req, rec)))
		return rec, got, called
	}

	t.Run("invalid jwt -> 401", func(t *testing.T) {
		rec, _, called := run("not.a.jwt")
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
		assert.False(t, called, "next must not be called")
	})

	t.Run("valid jwt -> claims set", func(t *testing.T) {
		token, err := auth.IssueJWT(&model.User{ID: "user-1", Email: "a@b.com"})
		require.NoError(t, err)
		rec, got, called := run(token)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.True(t, called)
		require.NotNil(t, got)
		assert.Equal(t, "user-1", got.UserID)
	})
}
