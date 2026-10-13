package api

import (
	"github.com/labstack/echo/v5"

	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
)

func registerVersionRoutes(g *echo.Group, h Handlers, s Services) {
	v := g.Group("/flags/:id/versions")
	v.GET("", h.Versions.List, middleware.RequireFlagRole(s.Teams, s.Flagsets, s.Flags, "id", model.RoleViewer))
	v.GET("/:n", h.Versions.Get, middleware.RequireFlagRole(s.Teams, s.Flagsets, s.Flags, "id", model.RoleViewer))
	v.POST("/:n/rollback", h.Versions.Rollback, middleware.RequireFlagRole(s.Teams, s.Flagsets, s.Flags, "id", model.RoleEditor))
}
