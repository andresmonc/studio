package handler

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const validFlagPayload = `{"name":"my-flag","payload":{"variations":{"on":true,"off":false},"defaultRule":{"variation":"on"}}}`

func TestFlagHandler(t *testing.T) {
	s := newStack(t)
	h := NewFlagHandler(s.flagSvc)
	actor := testutil.SeedUser(t, s.db, "actor@acme.com", "Actor", true)
	co := testutil.SeedCompany(t, s.db, "Acme", nil)
	team := testutil.SeedTeam(t, s.db, co.ID, "Platform")
	fs := testutil.SeedFlagset(t, s.db, team.ID, "prod")

	t.Run("Create success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, validFlagPayload)
		params(c, "flagsetId", fs.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Create(c))
		assert.Equal(t, http.StatusCreated, rec.Code)
		assert.Equal(t, "my-flag", dataMap(t, decodeResp(t, rec).Data)["name"])
	})

	t.Run("Create empty name -> 400", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"name":"","payload":{"variations":{"on":true,"off":false},"defaultRule":{"variation":"on"}}}`)
		params(c, "flagsetId", fs.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Create(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("Create invalid payload (1 variation) -> 400", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"name":"f","payload":{"variations":{"on":true},"defaultRule":{"variation":"on"}}}`)
		params(c, "flagsetId", fs.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Create(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("Create flagset not found -> 404", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, validFlagPayload)
		params(c, "flagsetId", missingUUID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Create(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("Create bad body -> 400", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{`)
		params(c, "flagsetId", fs.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Create(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("List", func(t *testing.T) {
		c, rec := reqCtxQuery(http.MethodGet, "page=1&pageSize=10&name=my")
		params(c, "flagsetId", fs.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.List(c))
		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("List invalid disabled filter -> 400", func(t *testing.T) {
		c, rec := reqCtxQuery(http.MethodGet, "disabled=maybe")
		params(c, "flagsetId", fs.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.List(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Contains(t, decodeResp(t, rec).Errors, "disabled")
	})

	t.Run("List non-integer page/pageSize -> 400", func(t *testing.T) {
		c, rec := reqCtxQuery(http.MethodGet, "page=abc&pageSize=1.5")
		params(c, "flagsetId", fs.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.List(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		errs := decodeResp(t, rec).Errors
		assert.Equal(t, []string{"must be an integer"}, errs["page"])
		assert.Contains(t, errs, "pageSize")
	})

	t.Run("ListByTeam", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "teamId", team.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.ListByTeam(c))
		assert.Equal(t, http.StatusOK, rec.Code)
	})
}

func TestFlagHandlerSingle(t *testing.T) {
	s := newStack(t)
	h := NewFlagHandler(s.flagSvc)
	actor := testutil.SeedUser(t, s.db, "actor@acme.com", "Actor", true)
	co := testutil.SeedCompany(t, s.db, "Acme", nil)
	team := testutil.SeedTeam(t, s.db, co.ID, "Platform")
	fs := testutil.SeedFlagset(t, s.db, team.ID, "prod")
	flag := testutil.SeedFlag(t, s.db, fs.ID, "feature-x", json.RawMessage(testutil.DefaultFlagPayload), &actor.ID)

	t.Run("Get success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "id", flag.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Get(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "feature-x", dataMap(t, decodeResp(t, rec).Data)["name"])
	})

	t.Run("Get not found", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "id", missingUUID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Get(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("Evaluate success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"evaluationContext":{"targetingKey":"user-1"}}`)
		params(c, "id", flag.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Evaluate(c))
		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("Evaluate not found", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"evaluationContext":{"targetingKey":"user-1"}}`)
		params(c, "id", missingUUID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Evaluate(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("Evaluate bad body -> 400", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{`)
		params(c, "id", flag.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Evaluate(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("Update success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPut, `{"payload":{"variations":{"on":true,"off":false},"defaultRule":{"variation":"off"}}}`)
		params(c, "id", flag.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Update(c))
		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("Update not found", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPut, `{"payload":{"variations":{"on":true,"off":false},"defaultRule":{"variation":"on"}}}`)
		params(c, "id", missingUUID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Update(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("Update invalid payload -> 400", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPut, `{"payload":{"variations":{"on":true},"defaultRule":{"variation":"on"}}}`)
		params(c, "id", flag.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Update(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("Update bad body -> 400", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPut, `{`)
		params(c, "id", flag.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Update(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("Disable success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"disabled":true}`)
		params(c, "id", flag.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Disable(c))
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("Disable without disabled field -> 400, state unchanged", func(t *testing.T) {
		for _, body := range []string{`{}`, ""} {
			c, rec := reqCtx(http.MethodPost, body)
			params(c, "id", flag.ID)
			withClaims(c, actor.ID, true)
			require.NoError(t, h.Disable(c))
			assert.Equal(t, http.StatusBadRequest, rec.Code, "body %q", body)
			assert.Contains(t, decodeResp(t, rec).Errors, "disabled")
			got, err := s.flagSvc.Get(t.Context(), flag.ID)
			require.NoError(t, err)
			assert.True(t, got.Disabled, "still disabled from the previous subtest")
		}
	})

	t.Run("Disable not found", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"disabled":true}`)
		params(c, "id", missingUUID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Disable(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("Disable bad body -> 400", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{`)
		params(c, "id", flag.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.Disable(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("Delete success", func(t *testing.T) {
		victim := testutil.SeedFlag(t, s.db, fs.ID, "to-delete", json.RawMessage(testutil.DefaultFlagPayload), &actor.ID)
		c, rec := reqCtx(http.MethodDelete, "")
		params(c, "id", victim.ID)
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
