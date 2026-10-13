package middleware

import (
	"log/slog"
	"time"

	"github.com/labstack/echo/v5"
	"go.opentelemetry.io/otel/trace"
)

func RequestLogger(log *slog.Logger) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			start := time.Now()
			err := next(c)
			if err != nil {
				// Write the error response now so the status below is the real one.
				// echo's own second call is a no-op on the committed response.
				c.Echo().HTTPErrorHandler(c, err)
			}
			req := c.Request()
			status := 0
			if resp, uerr := echo.UnwrapResponse(c.Response()); uerr == nil {
				status = resp.Status
			}
			attrs := []any{
				"method", req.Method,
				"path", req.URL.Path,
				"route", c.Path(),
				"status", status,
				"latency", time.Since(start),
				"remote", c.RealIP(),
				"request_id", c.Response().Header().Get(echo.HeaderXRequestID),
			}
			if sc := trace.SpanContextFromContext(req.Context()); sc.IsValid() {
				attrs = append(attrs, "trace_id", sc.TraceID().String())
			}
			if claims := MustClaims(c); claims != nil {
				attrs = append(attrs, "user_id", claims.UserID)
			}
			if err != nil {
				attrs = append(attrs, "error", err)
			}
			level := slog.LevelInfo
			switch {
			case status >= 500:
				level = slog.LevelError
			case status >= 400:
				level = slog.LevelWarn
			}
			log.Log(req.Context(), level, "request", attrs...)
			return err
		}
	}
}
