package api

import (
	"github.com/labstack/echo/v5"
)

func registerOnboardingRoutes(g *echo.Group, h Handlers) {
	ob := g.Group("/onboarding")
	ob.POST("/company", h.Onboarding.CreateCompany)
}
