package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"reflect"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/labstack/echo/v5"
)

func ok(c *echo.Context, data any) error {
	return c.JSON(http.StatusOK, model.APIResponse{Data: data})
}

// noContent answers 204 for mutations that have nothing to return.
func noContent(c *echo.Context) error {
	return c.NoContent(http.StatusNoContent)
}

func created(c *echo.Context, data any) error {
	return c.JSON(http.StatusCreated, model.APIResponse{Data: data})
}

// okPage writes a paginated list as the top-level body (no outer envelope).
func okPage[T any](c *echo.Context, items []T, total, page, pageSize int) error {
	return c.JSON(http.StatusOK, model.NewPaginatedResponse(items, total, page, pageSize))
}

// bindError turns a c.Bind failure into a 400 that says what broke: the
// offset of a JSON syntax error, or the field holding a value of the wrong
// type. A body over the size limit is a 413. Anything else stays a bare "invalid body".
func bindError(c *echo.Context, err error) error {
	var tooBig *http.MaxBytesError
	if errors.As(err, &tooBig) {
		return c.JSON(http.StatusRequestEntityTooLarge, model.APIResponse{Message: "request body too large"})
	}
	var syn *json.SyntaxError
	if errors.As(err, &syn) {
		return badRequest(c, fmt.Sprintf("invalid JSON at offset %d", syn.Offset))
	}
	var typ *json.UnmarshalTypeError
	if errors.As(err, &typ) && typ.Field != "" {
		return c.JSON(http.StatusBadRequest, model.APIResponse{
			Message: "invalid body",
			Errors:  map[string][]string{typ.Field: {"must be " + jsonKind(typ.Type)}},
		})
	}
	return badRequest(c, "invalid body")
}

// jsonKind names the JSON type a Go type decodes from.
func jsonKind(t reflect.Type) string {
	switch t.Kind() {
	case reflect.String:
		return "a string"
	case reflect.Bool:
		return "a boolean"
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		return "a number"
	case reflect.Slice, reflect.Array:
		return "an array"
	default:
		return "an object"
	}
}

func badRequest(c *echo.Context, msg string) error {
	return c.JSON(http.StatusBadRequest, model.APIResponse{Message: msg})
}

func notFound(c *echo.Context, msg string) error {
	return c.JSON(http.StatusNotFound, model.APIResponse{Message: msg})
}

func internal(c *echo.Context, msg string) error {
	return c.JSON(http.StatusInternalServerError, model.APIResponse{Message: msg})
}

// writeServiceError answers err. Messages come only from
// service.PublicMessage or fixed text, never err.Error(), so wrapped
// internals can't leak; opMsg must be a static description of the operation.
func writeServiceError(c *echo.Context, err error, opMsg string) error {
	var verrs model.ValidationErrors
	if errors.As(err, &verrs) {
		return c.JSON(http.StatusBadRequest, model.APIResponse{
			Message: "validation failed", Errors: verrs.ToMap(),
		})
	}
	for _, m := range []struct {
		kind   error
		status int
		msg    string
	}{
		{service.ErrNotFound, http.StatusNotFound, "not found"},
		{service.ErrForbidden, http.StatusForbidden, "forbidden"},
		{service.ErrConflict, http.StatusConflict, "conflict"},
	} {
		if errors.Is(err, m.kind) {
			msg := service.PublicMessage(err)
			if msg == "" {
				msg = m.msg
			}
			return c.JSON(m.status, model.APIResponse{Message: msg})
		}
	}
	// Client-caused PG errors are not server errors. Don't echo the PG message:
	// it leaks constraint names.
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505": // unique_violation
			return c.JSON(http.StatusConflict, model.APIResponse{Message: "already exists"})
		case "23503": // foreign_key_violation: a referenced row is missing, or still referenced
			return c.JSON(http.StatusConflict, model.APIResponse{Message: "conflicts with a related resource"})
		case "22P02", "23502", "23514", "22001": // bad cast, not null, check, too long
			return badRequest(c, "invalid value")
		}
	}
	// A client that went away: nobody reads the answer, and it isn't a server
	// failure (nginx's 499 convention keeps it out of 5xx metrics).
	if errors.Is(err, context.Canceled) {
		return c.NoContent(statusClientClosedRequest)
	}
	slog.ErrorContext(c.Request().Context(), opMsg, "error", err,
		"method", c.Request().Method, "path", c.Request().URL.Path)
	if errors.Is(err, context.DeadlineExceeded) {
		return c.JSON(http.StatusServiceUnavailable, model.APIResponse{Message: "service unavailable"})
	}
	return internal(c, opMsg)
}

const statusClientClosedRequest = 499
