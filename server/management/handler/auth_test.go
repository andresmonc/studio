package handler

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"
)

const (
	testClientID = "studio"
	testNonce    = "n1"
)

// fakeOIDC is a minimal OIDC provider: discovery, JWKS, and a token endpoint
// that returns an RS256 ID token for email, with testNonce. It enforces PKCE:
// the code must be the S256 challenge of the posted code_verifier (a real IdP
// remembers the challenge sent with the authorization request instead). It
// returns the issuer URL.
func fakeOIDC(t *testing.T, email string) string {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: jose.JSONWebKey{Key: key, KeyID: "k1"}},
		(&jose.SignerOptions{}).WithType("JWT"))
	require.NoError(t, err)

	var issuer string
	writeJSON := func(w http.ResponseWriter, v any) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(v)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{
			"issuer": issuer, "authorization_endpoint": issuer + "/auth", "token_endpoint": issuer + "/token",
			"jwks_uri": issuer + "/keys", "id_token_signing_alg_values_supported": []string{"RS256"},
		})
	})
	mux.HandleFunc("/keys", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, KeyID: "k1", Algorithm: "RS256", Use: "sig"}}})
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil ||
			oauth2.S256ChallengeFromVerifier(r.PostForm.Get("code_verifier")) != r.PostForm.Get("code") {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
			return
		}
		now := time.Now().Unix()
		claims, _ := json.Marshal(map[string]any{
			"iss": issuer, "aud": testClientID, "sub": "sub-" + email, "iat": now, "exp": now + 3600,
			"nonce": testNonce, "email": email, "email_verified": true, "name": "Logged In",
		})
		jws, err := signer.Sign(claims)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		token, _ := jws.CompactSerialize()
		writeJSON(w, map[string]any{"access_token": "at", "token_type": "Bearer", "id_token": token})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	issuer = srv.URL
	return issuer
}

func authConfig(issuer string) config.Config {
	return config.Config{
		OIDC: config.OIDCConfig{Issuer: issuer, ClientID: testClientID, RedirectURL: "http://studio/auth/callback"},
		Auth: config.AuthConfig{
			JWTSecret: strings.Repeat("x", 32), SessionMaxAge: time.Hour, CookieDomain: "goff.local", CookieSecure: true,
		},
	}
}

func newAuthService(t *testing.T, cfg config.Config, users *repository.UserRepo) *service.AuthService {
	t.Helper()
	auth, err := service.NewAuthService(t.Context(), cfg, users, nil)
	require.NoError(t, err)
	return auth
}

func cookieNamed(rec *httptest.ResponseRecorder, name string) *http.Cookie {
	for _, c := range rec.Result().Cookies() {
		if c.Name == name {
			return c
		}
	}
	return nil
}

func TestAuthHandlerLogin(t *testing.T) {
	issuer := fakeOIDC(t, "x@acme.com")
	cfg := authConfig(issuer)
	h := NewAuthHandler(cfg, newAuthService(t, cfg, nil), nil, nil, nil)

	c, rec := reqCtx(http.MethodGet, "")
	require.NoError(t, h.Login(c))
	assert.Equal(t, http.StatusFound, rec.Code)
	loc, err := url.Parse(rec.Header().Get("Location"))
	require.NoError(t, err)
	assert.Equal(t, issuer+"/auth", loc.Scheme+"://"+loc.Host+loc.Path)

	state := cookieNamed(rec, stateCookie)
	require.NotNil(t, state)
	parts := strings.Split(state.Value, ".")
	require.Len(t, parts, 3, "state.verifier.nonce")
	assert.Equal(t, parts[0], loc.Query().Get("state"))
	assert.Equal(t, parts[2], loc.Query().Get("nonce"))
	assert.Equal(t, "S256", loc.Query().Get("code_challenge_method"))
	assert.Equal(t, oauth2.S256ChallengeFromVerifier(parts[1]), loc.Query().Get("code_challenge"))
	assert.True(t, state.HttpOnly)
	assert.True(t, state.Secure)
	assert.Equal(t, http.SameSiteLaxMode, state.SameSite)
	assert.Equal(t, 600, state.MaxAge)
	assert.Empty(t, state.Domain, "host-only")
}

func TestAuthHandlerCallback(t *testing.T) {
	db := testutil.StartPostgres(t)
	issuer := fakeOIDC(t, "login@acme.com")
	cfg := authConfig(issuer)
	auth := newAuthService(t, cfg, repository.NewUserRepo(db))
	verifier := oauth2.GenerateVerifier()
	code := oauth2.S256ChallengeFromVerifier(verifier)
	validCookie := "abc." + verifier + "." + testNonce
	// A closed pool makes the user upsert fail after a valid exchange.
	broken, err := repository.NewDB(t.Context(), config.DBConfig{URL: db.Pool.Config().ConnString()})
	require.NoError(t, err)
	broken.Close()

	rejected := []struct {
		name, query, cookie string
		auth                *service.AuthService
		wantStatus          int
		wantMsg             string
	}{
		{"missing state cookie", "state=abc&code=" + code, "", auth, http.StatusBadRequest, "invalid state"},
		{"mismatched state", "state=abc&code=" + code, "other." + verifier + "." + testNonce, auth,
			http.StatusBadRequest, "invalid state"},
		{"state only (no verifier/nonce)", "state=abc&code=" + code, "abc", auth, http.StatusBadRequest, "invalid state"},
		{"IdP error instead of a code", "state=abc&error=access_denied", validCookie, auth,
			http.StatusBadRequest, "login failed"},
		{"wrong PKCE verifier", "state=abc&code=" + code, "abc." + oauth2.GenerateVerifier() + "." + testNonce, auth,
			http.StatusBadRequest, "login failed"},
		{"nonce mismatch", "state=abc&code=" + code, "abc." + verifier + ".wrong", auth,
			http.StatusBadRequest, "login failed"},
		{"database failure is a 500, not the user's fault", "state=abc&code=" + code, validCookie,
			newAuthService(t, cfg, repository.NewUserRepo(broken)), http.StatusInternalServerError, "login failed"},
	}
	for _, tt := range rejected {
		t.Run(tt.name, func(t *testing.T) {
			h := NewAuthHandler(cfg, tt.auth, nil, nil, nil)
			c, rec := reqCtxQuery(tt.query)
			if tt.cookie != "" {
				c.Request().AddCookie(&http.Cookie{Name: stateCookie, Value: tt.cookie})
			}
			require.NoError(t, h.Callback(c))
			assert.Equal(t, tt.wantStatus, rec.Code)
			assert.Equal(t, tt.wantMsg, decodeResp(t, rec).Message)
			assert.Nil(t, cookieNamed(rec, middleware.SessionCookieName), "no session on a failed login")
		})
	}

	success := []struct {
		name, redirect, wantLocation string
	}{
		{"default redirect", "", "/"},
		{"configured redirect", "https://studio.example/flags", "https://studio.example/flags"},
	}
	for _, tt := range success {
		t.Run("success: "+tt.name, func(t *testing.T) {
			cfg := cfg
			cfg.Auth.PostLoginRedirect = tt.redirect
			h := NewAuthHandler(cfg, auth, nil, nil, nil)
			c, rec := reqCtxQuery("state=abc&code=" + code)
			c.Request().AddCookie(&http.Cookie{Name: stateCookie, Value: validCookie})
			require.NoError(t, h.Callback(c))

			assert.Equal(t, http.StatusFound, rec.Code)
			assert.Equal(t, tt.wantLocation, rec.Header().Get("Location"))
			session := cookieNamed(rec, middleware.SessionCookieName)
			require.NotNil(t, session)
			claims, err := auth.Authenticate(t.Context(), session.Value)
			require.NoError(t, err, "the cookie holds a valid session")
			assert.Equal(t, "login@acme.com", claims.Email)
			assert.Equal(t, "goff.local", session.Domain)
			assert.True(t, session.HttpOnly)
			assert.True(t, session.Secure)
			assert.Equal(t, http.SameSiteLaxMode, session.SameSite)
			assert.Equal(t, 3600, session.MaxAge)
			state := cookieNamed(rec, stateCookie)
			require.NotNil(t, state)
			assert.Negative(t, state.MaxAge, "the one-shot state cookie is cleared")
		})
	}
}

func TestAuthHandlerLogout(t *testing.T) {
	h := NewAuthHandler(config.Config{Auth: config.AuthConfig{CookieDomain: "goff.local"}}, nil, nil, nil, nil)

	c, rec := reqCtx(http.MethodPost, "")
	require.NoError(t, h.Logout(c))
	assert.Equal(t, http.StatusNoContent, rec.Code)

	// Cleared (MaxAge < 0) on the Domain it was set on, otherwise the browser
	// keeps the original.
	session := cookieNamed(rec, middleware.SessionCookieName)
	require.NotNil(t, session, "session cookie should be cleared on logout")
	assert.Negative(t, session.MaxAge)
	assert.Equal(t, "goff.local", session.Domain)
	assert.Equal(t, http.SameSiteLaxMode, session.SameSite)
}

func TestAuthHandlerMe(t *testing.T) {
	s := newStack(t)
	h := NewAuthHandler(config.Config{}, nil, s.userRepo, s.teamSvc, s.companySvc)
	co := testutil.SeedCompany(t, s.db, "Acme")
	// Stored as super admin: Me must report the session's (demoted) value.
	user := testutil.SeedUser(t, s.db, "u@acme.com", "User", true)
	testutil.SetCompanyMember(t, s.db, co.ID, user.ID, model.CompanyRoleAdmin)

	t.Run("success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		withClaims(c, user.ID, false)
		require.NoError(t, h.Me(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		data := dataMap(t, decodeResp(t, rec).Data)
		userData := dataMap(t, data["user"])
		assert.Equal(t, "u@acme.com", userData["email"])
		assert.Equal(t, false, userData["isSuperAdmin"], "from the session, not the stored flag")
		assert.Equal(t, co.ID, dataMap(t, data["company"])["companyId"])
	})

	t.Run("lookup failure -> 500", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		ctx, cancel := context.WithCancel(c.Request().Context())
		cancel()
		c.SetRequest(c.Request().WithContext(ctx))
		withClaims(c, user.ID, false)
		require.NoError(t, h.Me(c))
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
		assert.Equal(t, "failed to load user", decodeResp(t, rec).Message)
	})

	t.Run("unknown user -> 404", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		withClaims(c, missingUUID, false)
		require.NoError(t, h.Me(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
		assert.Equal(t, "user not found", decodeResp(t, rec).Message)
	})
}
