package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"
)

// reqCtx builds an *echo.Context for the given method/body and returns it with
// its response recorder. body may be "" for no body. The Content-Type is JSON.
func reqCtx(method, body string) (*echo.Context, *httptest.ResponseRecorder) {
	e := echo.New()
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, "/", nil)
	} else {
		r = httptest.NewRequest(method, "/", strings.NewReader(body))
		r.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	}
	rec := httptest.NewRecorder()
	return e.NewContext(r, rec), rec
}

func dataMap(t *testing.T, resp any) map[string]any {
	t.Helper()
	m, ok := resp.(map[string]any)
	if !ok {
		t.Fatalf("expected data to be a JSON object, got %T", resp)
	}
	return m
}
