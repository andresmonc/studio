package handler

import (
	"net/http"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTeamHandler(t *testing.T) {
	s := newStack(t)
	h := NewTeamHandler(s.teamSvc)
	actor := testutil.SeedUser(t, s.db, "actor@acme.com", "Actor", true)
	co := testutil.SeedCompany(t, s.db, "Acme", nil)
	team := testutil.SeedTeam(t, s.db, co.ID, "Platform")

	t.Run("List", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		withClaims(c, actor.ID, true)
		require.NoError(t, h.List(c))
		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("Get success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "id", team.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Get(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "Platform", dataMap(t, decodeResp(t, rec).Data)["name"])
	})

	t.Run("Get not found", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "id", missingUUID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Get(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("Update success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPatch, `{"name":"Platform2"}`)
		params(c, "id", team.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Update(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "Platform2", dataMap(t, decodeResp(t, rec).Data)["name"])
	})

	t.Run("Update not found", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPatch, `{"name":"X"}`)
		params(c, "id", missingUUID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Update(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("Update bad body", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPatch, `{`)
		params(c, "id", team.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Update(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("ListMembers", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "id", team.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.ListMembers(c))
		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("AddableMembers", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "id", team.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.AddableMembers(c))
		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("AddableMembers not found", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "id", missingUUID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.AddableMembers(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("Delete success", func(t *testing.T) {
		toDelete := testutil.SeedTeam(t, s.db, co.ID, "Temp")
		c, rec := reqCtx(http.MethodDelete, "")
		params(c, "id", toDelete.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Delete(c))
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("Delete not found", func(t *testing.T) {
		c, rec := reqCtx(http.MethodDelete, "")
		params(c, "id", missingUUID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Delete(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}

func TestTeamHandlerMembers(t *testing.T) {
	s := newStack(t)
	h := NewTeamHandler(s.teamSvc)
	actor := testutil.SeedUser(t, s.db, "actor@acme.com", "Actor", true)
	co := testutil.SeedCompany(t, s.db, "Acme", nil)
	team := testutil.SeedTeam(t, s.db, co.ID, "Platform")
	member := testutil.SeedUser(t, s.db, "member@acme.com", "Member", false)
	require.NoError(t, s.companyRepo.SetMember(t.Context(), co.ID, member.ID, model.CompanyRoleMember))

	t.Run("AddMember success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"email":"member@acme.com","role":"editor"}`)
		params(c, "id", team.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.AddMember(c))
		assert.Equal(t, http.StatusCreated, rec.Code)
		assert.Equal(t, member.ID, dataMap(t, decodeResp(t, rec).Data)["userId"])
	})

	t.Run("AddMember existing member -> 200", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"email":"member@acme.com","role":"viewer"}`)
		params(c, "id", team.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.AddMember(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "viewer", dataMap(t, decodeResp(t, rec).Data)["role"])
	})

	t.Run("AddMember invalid role -> 400", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"email":"member@acme.com","role":"boss"}`)
		params(c, "id", team.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.AddMember(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("AddMember unknown email -> 404", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"email":"ghost@acme.com","role":"viewer"}`)
		params(c, "id", team.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.AddMember(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("AddMember user not in company -> 404", func(t *testing.T) {
		outsider := testutil.SeedUser(t, s.db, "out@x.com", "Out", false)
		_ = outsider
		c, rec := reqCtx(http.MethodPost, `{"email":"out@x.com","role":"viewer"}`)
		params(c, "id", team.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.AddMember(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("AddMember bad body -> 400", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{`)
		params(c, "id", team.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.AddMember(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("UpdateMember success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPatch, `{"role":"admin"}`)
		params(c, "id", team.ID, "uid", member.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.UpdateMember(c))
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("UpdateMember invalid role -> 400", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPatch, `{"role":"x"}`)
		params(c, "id", team.ID, "uid", member.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.UpdateMember(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("RemoveMember success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodDelete, "")
		params(c, "id", team.ID, "uid", member.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.RemoveMember(c))
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("RemoveMember not a member", func(t *testing.T) {
		c, rec := reqCtx(http.MethodDelete, "")
		params(c, "id", team.ID, "uid", missingUUID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.RemoveMember(c))
		// TeamService.RemoveMember translates repository.ErrNotFound into
		// service.ErrNotFound, so removing a non-member returns 404.
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}
