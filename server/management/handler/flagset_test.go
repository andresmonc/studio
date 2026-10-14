package handler

import (
	"net/http"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFlagsetHandler(t *testing.T) {
	s := newStack(t)
	h := NewFlagsetHandler(s.flagsetSvc)
	actor := testutil.SeedUser(t, s.db, "actor@acme.com", "Actor", true)
	co := testutil.SeedCompany(t, s.db, "Acme")
	team := testutil.SeedTeam(t, s.db, co.ID, "Platform")

	t.Run("Create success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"name":"prod"}`)
		params(c, "teamId", team.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Create(c))
		assert.Equal(t, http.StatusCreated, rec.Code)
		assert.Equal(t, "prod", dataMap(t, decodeResp(t, rec).Data)["name"])
	})

	t.Run("Create validation error empty name", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"name":""}`)
		params(c, "teamId", team.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Create(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Contains(t, decodeResp(t, rec).Errors, "name")
	})

	t.Run("Create bad body", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{`)
		params(c, "teamId", team.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Create(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("ListByTeam", func(t *testing.T) {
		listed := testutil.SeedTeam(t, s.db, co.ID, "Listed")
		fs := testutil.SeedFlagset(t, s.db, listed.ID, "only")
		testutil.SeedFlagset(t, s.db, team.ID, "elsewhere")
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "teamId", listed.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.ListByTeam(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, []string{fs.ID}, ids(t, decodeResp(t, rec).Data, "id"))
	})

	t.Run("Create with a taken name -> 409", func(t *testing.T) {
		testutil.SeedFlagset(t, s.db, team.ID, "taken")
		c, rec := reqCtx(http.MethodPost, `{"name":"taken"}`)
		params(c, "teamId", team.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Create(c))
		assert.Equal(t, http.StatusConflict, rec.Code)
		assert.Equal(t, "flagset name already used in this team", decodeResp(t, rec).Message)
	})

	t.Run("Get success", func(t *testing.T) {
		fs := testutil.SeedFlagset(t, s.db, team.ID, "staging")
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "id", fs.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Get(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "staging", dataMap(t, decodeResp(t, rec).Data)["name"])
	})

	t.Run("Get not found", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "id", missingUUID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Get(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("Update success", func(t *testing.T) {
		fs := testutil.SeedFlagset(t, s.db, team.ID, "qa")
		c, rec := reqCtx(http.MethodPatch, `{"name":"qa2"}`)
		params(c, "id", fs.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Update(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "qa2", dataMap(t, decodeResp(t, rec).Data)["name"])
	})

	t.Run("Update not found", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPatch, `{"name":"x"}`)
		params(c, "id", missingUUID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Update(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("Update bad body", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPatch, `{`)
		params(c, "id", missingUUID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Update(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("Delete success", func(t *testing.T) {
		fs := testutil.SeedFlagset(t, s.db, team.ID, "doomed")
		c, rec := reqCtx(http.MethodDelete, "")
		params(c, "id", fs.ID)
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

func TestFlagsetHandlerAPIKeys(t *testing.T) {
	s := newStack(t)
	h := NewFlagsetHandler(s.flagsetSvc)
	actor := testutil.SeedUser(t, s.db, "actor@acme.com", "Actor", true)
	co := testutil.SeedCompany(t, s.db, "Acme")
	team := testutil.SeedTeam(t, s.db, co.ID, "Platform")
	fs := testutil.SeedFlagset(t, s.db, team.ID, "prod")

	t.Run("CreateAPIKey success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"label":"ci"}`)
		params(c, "id", fs.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.CreateAPIKey(c))
		assert.Equal(t, http.StatusCreated, rec.Code)
		data := dataMap(t, decodeResp(t, rec).Data)
		assert.Equal(t, "ci", data["label"])
		assert.NotEmpty(t, data["id"])
	})

	t.Run("CreateAPIKey flagset not found -> 404", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"label":"x"}`)
		params(c, "id", missingUUID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.CreateAPIKey(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("CreateAPIKey bad body -> 400", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{`)
		params(c, "id", fs.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.CreateAPIKey(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("ListAPIKeys", func(t *testing.T) {
		listed := testutil.SeedFlagset(t, s.db, team.ID, "listed")
		key, err := s.flagsetSvc.CreateAPIKey(t.Context(), actor.ID, listed.ID, "ci")
		require.NoError(t, err)
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "id", listed.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.ListAPIKeys(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, []string{key.ID}, ids(t, decodeResp(t, rec).Data, "id"))
	})

	t.Run("DeleteAPIKey success", func(t *testing.T) {
		key, err := s.flagsetSvc.CreateAPIKey(t.Context(), actor.ID, fs.ID, "to-revoke")
		require.NoError(t, err)
		c, rec := reqCtx(http.MethodDelete, "")
		params(c, "id", fs.ID, "keyId", key.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.DeleteAPIKey(c))
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("DeleteAPIKey of another flagset -> 404", func(t *testing.T) {
		other := testutil.SeedFlagset(t, s.db, team.ID, "other")
		key, err := s.flagsetSvc.CreateAPIKey(t.Context(), actor.ID, other.ID, "theirs")
		require.NoError(t, err)
		c, rec := reqCtx(http.MethodDelete, "")
		params(c, "id", fs.ID, "keyId", key.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.DeleteAPIKey(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("DeleteAPIKey unknown key", func(t *testing.T) {
		c, rec := reqCtx(http.MethodDelete, "")
		params(c, "id", fs.ID, "keyId", missingUUID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.DeleteAPIKey(c))
		// FlagsetService.DeleteAPIKey translates repository.ErrNotFound into
		// service.ErrNotFound, so deleting an unknown key returns 404.
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}
