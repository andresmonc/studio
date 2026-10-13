package middleware

import (
	"net/http"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
)

const (
	SessionCookieName = "goff_mgmt_session"
	ContextClaimsKey  = "claims"
)

func RequireAuth(auth *service.AuthService) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			cookie, err := c.Cookie(SessionCookieName)
			if err != nil || cookie.Value == "" {
				return unauth(c)
			}
			claims, err := auth.ParseJWT(cookie.Value)
			if err != nil {
				return unauth(c)
			}
			c.Set(ContextClaimsKey, claims)
			return next(c)
		}
	}
}

func MustClaims(c *echo.Context) *service.Claims {
	v, _ := c.Get(ContextClaimsKey).(*service.Claims)
	return v
}

func unauth(c *echo.Context) error {
	return c.JSON(http.StatusUnauthorized, model.APIResponse{Message: "unauthenticated"})
}
