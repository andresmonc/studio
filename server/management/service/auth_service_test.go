package service

import (
	"encoding/base64"
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
	assert.True(t, claims.IsSuperAdmin)
	assert.Equal(t, "user-1", claims.Subject)
}

func TestParseJWTWrongSecret(t *testing.T) {
	issuer := authServiceForJWT(strings.Repeat("x", 32), time.Hour)
	token, err := issuer.IssueJWT(&model.User{ID: "u1"})
	require.NoError(t, err)

	verifier := authServiceForJWT(strings.Repeat("y", 32), time.Hour)
	_, err = verifier.ParseJWT(token)
	assert.Error(t, err, "token signed with a different secret must be rejected")
}

func TestParseJWTExpired(t *testing.T) {
	s := authServiceForJWT(strings.Repeat("x", 32), -time.Hour) // already expired
	token, err := s.IssueJWT(&model.User{ID: "u1"})
	require.NoError(t, err)

	_, err = s.ParseJWT(token)
	assert.Error(t, err, "expired token must be rejected")
}

func TestParseJWTMalformed(t *testing.T) {
	s := authServiceForJWT(strings.Repeat("x", 32), time.Hour)
	_, err := s.ParseJWT("not.a.valid.jwt")
	assert.Error(t, err)
}

// authExchangeService wires Exchange to a stub token endpoint returning an
// unsigned id_token with the given claims (signature check skipped). The stub
// rejects exchanges without the PKCE code_verifier.
func authExchangeService(t *testing.T, users *repository.UserRepo, idClaims string) *AuthService {
	t.Helper()
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
			_, _, err := s.Exchange(t.Context(), "code", "verifier", "")
			require.Error(t, err)
			u, err := users.GetByEmail(t.Context(), "unverified@acme.com")
			require.NoError(t, err)
			assert.Nil(t, u, "no account is created")
		})
	}

	t.Run("missing email_verified is rejected", func(t *testing.T) {
		s := authExchangeService(t, users, `{"sub":"s2","email":"noclaim@acme.com"}`)
		_, _, err := s.Exchange(t.Context(), "code", "verifier", "")
		require.Error(t, err)
	})

	t.Run("missing email_verified is accepted with AllowUnverifiedEmail", func(t *testing.T) {
		s := authExchangeService(t, users, `{"sub":"s2","email":"noclaim@acme.com"}`)
		s.cfg.Auth.AllowUnverifiedEmail = true
		u, token, err := s.Exchange(t.Context(), "code", "verifier", "")
		require.NoError(t, err)
		assert.Equal(t, "noclaim@acme.com", u.Email)
		assert.NotEmpty(t, token)
	})

	for _, v := range []string{`true`, `"true"`} {
		t.Run("email_verified="+v+" is accepted", func(t *testing.T) {
			s := authExchangeService(t, users, `{"sub":"s3","email":"verified@acme.com","email_verified":`+v+`}`)
			_, _, err := s.Exchange(t.Context(), "code", "verifier", "")
			require.NoError(t, err)
		})
	}
}

func TestExchangePKCEAndNonce(t *testing.T) {
	users := repository.NewUserRepo(testutil.StartPostgres(t))
	s := authExchangeService(t, users, `{"sub":"s4","email":"n@acme.com","email_verified":true,"nonce":"n1"}`)

	_, _, err := s.Exchange(t.Context(), "code", "wrong-verifier", "n1")
	require.Error(t, err, "token endpoint must receive the PKCE verifier")

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

func TestCompanyToJoin(t *testing.T) {
	db := testutil.StartPostgres(t)
	companies := repository.NewCompanyRepo(db)
	ctx := t.Context()
	member := &model.User{Email: "bob@other.io"}
	admin := &model.User{Email: "root@other.io", IsSuperAdmin: true}

	mono := &AuthService{companies: companies}
	c, _ := mono.companyToJoin(ctx, member)
	assert.Nil(t, c, "no company yet")

	acme, err := companies.Create(ctx, "Acme", new("acme.com"), "")
	require.NoError(t, err)
	c, role := mono.companyToJoin(ctx, member)
	require.NotNil(t, c)
	assert.Equal(t, acme.ID, c.ID)
	assert.Equal(t, model.CompanyRoleMember, role)
	_, role = mono.companyToJoin(ctx, admin)
	assert.Equal(t, model.CompanyRoleAdmin, role)

	multi := &AuthService{companies: companies, cfg: config.Config{Server: config.ServerConfig{MultiCompany: true}}}
	c, _ = multi.companyToJoin(ctx, member)
	assert.Nil(t, c, "multi: domain does not match")
	c, role = multi.companyToJoin(ctx, &model.User{Email: "eve@acme.com"})
	require.NotNil(t, c)
	assert.Equal(t, model.CompanyRoleMember, role)
}
