package api

import (
	"github.com/labstack/echo/v5"

	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
)

func registerFlagRoutes(g *echo.Group, h Handlers, s Services) {
	g.GET("/teams/:teamId/flags", h.Flags.ListByTeam,
		middleware.RequireTeamRole(s.Teams, "teamId", model.RoleViewer))
	g.GET("/teams/:teamId/tags", h.Flags.ListTeamTags,
		middleware.RequireTeamRole(s.Teams, "teamId", model.RoleViewer))
	g.GET("/teams/:teamId/owners", h.Flags.ListTeamOwners,
		middleware.RequireTeamRole(s.Teams, "teamId", model.RoleViewer))
	g.GET("/flagsets/:flagsetId/flags", h.Flags.List,
		middleware.RequireFlagsetRole(s.Teams, s.Flagsets, "flagsetId", model.RoleViewer))
	g.POST("/flagsets/:flagsetId/flags", h.Flags.Create,
		middleware.RequireFlagsetRole(s.Teams, s.Flagsets, "flagsetId", model.RoleEditor))

	f := g.Group("/flags/:id")
	f.GET("", h.Flags.Get, middleware.RequireFlagRole(s.Teams, s.Flagsets, s.Flags, "id", model.RoleViewer))
	// Evaluation is CPU-bound and viewer-reachable: cap it per user.
	evalLimit := rateLimit(20, func(c *echo.Context) (string, error) { return middleware.MustClaims(c).UserID, nil })
	f.POST("/evaluate", h.Flags.Evaluate, middleware.RequireFlagRole(s.Teams, s.Flagsets, s.Flags, "id", model.RoleViewer), evalLimit)
	f.PUT("", h.Flags.Update, middleware.RequireFlagRole(s.Teams, s.Flagsets, s.Flags, "id", model.RoleEditor))
	f.POST("/disable", h.Flags.Disable, middleware.RequireFlagRole(s.Teams, s.Flagsets, s.Flags, "id", model.RoleEditor))
	f.DELETE("", h.Flags.Delete, middleware.RequireFlagRole(s.Teams, s.Flagsets, s.Flags, "id", model.RoleEditor))
}
