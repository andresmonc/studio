package handler

import (
	"strconv"

	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
)

// VersionHandler serves a flag's version history and rollbacks. Access is
// enforced by the RBAC middleware on each route.
type VersionHandler struct{ svc *service.VersionService }

func NewVersionHandler(svc *service.VersionService) *VersionHandler { return &VersionHandler{svc: svc} }

// List godoc
// @Summary  List versions of a flag
// @Tags     versions
// @Produce  json
// @Param    id       path  string true  "flag id"
// @Param    page     query int    false "page" minimum(1) default(1)
// @Param    pageSize query int    false "items per page" minimum(1) maximum(200) default(50)
// @Success  200      {object} model.PaginatedResponse[model.FlagVersion]
// @Failure  400      {object} model.APIResponse "page/pageSize is not an integer"
// @Failure  401      {object} model.APIResponse "no valid session"
// @Failure  403      {object} model.APIResponse "insufficient role"
// @Failure  404      {object} model.APIResponse "unknown or deleted flag"
// @Router   /flags/{id}/versions [get]
func (h *VersionHandler) List(c *echo.Context) error {
	var errs model.ValidationErrors
	page := intParam(c.QueryParam("page"), "page", 1, &errs)
	pageSize := intParam(c.QueryParam("pageSize"), "pageSize", 50, &errs)
	if len(errs) > 0 {
		return writeServiceError(c, errs, "")
	}
	items, total, err := h.svc.List(c.Request().Context(), c.Param("id"), page, pageSize)
	if err != nil {
		return writeServiceError(c, err, "failed to list versions")
	}
	return okPage(c, items, total, page, pageSize)
}

// Get godoc
// @Summary  Get a specific flag version
// @Tags     versions
// @Produce  json
// @Param    id path string true "flag id"
// @Param    n  path int    true "version number"
// @Success  200 {object} model.APIResponse{data=model.FlagVersion}
// @Failure  400 {object} model.APIResponse
// @Failure  401 {object} model.APIResponse "no valid session"
// @Failure  403 {object} model.APIResponse "insufficient role"
// @Failure  404 {object} model.APIResponse
// @Router   /flags/{id}/versions/{n} [get]
func (h *VersionHandler) Get(c *echo.Context) error {
	num, err := strconv.Atoi(c.Param("n"))
	if err != nil {
		return badRequest(c, "invalid version number")
	}
	v, err := h.svc.Get(c.Request().Context(), c.Param("id"), num)
	if err != nil {
		return writeServiceError(c, err, "failed to get version")
	}
	return ok(c, v)
}

// Rollback godoc
// @Summary  Roll back to a previous version (team editor; creates a new current version, or 200 if already served)
// @Tags     versions
// @Accept   json
// @Produce  json
// @Param    id   path string                 true  "flag id"
// @Param    n    path int                    true  "version number to roll back to"
// @Param    body body model.RollbackRequest  false "optional comment"
// @Success  201  {object} model.APIResponse{data=model.FlagVersion} "new current version"
// @Success  200  {object} model.APIResponse{data=model.FlagVersion} "the flag already serves it; nothing written"
// @Failure  400  {object} model.APIResponse "invalid version number or body"
// @Failure  401  {object} model.APIResponse "no valid session"
// @Failure  403  {object} model.APIResponse
// @Failure  404  {object} model.APIResponse
// @Failure  413  {object} model.APIResponse "body larger than 256 KiB"
// @Router   /flags/{id}/versions/{n}/rollback [post]
func (h *VersionHandler) Rollback(c *echo.Context) error {
	num, err := strconv.Atoi(c.Param("n"))
	if err != nil {
		return badRequest(c, "invalid version number")
	}
	var req model.RollbackRequest
	if err := c.Bind(&req); err != nil {
		return bindError(c, err)
	}
	claims := middleware.MustClaims(c)
	v, isNew, err := h.svc.Rollback(c.Request().Context(), claims.UserID, c.Param("id"), num, req.Comment)
	if err != nil {
		return writeServiceError(c, err, "failed to rollback")
	}
	if !isNew {
		return ok(c, v)
	}
	return created(c, v)
}
