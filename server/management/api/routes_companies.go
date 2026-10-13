package api

import (
	"github.com/labstack/echo/v5"

	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
)

func registerCompanyRoutes(g *echo.Group, h Handlers, s Services) {
	companies := g.Group("/companies")
	companies.GET("", h.Companies.List, middleware.RequireSuperAdmin())
	companies.POST("", h.Companies.Create, middleware.RequireSuperAdmin())

	scoped := companies.Group("/:companyId")
	scoped.GET("", h.Companies.Get, middleware.RequireCompanyRole(s.Companies, "companyId", model.CompanyRoleMember))
	scoped.PATCH("", h.Companies.Update, middleware.RequireCompanyRole(s.Companies, "companyId", model.CompanyRoleAdmin))
	scoped.DELETE("", h.Companies.Delete, middleware.RequireSuperAdmin())

	scoped.GET("/members", h.Companies.ListMembers, middleware.RequireCompanyRole(s.Companies, "companyId", model.CompanyRoleMember))
	scoped.POST("/members", h.Companies.AddMember, middleware.RequireCompanyRole(s.Companies, "companyId", model.CompanyRoleAdmin))
	scoped.PATCH("/members/:uid", h.Companies.UpdateMember, middleware.RequireCompanyRole(s.Companies, "companyId", model.CompanyRoleAdmin))
	scoped.DELETE("/members/:uid", h.Companies.RemoveMember, middleware.RequireCompanyRole(s.Companies, "companyId", model.CompanyRoleAdmin))

	scoped.GET("/teams", h.Companies.ListTeams, middleware.RequireCompanyRole(s.Companies, "companyId", model.CompanyRoleMember))
	scoped.POST("/teams", h.Companies.CreateTeam, middleware.RequireCompanyRole(s.Companies, "companyId", model.CompanyRoleAdmin))
}
