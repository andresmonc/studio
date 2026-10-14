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

const (
	SessionCookieName = "goff_mgmt_session"
	// ContextClaimsKey is namespaced so no other middleware overwrites it.
	ContextClaimsKey = "goff_mgmt.claims"
)

func RequireAuth(auth *service.AuthService) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			cookie, err := c.Cookie(SessionCookieName)
			if err != nil || cookie.Value == "" {
				return unauth(c)
			}
			// ponytail: one PK lookup per request; add a short TTL cache if it shows in profiles.
			claims, err := auth.Authenticate(c.Request().Context(), cookie.Value)
			if errors.Is(err, service.ErrUnauthenticated) {
				return unauth(c)
			}
			// Anything else (DB outage, timeout) is ours: a 401 would make the
			// UI log the user out for a server failure.
			if err != nil {
				// A client that went away isn't a server failure worth an error log.
				if !errors.Is(err, context.Canceled) {
					slog.ErrorContext(c.Request().Context(), "authenticate session", "error", err)
				}
				return c.JSON(http.StatusInternalServerError, model.APIResponse{Message: "failed to authenticate"})
			}
			c.Set(ContextClaimsKey, claims)
			return next(c)
		}
	}
}

// MustClaims returns the claims RequireAuth stored. It panics on a route
// registered without RequireAuth, so that misconfiguration fails closed (500
// via Recover) instead of a handler acting with no caller.
func MustClaims(c *echo.Context) *service.Claims {
	claims := ClaimsFrom(c)
	if claims == nil {
		panic("middleware.MustClaims: no claims, route is missing RequireAuth")
	}
	return claims
}

// ClaimsFrom returns the claims RequireAuth stored, or nil on an
// unauthenticated route (for logging and telemetry).
func ClaimsFrom(c *echo.Context) *service.Claims {
	v, _ := c.Get(ContextClaimsKey).(*service.Claims)
	return v
}

func unauth(c *echo.Context) error {
	return c.JSON(http.StatusUnauthorized, model.APIResponse{Message: "unauthenticated"})
}
