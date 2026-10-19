package handler

import (
	"net/http"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCompanyHandler(t *testing.T) {
	s := newStack(t)
	h := NewCompanyHandler(s.companySvc, s.teamSvc)
	admin := testutil.SeedUser(t, s.db, "admin@acme.com", "Admin", true)

	testutil.SeedUser(t, s.db, "founder@acme.com", "Founder", false)
	t.Run("Create success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"displayName":"Acme","adminEmail":"founder@acme.com"}`)
		withClaims(c, admin.ID, true)
		require.NoError(t, h.Create(c))
		assert.Equal(t, http.StatusCreated, rec.Code)
		resp := decodeResp(t, rec)
		assert.Equal(t, "Acme", dataMap(t, resp.Data)["displayName"])
	})

	t.Run("Create bad body", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{not json`)
		withClaims(c, admin.ID, true)
		require.NoError(t, h.Create(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("Create validation error empty name and admin", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"displayName":""}`)
		withClaims(c, admin.ID, true)
		require.NoError(t, h.Create(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Contains(t, decodeResp(t, rec).Errors, "displayName")
		assert.Contains(t, decodeResp(t, rec).Errors, "adminEmail")
	})

	t.Run("List as super admin", func(t *testing.T) {
		testutil.SeedCompany(t, s.db, "Beta")
		c, rec := reqCtx(http.MethodGet, "")
		withClaims(c, admin.ID, true)
		require.NoError(t, h.List(c))
		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("Get success", func(t *testing.T) {
		co := testutil.SeedCompany(t, s.db, "Gamma")
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "companyId", co.ID)
		withClaims(c, admin.ID, true)
		require.NoError(t, h.Get(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "Gamma", dataMap(t, decodeResp(t, rec).Data)["displayName"])
	})

	t.Run("Get not found", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "companyId", missingUUID)
		withClaims(c, admin.ID, true)
		require.NoError(t, h.Get(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("Update success", func(t *testing.T) {
		co := testutil.SeedCompany(t, s.db, "Delta")
		c, rec := reqCtx(http.MethodPatch, `{"displayName":"Delta Inc"}`)
		params(c, "companyId", co.ID)
		withClaims(c, admin.ID, true)
		require.NoError(t, h.Update(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "Delta Inc", dataMap(t, decodeResp(t, rec).Data)["displayName"])
	})

	t.Run("Update not found", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPatch, `{"displayName":"X"}`)
		params(c, "companyId", missingUUID)
		withClaims(c, admin.ID, true)
		require.NoError(t, h.Update(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("Update bad body", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPatch, `{bad`)
		params(c, "companyId", missingUUID)
		withClaims(c, admin.ID, true)
		require.NoError(t, h.Update(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("Delete success", func(t *testing.T) {
		co := testutil.SeedCompany(t, s.db, "Epsilon")
		c, rec := reqCtx(http.MethodDelete, "")
		params(c, "companyId", co.ID)
		withClaims(c, admin.ID, true)
		require.NoError(t, h.Delete(c))
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("Delete not found", func(t *testing.T) {
		c, rec := reqCtx(http.MethodDelete, "")
		params(c, "companyId", missingUUID)
		withClaims(c, admin.ID, true)
		require.NoError(t, h.Delete(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}

func TestCompanyHandlerMembers(t *testing.T) {
	s := newStack(t)
	h := NewCompanyHandler(s.companySvc, s.teamSvc)
	actor := testutil.SeedUser(t, s.db, "actor@acme.com", "Actor", true)
	co := testutil.SeedCompany(t, s.db, "Acme")
	member := testutil.SeedUser(t, s.db, "member@acme.com", "Member", false)
	// owner is another admin, so removing member never trips the last-admin guard.
	owner := testutil.SeedUser(t, s.db, "owner@acme.com", "Owner", false)
	testutil.SetCompanyMember(t, s.db, co.ID, owner.ID, model.CompanyRoleAdmin)

	t.Run("AddMember success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"email":"member@acme.com","role":"member"}`)
		params(c, "companyId", co.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.AddMember(c))
		assert.Equal(t, http.StatusCreated, rec.Code)
		assert.Equal(t, member.ID, dataMap(t, decodeResp(t, rec).Data)["userId"])
	})

	t.Run("AddMember existing member -> 200", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"email":"member@acme.com","role":"member"}`)
		params(c, "companyId", co.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.AddMember(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, member.ID, dataMap(t, decodeResp(t, rec).Data)["userId"])
	})

	t.Run("AddMember invalid role -> 400", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"email":"member@acme.com","role":"wizard"}`)
		params(c, "companyId", co.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.AddMember(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("AddMember unknown email -> 404", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"email":"ghost@acme.com","role":"member"}`)
		params(c, "companyId", co.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.AddMember(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("AddMember bad body -> 400", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{`)
		params(c, "companyId", co.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.AddMember(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("ListMembers success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "companyId", co.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.ListMembers(c))
		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("UpdateMember success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPatch, `{"role":"admin"}`)
		params(c, "companyId", co.ID, "uid", member.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.UpdateMember(c))
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("UpdateMember invalid role -> 400", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPatch, `{"role":"nope"}`)
		params(c, "companyId", co.ID, "uid", member.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.UpdateMember(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("RemoveMember success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodDelete, "")
		params(c, "companyId", co.ID, "uid", member.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.RemoveMember(c))
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("demote or remove the last admin -> 409", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPatch, `{"role":"member"}`)
		params(c, "companyId", co.ID, "uid", owner.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.UpdateMember(c))
		assert.Equal(t, http.StatusConflict, rec.Code)
		assert.Equal(t, "company must keep at least one admin", decodeResp(t, rec).Message)

		c, rec = reqCtx(http.MethodDelete, "")
		params(c, "companyId", co.ID, "uid", owner.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.RemoveMember(c))
		assert.Equal(t, http.StatusConflict, rec.Code)
	})

	t.Run("RemoveMember not a member", func(t *testing.T) {
		c, rec := reqCtx(http.MethodDelete, "")
		params(c, "companyId", co.ID, "uid", missingUUID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.RemoveMember(c))
		// CompanyService.RemoveMember translates repository.ErrNotFound into
		// service.ErrNotFound, so removing a non-member returns 404.
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}

func TestCompanyHandlerTeams(t *testing.T) {
	s := newStack(t)
	h := NewCompanyHandler(s.companySvc, s.teamSvc)
	actor := testutil.SeedUser(t, s.db, "actor@acme.com", "Actor", true)
	co := testutil.SeedCompany(t, s.db, "Acme")
	teamAdmin := testutil.SeedUser(t, s.db, "ta@acme.com", "TA", false)
	testutil.SetCompanyMember(t, s.db, co.ID, teamAdmin.ID, model.CompanyRoleAdmin)

	t.Run("CreateTeam success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"name":"Platform","adminEmail":"ta@acme.com"}`)
		params(c, "companyId", co.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.CreateTeam(c))
		assert.Equal(t, http.StatusCreated, rec.Code)
		assert.Equal(t, "Platform", dataMap(t, decodeResp(t, rec).Data)["name"])
	})

	t.Run("CreateTeam missing admin -> 400", func(t *testing.T) {
		c, rec := reqCtx(http.MethodPost, `{"name":"NoAdmin"}`)
		params(c, "companyId", co.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.CreateTeam(c))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("CreateTeam admin not in company -> 404", func(t *testing.T) {
		outsider := testutil.SeedUser(t, s.db, "outsider@x.com", "Out", false)
		_ = outsider
		c, rec := reqCtx(http.MethodPost, `{"name":"T","adminEmail":"outsider@x.com"}`)
		params(c, "companyId", co.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.CreateTeam(c))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("ListTeams success", func(t *testing.T) {
		c, rec := reqCtx(http.MethodGet, "")
		params(c, "companyId", co.ID)
		withClaims(c, actor.ID, true)
		require.NoError(t, h.ListTeams(c))
		assert.Equal(t, http.StatusOK, rec.Code)
	})
}
