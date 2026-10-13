package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newAuthHandler builds an AuthHandler for Me. The OIDC-backed AuthService is
// left nil because the code exchange is not exercised here (it requires a
// network OIDC provider).
func newAuthHandler(s *stack) *AuthHandler {
	return NewAuthHandler(config.Config{}, nil, s.userRepo, s.teamSvc, s.companySvc)
}

func TestAuthHandlerLogout(t *testing.T) {
	h := NewAuthHandler(config.Config{Auth: config.AuthConfig{CookieDomain: "goff.local"}}, nil, nil, nil, nil)

	c, rec := reqCtx(http.MethodPost, "")
	require.NoError(t, h.Logout(c))
	assert.Equal(t, http.StatusNoContent, rec.Code)

	// Logout clears the session cookie (MaxAge<0 -> immediate expiry) on the
	// same Domain it was set on, otherwise the browser keeps the original.
	var found bool
	for _, ck := range rec.Result().Cookies() {
		if ck.Name == middleware.SessionCookieName {
			found = true
			assert.True(t, ck.MaxAge < 0)
			assert.Equal(t, "goff.local", ck.Domain)
			assert.Equal(t, http.SameSiteLaxMode, ck.SameSite)
		}
	}
	assert.True(t, found, "session cookie should be cleared on logout")
}

// authStubService builds a real AuthService against a stub OIDC discovery
// document. It has no token endpoint, so every code exchange fails.
func authStubService(t *testing.T) *service.AuthService {
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

func TestAuthHandlerCallback(t *testing.T) {
	h := NewAuthHandler(config.Config{}, authStubService(t), nil, nil, nil)

	for name, cookie := range map[string]string{
		"missing state cookie": "", "mismatched state": "other.v.n", "state only (no verifier/nonce)": "abc",
	} {
		t.Run(name, func(t *testing.T) {
			c, rec := reqCtxQuery(http.MethodGet, "state=abc&code=x")
			if cookie != "" {
				c.Request().AddCookie(&http.Cookie{Name: stateCookie, Value: cookie})
			}
			require.NoError(t, h.Callback(c))
			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.NotEmpty(t, decodeResp(t, rec).Message)
		})
	}

	// The exchange error must be logged, not echoed to the client.
	t.Run("exchange failure -> generic message", func(t *testing.T) {
		c, rec := reqCtxQuery(http.MethodGet, "state=abc&code=x")
		c.Request().AddCookie(&http.Cookie{Name: stateCookie, Value: "abc.verifier.nonce"})
		require.NoError(t, h.Callback(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Equal(t, "login failed", decodeResp(t, rec).Message)
	})
}

func TestAuthHandlerMe(t *testing.T) {
	s := newStack(t)
	h := newAuthHandler(s)
	co := testutil.SeedCompany(t, s.db, "Acme", nil)
	user := testutil.SeedUser(t, s.db, "u@acme.com", "User", false)
	require.NoError(t, s.companyRepo.SetMember(t.Context(), co.ID, user.ID, model.CompanyRoleAdmin))

	t.Run("success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		withClaims(c, user.ID, false)
		require.NoError(t, h.Me(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		resp := decodeResp(t, rec)
		data := dataMap(t, resp.Data)
		userData := dataMap(t, data["user"])
		assert.Equal(t, "u@acme.com", userData["email"])
	})

	t.Run("unknown user -> 404", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		withClaims(c, missingUUID, false)
		require.NoError(t, h.Me(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}
