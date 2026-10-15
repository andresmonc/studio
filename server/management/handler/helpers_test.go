package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
)

// reqCtx builds an *echo.Context for the given method/body and returns it with
// its response recorder. body may be "" for no body. The Content-Type is JSON.
func reqCtx(method, body string) (*echo.Context, *httptest.ResponseRecorder) {
	e := echo.New()
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, "/", nil)
	} else {
		r = httptest.NewRequest(method, "/", strings.NewReader(body))
		r.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	}
	rec := httptest.NewRecorder()
	return e.NewContext(r, rec), rec
}

func dataMap(t *testing.T, resp any) map[string]any {
	t.Helper()
	m, ok := resp.(map[string]any)
	if !ok {
		t.Fatalf("expected data to be a JSON object, got %T", resp)
	}
	return m
}

// missingUUID is a syntactically valid UUID that never matches a seeded row.
const missingUUID = "00000000-0000-0000-0000-000000000000"

// withClaims injects the caller identity the same way the auth middleware does.
func withClaims(c *echo.Context, userID string, superAdmin bool) {
	c.Set(middleware.ContextClaimsKey, &service.Claims{UserID: userID, IsSuperAdmin: superAdmin})
}

// stack is the real service stack on the Postgres test harness. Handler tests
// add the services they need.
type stack struct {
	db         *repository.DB
	userRepo   *repository.UserRepo
	onboardSvc *service.OnboardingService
	teamSvc    *service.TeamService
	companySvc *service.CompanyService
	flagsetSvc *service.FlagsetService
	flagSvc    *service.FlagService
	auditSvc   *service.AuditService
	versionSvc *service.VersionService
}

func newStack(t *testing.T) *stack {
	t.Helper()
	db := testutil.StartPostgres(t)
	companyRepo := repository.NewCompanyRepo(db)
	userRepo := repository.NewUserRepo(db)
	auditRepo := repository.NewAuditRepo(db)
	flagsetRepo := repository.NewFlagsetRepo(db)
	return &stack{
		db:         db,
		userRepo:   userRepo,
		onboardSvc: service.NewOnboardingService(companyRepo, userRepo, auditRepo, false),
		teamSvc:    service.NewTeamService(repository.NewTeamRepo(db), userRepo, companyRepo, auditRepo),
		companySvc: service.NewCompanyService(companyRepo, userRepo, auditRepo, false),
		flagsetSvc: service.NewFlagsetService(flagsetRepo, auditRepo),
		flagSvc: service.NewFlagService(db, repository.NewFlagRepo(db), repository.NewFlagVersionRepo(db),
			flagsetRepo, auditRepo),
		auditSvc: service.NewAuditService(auditRepo, companyRepo),
		versionSvc: service.NewVersionService(db, repository.NewFlagRepo(db), repository.NewFlagVersionRepo(db),
			flagsetRepo, auditRepo),
	}
}

// reqCtxQuery builds a GET *echo.Context with the given raw query string.
func reqCtxQuery(rawQuery string) (*echo.Context, *httptest.ResponseRecorder) {
	e := echo.New()
	r := httptest.NewRequest(http.MethodGet, "/?"+rawQuery, nil)
	rec := httptest.NewRecorder()
	return e.NewContext(r, rec), rec
}

// params sets path param name/value pairs on the context.
func params(c *echo.Context, kv ...string) {
	pv := make(echo.PathValues, 0, len(kv)/2)
	for i := 0; i+1 < len(kv); i += 2 {
		pv = append(pv, echo.PathValue{Name: kv[i], Value: kv[i+1]})
	}
	c.SetPathValues(pv)
}

func ptr[T any](v T) *T { return &v }
