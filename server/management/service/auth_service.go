package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
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
	verifier    *oidc.IDTokenVerifier
	adminEmails map[string]struct{}
}

func NewAuthService(ctx context.Context, cfg config.Config, users *repository.UserRepo, companies *repository.CompanyRepo) (*AuthService, error) {
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
		adm[strings.ToLower(strings.TrimSpace(e))] = struct{}{}
	}
	return &AuthService{cfg: cfg, users: users, companies: companies, oauth: o, verifier: v, adminEmails: adm}, nil
}

// AuthURL builds the provider redirect. verifier (PKCE, RFC 7636) and nonce
// (OIDC Core) bind the returned code and ID token to this browser's login;
// both are standard, and an IdP without PKCE support ignores the parameters.
func (s *AuthService) AuthURL(state, verifier, nonce string) string {
	return s.oauth.AuthCodeURL(state, oauth2.S256ChallengeOption(verifier), oidc.Nonce(nonce))
}

func (s *AuthService) RandomState() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

type Claims struct {
	UserID       string `json:"uid"`
	Email        string `json:"email"`
	Name         string `json:"name"`
	IsSuperAdmin bool   `json:"sa"`
	jwt.RegisteredClaims
}

func (s *AuthService) Exchange(ctx context.Context, code, verifier, nonce string) (*model.User, string, error) {
	tok, err := s.oauth.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return nil, "", fmt.Errorf("oauth exchange: %w", err)
	}
	rawID, ok := tok.Extra("id_token").(string)
	if !ok || rawID == "" {
		return nil, "", errors.New("id_token missing from token response")
	}
	idt, err := s.verifier.Verify(ctx, rawID)
	if err != nil {
		return nil, "", fmt.Errorf("verify id_token: %w", err)
	}
	if idt.Nonce != nonce {
		return nil, "", errors.New("id_token nonce mismatch")
	}
	var claims struct {
		Email         string `json:"email"`
		EmailVerified any    `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
		Sub           string `json:"sub"`
	}
	if err := idt.Claims(&claims); err != nil {
		return nil, "", fmt.Errorf("decode claims: %w", err)
	}
	if claims.Email == "" {
		return nil, "", errors.New("email claim missing")
	}
	// Require an explicit `true` (missing counts as unverified) unless the
	// operator opted out. `any` because some IdPs (AWS Cognito) send a string.
	if v := claims.EmailVerified; v != true && v != "true" && !s.cfg.Auth.AllowUnverifiedEmail {
		return nil, "", errors.New("email not verified")
	}

	_, isAdmin := s.adminEmails[strings.ToLower(claims.Email)]

	u, err := s.users.UpsertFromOIDC(ctx, claims.Email, claims.Name, claims.Picture, claims.Sub, isAdmin)
	if err != nil {
		return nil, "", err
	}

	if u.CompanyID == nil && s.companies != nil {
		if c, role := s.companyToJoin(ctx, u); c != nil {
			if serr := s.companies.SetMember(ctx, c.ID, u.ID, role); serr == nil {
				if refreshed, gerr := s.users.GetByID(ctx, u.ID); gerr == nil && refreshed != nil {
					u = refreshed
				}
			}
		}
	}

	signed, err := s.IssueJWT(u)
	if err != nil {
		return nil, "", err
	}
	return u, signed, nil
}

// companyToJoin picks the company a user without one is attached to on login.
// Mono company mode: the single company (super admins as admin). Otherwise:
// the company whose `domain` matches the email's domain, as member.
func (s *AuthService) companyToJoin(ctx context.Context, u *model.User) (*model.Company, model.CompanyRole) {
	if !s.cfg.Server.MultiCompany {
		c, err := s.companies.First(ctx)
		if err != nil || c == nil {
			return nil, ""
		}
		if u.IsSuperAdmin {
			return c, model.CompanyRoleAdmin
		}
		return c, model.CompanyRoleMember
	}
	at := strings.LastIndex(u.Email, "@")
	if at < 0 || at == len(u.Email)-1 {
		return nil, ""
	}
	c, err := s.companies.FindByDomain(ctx, strings.ToLower(u.Email[at+1:]))
	if err != nil || c == nil {
		return nil, ""
	}
	return c, model.CompanyRoleMember
}

func (s *AuthService) IssueJWT(u *model.User) (string, error) {
	now := time.Now()
	c := Claims{
		UserID:       u.ID,
		Email:        u.Email,
		Name:         u.Name,
		IsSuperAdmin: u.IsSuperAdmin,
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
	_, err := jwt.ParseWithClaims(token, c, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(s.cfg.Auth.JWTSecret), nil
	})
	if err != nil {
		return nil, err
	}
	return c, nil
}
