package service_test

import (
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAuditServiceList(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := service.NewAuditService(repository.NewAuditRepo(db))
	companySvc := newCompanyService(db)
	ctx := t.Context()
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)

	// generate some audit entries through a real service.
	c1, err := companySvc.Create(ctx, actor.ID, &model.CreateCompanyRequest{DisplayName: "Acme"})
	require.NoError(t, err)
	_, err = companySvc.Create(ctx, actor.ID, &model.CreateCompanyRequest{DisplayName: "Beta"})
	require.NoError(t, err)

	t.Run("list all", func(t *testing.T) {
		entries, total, err := svc.List(ctx, model.AuditFilters{Page: 1, PageSize: 50})
		require.NoError(t, err)
		assert.Equal(t, 2, total)
		require.Len(t, entries, 2)
		// joined actor email is resolved
		require.NotNil(t, entries[0].ActorEmail)
		assert.Equal(t, "actor@acme.com", *entries[0].ActorEmail)
	})

	t.Run("filter by action", func(t *testing.T) {
		action := "company.create"
		entries, total, err := svc.List(ctx, model.AuditFilters{Action: &action, Page: 1, PageSize: 50})
		require.NoError(t, err)
		assert.Equal(t, 2, total)
		assert.Len(t, entries, 2)
	})

	t.Run("filter by company scope", func(t *testing.T) {
		entries, total, err := svc.List(ctx, model.AuditFilters{
			CompanyID: &c1.ID, Page: 1, PageSize: 50,
		})
		require.NoError(t, err)
		assert.Equal(t, 1, total)
		require.Len(t, entries, 1)
		require.NotNil(t, entries[0].CompanyID)
		assert.Equal(t, c1.ID, *entries[0].CompanyID)
	})

	t.Run("filter by actor", func(t *testing.T) {
		entries, _, err := svc.List(ctx, model.AuditFilters{ActorID: &actor.ID, Page: 1, PageSize: 50})
		require.NoError(t, err)
		assert.Len(t, entries, 2)
	})

	t.Run("filter with no matches", func(t *testing.T) {
		nope := "does.not.exist"
		entries, total, err := svc.List(ctx, model.AuditFilters{Action: &nope, Page: 1, PageSize: 50})
		require.NoError(t, err)
		assert.Zero(t, total)
		assert.Empty(t, entries)
	})
}
