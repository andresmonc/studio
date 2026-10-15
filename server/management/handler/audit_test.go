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

func TestAuditHandler(t *testing.T) {
	s := newStack(t)
	h := NewAuditHandler(s.auditSvc)
	actor := testutil.SeedUser(t, s.db, "actor@acme.com", "Actor", true)
	co := testutil.SeedCompany(t, s.db, "Acme")

	// Generate at least one audit entry via a real service call.
	_, err := s.companySvc.Create(t.Context(), actor.ID, &model.CreateCompanyRequest{DisplayName: "Logged"})
	require.NoError(t, err)

	t.Run("List as super admin", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		withClaims(c, actor.ID, true)
		require.NoError(t, h.List(c))
		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("List as super admin with filters", func(t *testing.T) {
		c, rec := reqCtxQuery("action=create&page=1&pageSize=10")
		withClaims(c, actor.ID, true)
		require.NoError(t, h.List(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		var page model.PaginatedResponse[model.AuditEntry]
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &page))
		assert.Equal(t, 1, page.Total, "the company create")
	})

	t.Run("unknown action -> 400", func(t *testing.T) {
		c, rec := reqCtxQuery("action=company.create")
		withClaims(c, actor.ID, true)
		require.NoError(t, h.List(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Contains(t, decodeResp(t, rec).Errors, "action")
	})

	t.Run("List as non-super-admin scoped to own company", func(t *testing.T) {
		member := testutil.SeedUser(t, s.db, "m@acme.com", "M", false)
		testutil.SetCompanyMember(t, s.db, co.ID, member.ID, model.CompanyRoleMember)
		c, rec := reqCtx(http.MethodGet, "")
		withClaims(c, member.ID, false)
		require.NoError(t, h.List(c))
		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("List as non-super-admin with no company returns empty", func(t *testing.T) {
		orphan := testutil.SeedUser(t, s.db, "orphan@x.com", "Orphan", false)
		c, rec := reqCtx(http.MethodGet, "")
		withClaims(c, orphan.ID, false)
		require.NoError(t, h.List(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		var page model.PaginatedResponse[model.AuditEntry]
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &page))
		assert.Equal(t, 0, page.Total)
	})

	t.Run("unparseable from/to -> 400, RFC3339 with millis accepted", func(t *testing.T) {
		c, rec := reqCtxQuery("from=yesterday&to=2026-13-01")
		withClaims(c, actor.ID, true)
		require.NoError(t, h.List(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		errs := decodeResp(t, rec).Errors
		assert.Contains(t, errs, "from")
		assert.Contains(t, errs, "to")

		// The webui sends Date.toISOString() values.
		c, rec = reqCtxQuery("from=2026-01-01T00:00:00.000Z")
		withClaims(c, actor.ID, true)
		require.NoError(t, h.List(c))
		assert.Equal(t, http.StatusOK, rec.Code)
	})
}

// TestAuditHandlerMemberScope verifies a company member only reads the audit
// history of teams they belong to (plus company-level events), while a company
// admin reads the whole company.
func TestAuditHandlerMemberScope(t *testing.T) {
	s := newStack(t)
	h := NewAuditHandler(s.auditSvc)
	ctx := t.Context()
	co := testutil.SeedCompany(t, s.db, "Acme")
	teamX := testutil.SeedTeam(t, s.db, co.ID, "X")
	teamY := testutil.SeedTeam(t, s.db, co.ID, "Y")
	member := testutil.SeedUser(t, s.db, "m@acme.com", "M", false)
	admin := testutil.SeedUser(t, s.db, "a@acme.com", "A", false)
	testutil.SetCompanyMember(t, s.db, co.ID, member.ID, model.CompanyRoleMember)
	testutil.SetCompanyMember(t, s.db, co.ID, admin.ID, model.CompanyRoleAdmin)
	testutil.AddTeamMember(t, s.db, teamY.ID, member.ID, model.RoleViewer)

	for _, team := range []*model.Team{teamX, teamY} {
		fs := testutil.SeedFlagset(t, s.db, team.ID, "default")
		_, err := s.flagsetSvc.Update(ctx, admin.ID, fs.ID, &model.UpdateFlagsetRequest{Description: ptr("changed")})
		require.NoError(t, err)
	}
	_, err := s.companySvc.Update(ctx, admin.ID, co.ID, &model.UpdateCompanyRequest{Description: ptr("changed")})
	require.NoError(t, err)

	// teamsSeen lists the team ids of the entries visible to userID ("" for
	// company-level entries).
	teamsSeen := func(userID string) []string {
		c, rec := reqCtx(http.MethodGet, "")
		withClaims(c, userID, false)
		require.NoError(t, h.List(c))
		require.Equal(t, http.StatusOK, rec.Code)
		var page model.PaginatedResponse[model.AuditEntry]
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &page))
		var ids []string
		for _, e := range page.Data {
			if e.TeamID == nil {
				ids = append(ids, "")
			} else {
				ids = append(ids, *e.TeamID)
			}
		}
		return ids
	}

	memberSees := teamsSeen(member.ID)
	assert.NotContains(t, memberSees, teamX.ID)
	assert.Contains(t, memberSees, teamY.ID)
	assert.Contains(t, memberSees, "", "company-level events stay visible")
	assert.Contains(t, teamsSeen(admin.ID), teamX.ID)
}
