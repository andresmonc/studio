package handler

import (
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
)

type AuditHandler struct {
	svc       *service.AuditService
	companies *service.CompanyService
}

func NewAuditHandler(svc *service.AuditService, companies *service.CompanyService) *AuditHandler {
	return &AuditHandler{svc: svc, companies: companies}
}

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
// @Param    companyId query string false "filter by company id (super admin only; ignored otherwise)"
// @Param    teamId    query string false "filter by team id"
// @Param    flagsetId query string false "filter by flagset id"
// @Param    flagId    query string false "filter by flag id"
// @Param    actorId   query string false "filter by actor user id"
// @Param    action    query string false "filter by action (e.g. flag.create)"
// @Param    from      query string false "RFC3339 lower bound, inclusive (e.g. 2026-10-01T00:00:00Z)" format(date-time)
// @Param    to        query string false "RFC3339 upper bound, inclusive (e.g. 2026-10-31T23:59:59Z)" format(date-time)
// @Param    page      query int    false "page" minimum(1) default(1)
// @Param    pageSize  query int    false "items per page" minimum(1) maximum(200) default(50)
// @Success  200       {object} model.PaginatedResponse[model.AuditEntry]
// @Failure  400       {object} model.APIResponse "from/to is not an RFC3339 timestamp, or page/pageSize is not an integer"
// @Router   /audit [get]
func (h *AuditHandler) List(c *echo.Context) error {
	var verrs model.ValidationErrors
	f := model.AuditFilters{
		TeamID:    strPtr(c.QueryParam("teamId")),
		FlagsetID: strPtr(c.QueryParam("flagsetId")),
		FlagID:    strPtr(c.QueryParam("flagId")),
		ActorID:   strPtr(c.QueryParam("actorId")),
		Action:    strPtr(c.QueryParam("action")),
		From:      timePtr(c.QueryParam("from"), "from", &verrs),
		To:        timePtr(c.QueryParam("to"), "to", &verrs),
		Page:      intParam(c.QueryParam("page"), "page", 1, &verrs),
		PageSize:  intParam(c.QueryParam("pageSize"), "pageSize", 50, &verrs),
	}
	if len(verrs) > 0 {
		return writeServiceError(c, verrs, "")
	}

	// Tenant isolation. Super-admins may read across companies and may narrow
	// by an explicit companyId; everyone else is restricted server-side to
	// their own company, and members who are not company admins further to
	// their own teams plus company-level events. A user with no company sees
	// nothing.
	claims := middleware.MustClaims(c)
	if claims.IsSuperAdmin {
		f.CompanyID = strPtr(c.QueryParam("companyId"))
	} else {
		m, err := h.companies.Membership(c.Request().Context(), claims.UserID)
		if err != nil {
			return writeServiceError(c, err, "failed to resolve company")
		}
		if m == nil {
			return okPage(c, []model.AuditEntry{}, 0, f.Page, f.PageSize)
		}
		f.ScopeCompanyID = &m.CompanyID
		if m.Role != model.CompanyRoleAdmin {
			f.ScopeMemberUserID = &claims.UserID
		}
	}

	items, total, err := h.svc.List(c.Request().Context(), f)
	if err != nil {
		return writeServiceError(c, err, "failed to list audit log")
	}
	return okPage(c, items, total, f.Page, f.PageSize)
}
