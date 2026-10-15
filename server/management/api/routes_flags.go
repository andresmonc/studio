package api

import (
	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/labstack/echo/v5"
)

func registerFlagRoutes(g *echo.Group, h Handlers, s Services) {
	teamViewer := middleware.RequireTeamRole(s.Teams, "teamId", model.RoleViewer)
	g.GET("/teams/:teamId/flags", h.Flags.ListByTeam, teamViewer)
	g.GET("/teams/:teamId/tags", h.Flags.ListTeamTags, teamViewer)
	g.GET("/teams/:teamId/owners", h.Flags.ListTeamOwners, teamViewer)
	g.GET("/flagsets/:flagsetId/flags", h.Flags.List,
		middleware.RequireFlagsetRole(s.Teams, s.Flagsets, "flagsetId", model.RoleViewer))
	g.POST("/flagsets/:flagsetId/flags", h.Flags.Create,
		middleware.RequireFlagsetRole(s.Teams, s.Flagsets, "flagsetId", model.RoleEditor))

	viewer := middleware.RequireFlagRole(s.Teams, s.Flagsets, s.Flags, "id", model.RoleViewer)
	editor := middleware.RequireFlagRole(s.Teams, s.Flagsets, s.Flags, "id", model.RoleEditor)
	f := g.Group("/flags/:id")
	f.GET("", h.Flags.Get, viewer)
	// Evaluation is CPU-bound and viewer-reachable: cap it per user.
	evalLimit := rateLimit(20, func(c *echo.Context) (string, error) { return middleware.MustClaims(c).UserID, nil })
	f.POST("/evaluate", h.Flags.Evaluate, viewer, evalLimit)
	f.PUT("", h.Flags.Update, editor)
	f.POST("/disable", h.Flags.Disable, editor)
	f.DELETE("", h.Flags.Delete, editor)
}
