package handler

import (
	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
)

type OnboardingHandler struct{ svc *service.OnboardingService }

func NewOnboardingHandler(svc *service.OnboardingService) *OnboardingHandler {
	return &OnboardingHandler{svc: svc}
}

// CreateCompany godoc
// @Summary Create a company during onboarding (user without a company)
// @Tags    onboarding
// @Accept  json
// @Produce json
// @Param   body body model.CreateCompanyRequest true "company"
// @Success 201 {object} model.APIResponse{data=model.Company}
// @Failure 400 {object} model.APIResponse
// @Failure 401 {object} model.APIResponse "no valid session"
// @Failure 403 {object} model.APIResponse "already in a company (or, in mono company mode, not a super admin)"
// @Failure 404 {object} model.APIResponse "the session's user no longer exists"
// @Failure 409 {object} model.APIResponse "a company already exists (mono company mode)"
// @Failure 413 {object} model.APIResponse "body larger than 256 KiB"
// @Router  /onboarding/company [post]
func (h *OnboardingHandler) CreateCompany(c *echo.Context) error {
	var req model.CreateCompanyRequest
	if err := c.Bind(&req); err != nil {
		return bindError(c, err)
	}
	claims := middleware.MustClaims(c)
	// Super admin comes from the session, not the stored flag (see the service).
	co, err := h.svc.CreateCompanyForNewUser(c.Request().Context(), claims.UserID, claims.IsSuperAdmin, &req)
	if err != nil {
		return writeServiceError(c, err, "failed to create company")
	}
	return created(c, co)
}
