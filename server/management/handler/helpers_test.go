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

// missingUUID is a syntactically valid UUID that never matches a seeded row, so
// repository lookups return (nil, nil) → the handler's not-found path, rather
// than a Postgres uuid cast error.
const missingUUID = "00000000-0000-0000-0000-000000000000"

func ptr[T any](v T) *T { return &v }

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

// reqCtxQuery is like reqCtx but lets the caller supply a raw query string.
func reqCtxQuery(method, rawQuery string) (*echo.Context, *httptest.ResponseRecorder) {
	e := echo.New()
	r := httptest.NewRequest(method, "/?"+rawQuery, nil)
	rec := httptest.NewRecorder()
	return e.NewContext(r, rec), rec
}

// withClaims injects the caller identity the same way the auth middleware does.
func withClaims(c *echo.Context, userID string, superAdmin bool) *echo.Context {
	c.Set(middleware.ContextClaimsKey, &service.Claims{UserID: userID, IsSuperAdmin: superAdmin})
	return c
}

// params sets path param name/value pairs on the context.
func params(c *echo.Context, kv ...string) *echo.Context {
	pv := make(echo.PathValues, 0, len(kv)/2)
	for i := 0; i+1 < len(kv); i += 2 {
		pv = append(pv, echo.PathValue{Name: kv[i], Value: kv[i+1]})
	}
	c.SetPathValues(pv)
	return c
}

func dataMap(t *testing.T, resp any) map[string]any {
	t.Helper()
	m, ok := resp.(map[string]any)
	if !ok {
		t.Fatalf("expected data to be a JSON object, got %T", resp)
	}
	return m
}

// stack bundles the full real service stack built on the test harness db.
type stack struct {
	db *repository.DB

	companyRepo *repository.CompanyRepo
	userRepo    *repository.UserRepo
	teamRepo    *repository.TeamRepo
	flagsetRepo *repository.FlagsetRepo
	flagRepo    *repository.FlagRepo
	versionRepo *repository.FlagVersionRepo
	auditRepo   *repository.AuditRepo

	companySvc *service.CompanyService
	teamSvc    *service.TeamService
	flagSvc    *service.FlagService
	flagsetSvc *service.FlagsetService
	versionSvc *service.VersionService
	onboardSvc *service.OnboardingService
	auditSvc   *service.AuditService
}

// newStack boots the Postgres harness and wires every repo + service against it.
func newStack(t *testing.T) *stack {
	t.Helper()
	db := testutil.StartPostgres(t)

	companyRepo := repository.NewCompanyRepo(db)
	userRepo := repository.NewUserRepo(db)
	teamRepo := repository.NewTeamRepo(db)
	flagsetRepo := repository.NewFlagsetRepo(db)
	flagRepo := repository.NewFlagRepo(db)
	versionRepo := repository.NewFlagVersionRepo(db)
	auditRepo := repository.NewAuditRepo(db)

	return &stack{
		db:          db,
		companyRepo: companyRepo,
		userRepo:    userRepo,
		teamRepo:    teamRepo,
		flagsetRepo: flagsetRepo,
		flagRepo:    flagRepo,
		versionRepo: versionRepo,
		auditRepo:   auditRepo,
		companySvc:  service.NewCompanyService(companyRepo, userRepo, auditRepo, false),
		teamSvc:     service.NewTeamService(teamRepo, userRepo, companyRepo, auditRepo),
		flagSvc:     service.NewFlagService(db, flagRepo, versionRepo, flagsetRepo, auditRepo),
		flagsetSvc:  service.NewFlagsetService(flagsetRepo, auditRepo),
		versionSvc:  service.NewVersionService(db, flagRepo, versionRepo, flagsetRepo, auditRepo),
		onboardSvc:  service.NewOnboardingService(companyRepo, userRepo, auditRepo, false),
		auditSvc:    service.NewAuditService(auditRepo),
	}
}
