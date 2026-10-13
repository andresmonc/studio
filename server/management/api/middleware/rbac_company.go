package middleware

import (
	"net/http"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
)

// RequireCompanyRole gates routes that have :companyId in path.
func RequireCompanyRole(companies *service.CompanyService, paramName string, min model.CompanyRole) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			claims := MustClaims(c)
			if claims == nil {
				return c.JSON(http.StatusUnauthorized, model.APIResponse{Message: "unauthenticated"})
			}
			if claims.IsSuperAdmin {
				return next(c)
			}
			companyID := c.Param(paramName)
			if companyID == "" {
				return c.JSON(http.StatusBadRequest, model.APIResponse{Message: "missing company id"})
			}
			role, err := companies.Role(c.Request().Context(), companyID, claims.UserID)
			if err != nil {
				return serverError(c, err, "failed to load company membership")
			}
			if role == "" || !role.AtLeast(min) {
				return c.JSON(http.StatusForbidden, model.APIResponse{Message: "insufficient company role"})
			}
			return next(c)
		}
	}
}
