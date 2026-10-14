package middleware

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
	emw "github.com/labstack/echo/v5/middleware"
	"github.com/stretchr/testify/assert"
	"go.opentelemetry.io/otel/trace"
)

func TestRequestLogger(t *testing.T) {
	traceID := trace.TraceID{1, 2, 3}
	tests := []struct {
		name       string
		path       string
		handler    echo.HandlerFunc
		ctx        func(context.Context) context.Context
		wantStatus int
		wantLog    []string
		notInLog   []string
	}{
		{
			name: "success is info, with caller, request and trace ids", path: "/ok",
			handler: func(c *echo.Context) error {
				c.Set(ContextClaimsKey, &service.Claims{UserID: "u1"})
				return c.String(http.StatusOK, "ok")
			},
			ctx: func(ctx context.Context) context.Context {
				return trace.ContextWithSpanContext(ctx, trace.NewSpanContext(trace.SpanContextConfig{
					TraceID: traceID, SpanID: trace.SpanID{1}, TraceFlags: trace.FlagsSampled}))
			},
			wantStatus: http.StatusOK,
			wantLog: []string{"level=INFO", "status=200", "route=/ok", "user_id=u1", "request_id=",
				"trace_id=" + traceID.String(), "latency_ms="},
		},
		{
			name: "returned HTTP error is logged with its status", path: "/ok",
			handler:    func(*echo.Context) error { return echo.NewHTTPError(http.StatusBadRequest, "bad") },
			wantStatus: http.StatusBadRequest, wantLog: []string{"level=WARN", "status=400"},
		},
		{
			name: "plain error is a 500", path: "/ok",
			handler:    func(*echo.Context) error { return errors.New("db down") },
			wantStatus: http.StatusInternalServerError, wantLog: []string{"level=ERROR", "status=500", "db down"},
		},
		{
			name: "client gone is not a server failure", path: "/ok",
			handler:    func(*echo.Context) error { return context.Canceled },
			wantStatus: http.StatusInternalServerError, wantLog: []string{"level=INFO", "client_closed=true"},
		},
		{
			name: "error after a committed 200 is a warning", path: "/ok",
			handler: func(c *echo.Context) error {
				_ = c.String(http.StatusOK, "partial")
				return errors.New("late write")
			},
			wantStatus: http.StatusOK, wantLog: []string{"level=WARN", "status=200", "late write"},
		},
		{
			name: "recovered panic is a 500 with its stack", path: "/ok",
			handler:    func(*echo.Context) error { panic("kaboom") },
			wantStatus: http.StatusInternalServerError, wantLog: []string{"level=ERROR", "PANIC RECOVER", "kaboom"},
		},
		{
			name: "unknown route is a 404 warning", path: "/nope",
			handler:    func(c *echo.Context) error { return c.NoContent(http.StatusOK) },
			wantStatus: http.StatusNotFound, wantLog: []string{"level=WARN", "status=404"},
			notInLog: []string{"user_id="},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var buf bytes.Buffer
			e := echo.New()
			errorWrites := 0
			defaultHandler := e.HTTPErrorHandler
			e.HTTPErrorHandler = func(c *echo.Context, err error) {
				errorWrites++
				defaultHandler(c, err)
			}
			// The api.New order: request id, then logger, then recover.
			e.Use(emw.RequestID(), RequestLogger(slog.New(slog.NewTextHandler(&buf, nil))), emw.Recover())
			e.GET("/ok", tt.handler)
			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			if tt.ctx != nil {
				req = req.WithContext(tt.ctx(req.Context()))
			}
			rec := httptest.NewRecorder()
			e.ServeHTTP(rec, req)

			assert.Equal(t, tt.wantStatus, rec.Code)
			for _, want := range tt.wantLog {
				assert.Contains(t, buf.String(), want)
			}
			for _, unwanted := range tt.notInLog {
				assert.NotContains(t, buf.String(), unwanted)
			}
			assert.LessOrEqual(t, errorWrites, 2, "the logger writes the error, echo's second call is a no-op")
			if tt.name == "error after a committed 200 is a warning" {
				assert.Equal(t, "partial", rec.Body.String(), "no second response written")
			}
		})
	}
}
