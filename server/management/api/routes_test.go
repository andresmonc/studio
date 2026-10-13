package api_test

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gofeatureflag/flag-management-system/server/management/api"
	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/gofeatureflag/flag-management-system/server/management/handler"
	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
)

// Actors seeded by routesSeed. Company "acme" holds the team (with a flagset,
// a flag and an API key); the outsider is the admin of another company; the
// newbie has no company; "" is an anonymous request.
const (
	anon         = ""
	bogus        = "bogus" // a session cookie that is not a valid JWT
	viewer       = "viewer"
	editor       = "editor"
	teamAdmin    = "teamAdmin"
	member       = "member" // company member, on no team
	companyAdmin = "companyAdmin"
	outsider     = "outsider"
	superAdmin   = "superAdmin"
	newbie       = "newbie"
)

const flagBody = `{"name":"f2","payload":` + testutil.DefaultFlagPayload + `}`

// routeCases covers every route in server.go and routes_*.go with an allowed
// actor and a denied one at the role boundary. {x} is replaced by the seeded
// id of x. Each case runs against a freshly seeded database.
var routeCases = []struct {
	method, path, actor, body string
	want                      int
}{
	// Public.
	{"GET", "/health", anon, "", 200},
	{"GET", "/auth/login", anon, "", 302},
	{"GET", "/auth/callback?state=s&code=c", anon, "", 400}, // no state cookie
	{"POST", "/auth/logout", anon, "", 204},
	{"POST", "/api/v1/auth/logout", anon, "", 204},
	{"GET", "/api/v1/config", anon, "", 200},

	{"GET", "/api/v1/auth/me", viewer, "", 200},
	{"GET", "/api/v1/auth/me", anon, "", 401},
	{"GET", "/api/v1/auth/me", bogus, "", 401},
	{"POST", "/api/v1/onboarding/company", newbie, `{"displayName":"Mine"}`, 201},
	{"POST", "/api/v1/onboarding/company", member, `{"displayName":"Mine"}`, 403},
	{"GET", "/api/v1/audit", member, "", 200},
	{"GET", "/api/v1/audit", anon, "", 401},

	// Companies.
	{"GET", "/api/v1/companies", superAdmin, "", 200},
	{"GET", "/api/v1/companies", companyAdmin, "", 403},
	{"POST", "/api/v1/companies", superAdmin, `{"displayName":"New Co"}`, 201},
	{"POST", "/api/v1/companies", companyAdmin, `{"displayName":"New Co"}`, 403},
	{"GET", "/api/v1/companies/{company}", member, "", 200},
	{"GET", "/api/v1/companies/{company}", outsider, "", 403},
	{"PATCH", "/api/v1/companies/{company}", companyAdmin, `{"description":"d"}`, 200},
	{"PATCH", "/api/v1/companies/{company}", member, `{"description":"d"}`, 403},
	{"DELETE", "/api/v1/companies/{company}", superAdmin, "", 204},
	{"DELETE", "/api/v1/companies/{company}", companyAdmin, "", 403},
	{"GET", "/api/v1/companies/{company}/members", member, "", 200},
	{"GET", "/api/v1/companies/{company}/members", outsider, "", 403},
	{"POST", "/api/v1/companies/{company}/members", companyAdmin, `{"email":"newbie@acme.test","role":"member"}`, 201},
	{"POST", "/api/v1/companies/{company}/members", member, `{"email":"newbie@acme.test","role":"member"}`, 403},
	{"PATCH", "/api/v1/companies/{company}/members/{member}", companyAdmin, `{"role":"admin"}`, 204},
	{"PATCH", "/api/v1/companies/{company}/members/{member}", member, `{"role":"admin"}`, 403},
	{"PATCH", "/api/v1/companies/{company}/members/{companyAdmin}", companyAdmin, `{"role":"member"}`, 409}, // last admin
	{"DELETE", "/api/v1/companies/{company}/members/{member}", companyAdmin, "", 204},
	{"DELETE", "/api/v1/companies/{company}/members/{member}", member, "", 403},
	{"GET", "/api/v1/companies/{company}/teams", member, "", 200},
	{"GET", "/api/v1/companies/{company}/teams", outsider, "", 403},
	{"POST", "/api/v1/companies/{company}/teams", companyAdmin, `{"name":"t2","adminEmail":"member@acme.test"}`, 201},
	{"POST", "/api/v1/companies/{company}/teams", member, `{"name":"t2","adminEmail":"member@acme.test"}`, 403},

	// Teams.
	{"GET", "/api/v1/teams", member, "", 200},
	{"GET", "/api/v1/teams", anon, "", 401},
	{"GET", "/api/v1/teams/{team}", viewer, "", 200},
	{"GET", "/api/v1/teams/{team}", member, "", 403},
	{"GET", "/api/v1/teams/{team}", superAdmin, "", 200},
	{"PATCH", "/api/v1/teams/{team}", teamAdmin, `{"description":"d"}`, 200},
	{"PATCH", "/api/v1/teams/{team}", editor, `{"description":"d"}`, 403},
	{"PATCH", "/api/v1/teams/{team}", companyAdmin, `{"description":"d"}`, 200}, // inherits team admin
	{"DELETE", "/api/v1/teams/{team}", teamAdmin, "", 204},
	{"DELETE", "/api/v1/teams/{team}", editor, "", 403},
	{"GET", "/api/v1/teams/{team}/addable-members", teamAdmin, "", 200},
	{"GET", "/api/v1/teams/{team}/addable-members", editor, "", 403},
	{"GET", "/api/v1/teams/{team}/members", viewer, "", 200},
	{"GET", "/api/v1/teams/{team}/members", member, "", 403},
	{"POST", "/api/v1/teams/{team}/members", teamAdmin, `{"email":"member@acme.test","role":"viewer"}`, 201},
	{"POST", "/api/v1/teams/{team}/members", editor, `{"email":"member@acme.test","role":"viewer"}`, 403},
	{"PATCH", "/api/v1/teams/{team}/members/{viewer}", teamAdmin, `{"role":"editor"}`, 204},
	{"PATCH", "/api/v1/teams/{team}/members/{viewer}", editor, `{"role":"editor"}`, 403},
	{"DELETE", "/api/v1/teams/{team}/members/{viewer}", teamAdmin, "", 204},
	{"DELETE", "/api/v1/teams/{team}/members/{viewer}", editor, "", 403},

	// Flagsets.
	{"GET", "/api/v1/teams/{team}/flagsets", viewer, "", 200},
	{"GET", "/api/v1/teams/{team}/flagsets", member, "", 403},
	{"POST", "/api/v1/teams/{team}/flagsets", editor, `{"name":"fs2"}`, 201},
	{"POST", "/api/v1/teams/{team}/flagsets", viewer, `{"name":"fs2"}`, 403},
	{"GET", "/api/v1/flagsets/{flagset}", viewer, "", 200},
	{"GET", "/api/v1/flagsets/{flagset}", outsider, "", 403},
	{"PATCH", "/api/v1/flagsets/{flagset}", teamAdmin, `{"description":"d"}`, 200},
	{"PATCH", "/api/v1/flagsets/{flagset}", editor, `{"description":"d"}`, 403},
	{"DELETE", "/api/v1/flagsets/{flagset}", teamAdmin, "", 204},
	{"DELETE", "/api/v1/flagsets/{flagset}", editor, "", 403},
	{"GET", "/api/v1/flagsets/{flagset}/api-keys", viewer, "", 200},
	{"GET", "/api/v1/flagsets/{flagset}/api-keys", member, "", 403},
	{"POST", "/api/v1/flagsets/{flagset}/api-keys", teamAdmin, `{"label":"k2"}`, 201},
	{"POST", "/api/v1/flagsets/{flagset}/api-keys", editor, `{"label":"k2"}`, 403},
	{"DELETE", "/api/v1/flagsets/{flagset}/api-keys/{key}", teamAdmin, "", 204},
	{"DELETE", "/api/v1/flagsets/{flagset}/api-keys/{key}", editor, "", 403},

	// Flags.
	{"GET", "/api/v1/teams/{team}/flags", viewer, "", 200},
	{"GET", "/api/v1/teams/{team}/flags", member, "", 403},
	{"GET", "/api/v1/teams/{team}/flags?sort=name&order=desc", viewer, "", 200},
	{"GET", "/api/v1/teams/{team}/flags?sort=bogus", viewer, "", 400},
	{"GET", "/api/v1/teams/{team}/flags?order=up", viewer, "", 400},
	{"GET", "/api/v1/teams/{team}/tags", viewer, "", 200},
	{"GET", "/api/v1/teams/{team}/tags", member, "", 403},
	{"GET", "/api/v1/teams/{team}/owners", viewer, "", 200},
	{"GET", "/api/v1/teams/{team}/owners", member, "", 403},
	{"GET", "/api/v1/flagsets/{flagset}/flags", viewer, "", 200},
	{"GET", "/api/v1/flagsets/{flagset}/flags", member, "", 403},
	{"POST", "/api/v1/flagsets/{flagset}/flags", editor, flagBody, 201},
	{"POST", "/api/v1/flagsets/{flagset}/flags", viewer, flagBody, 403},
	{"GET", "/api/v1/flags/{flag}", viewer, "", 200},
	{"GET", "/api/v1/flags/{flag}", outsider, "", 403},
	{"POST", "/api/v1/flags/{flag}/evaluate", viewer, `{"evaluationContext":{"targetingKey":"u1"}}`, 200},
	{"POST", "/api/v1/flags/{flag}/evaluate", member, `{"evaluationContext":{"targetingKey":"u1"}}`, 403},
	{"PUT", "/api/v1/flags/{flag}", editor, `{"payload":` + testutil.DefaultFlagPayload + `}`, 200},
	{"PUT", "/api/v1/flags/{flag}", viewer, `{"payload":` + testutil.DefaultFlagPayload + `}`, 403},
	{"POST", "/api/v1/flags/{flag}/disable", editor, `{"disabled":true}`, 204},
	{"POST", "/api/v1/flags/{flag}/disable", viewer, `{"disabled":true}`, 403},
	{"POST", "/api/v1/flags/{flag}/disable", editor, `{}`, 400}, // missing field must not enable
	{"DELETE", "/api/v1/flags/{flag}", editor, "", 204},
	{"DELETE", "/api/v1/flags/{flag}", viewer, "", 403},

	// Versions.
	{"GET", "/api/v1/flags/{flag}/versions", viewer, "", 200},
	{"GET", "/api/v1/flags/{flag}/versions", member, "", 403},
	{"GET", "/api/v1/flags/{flag}/versions/1", viewer, "", 200},
	{"GET", "/api/v1/flags/{flag}/versions/1", member, "", 403},
	{"POST", "/api/v1/flags/{flag}/versions/1/rollback", editor, `{}`, 201},
	{"POST", "/api/v1/flags/{flag}/versions/1/rollback", viewer, `{}`, 403},

	// Malformed ids are a client error, never a 500.
	{"GET", "/api/v1/companies/not-a-uuid", superAdmin, "", 404},
	{"GET", "/api/v1/teams/not-a-uuid", superAdmin, "", 404},
	{"GET", "/api/v1/flagsets/not-a-uuid", viewer, "", 404},
	{"GET", "/api/v1/flags/not-a-uuid", viewer, "", 404},
	{"GET", "/api/v1/flags/{flag}/versions/abc", viewer, "", 400},
	{"PATCH", "/api/v1/teams/{team}/members/not-a-uuid", teamAdmin, `{"role":"viewer"}`, 400},
	{"DELETE", "/api/v1/companies/{company}/members/not-a-uuid", companyAdmin, "", 400},
	{"DELETE", "/api/v1/flagsets/{flagset}/api-keys/not-a-uuid", teamAdmin, "", 404},
}

func TestRoutesRBAC(t *testing.T) {
	e, auth := routesServer(t)
	for _, tc := range routeCases {
		t.Run(fmt.Sprintf("%s %s as %q", tc.method, tc.path, tc.actor), func(t *testing.T) {
			f := routesSeed(t, auth)
			rec := f.do(e, tc.method, tc.path, tc.actor, tc.body)
			assert.Equal(t, tc.want, rec.Code, rec.Body.String())
		})
	}
}

// Every id-bearing route, with each id malformed, as a super admin (so the
// handler itself sees the id, not just the RBAC lookup).
func TestRoutesMalformedIDsAreNotServerErrors(t *testing.T) {
	e, auth := routesServer(t)
	placeholder := regexp.MustCompile(`\{\w+\}`)
	seen := map[string]bool{}
	for _, tc := range routeCases {
		path := placeholder.ReplaceAllString(tc.path, "not-a-uuid")
		if path == tc.path || seen[tc.method+path] {
			continue
		}
		seen[tc.method+path] = true
		t.Run(tc.method+" "+path, func(t *testing.T) {
			rec := routesSeed(t, auth).do(e, tc.method, path, superAdmin, tc.body)
			assert.Less(t, rec.Code, 500, rec.Body.String())
		})
	}
}

// A user removed from the company loses access to its teams, and being added
// back does not resurrect the old team role.
func TestRoutesRemovedCompanyMemberLosesTeamAccess(t *testing.T) {
	e, auth := routesServer(t)
	f := routesSeed(t, auth)

	require.Equal(t, 200, f.do(e, "GET", "/api/v1/flags/{flag}", editor, "").Code)
	require.Equal(t, 204, f.do(e, "DELETE", "/api/v1/companies/{company}/members/{editor}", companyAdmin, "").Code)
	assert.Equal(t, 403, f.do(e, "GET", "/api/v1/teams/{team}", editor, "").Code)
	assert.Equal(t, 403, f.do(e, "GET", "/api/v1/flags/{flag}", editor, "").Code)

	require.Equal(t, 201, f.do(e, "POST", "/api/v1/companies/{company}/members", companyAdmin, `{"email":"editor@acme.test","role":"member"}`).Code)
	assert.Equal(t, 403, f.do(e, "PUT", "/api/v1/flags/{flag}", editor, `{"payload":`+testutil.DefaultFlagPayload+`}`).Code)
}

// A company member who is not on team X gets no audit rows of team X, even
// when filtering on it.
func TestRoutesAuditHidesOtherTeams(t *testing.T) {
	e, auth := routesServer(t)
	f := routesSeed(t, auth)
	teamID := f.ids["team"]
	require.NoError(t, repository.NewAuditRepo(f.db).Record(t.Context(), nil, repository.AuditInput{
		TeamID: &teamID, Action: "flag.update", TargetType: "flag", TargetID: f.ids["flag"],
	}))

	total := func(actor string) int {
		rec := f.do(e, "GET", "/api/v1/audit?teamId={team}", actor, "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		var page model.PaginatedResponse[model.AuditEntry]
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &page))
		assert.Len(t, page.Data, page.Total)
		return page.Total
	}
	assert.Equal(t, 1, total(viewer), "team member")
	assert.Equal(t, 1, total(companyAdmin), "company admin")
	assert.Equal(t, 0, total(member), "company member not on the team")
	assert.Equal(t, 0, total(outsider), "other company")
}

// A cross-site browser write is rejected before it reaches the handler, even
// with a valid session cookie.
func TestRoutesCrossSiteWriteRejected(t *testing.T) {
	e, auth := routesServer(t)
	f := routesSeed(t, auth)

	req := f.req("POST", "/api/v1/flags/{flag}/disable", editor, `{"disabled":true}`)
	req.Header.Set(echo.HeaderOrigin, "http://evil.example")
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	assert.Equal(t, http.StatusForbidden, platformServe(e, req).Code)

	rec := f.do(e, "GET", "/api/v1/flags/{flag}", editor, "")
	assert.Contains(t, rec.Body.String(), `"disabled":false`, "flag left untouched")
}

// routesServer builds the real router on the Postgres harness, wired like
// main.go, with an OIDC discovery stub so NewAuthService succeeds.
func routesServer(t *testing.T) (*echo.Echo, *service.AuthService) {
	t.Helper()
	db := testutil.StartPostgres(t)
	var issuer string
	idp := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"issuer":                 issuer,
			"authorization_endpoint": issuer + "/authorize",
			"token_endpoint":         issuer + "/token",
			"jwks_uri":               issuer + "/jwks",
		})
	}))
	t.Cleanup(idp.Close)
	issuer = idp.URL

	cfg := config.Config{
		Server: config.ServerConfig{MultiCompany: true},
		OIDC:   config.OIDCConfig{Issuer: issuer, ClientID: "goff"},
		Auth:   config.AuthConfig{JWTSecret: strings.Repeat("x", 32), SessionMaxAge: time.Hour},
	}
	userRepo := repository.NewUserRepo(db)
	companyRepo := repository.NewCompanyRepo(db)
	teamRepo := repository.NewTeamRepo(db)
	flagsetRepo := repository.NewFlagsetRepo(db)
	flagRepo := repository.NewFlagRepo(db)
	versionRepo := repository.NewFlagVersionRepo(db)
	auditRepo := repository.NewAuditRepo(db)

	authSvc, err := service.NewAuthService(t.Context(), cfg, userRepo, companyRepo)
	require.NoError(t, err)
	companySvc := service.NewCompanyService(companyRepo, userRepo, auditRepo, false)
	teamSvc := service.NewTeamService(teamRepo, userRepo, companyRepo, auditRepo)
	flagsetSvc := service.NewFlagsetService(flagsetRepo, auditRepo)
	flagSvc := service.NewFlagService(db, flagRepo, versionRepo, flagsetRepo, auditRepo)

	h := api.Handlers{
		Auth:       handler.NewAuthHandler(cfg, authSvc, userRepo, teamSvc, companySvc),
		Companies:  handler.NewCompanyHandler(companySvc, teamSvc),
		Teams:      handler.NewTeamHandler(teamSvc),
		Flagsets:   handler.NewFlagsetHandler(flagsetSvc),
		Flags:      handler.NewFlagHandler(flagSvc),
		Versions:   handler.NewVersionHandler(service.NewVersionService(db, flagRepo, versionRepo, flagsetRepo, auditRepo)),
		Audit:      handler.NewAuditHandler(service.NewAuditService(auditRepo), companySvc),
		Onboarding: handler.NewOnboardingHandler(service.NewOnboardingService(companyRepo, userRepo, auditRepo, false)),
		Config:     handler.NewConfigHandler(cfg),
	}
	s := api.Services{Auth: authSvc, Companies: companySvc, Teams: teamSvc, Flagsets: flagsetSvc, Flags: flagSvc}
	return api.New(cfg, slog.New(slog.DiscardHandler), h, s), authSvc
}

type routesFixture struct {
	db     *repository.DB
	ids    map[string]string // placeholder name → id
	tokens map[string]string // actor → session JWT
}

// routesSeed truncates the database and seeds one user per actor.
func routesSeed(t *testing.T, auth *service.AuthService) routesFixture {
	t.Helper()
	db := testutil.StartPostgres(t)
	companies := repository.NewCompanyRepo(db)
	acme := testutil.SeedCompany(t, db, "Acme", nil)
	other := testutil.SeedCompany(t, db, "Other", nil)
	team := testutil.SeedTeam(t, db, acme.ID, "team")
	fs := testutil.SeedFlagset(t, db, team.ID, "fs")
	f := routesFixture{
		db:     db,
		ids:    map[string]string{"company": acme.ID, "team": team.ID, "flagset": fs.ID},
		tokens: map[string]string{bogus: "not-a-jwt"},
	}
	for _, a := range []struct {
		actor   string
		company string
		role    model.CompanyRole
	}{
		{viewer, acme.ID, model.CompanyRoleMember},
		{editor, acme.ID, model.CompanyRoleMember},
		{teamAdmin, acme.ID, model.CompanyRoleMember},
		{member, acme.ID, model.CompanyRoleMember},
		{companyAdmin, acme.ID, model.CompanyRoleAdmin},
		{outsider, other.ID, model.CompanyRoleAdmin},
		{superAdmin, "", ""},
		{newbie, "", ""},
	} {
		u := testutil.SeedUser(t, db, a.actor+"@acme.test", a.actor, a.actor == superAdmin)
		if a.company != "" {
			require.NoError(t, companies.SetMember(t.Context(), a.company, u.ID, a.role))
		}
		tok, err := auth.IssueJWT(u)
		require.NoError(t, err)
		f.ids[a.actor], f.tokens[a.actor] = u.ID, tok
	}
	testutil.AddTeamMember(t, db, team.ID, f.ids[viewer], model.RoleViewer)
	testutil.AddTeamMember(t, db, team.ID, f.ids[editor], model.RoleEditor)
	testutil.AddTeamMember(t, db, team.ID, f.ids[teamAdmin], model.RoleAdmin)
	f.ids["flag"] = testutil.SeedFlag(t, db, fs.ID, "flag", nil, nil).ID
	key, err := repository.NewFlagsetRepo(db).InsertAPIKey(t.Context(), fs.ID, "k", "goff_test", f.ids[teamAdmin])
	require.NoError(t, err)
	f.ids["key"] = key.ID
	return f
}

// req builds a request with {placeholders} resolved and the actor's session.
func (f routesFixture) req(method, path, actor, body string) *http.Request {
	for name, id := range f.ids {
		path = strings.ReplaceAll(path, "{"+name+"}", id)
	}
	var r io.Reader
	if body != "" {
		r = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, r)
	if body != "" {
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	}
	if tok := f.tokens[actor]; tok != "" {
		req.AddCookie(&http.Cookie{Name: middleware.SessionCookieName, Value: tok})
	}
	return req
}

func (f routesFixture) do(e *echo.Echo, method, path, actor, body string) *httptest.ResponseRecorder {
	return platformServe(e, f.req(method, path, actor, body))
}
