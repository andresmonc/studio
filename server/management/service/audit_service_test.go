package service_test

import (
	"context"
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
	svc := service.NewAuditService(repository.NewAuditRepo(db), repository.NewCompanyRepo(db))
	companies := newCompanyService(db)
	teams := newTeamService(db)
	ctx := t.Context()

	super := testutil.SeedUser(t, db, "super@x.com", "Super", true)
	other := testutil.SeedUser(t, db, "other@x.com", "Other", true)
	admin := testutil.SeedUser(t, db, "admin@acme.com", "Admin", false)
	member := testutil.SeedUser(t, db, "member@acme.com", "Member", false)
	loner := testutil.SeedUser(t, db, "loner@x.com", "Loner", false)
	testutil.SeedUser(t, db, "admin@beta.com", "Beta Admin", false)
	// Each company create also records its first admin joining.
	acme, err := companies.Create(ctx, super.ID, companyReq("Acme", admin.Email))
	require.NoError(t, err)
	beta, err := companies.Create(ctx, other.ID, companyReq("Beta", "admin@beta.com"))
	require.NoError(t, err)
	testutil.SetCompanyMember(t, db, acme.ID, member.ID, model.CompanyRoleMember)
	// Acme entries: company create + its admin, team create + its admin, and a
	// second team the member isn't on.
	mine, err := teams.Create(ctx, admin.ID, acme.ID, &model.CreateTeamRequest{Name: "Mine", AdminEmail: member.Email})
	require.NoError(t, err)
	theirs, err := teams.Create(ctx, admin.ID, acme.ID, &model.CreateTeamRequest{Name: "Theirs", AdminEmail: admin.Email})
	require.NoError(t, err)
	_, err = teams.Update(ctx, admin.ID, theirs.ID, &model.UpdateTeamRequest{Description: new("d")})
	require.NoError(t, err)

	create, update := model.AuditActionCreate, model.AuditActionUpdate
	tests := []struct {
		name       string
		userID     string
		superAdmin bool
		filters    model.AuditFilters
		wantTotal  int
		check      func(t *testing.T, entries []model.AuditEntry)
	}{
		{name: "super admin sees every company", userID: super.ID, superAdmin: true, wantTotal: 9},
		{name: "super admin narrows by company", userID: super.ID, superAdmin: true,
			filters: model.AuditFilters{CompanyID: &beta.ID}, wantTotal: 2},
		{name: "company admin sees only their company", userID: admin.ID, wantTotal: 7,
			check: func(t *testing.T, entries []model.AuditEntry) {
				for _, e := range entries {
					assert.Equal(t, acme.ID, *e.CompanyID)
				}
			}},
		{name: "company admin can't widen to another company", userID: admin.ID,
			filters: model.AuditFilters{CompanyID: &beta.ID}, wantTotal: 0},
		{name: "member sees their team plus company events", userID: member.ID, wantTotal: 4,
			check: func(t *testing.T, entries []model.AuditEntry) {
				for _, e := range entries {
					if e.TeamID != nil {
						assert.Equal(t, mine.ID, *e.TeamID)
					} else {
						assert.Contains(t, []model.AuditTargetType{model.AuditTargetCompany, model.AuditTargetCompanyMember},
							e.TargetType)
					}
				}
			}},
		{name: "member can't filter into a team they aren't on", userID: member.ID,
			filters: model.AuditFilters{TeamID: &theirs.ID}, wantTotal: 0},
		{name: "page size limits the page, not the total", userID: admin.ID,
			filters: model.AuditFilters{PageSize: 2}, wantTotal: 7},
		{name: "user without a company sees nothing", userID: loner.ID, wantTotal: 0},
		{name: "filter by actor excludes other actors", userID: super.ID, superAdmin: true,
			filters: model.AuditFilters{ActorUserID: &other.ID}, wantTotal: 2,
			check: func(t *testing.T, entries []model.AuditEntry) {
				assert.Equal(t, "other@x.com", *entries[0].ActorEmail)
			}},
		{name: "filter by action create", userID: super.ID, superAdmin: true,
			filters: model.AuditFilters{Action: &create}, wantTotal: 8},
		{name: "filter by action update", userID: super.ID, superAdmin: true,
			filters: model.AuditFilters{Action: &update}, wantTotal: 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			entries, total, err := svc.List(ctx, tt.userID, tt.superAdmin, tt.filters)
			require.NoError(t, err)
			assert.Equal(t, tt.wantTotal, total)
			_, pageSize := model.ClampPage(1, tt.filters.PageSize)
			assert.Len(t, entries, min(tt.wantTotal, pageSize))
			assert.NotNil(t, entries, "never nil, so it encodes as []")
			if tt.check != nil {
				tt.check(t, entries)
			}
		})
	}

	t.Run("query error", func(t *testing.T) {
		cancelled, cancel := context.WithCancel(ctx)
		cancel()
		_, _, err := svc.List(cancelled, member.ID, false, model.AuditFilters{})
		assert.ErrorIs(t, err, context.Canceled, "membership lookup")
		_, _, err = svc.List(cancelled, super.ID, true, model.AuditFilters{})
		assert.ErrorIs(t, err, context.Canceled, "list")
	})
}
