package handler

import (
	"net/http"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOnboardingHandler(t *testing.T) {
	s := newStack(t)
	h := NewOnboardingHandler(s.onboardSvc)

	tests := []struct {
		name       string
		email      string // "" sends a session for a user that doesn't exist
		setup      func(t *testing.T, userID string)
		body       string
		wantStatus int
		wantMsg    string
		wantField  string
	}{
		{name: "creates the company for an unattached user", email: "new@startup.com",
			body: `{"displayName":"Startup"}`, wantStatus: http.StatusCreated},
		{name: "empty name", email: "n2@startup.com", body: `{"displayName":""}`,
			wantStatus: http.StatusBadRequest, wantMsg: "validation failed", wantField: "displayName"},
		{name: "bad body", email: "n3@startup.com", body: `{`,
			wantStatus: http.StatusBadRequest, wantMsg: "invalid JSON at offset 1"},
		{name: "already attached", email: "attached@startup.com",
			setup: func(t *testing.T, userID string) {
				c, rec := reqCtx(http.MethodPost, `{"displayName":"First"}`)
				withClaims(c, userID, false)
				require.NoError(t, h.CreateCompany(c))
				require.Equal(t, http.StatusCreated, rec.Code)
			},
			body: `{"displayName":"Second"}`, wantStatus: http.StatusForbidden, wantMsg: "forbidden"},
		{name: "unknown user", body: `{"displayName":"Ghost Co"}`,
			wantStatus: http.StatusNotFound, wantMsg: "not found"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			userID := missingUUID
			if tt.email != "" {
				userID = testutil.SeedUser(t, s.db, tt.email, "U", false).ID
			}
			if tt.setup != nil {
				tt.setup(t, userID)
			}
			c, rec := reqCtx(http.MethodPost, tt.body)
			withClaims(c, userID, false)
			require.NoError(t, h.CreateCompany(c))
			assert.Equal(t, tt.wantStatus, rec.Code)
			resp := decodeResp(t, rec)
			if tt.wantStatus == http.StatusCreated {
				assert.Equal(t, "Startup", dataMap(t, resp.Data)["displayName"])
				return
			}
			assert.Equal(t, tt.wantMsg, resp.Message)
			if tt.wantField != "" {
				assert.Contains(t, resp.Errors, tt.wantField)
			}
		})
	}
}

// TestOnboardingHandlerMonoCompany: the session's super admin flag decides,
// not the stored one. Own test: mono mode needs a database without companies.
func TestOnboardingHandlerMonoCompany(t *testing.T) {
	s := newStack(t)
	mono := NewOnboardingHandler(service.NewOnboardingService(repository.NewCompanyRepo(s.db),
		repository.NewUserRepo(s.db), repository.NewAuditRepo(s.db), true))
	// Stored as super admin, but the session (e.g. removed from adminEmails) says no.
	admin := testutil.SeedUser(t, s.db, "root@mono.com", "Root", true)
	c, rec := reqCtx(http.MethodPost, `{"displayName":"Mono"}`)
	withClaims(c, admin.ID, false)
	require.NoError(t, mono.CreateCompany(c))
	assert.Equal(t, http.StatusForbidden, rec.Code)

	c, rec = reqCtx(http.MethodPost, `{"displayName":"Mono"}`)
	withClaims(c, admin.ID, true)
	require.NoError(t, mono.CreateCompany(c))
	assert.Equal(t, http.StatusCreated, rec.Code)

	// Super admins seeded later join the mono company at login; this one has
	// no company yet but the single company exists.
	admin2 := testutil.SeedUser(t, s.db, "root2@mono.com", "Root2", true)
	c, rec = reqCtx(http.MethodPost, `{"displayName":"Second"}`)
	withClaims(c, admin2.ID, true)
	require.NoError(t, mono.CreateCompany(c))
	assert.Equal(t, http.StatusConflict, rec.Code)
	assert.Equal(t, "a company already exists (mono company mode)", decodeResp(t, rec).Message)
}
