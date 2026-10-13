package middleware

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v5"
	emw "github.com/labstack/echo/v5/middleware"
	"github.com/stretchr/testify/assert"
)

// platformServeLogged serves one request through RequestLogger+Recover (the
// api.New order) and returns the response and the log output.
func platformServeLogged(path string) (*httptest.ResponseRecorder, string) {
	var buf bytes.Buffer
	e := echo.New()
	e.Use(RequestLogger(slog.New(slog.NewTextHandler(&buf, nil))))
	e.Use(emw.Recover())
	e.GET("/boom", func(c *echo.Context) error { panic("kaboom") })
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec, buf.String()
}

func TestRequestLoggerLogsRealStatus(t *testing.T) {
	t.Run("recovered panic is logged as a 500 error with its stack", func(t *testing.T) {
		rec, out := platformServeLogged("/boom")
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
		assert.Contains(t, out, "level=ERROR")
		assert.Contains(t, out, "status=500")
		assert.Contains(t, out, "route=/boom")
		assert.Contains(t, out, "PANIC RECOVER")
		assert.Contains(t, out, "kaboom")
	})

	t.Run("unknown route is logged as a 404 warning", func(t *testing.T) {
		rec, out := platformServeLogged("/nope")
		assert.Equal(t, http.StatusNotFound, rec.Code)
		assert.Contains(t, out, "level=WARN")
		assert.Contains(t, out, "status=404")
	})
}
