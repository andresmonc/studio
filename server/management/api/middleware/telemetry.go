package middleware

import (
	"github.com/labstack/echo/v5"
	semconv "go.opentelemetry.io/otel/semconv/v1.40.0"
	"go.opentelemetry.io/otel/trace"
)

// RouteTelemetry hands the matched echo route to the otelhttp handler that
// wraps the server: otelhttp names the span "{method} {route}" and tags the
// metrics with http.route from Request.Pattern, which echo never sets. Must be
// registered before any middleware that replaces the request (ContextTimeout),
// so the Pattern lands on the request otelhttp holds.
func RouteTelemetry() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			req := c.Request()
			span := trace.SpanFromContext(req.Context())
			if p := c.Path(); p != "" {
				req.Pattern = p
				// otelhttp reads Pattern for the span name and metrics, but only at
				// span start for span attributes.
				span.SetAttributes(semconv.HTTPRoute(p))
			}
			err := next(c)
			// Claims are set by RequireAuth, deeper in the chain.
			if claims := ClaimsFrom(c); claims != nil {
				span.SetAttributes(semconv.EnduserID(claims.UserID))
			}
			return err
		}
	}
}
