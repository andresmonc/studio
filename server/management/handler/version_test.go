package handler

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestVersionHandler(t *testing.T) {
	s := newStack(t)
	h := NewVersionHandler(s.versionSvc)
	actor := testutil.SeedUser(t, s.db, "actor@acme.com", "Actor", true)
	co := testutil.SeedCompany(t, s.db, "Acme", nil)
	team := testutil.SeedTeam(t, s.db, co.ID, "Platform")
	fs := testutil.SeedFlagset(t, s.db, team.ID, "prod")
	flag := testutil.SeedFlag(t, s.db, fs.ID, "feature-x", json.RawMessage(testutil.DefaultFlagPayload), &actor.ID)

	t.Run("List", func(t *testing.T) {
		c, rec := reqCtxQuery(http.MethodGet, "page=1&pageSize=10")
		params(c, "id", flag.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.List(c))
		assert.Equal(t, http.StatusOK, rec.Code)
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

	t.Run("Rollback success", func(t *testing.T) {
		// Roll back to the flag's existing version 1, creating a new current version.
		c, rec := reqCtx(http.MethodPost, `{"comment":"revert"}`)
		params(c, "id", flag.ID, "n", "1")
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Rollback(c))
		assert.Equal(t, http.StatusCreated, rec.Code)
	})

	t.Run("Rollback without body", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, "")
		params(c, "id", flag.ID, "n", "1")
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
