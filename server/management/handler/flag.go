package handler

import (
	"strconv"
	"strings"

	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
)

// FlagHandler serves flags. Access is enforced by the RBAC middleware on each
// route.
type FlagHandler struct{ svc *service.FlagService }

func NewFlagHandler(svc *service.FlagService) *FlagHandler { return &FlagHandler{svc: svc} }

// parseBoolPtr returns nil for an absent value and an error for an unparseable one.
func parseBoolPtr(s string) (*bool, error) {
	if s == "" {
		return nil, nil
	}
	b, err := strconv.ParseBool(s)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// intParam parses an optional integer query parameter; a non-integer value is
// recorded in errs (400) rather than silently replaced by def. Range is left
// to model.ClampPage.
func intParam(s, field string, def int, errs *model.ValidationErrors) int {
	if s == "" {
		return def
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		*errs = append(*errs, model.ValidationError{Field: field, Message: "must be an integer"})
		return def
	}
	return v
}

// List godoc
// @Summary  List flags of a flagset
// @Tags     flags
// @Produce  json
// @Param    flagsetId path  string true  "flagset id"
// @Param    name      query string false "name contains filter"
// @Param    disabled  query bool   false "filter disabled flags"
// @Param    page      query int    false "page number"     minimum(1) default(1)
// @Param    pageSize  query int    false "items per page"  minimum(1) maximum(200) default(50)
// @Success  200       {object} model.PaginatedResponse[model.FlagListItem]
// @Failure  400       {object} model.APIResponse "disabled is not a boolean, or page/pageSize is not an integer"
// @Router   /flagsets/{flagsetId}/flags [get]
func (h *FlagHandler) List(c *echo.Context) error {
	flagsetID := c.Param("flagsetId")
	var errs model.ValidationErrors
	disabled := disabledParam(c, &errs)
	filters := model.FlagFilters{
		Name:     strPtr(c.QueryParam("name")),
		Disabled: disabled,
		Page:     intParam(c.QueryParam("page"), "page", 1, &errs),
		PageSize: intParam(c.QueryParam("pageSize"), "pageSize", 50, &errs),
	}
	if len(errs) > 0 {
		return writeServiceError(c, errs, "")
	}
	items, total, err := h.svc.List(c.Request().Context(), flagsetID, filters)
	if err != nil {
		return writeServiceError(c, err, "failed to list flags")
	}
	return okPage(c, items, total, filters.Page, filters.PageSize)
}

// ListByTeam godoc
// @Summary  List a team's flags across its flagsets (enriched with flagset name, type, owner), paginated
// @Tags     flags
// @Produce  json
// @Param    teamId    path  string true  "team id"
// @Param    tags      query string false "comma-separated tags, all required (AND)" example(beta,checkout)
// @Param    name      query string false "name contains filter (case-insensitive)"
// @Param    flagsetId query string false "only flags of this flagset"
// @Param    type      query string false "flag type" Enums(boolean, string, int, float, json)
// @Param    owner     query string false "current version author name; __unassigned__ for flags without one"
// @Param    disabled  query bool   false "filter disabled flags"
// @Param    sort      query string false "sort field" Enums(updated, name, state) default(updated)
// @Param    order     query string false "sort direction; defaults to desc for updated, asc otherwise" Enums(asc, desc)
// @Param    page      query int    false "page number"     minimum(1) default(1)
// @Param    pageSize  query int    false "items per page"  minimum(1) maximum(200) default(50)
// @Success  200       {object} model.PaginatedResponse[model.FlagInstance]
// @Failure  400       {object} model.APIResponse "invalid disabled, sort, order, page or pageSize"
// @Router   /teams/{teamId}/flags [get]
func (h *FlagHandler) ListByTeam(c *echo.Context) error {
	var errs model.ValidationErrors
	disabled := disabledParam(c, &errs)
	sort := c.QueryParam("sort")
	if sort == "" {
		sort = "updated"
	}
	desc, known := model.TeamFlagSorts[sort]
	if !known {
		errs = append(errs, model.ValidationError{Field: "sort", Message: "must be one of updated, name, state"})
	}
	switch c.QueryParam("order") {
	case "":
	case "asc":
		desc = false
	case "desc":
		desc = true
	default:
		errs = append(errs, model.ValidationError{Field: "order", Message: "must be asc or desc"})
	}
	page := intParam(c.QueryParam("page"), "page", 1, &errs)
	pageSize := intParam(c.QueryParam("pageSize"), "pageSize", 50, &errs)
	if len(errs) > 0 {
		return writeServiceError(c, errs, "")
	}
	filters := model.TeamFlagFilters{
		Tags:      parseTags(c.QueryParam("tags")),
		Name:      strPtr(c.QueryParam("name")),
		FlagsetID: strPtr(c.QueryParam("flagsetId")),
		Type:      strPtr(c.QueryParam("type")),
		Owner:     strPtr(c.QueryParam("owner")),
		Disabled:  disabled,
		Sort:      sort,
		Desc:      desc,
		Page:      page,
		PageSize:  pageSize,
	}
	filters.Unassigned = c.QueryParam("owner") == unassignedOwner
	items, total, err := h.svc.ListByTeam(c.Request().Context(), c.Param("teamId"), filters)
	if err != nil {
		return writeServiceError(c, err, "failed to list flags")
	}
	return okPage(c, items, total, filters.Page, filters.PageSize)
}

// disabledParam parses the optional "disabled" query param; a non-boolean is
// recorded in errs.
func disabledParam(c *echo.Context, errs *model.ValidationErrors) *bool {
	const field = "disabled"
	v, err := parseBoolPtr(c.QueryParam(field))
	if err != nil {
		*errs = append(*errs, model.ValidationError{Field: field, Message: "must be a boolean"})
	}
	return v
}

// unassignedOwner is the owner filter value selecting flags with no author.
const unassignedOwner = "__unassigned__"

// ListTeamOwners godoc
// @Summary  List the distinct owners (current version authors) of a team's flags
// @Tags     flags
// @Produce  json
// @Param    teamId path string true "team id"
// @Success  200    {object} model.APIResponse{data=[]string}
// @Router   /teams/{teamId}/owners [get]
func (h *FlagHandler) ListTeamOwners(c *echo.Context) error {
	owners, err := h.svc.ListTeamOwners(c.Request().Context(), c.Param("teamId"))
	if err != nil {
		return writeServiceError(c, err, "failed to list owners")
	}
	return ok(c, owners)
}

// parseTags splits a comma-separated `tags` query param into a trimmed,
// non-empty slice (nil when absent/blank → no tag filter).
func parseTags(raw string) []string {
	if raw == "" {
		return nil
	}
	var out []string
	for _, part := range strings.Split(raw, ",") {
		if t := strings.TrimSpace(part); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// ListTeamTags godoc
// @Summary  List the distinct tags used across a team's flags
// @Tags     flags
// @Produce  json
// @Param    teamId path string true "team id"
// @Success  200    {object} model.APIResponse{data=[]string}
// @Router   /teams/{teamId}/tags [get]
func (h *FlagHandler) ListTeamTags(c *echo.Context) error {
	tags, err := h.svc.ListTeamTags(c.Request().Context(), c.Param("teamId"))
	if err != nil {
		return writeServiceError(c, err, "failed to list tags")
	}
	return ok(c, tags)
}

// Create godoc
// @Summary  Create a flag in a flagset (team editor; creates version 1)
// @Description The server auto-manages a `metadata.flagType` field with the flag's
// @Description OpenFeature type (boolean|string|integer|float|object), so the
// @Description exported configuration is consumable by the OpenFeature CLI.
// @Tags     flags
// @Accept   json
// @Produce  json
// @Param    flagsetId path string                  true "flagset id"
// @Param    body      body model.CreateFlagRequest true "flag payload (GOFF DTO)"
// @Success  201       {object} model.APIResponse{data=model.Flag}
// @Failure  400       {object} model.APIResponse
// @Failure  403       {object} model.APIResponse
// @Failure  404       {object} model.APIResponse
// @Failure  409       {object} model.APIResponse "flag name already used in the flagset"
// @Router   /flagsets/{flagsetId}/flags [post]
func (h *FlagHandler) Create(c *echo.Context) error {
	var req model.CreateFlagRequest
	if err := c.Bind(&req); err != nil {
		return bindError(c, err)
	}
	claims := middleware.MustClaims(c)
	f, err := h.svc.Create(c.Request().Context(), claims.UserID, c.Param("flagsetId"), &req)
	if err != nil {
		return writeServiceError(c, err, "failed to create flag")
	}
	return created(c, f)
}

// Get godoc
// @Summary  Get a flag with its current version payload
// @Tags     flags
// @Produce  json
// @Param    id path string true "flag id"
// @Success  200 {object} model.APIResponse{data=model.Flag}
// @Failure  404 {object} model.APIResponse
// @Router   /flags/{id} [get]
func (h *FlagHandler) Get(c *echo.Context) error {
	f, err := h.svc.Get(c.Request().Context(), c.Param("id"))
	if err != nil {
		return writeServiceError(c, err, "failed to get flag")
	}
	return ok(c, f)
}

// Evaluate godoc
// @Summary  Test-evaluate a flag against an evaluation context
// @Description Runs the go-feature-flag evaluation engine against the flag's
// @Description current payload and the supplied evaluation context, returning the
// @Description resolved value and the reason. Read-only (does not record events).
// @Tags     flags
// @Accept   json
// @Produce  json
// @Param    id   path string                    true "flag id"
// @Param    body body model.EvaluateFlagRequest true "evaluation context"
// @Success  200  {object} model.APIResponse{data=model.EvaluationResult}
// @Failure  400  {object} model.APIResponse
// @Failure  403  {object} model.APIResponse
// @Failure  404  {object} model.APIResponse
// @Router   /flags/{id}/evaluate [post]
func (h *FlagHandler) Evaluate(c *echo.Context) error {
	var req model.EvaluateFlagRequest
	if err := c.Bind(&req); err != nil {
		return bindError(c, err)
	}
	res, err := h.svc.Evaluate(c.Request().Context(), c.Param("id"), &req)
	if err != nil {
		return writeServiceError(c, err, "failed to evaluate flag")
	}
	return ok(c, res)
}

// Update godoc
// @Summary  Replace flag payload (team editor; creates a new version)
// @Tags     flags
// @Accept   json
// @Produce  json
// @Param    id   path string                  true "flag id"
// @Param    body body model.UpdateFlagRequest true "new payload"
// @Success  200  {object} model.APIResponse{data=model.Flag}
// @Failure  400  {object} model.APIResponse
// @Failure  403  {object} model.APIResponse
// @Failure  404  {object} model.APIResponse
// @Router   /flags/{id} [put]
func (h *FlagHandler) Update(c *echo.Context) error {
	var req model.UpdateFlagRequest
	if err := c.Bind(&req); err != nil {
		return bindError(c, err)
	}
	claims := middleware.MustClaims(c)
	f, err := h.svc.Update(c.Request().Context(), claims.UserID, c.Param("id"), &req)
	if err != nil {
		return writeServiceError(c, err, "failed to update flag")
	}
	return ok(c, f)
}

// Disable godoc
// @Summary  Set the disabled state of a flag (team editor; no new version)
// @Description Sets the flag to the `disabled` value of the body, which is required:
// @Description `{"disabled": true}` disables it, `{"disabled": false}` re-enables it.
// @Tags     flags
// @Accept   json
// @Produce  json
// @Param    id   path string                   true "flag id"
// @Param    body body model.DisableFlagRequest true "disabled state"
// @Success  204  "No Content"
// @Failure  400  {object} model.APIResponse "invalid body, or disabled missing"
// @Failure  403  {object} model.APIResponse
// @Failure  404  {object} model.APIResponse
// @Router   /flags/{id}/disable [post]
func (h *FlagHandler) Disable(c *echo.Context) error {
	var req model.DisableFlagRequest
	if err := c.Bind(&req); err != nil {
		return bindError(c, err)
	}
	if req.Disabled == nil {
		return writeServiceError(c, model.ValidationErrors{{Field: "disabled", Message: "disabled is required"}}, "")
	}
	claims := middleware.MustClaims(c)
	if err := h.svc.SetDisabled(c.Request().Context(), claims.UserID, c.Param("id"), *req.Disabled); err != nil {
		return writeServiceError(c, err, "failed to set disabled")
	}
	return noContent(c)
}

// Delete godoc
// @Summary  Soft-delete a flag (team editor; audited; versions remain)
// @Tags     flags
// @Param    id path string true "flag id"
// @Success  204 "No Content"
// @Failure  403 {object} model.APIResponse
// @Failure  404 {object} model.APIResponse
// @Router   /flags/{id} [delete]
func (h *FlagHandler) Delete(c *echo.Context) error {
	claims := middleware.MustClaims(c)
	if err := h.svc.Delete(c.Request().Context(), claims.UserID, c.Param("id")); err != nil {
		return writeServiceError(c, err, "failed to delete flag")
	}
	return noContent(c)
}
