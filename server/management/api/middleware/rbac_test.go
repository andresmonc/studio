package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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

func TestMustClaims(t *testing.T) {
	e := echo.New()
	c := e.NewContext(httptest.NewRequest(http.MethodGet, "/", nil), httptest.NewRecorder())
	assert.Nil(t, MustClaims(c), "absent claims return nil")

	want := &service.Claims{UserID: "u1"}
	c.Set(ContextClaimsKey, want)
	assert.Equal(t, want, MustClaims(c))

	// A value of the wrong type also yields nil rather than panicking.
	c.Set(ContextClaimsKey, "not-claims")
	assert.Nil(t, MustClaims(c))
}

func TestRequireSuperAdmin(t *testing.T) {
	mw := RequireSuperAdmin()

	assert.Equal(t, http.StatusForbidden, invoke(mw, nil, nil).Code, "no claims")
	assert.Equal(t, http.StatusForbidden, invoke(mw, &service.Claims{UserID: "u1"}, nil).Code, "non-admin")
	assert.Equal(t, http.StatusOK, invoke(mw, &service.Claims{UserID: "u1", IsSuperAdmin: true}, nil).Code, "admin")
}

func TestRequireTeamRoleClaimsBranches(t *testing.T) {
	// teams service is never reached on these branches, so nil is safe.
	mw := RequireTeamRole(nil, "teamId", model.RoleEditor)

	assert.Equal(t, http.StatusUnauthorized, invoke(mw, nil, nil).Code, "no claims")
	assert.Equal(t, http.StatusOK,
		invoke(mw, &service.Claims{IsSuperAdmin: true}, nil).Code, "super admin shortcut")
	assert.Equal(t, http.StatusBadRequest,
		invoke(mw, &service.Claims{UserID: "u1"}, nil).Code, "missing team id param")
}

func TestRequireCompanyRoleClaimsBranches(t *testing.T) {
	mw := RequireCompanyRole(nil, "companyId", model.CompanyRoleAdmin)

	assert.Equal(t, http.StatusUnauthorized, invoke(mw, nil, nil).Code, "no claims")
	assert.Equal(t, http.StatusOK,
		invoke(mw, &service.Claims{IsSuperAdmin: true}, nil).Code, "super admin shortcut")
	assert.Equal(t, http.StatusBadRequest,
		invoke(mw, &service.Claims{UserID: "u1"}, nil).Code, "missing company id param")
}

func TestRequireFlagsetRoleClaimsBranches(t *testing.T) {
	mw := RequireFlagsetRole(nil, nil, "id", model.RoleEditor)

	assert.Equal(t, http.StatusUnauthorized, invoke(mw, nil, nil).Code, "no claims")
	assert.Equal(t, http.StatusOK,
		invoke(mw, &service.Claims{IsSuperAdmin: true}, nil).Code, "super admin shortcut")
}

func TestRequireFlagRoleClaimsBranches(t *testing.T) {
	mw := RequireFlagRole(nil, nil, nil, "id", model.RoleEditor)

	assert.Equal(t, http.StatusUnauthorized, invoke(mw, nil, nil).Code, "no claims")
	assert.Equal(t, http.StatusOK,
		invoke(mw, &service.Claims{IsSuperAdmin: true}, nil).Code, "super admin shortcut")
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

	a := testutil.SeedCompany(t, db, "A", nil)
	b := testutil.SeedCompany(t, db, "B", nil)
	team := testutil.SeedTeam(t, db, a.ID, "team")
	fs := testutil.SeedFlagset(t, db, team.ID, "fs")
	flag := testutil.SeedFlag(t, db, fs.ID, "flag", nil, nil)
	user := func(email string, company string, role model.CompanyRole) string {
		u := testutil.SeedUser(t, db, email, email, false)
		require.NoError(t, companyRepo.SetMember(t.Context(), company, u.ID, role))
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
	flag := RequireFlagRole(f.teams, f.flagsets, f.flags, "id", model.RoleEditor)

	cases := []struct {
		name string
		mw   echo.MiddlewareFunc
		id   string
		user string
		want int
	}{
		{"team: outsider", team, f.team, f.outsider, http.StatusForbidden},
		{"team: company member, not on team", team, f.team, f.member, http.StatusForbidden},
		{"team: viewer below editor", team, f.team, f.viewer, http.StatusForbidden},
		{"team: editor", team, f.team, f.editor, http.StatusOK},
		{"team: company admin inherits admin", team, f.team, f.companyAdmin, http.StatusOK},
		{"team: unknown id", team, missing, f.editor, http.StatusForbidden},
		{"team: malformed id", team, malformed, f.editor, http.StatusForbidden},

		{"company: outsider (admin elsewhere)", company, f.company, f.outsider, http.StatusForbidden},
		{"company: member below admin", company, f.company, f.member, http.StatusForbidden},
		{"company: admin", company, f.company, f.companyAdmin, http.StatusOK},
		{"company: unknown id", company, missing, f.companyAdmin, http.StatusForbidden},
		{"company: malformed id", company, malformed, f.companyAdmin, http.StatusForbidden},

		{"flagset: outsider", flagset, f.flagset, f.outsider, http.StatusForbidden},
		{"flagset: viewer below editor", flagset, f.flagset, f.viewer, http.StatusForbidden},
		{"flagset: editor", flagset, f.flagset, f.editor, http.StatusOK},
		{"flagset: unknown id", flagset, missing, f.editor, http.StatusNotFound},
		{"flagset: malformed id", flagset, malformed, f.editor, http.StatusNotFound},

		{"flag: outsider", flag, f.flag, f.outsider, http.StatusForbidden},
		{"flag: viewer below editor", flag, f.flag, f.viewer, http.StatusForbidden},
		{"flag: editor", flag, f.flag, f.editor, http.StatusOK},
		{"flag: unknown id", flag, missing, f.editor, http.StatusNotFound},
		{"flag: malformed id", flag, malformed, f.editor, http.StatusNotFound},
	}
	for _, tc := range cases {
		got := invoke(tc.mw, &service.Claims{UserID: tc.user}, map[string]string{"id": tc.id}).Code
		assert.Equal(t, tc.want, got, tc.name)
	}
}
