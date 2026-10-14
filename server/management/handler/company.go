package handler

import (
	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
)

// CompanyHandler serves companies, their members and their teams. Access is
// enforced by the RBAC middleware on each route.
type CompanyHandler struct {
	svc  *service.CompanyService
	team *service.TeamService
}

func NewCompanyHandler(svc *service.CompanyService, team *service.TeamService) *CompanyHandler {
	return &CompanyHandler{svc: svc, team: team}
}

// List godoc
// @Summary List all companies (super admin only)
// @Tags    companies
// @Success 200 {object} model.APIResponse{data=[]model.Company}
// @Failure 403 {object} model.APIResponse
// @Router  /companies [get]
func (h *CompanyHandler) List(c *echo.Context) error {
	claims := middleware.MustClaims(c)
	items, err := h.svc.List(c.Request().Context(), claims.UserID, claims.IsSuperAdmin)
	if err != nil {
		return writeServiceError(c, err, "failed to list companies")
	}
	return ok(c, items)
}

// Create godoc
// @Summary Create a company (super admin only)
// @Tags    companies
// @Accept  json
// @Param   body body model.CreateCompanyRequest true "company"
// @Success 201 {object} model.APIResponse{data=model.Company}
// @Failure 400 {object} model.APIResponse
// @Failure 403 {object} model.APIResponse
// @Failure 409 {object} model.APIResponse "a company already exists (mono company mode)"
// @Router  /companies [post]
func (h *CompanyHandler) Create(c *echo.Context) error {
	var req model.CreateCompanyRequest
	if err := c.Bind(&req); err != nil {
		return bindError(c, err)
	}
	claims := middleware.MustClaims(c)
	co, err := h.svc.Create(c.Request().Context(), claims.UserID, &req)
	if err != nil {
		return writeServiceError(c, err, "failed to create company")
	}
	return created(c, co)
}

// Get godoc
// @Summary Get company
// @Tags    companies
// @Param   companyId path string true "company id"
// @Success 200 {object} model.APIResponse{data=model.Company}
// @Failure 404 {object} model.APIResponse
// @Router  /companies/{companyId} [get]
func (h *CompanyHandler) Get(c *echo.Context) error {
	co, err := h.svc.Get(c.Request().Context(), c.Param("companyId"))
	if err != nil {
		return writeServiceError(c, err, "failed to get company")
	}
	return ok(c, co)
}

// Update godoc
// @Summary Update a company (company admin)
// @Tags    companies
// @Accept  json
// @Param   companyId path string                    true "company id"
// @Param   body      body model.UpdateCompanyRequest true "fields to update"
// @Success 200 {object} model.APIResponse{data=model.Company}
// @Failure 400 {object} model.APIResponse
// @Failure 403 {object} model.APIResponse
// @Failure 404 {object} model.APIResponse
// @Router  /companies/{companyId} [patch]
func (h *CompanyHandler) Update(c *echo.Context) error {
	var req model.UpdateCompanyRequest
	if err := c.Bind(&req); err != nil {
		return bindError(c, err)
	}
	claims := middleware.MustClaims(c)
	co, err := h.svc.Update(c.Request().Context(), claims.UserID, c.Param("companyId"), &req)
	if err != nil {
		return writeServiceError(c, err, "failed to update company")
	}
	return ok(c, co)
}

// Delete godoc
// @Summary Delete a company (super admin only; cascades to its teams, flagsets, flags, versions and API keys)
// @Tags    companies
// @Param   companyId path string true "company id"
// @Success 204 "No Content"
// @Failure 403 {object} model.APIResponse
// @Failure 404 {object} model.APIResponse
// @Router  /companies/{companyId} [delete]
func (h *CompanyHandler) Delete(c *echo.Context) error {
	claims := middleware.MustClaims(c)
	if err := h.svc.Delete(c.Request().Context(), claims.UserID, c.Param("companyId")); err != nil {
		return writeServiceError(c, err, "failed to delete company")
	}
	return noContent(c)
}

// ListMembers godoc
// @Summary List company members
// @Tags    companies
// @Param   companyId path string true "company id"
// @Success 200 {object} model.APIResponse{data=[]model.CompanyMember}
// @Router  /companies/{companyId}/members [get]
func (h *CompanyHandler) ListMembers(c *echo.Context) error {
	items, err := h.svc.ListMembers(c.Request().Context(), c.Param("companyId"))
	if err != nil {
		return writeServiceError(c, err, "failed to list company members")
	}
	return ok(c, items)
}

// AddMember godoc
// @Summary Add a member to a company, or set the role of an existing member (company admin)
// @Tags    companies
// @Accept  json
// @Param   companyId path string                        true "company id"
// @Param   body      body model.AddCompanyMemberRequest true "member to add"
// @Success 201 {object} model.APIResponse{data=model.CompanyMember} "member added"
// @Success 200 {object} model.APIResponse{data=model.CompanyMember} "existing member: role updated"
// @Failure 400 {object} model.APIResponse
// @Failure 403 {object} model.APIResponse
// @Failure 404 {object} model.APIResponse "no user with this email (users of other companies included)"
// @Failure 409 {object} model.APIResponse "demoting the last company admin"
// @Router  /companies/{companyId}/members [post]
func (h *CompanyHandler) AddMember(c *echo.Context) error {
	var req model.AddCompanyMemberRequest
	if err := c.Bind(&req); err != nil {
		return bindError(c, err)
	}
	claims := middleware.MustClaims(c)
	m, added, err := h.svc.AddMember(c.Request().Context(), claims.UserID, c.Param("companyId"), &req)
	if err != nil {
		return writeServiceError(c, err, "failed to add company member")
	}
	if !added {
		return ok(c, m) // existing member: role updated
	}
	return created(c, m)
}

// UpdateMember godoc
// @Summary Update a company member's role (company admin)
// @Tags    companies
// @Accept  json
// @Param   companyId path string                            true "company id"
// @Param   uid       path string                            true "user id"
// @Param   body      body model.UpdateCompanyMemberRequest  true "new role"
// @Success 204 "No Content"
// @Failure 400 {object} model.APIResponse
// @Failure 403 {object} model.APIResponse
// @Failure 404 {object} model.APIResponse
// @Failure 409 {object} model.APIResponse "demoting the last company admin"
// @Router  /companies/{companyId}/members/{uid} [patch]
func (h *CompanyHandler) UpdateMember(c *echo.Context) error {
	var req model.UpdateCompanyMemberRequest
	if err := c.Bind(&req); err != nil {
		return bindError(c, err)
	}
	claims := middleware.MustClaims(c)
	err := h.svc.UpdateMember(c.Request().Context(), claims.UserID, c.Param("companyId"), c.Param("uid"), req.Role)
	if err != nil {
		return writeServiceError(c, err, "failed to update company member")
	}
	return noContent(c)
}

// RemoveMember godoc
// @Summary Remove a member from a company (company admin; also drops their team roles there)
// @Tags    companies
// @Param   companyId path string true "company id"
// @Param   uid       path string true "user id"
// @Success 204 "No Content"
// @Failure 400 {object} model.APIResponse "malformed id"
// @Failure 403 {object} model.APIResponse
// @Failure 404 {object} model.APIResponse
// @Failure 409 {object} model.APIResponse "removing the last company admin"
// @Router  /companies/{companyId}/members/{uid} [delete]
func (h *CompanyHandler) RemoveMember(c *echo.Context) error {
	claims := middleware.MustClaims(c)
	if err := h.svc.RemoveMember(c.Request().Context(), claims.UserID, c.Param("companyId"), c.Param("uid")); err != nil {
		return writeServiceError(c, err, "failed to remove company member")
	}
	return noContent(c)
}

// ListTeams godoc
// @Summary List teams in a company
// @Tags    companies
// @Param   companyId path string true "company id"
// @Success 200 {object} model.APIResponse{data=[]model.Team}
// @Router  /companies/{companyId}/teams [get]
func (h *CompanyHandler) ListTeams(c *echo.Context) error {
	items, err := h.team.ListByCompany(c.Request().Context(), c.Param("companyId"))
	if err != nil {
		return writeServiceError(c, err, "failed to list teams")
	}
	return ok(c, items)
}

// CreateTeam godoc
// @Summary Create a team in a company (company admin)
// @Tags    companies
// @Accept  json
// @Param   companyId path string                  true "company id"
// @Param   body      body model.CreateTeamRequest true "team"
// @Success 201 {object} model.APIResponse{data=model.Team}
// @Failure 400 {object} model.APIResponse
// @Failure 403 {object} model.APIResponse "insufficient role"
// @Failure 404 {object} model.APIResponse "no user with the admin email in the company"
// @Failure 409 {object} model.APIResponse "team name already used in the company"
// @Router  /companies/{companyId}/teams [post]
func (h *CompanyHandler) CreateTeam(c *echo.Context) error {
	var req model.CreateTeamRequest
	if err := c.Bind(&req); err != nil {
		return bindError(c, err)
	}
	claims := middleware.MustClaims(c)
	t, err := h.team.Create(c.Request().Context(), claims.UserID, c.Param("companyId"), &req)
	if err != nil {
		return writeServiceError(c, err, "failed to create team")
	}
	return created(c, t)
}
