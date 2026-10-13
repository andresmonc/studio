package middleware

import (
	"net/http"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
)

func RequireSuperAdmin() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			claims := MustClaims(c)
			if claims == nil || !claims.IsSuperAdmin {
				return c.JSON(http.StatusForbidden, model.APIResponse{Message: "super admin required"})
			}
			return next(c)
		}
	}
}

// RequireTeamRole gates routes that have :teamId or :id (interpreted as team) in path.
// paramName is the path-param holding the team id.
func RequireTeamRole(teams *service.TeamService, paramName string, min model.Role) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			claims := MustClaims(c)
			if claims == nil {
				return c.JSON(http.StatusUnauthorized, model.APIResponse{Message: "unauthenticated"})
			}
			if claims.IsSuperAdmin {
				return next(c)
			}
			teamID := c.Param(paramName)
			if teamID == "" {
				return c.JSON(http.StatusBadRequest, model.APIResponse{Message: "missing team id"})
			}
			role, err := teams.Role(c.Request().Context(), teamID, claims.UserID)
			if err != nil {
				return serverError(c, err, "failed to load membership")
			}
			if role == "" || !role.AtLeast(min) {
				return c.JSON(http.StatusForbidden, model.APIResponse{Message: "insufficient role"})
			}
			return next(c)
		}
	}
}

// serverError logs a failed RBAC lookup and answers 500 with msg.
func serverError(c *echo.Context, err error, msg string) error {
	c.Logger().Error(msg, "error", err)
	return c.JSON(http.StatusInternalServerError, model.APIResponse{Message: msg})
}
