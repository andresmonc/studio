package middleware

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/labstack/echo/v5"
	"go.opentelemetry.io/otel/trace"
)

// RequestLogger logs one line per request. It must run outside RequestID (so
// the id is set), Recover and RequireAuth (so panics and the caller are
// logged); behind a proxy the server needs an IPExtractor for "remote".
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
				// A float of milliseconds reads the same in text and JSON logs.
				"latency_ms", float64(time.Since(start).Microseconds()) / 1000,
				"remote", c.RealIP(),
			}
			if id := c.Response().Header().Get(echo.HeaderXRequestID); id != "" {
				attrs = append(attrs, "request_id", id)
			}
			if sc := trace.SpanContextFromContext(req.Context()); sc.IsValid() {
				attrs = append(attrs, "trace_id", sc.TraceID().String())
			}
			if claims := ClaimsFrom(c); claims != nil {
				attrs = append(attrs, "user_id", claims.UserID)
			}
			if err != nil {
				attrs = append(attrs, "error", err)
			}
			level := requestLogLevel(status, err)
			if errors.Is(err, context.Canceled) {
				attrs = append(attrs, "client_closed", true)
			}
			log.Log(req.Context(), level, "request", attrs...)
			return err
		}
	}
}

// requestLogLevel: 5xx (or an unknown status) is an error and 4xx a warning,
// except a client that went away, which is not a server failure. An error
// returned after a committed 2xx is still at least a warning.
func requestLogLevel(status int, err error) slog.Level {
	switch {
	case errors.Is(err, context.Canceled):
		return slog.LevelInfo
	case status >= 500 || status == 0:
		return slog.LevelError
	case status >= 400 || err != nil:
		return slog.LevelWarn
	}
	return slog.LevelInfo
}
