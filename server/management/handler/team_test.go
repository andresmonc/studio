package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ids returns the "id" (or key) of each object of a list response.
func ids(t *testing.T, data any, key string) []string {
	t.Helper()
	list, ok := data.([]any)
	require.True(t, ok, "data is a list, got %T", data)
	out := make([]string, len(list))
	for i, item := range list {
		out[i], _ = dataMap(t, item)[key].(string)
	}
	return out
}

func TestTeamHandler(t *testing.T) {
	s := newStack(t)
	h := NewTeamHandler(s.teamSvc)
	actor := testutil.SeedUser(t, s.db, "actor@acme.com", "Actor", true)
	co := testutil.SeedCompany(t, s.db, "Acme")
	team := testutil.SeedTeam(t, s.db, co.ID, "Platform")
	other := testutil.SeedTeam(t, s.db, co.ID, "Other")
	foreign := testutil.SeedTeam(t, s.db, testutil.SeedCompany(t, s.db, "Globex").ID, "Foreign")
	member := testutil.SeedUser(t, s.db, "member@acme.com", "Member", false)
	testutil.SetCompanyMember(t, s.db, co.ID, member.ID, model.CompanyRoleMember)
	testutil.AddTeamMember(t, s.db, team.ID, member.ID, model.RoleViewer)

	t.Run("List: a super admin sees every team", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		withClaims(c, actor.ID, true)
		require.NoError(t, h.List(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.ElementsMatch(t, []string{team.ID, other.ID, foreign.ID}, ids(t, decodeResp(t, rec).Data, "id"))
	})

	t.Run("List: a company member sees their company's teams only", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		withClaims(c, member.ID, false)
		require.NoError(t, h.List(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.ElementsMatch(t, []string{team.ID, other.ID}, ids(t, decodeResp(t, rec).Data, "id"))
	})

	t.Run("Get success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "id", team.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Get(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "Platform", dataMap(t, decodeResp(t, rec).Data)["name"])
	})

	t.Run("Update success", func(t *testing.T) {
		toRename := testutil.SeedTeam(t, s.db, co.ID, "Rename me")
		c, rec := reqCtx(http.MethodPatch, `{"name":"Renamed"}`)
		params(c, "id", toRename.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Update(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "Renamed", dataMap(t, decodeResp(t, rec).Data)["name"])
	})

	t.Run("Update to a taken name -> 409", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPatch, `{"name":"Platform"}`)
		params(c, "id", other.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Update(c))
		assert.Equal(t, http.StatusConflict, rec.Code)
		assert.Equal(t, "team name already used in this company", decodeResp(t, rec).Message)
	})

	t.Run("ListMembers", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "id", team.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.ListMembers(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, []string{member.ID}, ids(t, decodeResp(t, rec).Data, "userId"))
	})

	t.Run("AddableMembers excludes current members and other companies", func(t *testing.T) {
		addable := testutil.SeedUser(t, s.db, "free@acme.com", "Free", false)
		testutil.SetCompanyMember(t, s.db, co.ID, addable.ID, model.CompanyRoleMember)
		testutil.SeedUser(t, s.db, "out@x.com", "Out", false)
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "id", team.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.AddableMembers(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, []string{addable.ID}, ids(t, decodeResp(t, rec).Data, "userId"))
	})

	t.Run("Delete success", func(t *testing.T) {
		toDelete := testutil.SeedTeam(t, s.db, co.ID, "Temp")
		c, rec := reqCtx(http.MethodDelete, "")
		params(c, "id", toDelete.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Delete(c))
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	notFound := []struct {
		name string
		call func(h *TeamHandler, c *echo.Context) error
		body string
	}{
		{"Get", (*TeamHandler).Get, ""},
		{"Update", (*TeamHandler).Update, `{"name":"X"}`},
		{"AddableMembers", (*TeamHandler).AddableMembers, ""},
		{"Delete", (*TeamHandler).Delete, ""},
	}
	for _, tt := range notFound {
		t.Run(tt.name+" unknown team -> 404", func(t *testing.T) {
			c, rec := reqCtx(http.MethodGet, tt.body)
			params(c, "id", missingUUID)
			withClaims(c, actor.ID, true)
			require.NoError(t, tt.call(h, c))
			assert.Equal(t, http.StatusNotFound, rec.Code)
			assert.Equal(t, "not found", decodeResp(t, rec).Message)
		})
	}

	t.Run("Update bad body -> 400", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPatch, `{`)
		params(c, "id", team.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Update(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Equal(t, "invalid JSON at offset 1", decodeResp(t, rec).Message)
	})
}

// TestTeamHandlerMembers: each subtest seeds its own team and member, so any
// one runs alone with -run.
func TestTeamHandlerMembers(t *testing.T) {
	s := newStack(t)
	h := NewTeamHandler(s.teamSvc)
	actor := testutil.SeedUser(t, s.db, "actor@acme.com", "Actor", true)
	co := testutil.SeedCompany(t, s.db, "Acme")
	testutil.SeedUser(t, s.db, "out@x.com", "Out", false)
	n := 0
	// seed returns a fresh team and a company member, on the team with role
	// when it isn't "".
	seed := func(t *testing.T, role model.Role) (*model.Team, *model.User) {
		t.Helper()
		n++
		team := testutil.SeedTeam(t, s.db, co.ID, "team-"+string(rune('a'+n)))
		u := testutil.SeedUser(t, s.db, "m"+string(rune('a'+n))+"@acme.com", "M", false)
		testutil.SetCompanyMember(t, s.db, co.ID, u.ID, model.CompanyRoleMember)
		if role != "" {
			testutil.AddTeamMember(t, s.db, team.ID, u.ID, role)
		}
		return team, u
	}
	call := func(t *testing.T, fn func(*echo.Context) error, method, body string, kv ...string) *httptest.ResponseRecorder {
		t.Helper()
		c, rec := reqCtx(method, body)
		params(c, kv...)
		withClaims(c, actor.ID, true)
		require.NoError(t, fn(c))
		return rec
	}

	t.Run("AddMember adds -> 201", func(t *testing.T) {
		team, u := seed(t, "")
		rec := call(t, h.AddMember, http.MethodPost, `{"email":"`+u.Email+`","role":"editor"}`, "id", team.ID)
		assert.Equal(t, http.StatusCreated, rec.Code)
		assert.Equal(t, u.ID, dataMap(t, decodeResp(t, rec).Data)["userId"])
	})

	t.Run("AddMember existing member sets the role -> 200", func(t *testing.T) {
		team, u := seed(t, model.RoleEditor)
		rec := call(t, h.AddMember, http.MethodPost, `{"email":"`+u.Email+`","role":"viewer"}`, "id", team.ID)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "viewer", dataMap(t, decodeResp(t, rec).Data)["role"])
	})

	addErrors := []struct {
		name, body string
		wantStatus int
		wantMsg    string
	}{
		{"invalid role", `{"email":"x@acme.com","role":"boss"}`, http.StatusBadRequest, "validation failed"},
		{"unknown email", `{"email":"ghost@acme.com","role":"viewer"}`, http.StatusNotFound,
			"user with email ghost@acme.com not found"},
		{"user not in the company", `{"email":"out@x.com","role":"viewer"}`, http.StatusNotFound,
			"user with email out@x.com not found"},
		{"bad body", `{`, http.StatusBadRequest, "invalid JSON at offset 1"},
	}
	for _, tt := range addErrors {
		t.Run("AddMember "+tt.name, func(t *testing.T) {
			team, _ := seed(t, "")
			rec := call(t, h.AddMember, http.MethodPost, tt.body, "id", team.ID)
			assert.Equal(t, tt.wantStatus, rec.Code)
			assert.Equal(t, tt.wantMsg, decodeResp(t, rec).Message)
		})
	}

	t.Run("UpdateMember -> 204", func(t *testing.T) {
		team, u := seed(t, model.RoleViewer)
		rec := call(t, h.UpdateMember, http.MethodPatch, `{"role":"admin"}`, "id", team.ID, "uid", u.ID)
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("UpdateMember invalid role -> 400", func(t *testing.T) {
		team, u := seed(t, model.RoleViewer)
		rec := call(t, h.UpdateMember, http.MethodPatch, `{"role":"x"}`, "id", team.ID, "uid", u.ID)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Contains(t, decodeResp(t, rec).Errors, "role")
	})

	t.Run("RemoveMember -> 204", func(t *testing.T) {
		team, u := seed(t, model.RoleViewer)
		rec := call(t, h.RemoveMember, http.MethodDelete, "", "id", team.ID, "uid", u.ID)
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("RemoveMember not a member -> 404", func(t *testing.T) {
		team, u := seed(t, "")
		rec := call(t, h.RemoveMember, http.MethodDelete, "", "id", team.ID, "uid", u.ID)
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}
