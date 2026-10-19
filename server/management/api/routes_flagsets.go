package api

import (
	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/labstack/echo/v5"
)

func registerFlagsetRoutes(g *echo.Group, h Handlers, s Services) {
	g.GET("/teams/:teamId/flagsets", h.Flagsets.ListByTeam,
		middleware.RequireTeamRole(s.Teams, "teamId", model.RoleViewer))
	g.POST("/teams/:teamId/flagsets", h.Flagsets.Create,
		middleware.RequireTeamRole(s.Teams, "teamId", model.RoleEditor))

	viewer := middleware.RequireFlagsetRole(s.Teams, s.Flagsets, "id", model.RoleViewer)
	editor := middleware.RequireFlagsetRole(s.Teams, s.Flagsets, "id", model.RoleEditor)
	admin := middleware.RequireFlagsetRole(s.Teams, s.Flagsets, "id", model.RoleAdmin)
	fs := g.Group("/flagsets/:id")
	fs.GET("", h.Flagsets.Get, viewer)
	fs.PATCH("", h.Flagsets.Update, admin)
	fs.DELETE("", h.Flagsets.Delete, admin)
	// Keys are secrets (relay-proxy credentials outside Studio's RBAC and
	// audit): viewers can't read them, editors can (they wire relay proxies),
	// and only admins create or revoke them.
	fs.GET("/api-keys", h.Flagsets.ListAPIKeys, editor)
	fs.POST("/api-keys", h.Flagsets.CreateAPIKey, admin)
	fs.DELETE("/api-keys/:keyId", h.Flagsets.DeleteAPIKey, admin)
}
