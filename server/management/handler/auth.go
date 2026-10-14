package handler

import (
	"crypto/subtle"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
	"golang.org/x/oauth2"
)

const stateCookie = "goff_mgmt_oidc_state"

// AuthHandler serves the OIDC login, logout and the current user.
type AuthHandler struct {
	cfg       config.Config
	auth      *service.AuthService
	users     *repository.UserRepo
	teams     *service.TeamService
	companies *service.CompanyService
}

func NewAuthHandler(
	cfg config.Config, auth *service.AuthService, users *repository.UserRepo, teams *service.TeamService,
	companies *service.CompanyService,
) *AuthHandler {
	return &AuthHandler{cfg: cfg, auth: auth, users: users, teams: teams, companies: companies}
}

// Login starts the OIDC login by redirecting the browser to the provider.
// A root route (GET /auth/login), not under /api/v1, so it is left out of the
// Swagger spec; see docs/reference/api.md.
func (h *AuthHandler) Login(c *echo.Context) error {
	state, nonce, verifier := h.auth.RandomState(), h.auth.RandomState(), oauth2.GenerateVerifier()
	// The cookie carries all three (none contains a "."); only
	// state and the PKCE challenge travel through the provider redirect.
	ck := h.cookie(stateCookie, state+"."+verifier+"."+nonce) //nolint:gosec // Secure: see cookie()
	ck.Domain, ck.MaxAge = "", int((10 * time.Minute).Seconds())
	c.SetCookie(ck)
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
	if len(parts) != 3 || parts[0] == "" || subtle.ConstantTimeCompare([]byte(parts[0]), []byte(state)) != 1 {
		return badRequest(c, "invalid state")
	}
	cleared := h.cookie(stateCookie, "") //nolint:gosec // Secure: see cookie()
	cleared.Domain, cleared.MaxAge = "", -1
	c.SetCookie(cleared)
	// The IdP sends ?error=… (e.g. access_denied) instead of a code.
	if idpErr := c.QueryParam("error"); idpErr != "" || code == "" {
		slog.WarnContext(c.Request().Context(), "oidc callback without code", "error", idpErr)
		return badRequest(c, "login failed")
	}
	_, jwtStr, err := h.auth.Exchange(c.Request().Context(), code, parts[1], parts[2])
	if err != nil {
		// Don't echo the cause: it can leak IdP or Postgres details.
		slog.ErrorContext(c.Request().Context(), "oidc callback failed", "error", err)
		if errors.Is(err, service.ErrLoginRejected) {
			return badRequest(c, "login failed")
		}
		return internal(c, "login failed")
	}
	session := h.cookie(middleware.SessionCookieName, jwtStr) //nolint:gosec // Secure: see cookie()
	// MaxAge, unlike Expires, doesn't depend on the browser's clock.
	session.MaxAge = int(h.cfg.Auth.SessionMaxAge.Seconds())
	c.SetCookie(session)
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
	session := h.cookie(middleware.SessionCookieName, "") //nolint:gosec // Secure: see cookie()
	session.MaxAge = -1
	c.SetCookie(session)
	return noContent(c)
}

// cookie builds an auth cookie with the shared attributes: HttpOnly, SameSite
// Lax, on the configured domain, and Secure unless auth.cookieSecure turns it
// off for local http development (G124 can't see that it defaults to true).
func (h *AuthHandler) cookie(name, value string) *http.Cookie {
	return &http.Cookie{ //nolint:gosec // Secure follows auth.cookieSecure, true by default
		Name: name, Value: value, Path: "/", Domain: h.cfg.Auth.CookieDomain,
		HttpOnly: true, Secure: h.cfg.Auth.CookieSecure, SameSite: http.SameSiteLaxMode,
	}
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
		slog.ErrorContext(c.Request().Context(), "failed to load user", "error", err)
		return internal(c, "failed to load user")
	}
	if u == nil {
		return notFound(c, "user not found")
	}
	// The stored flag isn't updated until the next login; the session's value
	// also checks adminEmails.
	u.IsSuperAdmin = claims.IsSuperAdmin
	mem, err := h.teams.Memberships(c.Request().Context(), claims.UserID)
	if err != nil {
		slog.ErrorContext(c.Request().Context(), "failed to load membership", "error", err)
		return internal(c, "failed to load membership")
	}
	cm, err := h.companies.Membership(c.Request().Context(), claims.UserID)
	if err != nil {
		slog.ErrorContext(c.Request().Context(), "failed to load company membership", "error", err)
		return internal(c, "failed to load company membership")
	}
	return ok(c, model.MeResponse{User: *u, Company: cm, Membership: mem})
}
