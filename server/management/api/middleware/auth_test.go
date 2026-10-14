package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// authTestService builds a real AuthService against a stub OIDC discovery
// endpoint (NewAuthService only fetches the discovery document).
func authTestService(t testing.TB, users *repository.UserRepo) *service.AuthService {
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
	auth, err := service.NewAuthService(t.Context(), cfg, users, nil)
	require.NoError(t, err)
	return auth
}

// runAuth sends one request through RequireAuth with the given session cookie
// ("" sends none) and returns the response, the claims next saw, and whether
// next ran.
func runAuth(t testing.TB, auth *service.AuthService, cookie string) (*httptest.ResponseRecorder, *service.Claims, bool) {
	t.Helper()
	var got *service.Claims
	called := false
	handler := RequireAuth(auth)(func(c *echo.Context) error {
		called, got = true, MustClaims(c)
		return c.NoContent(http.StatusOK)
	})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	if cookie != "" {
		req.AddCookie(&http.Cookie{Name: SessionCookieName, Value: cookie})
	}
	rec := httptest.NewRecorder()
	require.NoError(t, handler(echo.New().NewContext(req, rec)))
	return rec, got, called
}

func TestRequireAuth(t *testing.T) {
	db := testutil.StartPostgres(t)
	users := repository.NewUserRepo(db)
	auth := authTestService(t, users)
	sessionOf := func(t *testing.T, email string) (string, *model.User) {
		u := testutil.SeedUser(t, db, email, "U", false)
		token, err := auth.IssueJWT(u)
		require.NoError(t, err)
		return token, u
	}
	// A fresh, closed pool makes the user lookup fail.
	broken, err := repository.NewDB(t.Context(), config.DBConfig{URL: db.Pool.Config().ConnString()})
	require.NoError(t, err)
	broken.Close()
	brokenAuth := authTestService(t, repository.NewUserRepo(broken))

	tests := []struct {
		name        string
		auth        *service.AuthService
		cookie      func(t *testing.T) string
		wantStatus  int
		wantMessage string
	}{
		{"no cookie", auth, func(*testing.T) string { return "" }, http.StatusUnauthorized, "unauthenticated"},
		{"invalid token", auth, func(*testing.T) string { return "not.a.jwt" }, http.StatusUnauthorized, "unauthenticated"},
		{"deleted user", auth, func(t *testing.T) string {
			token, u := sessionOf(t, "gone@b.com")
			_, err := db.Pool.Exec(t.Context(), `DELETE FROM users WHERE id = $1`, u.ID)
			require.NoError(t, err)
			return token
		}, http.StatusUnauthorized, "unauthenticated"},
		{"database failure is a 500, not a logout", brokenAuth, func(t *testing.T) string {
			token, _ := sessionOf(t, "db@b.com")
			return token
		}, http.StatusInternalServerError, "failed to authenticate"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec, _, called := runAuth(t, tt.auth, tt.cookie(t))
			assert.Equal(t, tt.wantStatus, rec.Code)
			assert.False(t, called, "next must not run")
			var body model.APIResponse
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
			assert.Equal(t, tt.wantMessage, body.Message)
		})
	}

	t.Run("valid session sets the claims", func(t *testing.T) {
		token, u := sessionOf(t, "a@b.com")
		rec, got, called := runAuth(t, auth, token)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.True(t, called)
		require.NotNil(t, got)
		assert.Equal(t, u.ID, got.UserID)
	})
}

func TestMustClaimsPanicsWithoutRequireAuth(t *testing.T) {
	c := echo.New().NewContext(httptest.NewRequest(http.MethodGet, "/", nil), httptest.NewRecorder())
	assert.Nil(t, ClaimsFrom(c))
	assert.PanicsWithValue(t, "middleware.MustClaims: no claims, route is missing RequireAuth", func() { MustClaims(c) })
}

// FuzzRequireAuthCookie: the cookie is untrusted. Anything that isn't a
// token this service signed must be a 401 that never reaches the handler;
// such tokens fail before any DB access, so no Postgres is needed.
func FuzzRequireAuthCookie(f *testing.F) {
	auth := authTestService(f, nil)
	valid, err := auth.IssueJWT(&model.User{ID: "u1"})
	require.NoError(f, err)
	for _, seed := range []string{"not.a.jwt", "a.b.c", valid[:len(valid)-2], "x"} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, cookie string) {
		if cookie == "" || strings.HasPrefix(valid, cookie) && len(cookie) == len(valid) {
			return
		}
		if _, err := auth.ParseJWT(cookie); err == nil {
			t.Skip("a valid signature would need the DB")
		}
		rec, _, called := runAuth(t, auth, cookie)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
		assert.False(t, called)
	})
}
