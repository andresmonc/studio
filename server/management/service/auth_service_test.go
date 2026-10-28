package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"
)

// authServiceForJWT builds an AuthService with only the fields IssueJWT/ParseJWT
// need, bypassing the OIDC discovery that NewAuthService performs. Constructing
// the struct literal directly is only possible from within the service package.
func authServiceForJWT(secret string, maxAge time.Duration) *AuthService {
	return &AuthService{
		cfg: config.Config{Auth: config.AuthConfig{JWTSecret: secret, SessionMaxAge: maxAge}},
	}
}

func TestIssueAndParseJWTRoundTrip(t *testing.T) {
	s := authServiceForJWT(strings.Repeat("x", 32), time.Hour)
	u := &model.User{ID: "user-1", Email: "a@b.com", Name: "Alice", IsSuperAdmin: true}

	token, err := s.IssueJWT(u)
	require.NoError(t, err)
	require.NotEmpty(t, token)

	claims, err := s.ParseJWT(token)
	require.NoError(t, err)
	assert.Equal(t, "user-1", claims.UserID)
	assert.Equal(t, "a@b.com", claims.Email)
	assert.Equal(t, "Alice", claims.Name)
	assert.False(t, claims.IsSuperAdmin, "super admin is never carried in the token")
	assert.Equal(t, "user-1", claims.Subject)
}

func TestParseJWTRejects(t *testing.T) {
	secret := strings.Repeat("x", 32)
	sign := func(s *AuthService) string {
		token, err := s.IssueJWT(&model.User{ID: "u1"})
		require.NoError(t, err)
		return token
	}
	// {"alg":"none"} with a uid claim and no signature.
	none := "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0." + base64.RawURLEncoding.EncodeToString([]byte(`{"uid":"u1"}`)) + "."
	tests := []struct {
		name    string
		token   string
		wantErr string
	}{
		{"different secret", sign(authServiceForJWT(strings.Repeat("y", 32), time.Hour)), "signature is invalid"},
		{"expired", sign(authServiceForJWT(secret, -time.Hour)), "token is expired"},
		{"malformed", "not.a.valid.jwt", "token is malformed"},
		{"alg none", none, "signing method none is invalid"},
	}
	verifier := authServiceForJWT(secret, time.Hour)
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := verifier.ParseJWT(tt.token)
			assert.ErrorContains(t, err, tt.wantErr)
		})
	}
}

// FuzzParseJWT: ParseJWT reads an untrusted cookie. It must never panic, and
// only a token this service signed parses.
func FuzzParseJWT(f *testing.F) {
	s := authServiceForJWT(strings.Repeat("x", 32), time.Hour)
	valid, err := s.IssueJWT(&model.User{ID: "u1"})
	require.NoError(f, err)
	for _, seed := range []string{valid, "", "not.a.valid.jwt", "a.b.c", valid + "x"} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, token string) {
		c, err := s.ParseJWT(token)
		if err == nil {
			assert.Equal(t, valid, token, "only the issued token parses")
			assert.Equal(t, "u1", c.UserID)
		}
	})
}

// testNonce is the nonce authExchangeService adds to id_token claims that
// don't set one.
const testNonce = "n0"

// authExchangeService wires Exchange to a stub token endpoint returning an
// unsigned id_token with the given claims (signature check skipped). The stub
// rejects exchanges without the PKCE code_verifier.
func authExchangeService(t *testing.T, users *repository.UserRepo, idClaims string) *AuthService {
	t.Helper()
	var obj map[string]any
	if json.Unmarshal([]byte(idClaims), &obj) == nil {
		if _, ok := obj["nonce"]; !ok {
			obj["nonce"] = testNonce
			b, err := json.Marshal(obj)
			require.NoError(t, err)
			idClaims = string(b)
		}
	}
	idToken := "e30." + base64.RawURLEncoding.EncodeToString([]byte(idClaims)) + ".sig"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.FormValue("code_verifier") != "verifier" {
			http.Error(w, `{"error":"invalid_grant"}`, http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"access_token":"at","token_type":"Bearer","id_token":"` + idToken + `"}`))
	}))
	t.Cleanup(srv.Close)
	return &AuthService{
		cfg:   config.Config{Auth: config.AuthConfig{JWTSecret: strings.Repeat("x", 32), SessionMaxAge: time.Hour}},
		users: users,
		oauth: &oauth2.Config{Endpoint: oauth2.Endpoint{TokenURL: srv.URL}},
		verifier: oidc.NewVerifier("", nil, &oidc.Config{
			SkipClientIDCheck: true, SkipExpiryCheck: true, SkipIssuerCheck: true, InsecureSkipSignatureCheck: true,
		}),
	}
}

func TestExchangeEmailVerified(t *testing.T) {
	users := repository.NewUserRepo(testutil.StartPostgres(t))

	// Some IdPs (AWS Cognito) send the claim as a string.
	for _, v := range []string{`false`, `"false"`, `null`} {
		t.Run("email_verified="+v+" is rejected", func(t *testing.T) {
			s := authExchangeService(t, users, `{"sub":"s1","email":"unverified@acme.com","email_verified":`+v+`}`)
			_, _, err := s.Exchange(t.Context(), "code", "verifier", testNonce)
			require.ErrorContains(t, err, "email not verified")
			_, err = users.GetByEmail(t.Context(), "unverified@acme.com")
			assert.ErrorIs(t, err, repository.ErrNotFound, "no account is created")
		})
	}

	t.Run("missing email_verified is rejected", func(t *testing.T) {
		s := authExchangeService(t, users, `{"sub":"s2","email":"noclaim@acme.com"}`)
		_, _, err := s.Exchange(t.Context(), "code", "verifier", testNonce)
		require.ErrorContains(t, err, "email not verified")
	})

	t.Run("missing email_verified is accepted with AllowUnverifiedEmail", func(t *testing.T) {
		s := authExchangeService(t, users, `{"sub":"s2","email":"noclaim@acme.com"}`)
		s.cfg.Auth.AllowUnverifiedEmail = true
		s.adminEmails = map[string]struct{}{"noclaim@acme.com": {}}
		u, token, err := s.Exchange(t.Context(), "code", "verifier", testNonce)
		require.NoError(t, err)
		assert.Equal(t, "noclaim@acme.com", u.Email)
		assert.NotEmpty(t, token)
		assert.False(t, u.IsSuperAdmin, "an unverified email never grants super admin")
	})

	for _, v := range []string{`true`, `"true"`} {
		t.Run("email_verified="+v+" is accepted", func(t *testing.T) {
			s := authExchangeService(t, users, `{"sub":"s3","email":"verified@acme.com","email_verified":`+v+`}`)
			_, _, err := s.Exchange(t.Context(), "code", "verifier", testNonce)
			require.NoError(t, err)
		})
	}
}

// withUserInfo points s at a stub /userinfo endpoint and counts its calls. It
// answers only the access token the stub token endpoint issues.
func withUserInfo(t *testing.T, s *AuthService, status int, body string) *int {
	t.Helper()
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Header.Get("Authorization") != "Bearer at" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	s.provider = (&oidc.ProviderConfig{UserInfoURL: srv.URL}).NewProvider(t.Context())
	return &calls
}

func TestExchangeEmailVerifiedFromUserInfo(t *testing.T) {
	users := repository.NewUserRepo(testutil.StartPostgres(t))
	tests := []struct {
		name      string
		idClaims  string
		status    int
		userInfo  string
		wantErr   string
		wantCalls int
	}{
		{
			name:     "missing in id_token, verified in userinfo",
			idClaims: `{"sub":"u1","email":"ui1@acme.com"}`,
			status:   http.StatusOK, userInfo: `{"sub":"u1","email":"ui1@acme.com","email_verified":true}`,
			wantCalls: 1,
		},
		{
			name:     "userinfo sends a string",
			idClaims: `{"sub":"u2","email":"ui2@acme.com"}`,
			status:   http.StatusOK, userInfo: `{"sub":"u2","email":"UI2@acme.com","email_verified":"true"}`,
			wantCalls: 1,
		},
		{
			name:     "userinfo says unverified",
			idClaims: `{"sub":"u3","email":"ui3@acme.com"}`,
			status:   http.StatusOK, userInfo: `{"sub":"u3","email":"ui3@acme.com","email_verified":false}`,
			wantErr: "email not verified", wantCalls: 1,
		},
		{
			name:     "userinfo omits the claim",
			idClaims: `{"sub":"u4","email":"ui4@acme.com"}`,
			status:   http.StatusOK, userInfo: `{"sub":"u4","email":"ui4@acme.com"}`,
			wantErr: "email not verified", wantCalls: 1,
		},
		{
			name:     "userinfo for another subject",
			idClaims: `{"sub":"u5","email":"ui5@acme.com"}`,
			status:   http.StatusOK, userInfo: `{"sub":"other","email":"ui5@acme.com","email_verified":true}`,
			wantErr: "email not verified", wantCalls: 1,
		},
		{
			name:     "userinfo verifies a different email",
			idClaims: `{"sub":"u6","email":"ui6@acme.com"}`,
			status:   http.StatusOK, userInfo: `{"sub":"u6","email":"other@acme.com","email_verified":true}`,
			wantErr: "email not verified", wantCalls: 1,
		},
		{
			name:     "userinfo fails",
			idClaims: `{"sub":"u7","email":"ui7@acme.com"}`,
			status:   http.StatusInternalServerError, userInfo: `{}`,
			wantErr: "email not verified", wantCalls: 1,
		},
		{
			name:     "explicit false in id_token is final",
			idClaims: `{"sub":"u8","email":"ui8@acme.com","email_verified":false}`,
			status:   http.StatusOK, userInfo: `{"sub":"u8","email":"ui8@acme.com","email_verified":true}`,
			wantErr: "email not verified", wantCalls: 0,
		},
		{
			name:     "explicit true in id_token skips userinfo",
			idClaims: `{"sub":"u9","email":"ui9@acme.com","email_verified":true}`,
			status:   http.StatusInternalServerError, userInfo: `{}`,
			wantCalls: 0,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := authExchangeService(t, users, tt.idClaims)
			calls := withUserInfo(t, s, tt.status, tt.userInfo)
			var claims struct {
				Email string `json:"email"`
			}
			require.NoError(t, json.Unmarshal([]byte(tt.idClaims), &claims))
			s.adminEmails = map[string]struct{}{claims.Email: {}}

			u, _, err := s.Exchange(t.Context(), "code", "verifier", testNonce)
			assert.Equal(t, tt.wantCalls, *calls)
			if tt.wantErr != "" {
				require.ErrorContains(t, err, tt.wantErr)
				return
			}
			require.NoError(t, err)
			assert.True(t, u.IsSuperAdmin, "a verified admin email grants super admin")
		})
	}
}

func TestExchangePKCEAndNonce(t *testing.T) {
	users := repository.NewUserRepo(testutil.StartPostgres(t))
	s := authExchangeService(t, users, `{"sub":"s4","email":"n@acme.com","email_verified":true,"nonce":"n1"}`)

	_, _, err := s.Exchange(t.Context(), "code", "wrong-verifier", "n1")
	require.ErrorContains(t, err, "invalid_grant", "token endpoint must receive the PKCE verifier")

	for _, missing := range []struct{ verifier, nonce string }{{"", "n1"}, {"verifier", ""}} {
		_, _, err = s.Exchange(t.Context(), "code", missing.verifier, missing.nonce)
		require.ErrorContains(t, err, "pkce verifier and nonce are required")
	}

	_, _, err = s.Exchange(t.Context(), "code", "verifier", "n2")
	require.ErrorContains(t, err, "nonce")

	_, _, err = s.Exchange(t.Context(), "code", "verifier", "n1")
	require.NoError(t, err)

	u, err := url.Parse(s.AuthURL("st", "verifier", "n1"))
	require.NoError(t, err)
	q := u.Query()
	assert.Equal(t, "S256", q.Get("code_challenge_method"))
	assert.Equal(t, oauth2.S256ChallengeFromVerifier("verifier"), q.Get("code_challenge"))
	assert.Equal(t, "n1", q.Get("nonce"))
}

func TestJoinDefaultCompany(t *testing.T) {
	db := testutil.StartPostgres(t)
	companies := repository.NewCompanyRepo(db)
	ctx := t.Context()
	mono := &AuthService{companies: companies}
	multi := &AuthService{companies: companies, cfg: config.Config{Server: config.ServerConfig{MultiCompany: true}}}

	first := testutil.SeedUser(t, db, "first@acme.com", "F", false)
	require.NoError(t, mono.joinDefaultCompany(ctx, first))
	assert.Nil(t, first.CompanyID, "no company yet: nothing to join")

	acme, err := companies.Create(ctx, "Acme", "")
	require.NoError(t, err)
	tests := []struct {
		name     string
		svc      *AuthService
		user     *model.User
		wantRole model.CompanyRole // "" means no company
	}{
		{"mono: member joins the company", mono, testutil.SeedUser(t, db, "bob@other.io", "B", false),
			model.CompanyRoleMember},
		{"mono: super admin joins as admin", mono, testutil.SeedUser(t, db, "root@other.io", "R", true),
			model.CompanyRoleAdmin},
		{"multi: never auto-joins", multi, testutil.SeedUser(t, db, "eve@acme.com", "E", false), ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.NoError(t, tt.svc.joinDefaultCompany(ctx, tt.user))
			if tt.wantRole == "" {
				assert.Nil(t, tt.user.CompanyID)
				return
			}
			require.NotNil(t, tt.user.CompanyID)
			assert.Equal(t, acme.ID, *tt.user.CompanyID)
			assert.Equal(t, tt.wantRole, *tt.user.CompanyRole)
		})
	}

	t.Run("errors are returned, not swallowed", func(t *testing.T) {
		cancelled, cancel := context.WithCancel(ctx)
		cancel()
		assert.ErrorIs(t, mono.joinDefaultCompany(cancelled, first), context.Canceled)
		ghost := &model.User{ID: "00000000-0000-0000-0000-000000000000"}
		assert.ErrorIs(t, mono.joinDefaultCompany(ctx, ghost), repository.ErrConflictOrNotFound)
	})
}

func TestExchangeJoinsCompany(t *testing.T) {
	db := testutil.StartPostgres(t)
	users := repository.NewUserRepo(db)
	acme := testutil.SeedCompany(t, db, "Acme")
	s := authExchangeService(t, users, `{"sub":"s5","email":"joiner@acme.com","email_verified":true}`)
	s.companies = repository.NewCompanyRepo(db)

	u, _, err := s.Exchange(t.Context(), "code", "verifier", testNonce)
	require.NoError(t, err)
	require.NotNil(t, u.CompanyID)
	assert.Equal(t, acme.ID, *u.CompanyID)
}

// TestAuthenticateRevocation: privileges come from the current user row and
// config, not the session, so a demotion or deletion applies to live sessions.
func TestAuthenticateRevocation(t *testing.T) {
	db := testutil.StartPostgres(t)
	users := repository.NewUserRepo(db)
	s := authServiceForJWT(strings.Repeat("x", 32), time.Hour)
	s.users = users
	s.adminEmails = map[string]struct{}{"root@acme.com": {}}
	ctx := t.Context()

	root := testutil.SeedUser(t, db, "root@acme.com", "Root", true)
	token, err := s.IssueJWT(root)
	require.NoError(t, err)
	c, err := s.Authenticate(ctx, token)
	require.NoError(t, err)
	assert.True(t, c.IsSuperAdmin)

	tests := []struct {
		name    string
		revoke  func(t *testing.T)
		wantErr bool
	}{
		{"removed from adminEmails", func(*testing.T) { s.adminEmails = map[string]struct{}{} }, false},
		{"super admin flag cleared", func(t *testing.T) {
			s.adminEmails = map[string]struct{}{"root@acme.com": {}}
			_, err := db.Pool.Exec(ctx, `UPDATE users SET is_super_admin = FALSE WHERE id = $1`, root.ID)
			require.NoError(t, err)
		}, false},
		{"email changed", func(t *testing.T) {
			_, err := db.Pool.Exec(ctx, `UPDATE users SET email = 'renamed@acme.com' WHERE id = $1`, root.ID)
			require.NoError(t, err)
		}, false},
		{"user deleted", func(t *testing.T) {
			_, err := db.Pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, root.ID)
			require.NoError(t, err)
		}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.revoke(t)
			c, err := s.Authenticate(ctx, token)
			if tt.wantErr {
				assert.ErrorIs(t, err, ErrUnauthenticated)
				return
			}
			require.NoError(t, err)
			assert.False(t, c.IsSuperAdmin)
			var email string
			require.NoError(t, db.Pool.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, root.ID).Scan(&email))
			assert.Equal(t, email, c.Email, "identity comes from the current row")
		})
	}

	_, err = s.Authenticate(ctx, "garbage")
	assert.ErrorIs(t, err, ErrUnauthenticated)
}

// Logout ends every session of the user (all devices, copied tokens
// included); a new login works again, and a stale token can't log it out.
func TestLogoutRevokesSessions(t *testing.T) {
	db := testutil.StartPostgres(t)
	users := repository.NewUserRepo(db)
	s := authServiceForJWT(strings.Repeat("x", 32), time.Hour)
	s.users = users
	ctx := t.Context()
	u := testutil.SeedUser(t, db, "u@acme.com", "U", false)
	issue := func() string {
		t.Helper()
		cur, err := users.GetByID(ctx, u.ID)
		require.NoError(t, err)
		tok, err := s.IssueJWT(cur)
		require.NoError(t, err)
		return tok
	}
	laptop, phone := issue(), issue()

	require.NoError(t, s.Logout(ctx, laptop))
	for _, tok := range []string{laptop, phone} {
		_, err := s.Authenticate(ctx, tok)
		assert.ErrorIs(t, err, ErrUnauthenticated)
		assert.ErrorContains(t, err, "session revoked")
	}

	fresh := issue()
	require.NoError(t, s.Logout(ctx, laptop), "a revoked token is a no-op")
	_, err := s.Authenticate(ctx, fresh)
	assert.NoError(t, err, "a stale token doesn't revoke the new session")
	assert.NoError(t, s.Logout(ctx, "garbage"))

	ctxDone, cancel := context.WithCancel(ctx)
	cancel()
	assert.ErrorIs(t, s.Logout(ctxDone, fresh), context.Canceled)
}

func TestNewAuthService(t *testing.T) {
	var issuer string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"issuer":"` + issuer + `","authorization_endpoint":"` + issuer + `/auth",` +
			`"token_endpoint":"` + issuer + `/token","jwks_uri":"` + issuer + `/keys"}`))
	}))
	t.Cleanup(srv.Close)
	issuer = srv.URL

	cfg := config.Config{
		OIDC: config.OIDCConfig{Issuer: issuer, ClientID: "cid", RedirectURL: "http://app/cb", Scopes: []string{"openid"}},
		Auth: config.AuthConfig{AdminEmails: []string{"Root@Acme.com"}},
	}
	s, err := NewAuthService(t.Context(), cfg, nil, nil)
	require.NoError(t, err)
	assert.True(t, s.isAdminEmail("root@acme.com"), "admin emails are case-insensitive")
	assert.True(t, strings.HasPrefix(s.AuthURL("st", "v", "n"), issuer+"/auth?"))

	cfg.OIDC.Issuer = "http://127.0.0.1:1"
	_, err = NewAuthService(t.Context(), cfg, nil, nil)
	assert.ErrorContains(t, err, "init oidc provider")
}

func TestRandomState(t *testing.T) {
	s := &AuthService{}
	a, b := s.RandomState(), s.RandomState()
	assert.Len(t, a, 26, "130 random bits, base32")
	assert.NotContains(t, a, ".", "safe inside the state.verifier.nonce cookie")
	assert.NotEqual(t, a, b)
}

func TestExchangeErrors(t *testing.T) {
	users := repository.NewUserRepo(testutil.StartPostgres(t))
	tests := []struct {
		name    string
		claims  string
		wantErr string
	}{
		{"email claim missing", `{"sub":"s6","email_verified":true}`, "email claim missing"},
		{"claims of the wrong type", `{"sub":"s8","email":42}`, "decode claims"},
		{"sub missing", `{"email":"nosub@acme.com","email_verified":true}`, repository.ErrMissingIdentity.Error()},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := authExchangeService(t, users, tt.claims)
			_, _, err := s.Exchange(t.Context(), "code", "verifier", testNonce)
			assert.ErrorContains(t, err, tt.wantErr)
			assert.ErrorIs(t, err, ErrLoginRejected, "an IdP-side problem, not a server failure")
		})
	}

	t.Run("token response without id_token", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"at","token_type":"Bearer"}`))
		}))
		t.Cleanup(srv.Close)
		s := &AuthService{oauth: &oauth2.Config{Endpoint: oauth2.Endpoint{TokenURL: srv.URL}}}
		_, _, err := s.Exchange(t.Context(), "code", "verifier", testNonce)
		assert.ErrorContains(t, err, "id_token missing")
	})

	t.Run("id_token fails verification", func(t *testing.T) {
		s := authExchangeService(t, users, `{"sub":"s7","email":"v@acme.com","email_verified":true}`)
		s.verifier = oidc.NewVerifier("https://issuer", nil, &oidc.Config{SkipClientIDCheck: true})
		_, _, err := s.Exchange(t.Context(), "code", "verifier", testNonce)
		assert.ErrorContains(t, err, "verify id_token")
	})
}
