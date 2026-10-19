package api

import (
	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/labstack/echo/v5"
)

func registerVersionRoutes(g *echo.Group, h Handlers, s Services) {
	viewer := middleware.RequireFlagRole(s.Teams, s.Flags, "id", model.RoleViewer)
	editor := middleware.RequireFlagRole(s.Teams, s.Flags, "id", model.RoleEditor)
	v := g.Group("/flags/:id/versions")
	v.GET("", h.Versions.List, viewer)
	v.GET("/:n", h.Versions.Get, viewer)
	v.POST("/:n/rollback", h.Versions.Rollback, editor)
}
