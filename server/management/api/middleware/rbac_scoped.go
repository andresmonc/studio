package middleware

import (
	"errors"
	"net/http"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
)

// RequireFlagsetRole resolves the team owning a flagset (param `paramName`) and checks role.
func RequireFlagsetRole(teams *service.TeamService, flagsets *service.FlagsetService, paramName string, min model.Role) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			claims := MustClaims(c)
			if claims == nil {
				return c.JSON(http.StatusUnauthorized, model.APIResponse{Message: "unauthenticated"})
			}
			if claims.IsSuperAdmin {
				return next(c)
			}
			id := c.Param(paramName)
			fs, err := flagsets.Get(c.Request().Context(), id)
			if err != nil {
				return serverError(c, err, "failed to load flagset")
			}
			if fs == nil {
				return c.JSON(http.StatusNotFound, model.APIResponse{Message: "flagset not found"})
			}
			role, err := teams.Role(c.Request().Context(), fs.TeamID, claims.UserID)
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

// RequireFlagRole resolves flag → flagset → team.
func RequireFlagRole(teams *service.TeamService, flagsets *service.FlagsetService, flags *service.FlagService, paramName string, min model.Role) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			claims := MustClaims(c)
			if claims == nil {
				return c.JSON(http.StatusUnauthorized, model.APIResponse{Message: "unauthenticated"})
			}
			if claims.IsSuperAdmin {
				return next(c)
			}
			flagID := c.Param(paramName)
			fsID, err := flags.FlagsetID(c.Request().Context(), flagID)
			if errors.Is(err, repository.ErrNotFound) {
				return c.JSON(http.StatusNotFound, model.APIResponse{Message: "flag not found"})
			}
			if err != nil {
				return serverError(c, err, "failed to load flag")
			}
			fs, err := flagsets.Get(c.Request().Context(), fsID)
			if err != nil {
				return serverError(c, err, "failed to load flagset")
			}
			if fs == nil {
				return c.JSON(http.StatusNotFound, model.APIResponse{Message: "flagset not found"})
			}
			role, err := teams.Role(c.Request().Context(), fs.TeamID, claims.UserID)
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
