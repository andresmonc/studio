package handler

import (
	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
)

// FlagsetHandler serves flagsets and their API keys. Access is enforced by the
// RBAC middleware on each route.
type FlagsetHandler struct{ svc *service.FlagsetService }

func NewFlagsetHandler(svc *service.FlagsetService) *FlagsetHandler { return &FlagsetHandler{svc: svc} }

// ListByTeam godoc
// @Summary  List flagsets of a team
// @Tags     flagsets
// @Produce  json
// @Param    teamId path string true "team id"
// @Success  200    {object} model.APIResponse{data=[]model.Flagset}
// @Failure  401    {object} model.APIResponse "no valid session"
// @Failure  403    {object} model.APIResponse "insufficient role"
// @Failure  404    {object} model.APIResponse "not found, or a malformed id"
// @Router   /teams/{teamId}/flagsets [get]
func (h *FlagsetHandler) ListByTeam(c *echo.Context) error {
	items, err := h.svc.ListByTeam(c.Request().Context(), c.Param("teamId"))
	if err != nil {
		return writeServiceError(c, err, "failed to list flagsets")
	}
	return ok(c, items)
}

// Create godoc
// @Summary  Create a flagset under a team (team editor; also provisions a default API key)
// @Tags     flagsets
// @Accept   json
// @Produce  json
// @Param    teamId path string                     true "team id"
// @Param    body   body model.CreateFlagsetRequest true "flagset"
// @Success  201    {object} model.APIResponse{data=model.Flagset}
// @Failure  400    {object} model.APIResponse
// @Failure  401    {object} model.APIResponse "no valid session"
// @Failure  403    {object} model.APIResponse
// @Failure  404    {object} model.APIResponse
// @Failure  409    {object} model.APIResponse "flagset name already used in the team"
// @Failure  413    {object} model.APIResponse "body larger than 256 KiB"
// @Router   /teams/{teamId}/flagsets [post]
func (h *FlagsetHandler) Create(c *echo.Context) error {
	var req model.CreateFlagsetRequest
	if err := c.Bind(&req); err != nil {
		return bindError(c, err)
	}
	claims := middleware.MustClaims(c)
	fs, err := h.svc.Create(c.Request().Context(), claims.UserID, c.Param("teamId"), &req)
	if err != nil {
		return writeServiceError(c, err, "failed to create flagset")
	}
	return created(c, fs)
}

// Get godoc
// @Summary  Get a flagset
// @Tags     flagsets
// @Produce  json
// @Param    id path string true "flagset id"
// @Success  200 {object} model.APIResponse{data=model.Flagset}
// @Failure  401 {object} model.APIResponse "no valid session"
// @Failure  403 {object} model.APIResponse "insufficient role"
// @Failure  404 {object} model.APIResponse
// @Router   /flagsets/{id} [get]
func (h *FlagsetHandler) Get(c *echo.Context) error {
	fs, err := h.svc.Get(c.Request().Context(), c.Param("id"))
	if err != nil {
		return writeServiceError(c, err, "failed to get flagset")
	}
	return ok(c, fs)
}

// Update godoc
// @Summary  Update a flagset (team admin)
// @Tags     flagsets
// @Accept   json
// @Produce  json
// @Param    id   path string                     true "flagset id"
// @Param    body body model.UpdateFlagsetRequest true "fields to update"
// @Success  200  {object} model.APIResponse{data=model.Flagset}
// @Failure  400  {object} model.APIResponse
// @Failure  401  {object} model.APIResponse "no valid session"
// @Failure  403  {object} model.APIResponse
// @Failure  404  {object} model.APIResponse
// @Failure  409  {object} model.APIResponse "flagset name already used in the team"
// @Failure  413  {object} model.APIResponse "body larger than 256 KiB"
// @Router   /flagsets/{id} [patch]
func (h *FlagsetHandler) Update(c *echo.Context) error {
	var req model.UpdateFlagsetRequest
	if err := c.Bind(&req); err != nil {
		return bindError(c, err)
	}
	claims := middleware.MustClaims(c)
	fs, err := h.svc.Update(c.Request().Context(), claims.UserID, c.Param("id"), &req)
	if err != nil {
		return writeServiceError(c, err, "failed to update flagset")
	}
	return ok(c, fs)
}

// Delete godoc
// @Summary  Delete a flagset (team admin; cascades to its flags, versions and API keys)
// @Tags     flagsets
// @Produce  json
// @Param    id path string true "flagset id"
// @Success  204 "No Content"
// @Failure  401 {object} model.APIResponse "no valid session"
// @Failure  403 {object} model.APIResponse
// @Failure  404 {object} model.APIResponse
// @Router   /flagsets/{id} [delete]
func (h *FlagsetHandler) Delete(c *echo.Context) error {
	claims := middleware.MustClaims(c)
	if err := h.svc.Delete(c.Request().Context(), claims.UserID, c.Param("id")); err != nil {
		return writeServiceError(c, err, "failed to delete flagset")
	}
	return noContent(c)
}

// ListAPIKeys godoc
// @Summary  List API keys for a flagset (team editor: the keys are secrets)
// @Tags     flagsets
// @Produce  json
// @Param    id path string true "flagset id"
// @Success  200 {object} model.APIResponse{data=[]model.FlagsetAPIKey}
// @Failure  401 {object} model.APIResponse "no valid session"
// @Failure  403 {object} model.APIResponse
// @Failure  404 {object} model.APIResponse "not found, or a malformed id"
// @Router   /flagsets/{id}/api-keys [get]
func (h *FlagsetHandler) ListAPIKeys(c *echo.Context) error {
	keys, err := h.svc.ListAPIKeys(c.Request().Context(), c.Param("id"))
	if err != nil {
		return writeServiceError(c, err, "failed to list api keys")
	}
	return ok(c, keys)
}

// CreateAPIKey godoc
// @Summary  Create a new API key for a flagset (team admin)
// @Tags     flagsets
// @Accept   json
// @Produce  json
// @Param    id   path string                     true "flagset id"
// @Param    body body model.CreateAPIKeyRequest  true "key label"
// @Success  201 {object} model.APIResponse{data=model.FlagsetAPIKey}
// @Failure  400 {object} model.APIResponse
// @Failure  401 {object} model.APIResponse "no valid session"
// @Failure  403 {object} model.APIResponse
// @Failure  404 {object} model.APIResponse
// @Failure  413 {object} model.APIResponse "body larger than 256 KiB"
// @Router   /flagsets/{id}/api-keys [post]
func (h *FlagsetHandler) CreateAPIKey(c *echo.Context) error {
	claims := middleware.MustClaims(c)
	var req model.CreateAPIKeyRequest
	if err := c.Bind(&req); err != nil {
		return bindError(c, err)
	}
	out, err := h.svc.CreateAPIKey(c.Request().Context(), claims.UserID, c.Param("id"), req.Label)
	if err != nil {
		return writeServiceError(c, err, "failed to create api key")
	}
	return created(c, out)
}

// DeleteAPIKey godoc
// @Summary  Revoke a flagset API key by id (team admin)
// @Tags     flagsets
// @Produce  json
// @Param    id    path string true "flagset id"
// @Param    keyId path string true "key id"
// @Success  204   "No Content"
// @Failure  401   {object} model.APIResponse "no valid session"
// @Failure  403   {object} model.APIResponse
// @Failure  404   {object} model.APIResponse
// @Router   /flagsets/{id}/api-keys/{keyId} [delete]
func (h *FlagsetHandler) DeleteAPIKey(c *echo.Context) error {
	claims := middleware.MustClaims(c)
	err := h.svc.DeleteAPIKey(c.Request().Context(), claims.UserID, c.Param("id"), c.Param("keyId"))
	if err != nil {
		return writeServiceError(c, err, "failed to delete api key")
	}
	return noContent(c)
}
