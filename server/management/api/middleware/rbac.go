package middleware

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
)

// denial is why a gate refused a request; nil means allowed.
type denial struct {
	status int
	msg    string
}

// denyRole answers both "no role" and "no such flagset/flag": telling them
// apart would let anyone probe which ids exist in other tenants. Super admins
// skip the gate and get the handler's real 404. A malformed id is denied before
// any lookup: the API answers it with 404 earlier (ValidIDs), but a gate must
// never turn client input into a 500.
var denyRole = &denial{http.StatusForbidden, "insufficient role"}

// gate is the shape every RBAC middleware shares: 401 without a session, a
// super admin always passes, and otherwise check decides for the caller.
func gate(check func(c *echo.Context, userID string) *denial) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			claims := ClaimsFrom(c)
			if claims == nil {
				return unauth(c)
			}
			if claims.IsSuperAdmin {
				return next(c)
			}
			if d := check(c, claims.UserID); d != nil {
				return c.JSON(d.status, model.APIResponse{Message: d.msg})
			}
			return next(c)
		}
	}
}

// RequireSuperAdmin lets only super admins through.
func RequireSuperAdmin() echo.MiddlewareFunc {
	return gate(func(*echo.Context, string) *denial {
		return &denial{http.StatusForbidden, "super admin required"}
	})
}

// RequireTeamRole gates routes whose paramName path param is a team id. An
// empty or unknown id is a 403 like a missing role (as in every gate below).
func RequireTeamRole(teams *service.TeamService, paramName string, minRole model.Role) echo.MiddlewareFunc {
	return gate(func(c *echo.Context, userID string) *denial {
		id := c.Param(paramName)
		if !IsUUID(id) {
			return denyRole
		}
		return teamRole(c, teams, id, userID, minRole)
	})
}

// RequireCompanyRole gates routes whose paramName path param is a company id.
func RequireCompanyRole(
	companies *service.CompanyService, paramName string, minRole model.CompanyRole,
) echo.MiddlewareFunc {
	return gate(func(c *echo.Context, userID string) *denial {
		id := c.Param(paramName)
		if !IsUUID(id) {
			return &denial{http.StatusForbidden, "insufficient company role"}
		}
		role, err := companies.Role(c.Request().Context(), id, userID)
		if err != nil {
			return serverError(c, err, "failed to load company membership")
		}
		// AtLeast denies the empty (no) role.
		if !role.AtLeast(minRole) {
			return &denial{http.StatusForbidden, "insufficient company role"}
		}
		return nil
	})
}

// RequireFlagsetRole resolves the team owning the flagset (path param
// paramName) and checks the caller's role on it.
func RequireFlagsetRole(
	teams *service.TeamService, flagsets *service.FlagsetService, paramName string, minRole model.Role,
) echo.MiddlewareFunc {
	return gate(func(c *echo.Context, userID string) *denial {
		return resourceRole(c, teams, flagsets.TeamID, c.Param(paramName), userID, minRole)
	})
}

// RequireFlagRole resolves the team owning the flag (path param paramName) and
// checks the caller's role on it.
func RequireFlagRole(
	teams *service.TeamService, flags *service.FlagService, paramName string, minRole model.Role,
) echo.MiddlewareFunc {
	return gate(func(c *echo.Context, userID string) *denial {
		return resourceRole(c, teams, flags.TeamID, c.Param(paramName), userID, minRole)
	})
}

// resourceRole checks the caller's role on the team owning a flagset or flag,
// resolved by teamOf in one query. A missing resource is denied like a missing
// role.
func resourceRole(
	c *echo.Context, teams *service.TeamService, teamOf func(context.Context, string) (string, error),
	id, userID string, minRole model.Role,
) *denial {
	if !IsUUID(id) {
		return denyRole
	}
	teamID, err := teamOf(c.Request().Context(), id)
	if errors.Is(err, service.ErrNotFound) {
		return denyRole
	}
	if err != nil {
		return serverError(c, err, "failed to load resource")
	}
	return teamRole(c, teams, teamID, userID, minRole)
}

func teamRole(c *echo.Context, teams *service.TeamService, teamID, userID string, minRole model.Role) *denial {
	role, err := teams.Role(c.Request().Context(), teamID, userID)
	if err != nil {
		return serverError(c, err, "failed to load membership")
	}
	// AtLeast denies the empty (no) role.
	if !role.AtLeast(minRole) {
		return denyRole
	}
	return nil
}

// serverError logs a failed RBAC lookup (unless the client went away) and
// denies with a 500.
func serverError(c *echo.Context, err error, msg string) *denial {
	if !errors.Is(err, context.Canceled) {
		slog.ErrorContext(c.Request().Context(), msg, "error", err)
	}
	return &denial{http.StatusInternalServerError, msg}
}
