package middleware

import (
	"net/http"
	"strings"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
)

// ValidIDs answers 404 for a route whose id path params (id, uid, *Id) are not
// canonical UUIDs: no such row can exist. Checking once here, before the RBAC
// gates and the handlers, keeps malformed input out of every query, so the
// repositories can treat a failed uuid cast as the bug it is.
func ValidIDs() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			for _, p := range c.PathValues() {
				if isIDParam(p.Name) && !IsUUID(p.Value) {
					return c.JSON(http.StatusNotFound, model.APIResponse{Message: "not found"})
				}
			}
			return next(c)
		}
	}
}

func isIDParam(name string) bool {
	return name == "id" || name == "uid" || strings.HasSuffix(name, "Id")
}

// IsUUID accepts only the canonical 36-char form: Postgres accepts more
// spellings, but nothing accepted here is one it rejects.
func IsUUID(s string) bool {
	_, err := uuid.Parse(s)
	return err == nil && len(s) == 36
}
