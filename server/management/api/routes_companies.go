package api

import (
	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/labstack/echo/v5"
)

func registerCompanyRoutes(g *echo.Group, h Handlers, s Services) {
	member := middleware.RequireCompanyRole(s.Companies, "companyId", model.CompanyRoleMember)
	admin := middleware.RequireCompanyRole(s.Companies, "companyId", model.CompanyRoleAdmin)
	super := middleware.RequireSuperAdmin()

	companies := g.Group("/companies")
	companies.GET("", h.Companies.List, super)
	companies.POST("", h.Companies.Create, super)

	scoped := companies.Group("/:companyId")
	scoped.GET("", h.Companies.Get, member)
	scoped.PATCH("", h.Companies.Update, admin)
	scoped.DELETE("", h.Companies.Delete, super)

	scoped.GET("/members", h.Companies.ListMembers, member)
	scoped.POST("/members", h.Companies.AddMember, admin)
	scoped.PATCH("/members/:uid", h.Companies.UpdateMember, admin)
	scoped.DELETE("/members/:uid", h.Companies.RemoveMember, admin)

	scoped.GET("/teams", h.Companies.ListTeams, member)
	scoped.POST("/teams", h.Companies.CreateTeam, admin)

	// Holds every API key of the company, so company admins only.
	scoped.GET("/relay-proxy-config", h.Flagsets.RelayProxyConfig, admin)
}
