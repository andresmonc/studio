package handler

import (
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
)

// AuditHandler serves the audit log. Tenant scoping is done by AuditService
// from the session, so query filters can only narrow what the caller sees.
type AuditHandler struct{ svc *service.AuditService }

func NewAuditHandler(svc *service.AuditService) *AuditHandler { return &AuditHandler{svc: svc} }

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// timePtr parses an optional RFC3339 query value; an unparseable one is
// recorded in errs under field.
func timePtr(s, field string, errs *model.ValidationErrors) *time.Time {
	if s == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		*errs = append(*errs, model.ValidationError{Field: field, Message: "must be an RFC3339 timestamp"})
		return nil
	}
	return &t
}

// List godoc
// @Summary  List audit log entries with filters
// @Tags     audit
// @Produce  json
// @Param    companyId query string false "filter by company id (narrows; another company's id yields nothing)"
// @Param    teamId    query string false "filter by team id"
// @Param    flagsetId query string false "filter by flagset id"
// @Param    flagId    query string false "filter by flag id"
// @Param    actorId   query string false "filter by actor user id"
// @Param    action    query string false "filter by action" Enums(create, update, delete, rollback)
// @Param    from      query string false "RFC3339 lower bound, inclusive (e.g. 2026-10-01T00:00:00Z)" format(date-time)
// @Param    to        query string false "RFC3339 upper bound, inclusive (e.g. 2026-10-31T23:59:59Z)" format(date-time)
// @Param    page      query int    false "page" minimum(1) default(1)
// @Param    pageSize  query int    false "items per page" minimum(1) maximum(200) default(50)
// @Success  200       {object} model.PaginatedResponse[model.AuditEntry]
// @Failure  400       {object} model.APIResponse "bad from/to, page/pageSize or action"
// @Failure  401       {object} model.APIResponse "no valid session"
// @Router   /audit [get]
func (h *AuditHandler) List(c *echo.Context) error {
	var verrs model.ValidationErrors
	f := model.AuditFilters{
		CompanyID:   strPtr(c.QueryParam("companyId")),
		TeamID:      strPtr(c.QueryParam("teamId")),
		FlagsetID:   strPtr(c.QueryParam("flagsetId")),
		FlagID:      strPtr(c.QueryParam("flagId")),
		ActorUserID: strPtr(c.QueryParam("actorId")),
		From:        timePtr(c.QueryParam("from"), "from", &verrs),
		To:          timePtr(c.QueryParam("to"), "to", &verrs),
		Page:        intParam(c.QueryParam("page"), "page", 1, &verrs),
		PageSize:    intParam(c.QueryParam("pageSize"), "pageSize", 50, &verrs),
	}
	if a := c.QueryParam("action"); a != "" {
		action := model.AuditAction(a)
		if !action.IsValid() {
			verrs = append(verrs, model.ValidationError{
				Field: "action", Message: "action must be create, update, delete or rollback",
			})
		}
		f.Action = &action
	}
	if err := verrs.Err(); err != nil {
		return writeServiceError(c, err, "")
	}

	claims := middleware.MustClaims(c)
	items, total, err := h.svc.List(c.Request().Context(), claims.UserID, claims.IsSuperAdmin, f)
	if err != nil {
		return writeServiceError(c, err, "failed to list audit log")
	}
	return okPage(c, items, total, f.Page, f.PageSize)
}
