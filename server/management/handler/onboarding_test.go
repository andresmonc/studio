package handler

import (
	"net/http"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOnboardingHandler(t *testing.T) {
	s := newStack(t)
	h := NewOnboardingHandler(s.onboardSvc)

	t.Run("CreateCompany success for unattached user", func(t *testing.T) {
		user := testutil.SeedUser(t, s.db, "new@startup.com", "New", false)
		c, rec := reqCtx(http.MethodPost, `{"displayName":"Startup"}`)
		withClaims(c, user.ID, false)
		require.NoError(t, h.CreateCompany(c))
		assert.Equal(t, http.StatusCreated, rec.Code)
		assert.Equal(t, "Startup", dataMap(t, decodeResp(t, rec).Data)["displayName"])
	})

	t.Run("CreateCompany validation error empty name -> 400", func(t *testing.T) {
		user := testutil.SeedUser(t, s.db, "n2@startup.com", "N2", false)
		c, rec := reqCtx(http.MethodPost, `{"displayName":""}`)
		withClaims(c, user.ID, false)
		require.NoError(t, h.CreateCompany(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("CreateCompany bad body -> 400", func(t *testing.T) {
		user := testutil.SeedUser(t, s.db, "n3@startup.com", "N3", false)
		c, rec := reqCtx(http.MethodPost, `{`)
		withClaims(c, user.ID, false)
		require.NoError(t, h.CreateCompany(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("CreateCompany when already attached -> 403", func(t *testing.T) {
		user := testutil.SeedUser(t, s.db, "attached@startup.com", "Att", false)
		// First creation attaches the user as company admin.
		c1, rec1 := reqCtx(http.MethodPost, `{"displayName":"First"}`)
		withClaims(c1, user.ID, false)
		require.NoError(t, h.CreateCompany(c1))
		require.Equal(t, http.StatusCreated, rec1.Code)

		// Second creation is forbidden: user already belongs to a company.
		c2, rec2 := reqCtx(http.MethodPost, `{"displayName":"Second"}`)
		withClaims(c2, user.ID, false)
		require.NoError(t, h.CreateCompany(c2))
		assert.Equal(t, http.StatusForbidden, rec2.Code)
	})

	t.Run("CreateCompany unknown user -> 404", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"displayName":"Ghost Co"}`)
		withClaims(c, missingUUID, false)
		require.NoError(t, h.CreateCompany(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}
