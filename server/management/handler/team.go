package handler

import (
	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
)

// TeamHandler serves teams and their members. Access is enforced by the RBAC
// middleware on each route.
type TeamHandler struct{ svc *service.TeamService }

func NewTeamHandler(svc *service.TeamService) *TeamHandler { return &TeamHandler{svc: svc} }

// List godoc
// @Summary List teams visible to the user
// @Tags    teams
// @Success 200 {object} model.APIResponse{data=[]model.Team}
// @Router  /teams [get]
func (h *TeamHandler) List(c *echo.Context) error {
	claims := middleware.MustClaims(c)
	items, err := h.svc.List(c.Request().Context(), claims.UserID, claims.IsSuperAdmin)
	if err != nil {
		return writeServiceError(c, err, "failed to list teams")
	}
	return ok(c, items)
}

// Get godoc
// @Summary Get team
// @Tags    teams
// @Param   id path string true "team id"
// @Success 200 {object} model.APIResponse{data=model.Team}
// @Failure 404 {object} model.APIResponse
// @Router  /teams/{id} [get]
func (h *TeamHandler) Get(c *echo.Context) error {
	t, err := h.svc.Get(c.Request().Context(), c.Param("id"))
	if err != nil {
		return writeServiceError(c, err, "failed to get team")
	}
	return ok(c, t)
}

// Update godoc
// @Summary Update a team (team admin)
// @Tags    teams
// @Accept  json
// @Produce json
// @Param   id   path string                  true  "team id"
// @Param   body body model.UpdateTeamRequest true  "fields to update"
// @Success 200  {object} model.APIResponse{data=model.Team}
// @Failure 400  {object} model.APIResponse
// @Failure 403  {object} model.APIResponse
// @Failure 404  {object} model.APIResponse
// @Failure 409  {object} model.APIResponse "team name already used in the company"
// @Router  /teams/{id} [patch]
func (h *TeamHandler) Update(c *echo.Context) error {
	var req model.UpdateTeamRequest
	if err := c.Bind(&req); err != nil {
		return bindError(c, err)
	}
	claims := middleware.MustClaims(c)
	t, err := h.svc.Update(c.Request().Context(), claims.UserID, c.Param("id"), &req)
	if err != nil {
		return writeServiceError(c, err, "failed to update team")
	}
	return ok(c, t)
}

// Delete godoc
// @Summary Delete a team (team admin; cascades to its flagsets, flags, versions and API keys)
// @Tags    teams
// @Param   id path string true "team id"
// @Success 204 "No Content"
// @Failure 403 {object} model.APIResponse
// @Failure 404 {object} model.APIResponse
// @Router  /teams/{id} [delete]
func (h *TeamHandler) Delete(c *echo.Context) error {
	claims := middleware.MustClaims(c)
	if err := h.svc.Delete(c.Request().Context(), claims.UserID, c.Param("id")); err != nil {
		return writeServiceError(c, err, "failed to delete team")
	}
	return noContent(c)
}

// ListMembers godoc
// @Summary List team members
// @Tags    teams
// @Produce json
// @Param   id path string true "team id"
// @Success 200 {object} model.APIResponse{data=[]model.TeamMember}
// @Router  /teams/{id}/members [get]
func (h *TeamHandler) ListMembers(c *echo.Context) error {
	items, err := h.svc.ListMembers(c.Request().Context(), c.Param("id"))
	if err != nil {
		return writeServiceError(c, err, "failed to list members")
	}
	return ok(c, items)
}

// AddableMembers godoc
// @Summary List company members that can be added to the team
// @Tags    teams
// @Produce json
// @Param   id path string true "team id"
// @Success 200 {object} model.APIResponse{data=[]model.CompanyMember}
// @Router  /teams/{id}/addable-members [get]
func (h *TeamHandler) AddableMembers(c *echo.Context) error {
	items, err := h.svc.AddableMembers(c.Request().Context(), c.Param("id"))
	if err != nil {
		return writeServiceError(c, err, "failed to list addable members")
	}
	return ok(c, items)
}

// AddMember godoc
// @Summary Add a member to a team, or set the role of an existing member (team admin)
// @Tags    teams
// @Accept  json
// @Produce json
// @Param   id   path string                 true "team id"
// @Param   body body model.AddMemberRequest true "member to add"
// @Success 201  {object} model.APIResponse{data=model.TeamMember} "member added"
// @Success 200  {object} model.APIResponse{data=model.TeamMember} "existing member: role updated"
// @Failure 400  {object} model.APIResponse
// @Failure 403  {object} model.APIResponse "insufficient role"
// @Failure 404  {object} model.APIResponse "no user with this email in the team's company"
// @Router  /teams/{id}/members [post]
func (h *TeamHandler) AddMember(c *echo.Context) error {
	var req model.AddMemberRequest
	if err := c.Bind(&req); err != nil {
		return bindError(c, err)
	}
	claims := middleware.MustClaims(c)
	m, added, err := h.svc.AddMember(c.Request().Context(), claims.UserID, c.Param("id"), &req)
	if err != nil {
		return writeServiceError(c, err, "failed to add member")
	}
	if !added {
		return ok(c, m) // existing member: role updated
	}
	return created(c, m)
}

// UpdateMember godoc
// @Summary Update a team member's role (team admin)
// @Tags    teams
// @Accept  json
// @Produce json
// @Param   id   path string                    true "team id"
// @Param   uid  path string                    true "user id"
// @Param   body body model.UpdateMemberRequest true "new role"
// @Success 204  "No Content"
// @Failure 400  {object} model.APIResponse
// @Failure 403  {object} model.APIResponse
// @Failure 404  {object} model.APIResponse
// @Router  /teams/{id}/members/{uid} [patch]
func (h *TeamHandler) UpdateMember(c *echo.Context) error {
	var req model.UpdateMemberRequest
	if err := c.Bind(&req); err != nil {
		return bindError(c, err)
	}
	claims := middleware.MustClaims(c)
	err := h.svc.UpdateMember(c.Request().Context(), claims.UserID, c.Param("id"), c.Param("uid"), req.Role)
	if err != nil {
		return writeServiceError(c, err, "failed to update member")
	}
	return noContent(c)
}

// RemoveMember godoc
// @Summary Remove a member from a team (team admin)
// @Tags    teams
// @Param   id  path string true "team id"
// @Param   uid path string true "user id"
// @Success 204 "No Content"
// @Failure 400 {object} model.APIResponse "malformed id"
// @Failure 403 {object} model.APIResponse
// @Failure 404 {object} model.APIResponse
// @Router  /teams/{id}/members/{uid} [delete]
func (h *TeamHandler) RemoveMember(c *echo.Context) error {
	claims := middleware.MustClaims(c)
	if err := h.svc.RemoveMember(c.Request().Context(), claims.UserID, c.Param("id"), c.Param("uid")); err != nil {
		return writeServiceError(c, err, "failed to remove member")
	}
	return noContent(c)
}
