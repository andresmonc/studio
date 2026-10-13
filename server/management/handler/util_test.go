package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newCtx() (*echo.Context, *httptest.ResponseRecorder) {
	e := echo.New()
	rec := httptest.NewRecorder()
	c := e.NewContext(httptest.NewRequest(http.MethodGet, "/", nil), rec)
	return c, rec
}

func decodeResp(t *testing.T, rec *httptest.ResponseRecorder) model.APIResponse {
	t.Helper()
	var resp model.APIResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	return resp
}

func TestResponseHelpers(t *testing.T) {
	t.Run("ok", func(t *testing.T) {
		c, rec := newCtx()
		require.NoError(t, ok(c, map[string]string{"k": "v"}))
		assert.Equal(t, http.StatusOK, rec.Code)
		resp := decodeResp(t, rec)
		assert.Equal(t, map[string]any{"k": "v"}, resp.Data)
	})

	t.Run("created", func(t *testing.T) {
		c, rec := newCtx()
		require.NoError(t, created(c, nil))
		assert.Equal(t, http.StatusCreated, rec.Code)
	})

	t.Run("badRequest", func(t *testing.T) {
		c, rec := newCtx()
		require.NoError(t, badRequest(c, "bad input"))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		resp := decodeResp(t, rec)
		assert.Equal(t, "bad input", resp.Message)
	})

	t.Run("notFound", func(t *testing.T) {
		c, rec := newCtx()
		require.NoError(t, notFound(c, "gone"))
		assert.Equal(t, http.StatusNotFound, rec.Code)
		assert.Equal(t, "gone", decodeResp(t, rec).Message)
	})

	t.Run("internal", func(t *testing.T) {
		c, rec := newCtx()
		require.NoError(t, internal(c, "boom"))
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
		assert.Equal(t, "boom", decodeResp(t, rec).Message)
	})
}

func TestWriteServiceError(t *testing.T) {
	t.Run("validation errors become 400 with field map", func(t *testing.T) {
		c, rec := newCtx()
		verrs := model.ValidationErrors{{Field: "name", Message: "required"}}
		require.NoError(t, writeServiceError(c, verrs, "create"))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		resp := decodeResp(t, rec)
		assert.Equal(t, "validation failed", resp.Message)
		assert.Equal(t, []string{"required"}, resp.Errors["name"])
	})

	t.Run("wrapped validation errors are detected", func(t *testing.T) {
		c, rec := newCtx()
		wrapped := fmt.Errorf("service failed: %w", model.ValidationErrors{{Field: "x", Message: "bad"}})
		require.NoError(t, writeServiceError(c, wrapped, "create"))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	tests := []struct {
		name     string
		err      error
		wantCode int
		wantMsg  string // checked when set
	}{
		{"not found", service.ErrNotFound, http.StatusNotFound, ""},
		{"forbidden", service.ErrForbidden, http.StatusForbidden, ""},
		{"conflict", service.ErrConflict, http.StatusConflict, "conflict"},
		{"wrapped conflict drops the sentinel prefix", fmt.Errorf("%w: domain already in use", service.ErrConflict), http.StatusConflict, "domain already in use"},
		{"wrapped not found", fmt.Errorf("load: %w", service.ErrNotFound), http.StatusNotFound, ""},
		{"unique violation is 409", fmt.Errorf("insert: %w", &pgconn.PgError{Code: "23505"}), http.StatusConflict, "already exists"},
		{"malformed uuid is 400", fmt.Errorf("load: %w", &pgconn.PgError{Code: "22P02"}), http.StatusBadRequest, "invalid id"},
		{"foreign key violation is 404", fmt.Errorf("insert: %w", &pgconn.PgError{Code: "23503"}), http.StatusNotFound, "not found"},
		{"deadline exceeded is 503", fmt.Errorf("query: %w", context.DeadlineExceeded), http.StatusServiceUnavailable, "service unavailable"},
		{"unknown error is 500", errors.New("db exploded"), http.StatusInternalServerError, "op failed"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, rec := newCtx()
			require.NoError(t, writeServiceError(c, tt.err, "op failed"))
			assert.Equal(t, tt.wantCode, rec.Code)
			msg := decodeResp(t, rec).Message
			assert.NotEmpty(t, msg)
			if tt.wantMsg != "" {
				assert.Equal(t, tt.wantMsg, msg)
			}
		})
	}
}

func TestBindError(t *testing.T) {
	type req struct {
		Name string `json:"name"`
		Meta struct {
			Tags []string `json:"tags"`
		} `json:"meta"`
		PollingIntervalMs *int `json:"pollingIntervalMs"`
	}
	tests := []struct {
		body, wantMsg, field, fieldMsg string
	}{
		{`{"name":`, "invalid JSON at offset 8", "", ""},
		{`{bad`, "invalid JSON at offset 2", "", ""},
		{`{"name":1}`, "invalid body", "name", "must be a string"},
		{`{"meta":{"tags":"x"}}`, "invalid body", "meta.tags", "must be an array"},
		{`{"pollingIntervalMs":"5"}`, "invalid body", "pollingIntervalMs", "must be a number"},
	}
	for _, tt := range tests {
		t.Run(tt.body, func(t *testing.T) {
			c, rec := reqCtx(http.MethodPost, tt.body)
			var r req
			err := c.Bind(&r)
			require.Error(t, err)
			require.NoError(t, bindError(c, err))
			assert.Equal(t, http.StatusBadRequest, rec.Code)
			resp := decodeResp(t, rec)
			assert.Equal(t, tt.wantMsg, resp.Message)
			if tt.field != "" {
				assert.Equal(t, []string{tt.fieldMsg}, resp.Errors[tt.field])
			}
		})
	}
}
