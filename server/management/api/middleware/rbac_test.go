package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
)

// invoke runs mw around a handler that returns 200, with the given claims set in
// context (when non-nil) and optional param wiring, and returns the recorder.
func invoke(mw echo.MiddlewareFunc, claims *service.Claims, params map[string]string) *httptest.ResponseRecorder {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	if claims != nil {
		c.Set(ContextClaimsKey, claims)
	}
	if len(params) > 0 {
		pv := make(echo.PathValues, 0, len(params))
		for k, v := range params {
			pv = append(pv, echo.PathValue{Name: k, Value: v})
		}
		c.SetPathValues(pv)
	}
	handler := mw(func(c *echo.Context) error {
		return c.JSON(http.StatusOK, model.APIResponse{})
	})
	_ = handler(c)
	return rec
}

func TestRBACWithoutLookups(t *testing.T) {
	// Services are never reached on these branches, so nil is safe.
	gates := map[string]echo.MiddlewareFunc{
		"team":    RequireTeamRole(nil, "id", model.RoleEditor),
		"company": RequireCompanyRole(nil, "id", model.CompanyRoleAdmin),
		"flagset": RequireFlagsetRole(nil, nil, "id", model.RoleEditor),
		"flag":    RequireFlagRole(nil, nil, "id", model.RoleEditor),
		"super":   RequireSuperAdmin(),
	}
	for name, mw := range gates {
		t.Run(name+": no session", func(t *testing.T) {
			rec := invoke(mw, nil, nil)
			assert.Equal(t, http.StatusUnauthorized, rec.Code)
			assert.Contains(t, rec.Body.String(), "unauthenticated")
		})
		t.Run(name+": super admin passes", func(t *testing.T) {
			assert.Equal(t, http.StatusOK, invoke(mw, &service.Claims{IsSuperAdmin: true}, nil).Code)
		})
	}
	rec := invoke(gates["super"], &service.Claims{UserID: "u1"}, nil)
	assert.Equal(t, http.StatusForbidden, rec.Code)
	assert.Contains(t, rec.Body.String(), "super admin required")
}

// rbacFixture is a seeded company A (team, flagset, flag) plus one user per
// role, and a company B whose admin is the outsider.
type rbacFixture struct {
	companies *service.CompanyService
	teams     *service.TeamService
	flagsets  *service.FlagsetService
	flags     *service.FlagService

	company, team, flagset, flag                   string
	viewer, editor, member, companyAdmin, outsider string
}

// rbacSeed boots the Postgres harness and wires the services the RBAC
// middlewares need, the way handler/helpers_test.go newStack does.
func rbacSeed(t *testing.T) rbacFixture {
	t.Helper()
	db := testutil.StartPostgres(t)
	companyRepo := repository.NewCompanyRepo(db)
	userRepo := repository.NewUserRepo(db)
	flagsetRepo := repository.NewFlagsetRepo(db)
	auditRepo := repository.NewAuditRepo(db)

	a := testutil.SeedCompany(t, db, "A")
	b := testutil.SeedCompany(t, db, "B")
	team := testutil.SeedTeam(t, db, a.ID, "team")
	fs := testutil.SeedFlagset(t, db, team.ID, "fs")
	flag := testutil.SeedFlag(t, db, fs.ID, "flag", nil, nil)
	user := func(email string, company string, role model.CompanyRole) string {
		u := testutil.SeedUser(t, db, email, email, false)
		testutil.SetCompanyMember(t, db, company, u.ID, role)
		return u.ID
	}
	f := rbacFixture{
		companies: service.NewCompanyService(companyRepo, userRepo, auditRepo, false),
		teams:     service.NewTeamService(repository.NewTeamRepo(db), userRepo, companyRepo, auditRepo),
		flagsets:  service.NewFlagsetService(flagsetRepo, auditRepo),
		flags:     service.NewFlagService(db, repository.NewFlagRepo(db), repository.NewFlagVersionRepo(db), flagsetRepo, auditRepo),
		company:   a.ID, team: team.ID, flagset: fs.ID, flag: flag.ID,
		viewer:       user("viewer@a.test", a.ID, model.CompanyRoleMember),
		editor:       user("editor@a.test", a.ID, model.CompanyRoleMember),
		member:       user("member@a.test", a.ID, model.CompanyRoleMember),
		companyAdmin: user("admin@a.test", a.ID, model.CompanyRoleAdmin),
		outsider:     user("admin@b.test", b.ID, model.CompanyRoleAdmin),
	}
	testutil.AddTeamMember(t, db, team.ID, f.viewer, model.RoleViewer)
	testutil.AddTeamMember(t, db, team.ID, f.editor, model.RoleEditor)
	return f
}

// The role checks against real services: every middleware denies an outsider
// and a role below its minimum, and lets exactly the minimum through.
func TestRBACRoleChecks(t *testing.T) {
	f := rbacSeed(t)
	const missing, malformed = "00000000-0000-0000-0000-000000000000", "not-a-uuid"
	team := RequireTeamRole(f.teams, "id", model.RoleEditor)
	company := RequireCompanyRole(f.companies, "id", model.CompanyRoleAdmin)
	flagset := RequireFlagsetRole(f.teams, f.flagsets, "id", model.RoleEditor)
	flag := RequireFlagRole(f.teams, f.flags, "id", model.RoleEditor)

	const (
		denied        = "insufficient role"
		deniedCompany = "insufficient company role"
	)
	cases := []struct {
		name    string
		mw      echo.MiddlewareFunc
		id      string
		user    string
		want    int
		wantMsg string
	}{
		{"team: outsider", team, f.team, f.outsider, http.StatusForbidden, denied},
		{"team: company member, not on team", team, f.team, f.member, http.StatusForbidden, denied},
		{"team: viewer below editor", team, f.team, f.viewer, http.StatusForbidden, denied},
		{"team: editor", team, f.team, f.editor, http.StatusOK, ""},
		{"team: company admin inherits admin", team, f.team, f.companyAdmin, http.StatusOK, ""},
		{"team: unknown id", team, missing, f.editor, http.StatusForbidden, denied},
		{"team: malformed id", team, malformed, f.editor, http.StatusForbidden, denied},
		{"team: empty id", team, "", f.editor, http.StatusForbidden, denied},

		{"company: outsider (admin elsewhere)", company, f.company, f.outsider, http.StatusForbidden, deniedCompany},
		{"company: member below admin", company, f.company, f.member, http.StatusForbidden, deniedCompany},
		{"company: admin", company, f.company, f.companyAdmin, http.StatusOK, ""},
		{"company: unknown id", company, missing, f.companyAdmin, http.StatusForbidden, deniedCompany},
		{"company: empty id", company, "", f.companyAdmin, http.StatusForbidden, deniedCompany},

		{"flagset: outsider", flagset, f.flagset, f.outsider, http.StatusForbidden, denied},
		{"flagset: viewer below editor", flagset, f.flagset, f.viewer, http.StatusForbidden, denied},
		{"flagset: editor", flagset, f.flagset, f.editor, http.StatusOK, ""},
		{"flagset: unknown id looks like no access", flagset, missing, f.outsider, http.StatusForbidden, denied},
		{"flagset: malformed id", flagset, malformed, f.editor, http.StatusForbidden, denied},

		{"flag: outsider", flag, f.flag, f.outsider, http.StatusForbidden, denied},
		{"flag: viewer below editor", flag, f.flag, f.viewer, http.StatusForbidden, denied},
		{"flag: editor", flag, f.flag, f.editor, http.StatusOK, ""},
		{"flag: unknown id looks like no access", flag, missing, f.outsider, http.StatusForbidden, denied},
		{"flag: malformed id", flag, malformed, f.editor, http.StatusForbidden, denied},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := invoke(tc.mw, &service.Claims{UserID: tc.user}, map[string]string{"id": tc.id})
			assert.Equal(t, tc.want, rec.Code)
			if tc.wantMsg != "" {
				assert.Contains(t, rec.Body.String(), tc.wantMsg)
			}
		})
	}
}

func TestRBACServerErrors(t *testing.T) {
	f := rbacSeed(t)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	cases := []struct {
		name string
		mw   echo.MiddlewareFunc
		id   string
	}{
		{"team", RequireTeamRole(f.teams, "id", model.RoleViewer), f.team},
		{"company", RequireCompanyRole(f.companies, "id", model.CompanyRoleMember), f.company},
		{"flagset", RequireFlagsetRole(f.teams, f.flagsets, "id", model.RoleViewer), f.flagset},
		{"flag", RequireFlagRole(f.teams, f.flags, "id", model.RoleViewer), f.flag},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e := echo.New()
			rec := httptest.NewRecorder()
			c := e.NewContext(httptest.NewRequest(http.MethodGet, "/", nil).WithContext(ctx), rec)
			c.Set(ContextClaimsKey, &service.Claims{UserID: f.editor})
			c.SetPathValues(echo.PathValues{{Name: "id", Value: tc.id}})
			called := false
			_ = tc.mw(func(*echo.Context) error { called = true; return nil })(c)
			assert.Equal(t, http.StatusInternalServerError, rec.Code)
			assert.False(t, called)
		})
	}
}
