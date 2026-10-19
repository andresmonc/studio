package handler

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestVersionHandler(t *testing.T) {
	s := newStack(t)
	h := NewVersionHandler(s.versionSvc)
	actor := testutil.SeedUser(t, s.db, "actor@acme.com", "Actor", true)
	co := testutil.SeedCompany(t, s.db, "Acme")
	team := testutil.SeedTeam(t, s.db, co.ID, "Platform")
	fs := testutil.SeedFlagset(t, s.db, team.ID, "prod")
	flag := testutil.SeedFlag(t, s.db, fs.ID, "feature-x", json.RawMessage(testutil.DefaultFlagPayload), &actor.ID)

	t.Run("List", func(t *testing.T) {
		c, rec := reqCtxQuery("page=1&pageSize=10")
		params(c, "id", flag.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.List(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		var page model.PaginatedResponse[model.FlagVersion]
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &page))
		assert.GreaterOrEqual(t, page.Total, 1)
		assert.Equal(t, 1, page.Data[len(page.Data)-1].VersionNumber, "newest first, v1 last")
	})

	t.Run("List unknown flag -> 404", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "id", missingUUID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.List(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("List non-integer page -> 400", func(t *testing.T) {
		c, rec := reqCtxQuery("page=x")
		params(c, "id", flag.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.List(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Contains(t, decodeResp(t, rec).Errors, "page")
	})

	t.Run("Get success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "id", flag.ID, "n", "1")
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Get(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.EqualValues(t, 1, dataMap(t, decodeResp(t, rec).Data)["versionNumber"])
	})

	t.Run("Get invalid version number -> 400", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "id", flag.ID, "n", "abc")
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Get(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("Get missing version -> 404", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "id", flag.ID, "n", "999")
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Get(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("Rollback to the served payload -> 200, nothing written", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"comment":"noop"}`)
		params(c, "id", flag.ID, "n", "1")
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Rollback(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.InDelta(t, 1, dataMap(t, decodeResp(t, rec).Data)["versionNumber"], 0)
	})

	t.Run("Rollback success", func(t *testing.T) {
		// v2 serves "off", so rolling back to v1 creates a new current version.
		_, err := s.flagSvc.Update(t.Context(), actor.ID, flag.ID, &model.UpdateFlagRequest{
			Payload: json.RawMessage(`{"variations":{"on":true,"off":false},"defaultRule":{"variation":"off"}}`),
		})
		require.NoError(t, err)
		c, rec := reqCtx(http.MethodPost, `{"comment":"revert"}`)
		params(c, "id", flag.ID, "n", "1")
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Rollback(c))
		assert.Equal(t, http.StatusCreated, rec.Code)
		assert.Equal(t, "revert", dataMap(t, decodeResp(t, rec).Data)["comment"])
	})

	t.Run("Rollback without body", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, "")
		params(c, "id", flag.ID, "n", "2")
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Rollback(c))
		assert.Equal(t, http.StatusCreated, rec.Code)
	})

	t.Run("Rollback bad body -> 400", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{`)
		params(c, "id", flag.ID, "n", "1")
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Rollback(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("Rollback invalid version number -> 400", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{}`)
		params(c, "id", flag.ID, "n", "xx")
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Rollback(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("Rollback missing source version -> 404", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{}`)
		params(c, "id", flag.ID, "n", "999")
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Rollback(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}
