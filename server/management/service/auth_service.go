package service

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/oauth2"
)

type AuthService struct {
	cfg         config.Config
	users       *repository.UserRepo
	companies   *repository.CompanyRepo
	oauth       *oauth2.Config
	provider    *oidc.Provider
	verifier    *oidc.IDTokenVerifier
	adminEmails map[string]struct{}
}

func NewAuthService(
	ctx context.Context, cfg config.Config, users *repository.UserRepo, companies *repository.CompanyRepo,
) (*AuthService, error) {
	provider, err := oidc.NewProvider(ctx, cfg.OIDC.Issuer)
	if err != nil {
		return nil, fmt.Errorf("init oidc provider: %w", err)
	}
	o := &oauth2.Config{
		ClientID:     cfg.OIDC.ClientID,
		ClientSecret: cfg.OIDC.ClientSecret,
		Endpoint:     provider.Endpoint(),
		RedirectURL:  cfg.OIDC.RedirectURL,
		Scopes:       cfg.OIDC.Scopes,
	}
	v := provider.Verifier(&oidc.Config{ClientID: cfg.OIDC.ClientID})
	adm := make(map[string]struct{}, len(cfg.Auth.AdminEmails))
	for _, e := range cfg.Auth.AdminEmails {
		adm[strings.ToLower(e)] = struct{}{}
	}
	return &AuthService{
		cfg: cfg, users: users, companies: companies, oauth: o, provider: provider, verifier: v, adminEmails: adm,
	}, nil
}

// AuthURL builds the provider redirect. verifier (PKCE, RFC 7636) and nonce
// (OIDC Core) bind the returned code and ID token to this browser's login;
// both are standard, and an IdP without PKCE support ignores the parameters.
func (s *AuthService) AuthURL(state, verifier, nonce string) string {
	return s.oauth.AuthCodeURL(state, oauth2.S256ChallengeOption(verifier), oidc.Nonce(nonce))
}

// RandomState returns a random OAuth state or nonce value (crypto/rand.Text:
// 26 base32 chars, 130 bits; it can't fail and contains no "."). Use
// oauth2.GenerateVerifier for the PKCE verifier (RFC 7636 wants 43-128 chars).
func (s *AuthService) RandomState() string {
	return rand.Text()
}

type Claims struct {
	UserID string `json:"uid"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	// IsSuperAdmin is never read from the token: Authenticate derives it from
	// the current DB row and adminEmails config on every request, so a
	// demotion takes effect immediately instead of when the session expires.
	IsSuperAdmin bool `json:"-"`
	// SessionVersion must match the user's: logout bumps it, revoking every
	// session issued before, copied tokens included.
	SessionVersion int `json:"sv"`
	jwt.RegisteredClaims
}

func (s *AuthService) isAdminEmail(email string) bool {
	_, ok := s.adminEmails[strings.ToLower(email)]
	return ok
}

// ErrLoginRejected wraps an OIDC login the IdP side refused or got wrong
// (code, ID token, nonce, email): a client error, unlike a database failure
// during the same login.
var ErrLoginRejected = errors.New("login rejected")

func rejected(reason string) error { return fmt.Errorf("%w: %s", ErrLoginRejected, reason) }

// ErrUnauthenticated means the session is invalid, expired, or belongs to a
// user who no longer exists.
var ErrUnauthenticated = errors.New("unauthenticated")

// Authenticate validates a session token and resolves the caller from the
// current user row: identity and privileges, so a demotion or an email change
// applies to live sessions. A deleted user is rejected.
func (s *AuthService) Authenticate(ctx context.Context, token string) (*Claims, error) {
	c, err := s.ParseJWT(token)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrUnauthenticated, err)
	}
	u, err := s.users.GetByID(ctx, c.UserID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, fmt.Errorf("%w: user not found", ErrUnauthenticated)
	}
	if err != nil {
		return nil, err
	}
	if c.SessionVersion != u.SessionVersion {
		return nil, fmt.Errorf("%w: session revoked", ErrUnauthenticated)
	}
	c.Email, c.Name = u.Email, u.Name
	c.IsSuperAdmin = u.IsSuperAdmin && s.isAdminEmail(u.Email)
	return c, nil
}

// Logout revokes every session of the token's user. An invalid, expired or
// already revoked token has nothing left to revoke.
func (s *AuthService) Logout(ctx context.Context, token string) error {
	if c, err := s.ParseJWT(token); err == nil {
		return s.users.RevokeSessions(ctx, c.UserID, c.SessionVersion)
	}
	return nil
}

// Exchange completes the login: it redeems the code with the PKCE verifier,
// checks the ID token and its nonce, and upserts the user. verifier and nonce
// are required; an empty one would silently disable that protection. A login
// the IdP side refused or got wrong is ErrLoginRejected; anything else is a
// server failure.
func (s *AuthService) Exchange(ctx context.Context, code, verifier, nonce string) (*model.User, string, error) {
	if verifier == "" || nonce == "" {
		return nil, "", rejected("pkce verifier and nonce are required")
	}
	tok, err := s.oauth.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return nil, "", fmt.Errorf("%w: oauth exchange: %w", ErrLoginRejected, err)
	}
	rawID, ok := tok.Extra("id_token").(string)
	if !ok || rawID == "" {
		return nil, "", rejected("id_token missing from token response")
	}
	idt, err := s.verifier.Verify(ctx, rawID)
	if err != nil {
		return nil, "", fmt.Errorf("%w: verify id_token: %w", ErrLoginRejected, err)
	}
	if idt.Nonce != nonce {
		return nil, "", rejected("id_token nonce mismatch")
	}
	var claims struct {
		Email         string `json:"email"`
		EmailVerified any    `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
		Sub           string `json:"sub"`
	}
	if err := idt.Claims(&claims); err != nil {
		return nil, "", fmt.Errorf("%w: decode claims: %w", ErrLoginRejected, err)
	}
	if claims.Email == "" {
		return nil, "", rejected("email claim missing")
	}
	// Require an explicit `true`, from the ID token or /userinfo, unless the
	// operator opted out. `any` because some IdPs (AWS Cognito) send a string.
	verified := s.emailVerified(ctx, tok, claims.EmailVerified, claims.Sub, claims.Email)
	if !verified && !s.cfg.Auth.AllowUnverifiedEmail {
		return nil, "", rejected("email not verified")
	}

	// Super admin only from a verified email: with AllowUnverifiedEmail, anyone
	// able to set their email at the IdP could otherwise claim an admin one.
	u, err := s.users.UpsertFromOIDC(ctx, repository.OIDCLogin{
		Email: claims.Email, Name: claims.Name, AvatarURL: claims.Picture, Sub: claims.Sub,
		SuperAdmin: verified && s.isAdminEmail(claims.Email),
	})
	if errors.Is(err, repository.ErrMissingIdentity) {
		return nil, "", fmt.Errorf("%w: %w", ErrLoginRejected, err)
	}
	if err != nil {
		return nil, "", err
	}

	if u.CompanyID == nil && s.companies != nil {
		// Failing the login beats issuing a session without the company: the
		// join is only attempted here, so a later request wouldn't retry it.
		if err := s.joinDefaultCompany(ctx, u); err != nil {
			return nil, "", fmt.Errorf("join company: %w", err)
		}
	}

	signed, err := s.IssueJWT(u)
	if err != nil {
		return nil, "", err
	}
	return u, signed, nil
}

// emailVerified reads email_verified from the ID token, falling back to /userinfo when the token omits it.
func (s *AuthService) emailVerified(ctx context.Context, tok *oauth2.Token, claim any, sub, email string) bool {
	if claim != nil || s.provider == nil || s.provider.UserInfoEndpoint() == "" {
		return claim == true || claim == "true"
	}
	info, err := s.provider.UserInfo(ctx, oauth2.StaticTokenSource(tok))
	if err != nil {
		slog.WarnContext(ctx, "userinfo lookup failed", "error", err)
		return false
	}
	// OIDC Core 5.3.2: a userinfo sub that differs from the ID token's must not be used.
	return info.Subject == sub && strings.EqualFold(info.Email, email) && info.EmailVerified
}

// joinDefaultCompany attaches a user without a company to the one they join on
// login, and updates u. Mono company mode: the single company, if it exists
// (super admins as admin). Multi company mode: none, a company admin adds
// users by email.
func (s *AuthService) joinDefaultCompany(ctx context.Context, u *model.User) error {
	if s.cfg.Server.MultiCompany {
		return nil
	}
	c, err := s.companies.First(ctx)
	if err != nil || c == nil {
		return err
	}
	role := model.CompanyRoleMember
	if u.IsSuperAdmin {
		role = model.CompanyRoleAdmin
	}
	m, _, err := s.companies.SetMember(ctx, c.ID, u.ID, role)
	if err != nil {
		return err
	}
	u.CompanyID, u.CompanyRole = &m.CompanyID, &m.Role
	return nil
}

func (s *AuthService) IssueJWT(u *model.User) (string, error) {
	now := time.Now()
	c := Claims{
		UserID:         u.ID,
		Email:          u.Email,
		Name:           u.Name,
		SessionVersion: u.SessionVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.Auth.SessionMaxAge)),
			Subject:   u.ID,
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, c)
	return tok.SignedString([]byte(s.cfg.Auth.JWTSecret))
}

func (s *AuthService) ParseJWT(token string) (*Claims, error) {
	c := &Claims{}
	_, err := jwt.ParseWithClaims(token, c, func(*jwt.Token) (any, error) {
		return []byte(s.cfg.Auth.JWTSecret), nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil {
		return nil, err
	}
	return c, nil
}
