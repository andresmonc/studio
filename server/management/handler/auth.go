package handler

import (
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"golang.org/x/oauth2"

	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
)

const stateCookie = "goff_mgmt_oidc_state"

type AuthHandler struct {
	cfg       config.Config
	auth      *service.AuthService
	users     *repository.UserRepo
	teams     *service.TeamService
	companies *service.CompanyService
}

func NewAuthHandler(cfg config.Config, auth *service.AuthService, users *repository.UserRepo, teams *service.TeamService, companies *service.CompanyService) *AuthHandler {
	return &AuthHandler{cfg: cfg, auth: auth, users: users, teams: teams, companies: companies}
}

// Login starts the OIDC login by redirecting the browser to the provider.
// A root route (GET /auth/login), not under /api/v1, so it is left out of the
// Swagger spec; see docs/reference/api.md.
func (h *AuthHandler) Login(c *echo.Context) error {
	state, err := h.auth.RandomState()
	if err != nil {
		c.Logger().Error("failed to generate state", "error", err)
		return internal(c, "failed to generate state")
	}
	nonce, err := h.auth.RandomState()
	if err != nil {
		c.Logger().Error("failed to generate nonce", "error", err)
		return internal(c, "failed to generate state")
	}
	verifier := oauth2.GenerateVerifier()
	// The cookie carries all three (base64url, so "." is a safe separator); only
	// state and the PKCE challenge travel through the provider redirect.
	c.SetCookie(&http.Cookie{
		Name:     stateCookie,
		Value:    state + "." + verifier + "." + nonce,
		Path:     "/",
		HttpOnly: true,
		Secure:   h.cfg.Auth.CookieSecure,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(10 * time.Minute),
	})
	return c.Redirect(http.StatusFound, h.auth.AuthURL(state, verifier, nonce))
}

// Callback is the OIDC redirect target (GET /auth/callback, a root route left
// out of the Swagger spec): it checks state, sets the session cookie and
// redirects to the webui.
func (h *AuthHandler) Callback(c *echo.Context) error {
	state := c.QueryParam("state")
	code := c.QueryParam("code")
	cookie, err := c.Cookie(stateCookie)
	if err != nil {
		return badRequest(c, "invalid state")
	}
	parts := strings.Split(cookie.Value, ".")
	if len(parts) != 3 || parts[0] == "" || parts[0] != state {
		return badRequest(c, "invalid state")
	}
	c.SetCookie(&http.Cookie{Name: stateCookie, Value: "", Path: "/", MaxAge: -1})
	_, jwtStr, err := h.auth.Exchange(c.Request().Context(), code, parts[1], parts[2])
	if err != nil {
		// Don't echo the cause: it can leak IdP or Postgres details.
		c.Logger().Error("oidc callback failed", "error", err)
		return badRequest(c, "login failed")
	}
	c.SetCookie(&http.Cookie{
		Name:     middleware.SessionCookieName,
		Value:    jwtStr,
		Path:     "/",
		HttpOnly: true,
		Secure:   h.cfg.Auth.CookieSecure,
		SameSite: http.SameSiteLaxMode,
		Domain:   h.cfg.Auth.CookieDomain,
		Expires:  time.Now().Add(h.cfg.Auth.SessionMaxAge),
	})
	dest := h.cfg.Auth.PostLoginRedirect
	if dest == "" {
		dest = "/"
	}
	return c.Redirect(http.StatusFound, dest)
}

// Logout godoc
// @Summary  Logout (clears the session cookie; no session required)
// @Tags     auth
// @Produce  json
// @Success  204 "No Content"
// @Router   /auth/logout [post]
func (h *AuthHandler) Logout(c *echo.Context) error {
	c.SetCookie(&http.Cookie{
		Name: middleware.SessionCookieName, Value: "", Path: "/", MaxAge: -1,
		Domain: h.cfg.Auth.CookieDomain, Secure: h.cfg.Auth.CookieSecure, HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	return noContent(c)
}

// Me godoc
// @Summary  Get current user + memberships
// @Tags     auth
// @Success  200 {object} model.APIResponse{data=model.MeResponse}
// @Router   /auth/me [get]
func (h *AuthHandler) Me(c *echo.Context) error {
	claims := middleware.MustClaims(c)
	u, err := h.users.GetByID(c.Request().Context(), claims.UserID)
	if err != nil {
		c.Logger().Error("failed to load user", "error", err)
		return internal(c, "failed to load user")
	}
	if u == nil {
		return notFound(c, "user not found")
	}
	mem, err := h.teams.Memberships(c.Request().Context(), claims.UserID)
	if err != nil {
		c.Logger().Error("failed to load membership", "error", err)
		return internal(c, "failed to load membership")
	}
	cm, err := h.companies.Membership(c.Request().Context(), claims.UserID)
	if err != nil {
		c.Logger().Error("failed to load company membership", "error", err)
		return internal(c, "failed to load company membership")
	}
	return ok(c, model.MeResponse{User: *u, Company: cm, Membership: mem})
}
