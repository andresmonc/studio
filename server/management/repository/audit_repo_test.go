package repository_test

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"testing"
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	auditFlagsetID = "00000000-0000-0000-0000-0000000000f5"
	auditFlagID    = "00000000-0000-0000-0000-0000000000f1"
)

// auditFixture holds two companies: company A with teams A1 and A2, company B
// with team B. member belongs to A and to team A1 only; admin belongs to A.
type auditFixture struct {
	companyA, companyB, teamA1, teamA2, teamB, member, admin string
}

func seedAuditFixture(t *testing.T, db *repository.DB) auditFixture {
	t.Helper()
	ctx := t.Context()
	companyA := testutil.SeedCompany(t, db, "Acme")
	companyB := testutil.SeedCompany(t, db, "Globex")
	member := testutil.SeedUser(t, db, "member@acme.com", "Member", false)
	admin := testutil.SeedUser(t, db, "admin@acme.com", "Admin", false)
	companies := repository.NewCompanyRepo(db)
	require.NoError(t, companies.SetMember(ctx, companyA.ID, member.ID, model.CompanyRoleMember))
	require.NoError(t, companies.SetMember(ctx, companyA.ID, admin.ID, model.CompanyRoleAdmin))
	fx := auditFixture{
		companyA: companyA.ID,
		companyB: companyB.ID,
		teamA1:   testutil.SeedTeam(t, db, companyA.ID, "A1").ID,
		teamA2:   testutil.SeedTeam(t, db, companyA.ID, "A2").ID,
		teamB:    testutil.SeedTeam(t, db, companyB.ID, "B").ID,
		member:   member.ID,
		admin:    admin.ID,
	}
	_, _, err := repository.NewTeamRepo(db).SetMember(ctx, fx.teamA1, fx.member, model.RoleViewer)
	require.NoError(t, err)
	return fx
}

// recordAuditEvents records e1..e9 (the TargetID is the label) dated
// 2026-01-01 + n-1 days, so the newest-first order is e9..e1.
func recordAuditEvents(t *testing.T, db *repository.DB, fx auditFixture) {
	t.Helper()
	fs, flag := auditFlagsetID, auditFlagID
	events := []repository.AuditInput{
		{ActorUserID: &fx.admin, CompanyID: &fx.companyA,
			Action: model.AuditActionUpdate, TargetType: model.AuditTargetCompany, TargetID: "e1"},
		// Team only: company_id resolves from the team.
		{ActorUserID: &fx.member, TeamID: &fx.teamA1,
			Action: model.AuditActionCreate, TargetType: model.AuditTargetTeam, TargetID: "e2"},
		{ActorUserID: &fx.admin, TeamID: &fx.teamA1, FlagsetID: &fs,
			Action: model.AuditActionCreate, TargetType: model.AuditTargetFlagset, TargetID: "e3"},
		{ActorUserID: &fx.member, TeamID: &fx.teamA1, FlagsetID: &fs, FlagID: &flag,
			Action: model.AuditActionUpdate, TargetType: model.AuditTargetFlag, TargetID: "e4"},
		{CompanyID: &fx.companyA, TeamID: &fx.teamA2,
			Action: model.AuditActionUpdate, TargetType: model.AuditTargetTeam, TargetID: "e5"},
		{CompanyID: &fx.companyA,
			Action: model.AuditActionCreate, TargetType: model.AuditTargetCompanyMember, TargetID: "e6"},
		{CompanyID: &fx.companyB,
			Action: model.AuditActionUpdate, TargetType: model.AuditTargetCompany, TargetID: "e7"},
		{TeamID: &fx.teamB,
			Action: model.AuditActionCreate, TargetType: model.AuditTargetTeam, TargetID: "e8"},
		// A team event without TeamID: hidden from plain members.
		{CompanyID: &fx.companyA,
			Action: model.AuditActionDelete, TargetType: model.AuditTargetTeam, TargetID: "e9"},
	}
	repo := repository.NewAuditRepo(db)
	for _, e := range events {
		require.NoError(t, repo.Record(t.Context(), nil, e))
	}
	_, err := db.Pool.Exec(t.Context(), `UPDATE audit_log
		SET occurred_at = '2025-12-31T00:00:00Z'::timestamptz + substring(target_id FROM 2)::int * interval '1 day'`)
	require.NoError(t, err)
}

func TestAuditRepoList(t *testing.T) {
	db := testutil.StartPostgres(t)
	fx := seedAuditFixture(t, db)
	recordAuditEvents(t, db, fx)
	repo := repository.NewAuditRepo(db)

	fs, flag := auditFlagsetID, auditFlagID
	update := model.AuditActionUpdate
	from := time.Date(2026, 1, 8, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC)
	all := []string{"e9", "e8", "e7", "e6", "e5", "e4", "e3", "e2", "e1"}

	tests := []struct {
		name      string
		scope     model.AuditScope
		filters   model.AuditFilters
		want      []string
		wantTotal int // defaults to len(want)
	}{
		{name: "no scope sees every company", want: all},
		{name: "company A scope", scope: model.AuditScope{CompanyID: &fx.companyA},
			want: []string{"e9", "e6", "e5", "e4", "e3", "e2", "e1"}},
		{name: "company B scope", scope: model.AuditScope{CompanyID: &fx.companyB},
			want: []string{"e8", "e7"}},
		{name: "member sees own teams and company events only",
			scope: model.AuditScope{CompanyID: &fx.companyA, MemberUserID: &fx.member},
			want:  []string{"e6", "e4", "e3", "e2", "e1"}},
		{name: "member scope in another company sees its company events only",
			scope: model.AuditScope{CompanyID: &fx.companyB, MemberUserID: &fx.member},
			want:  []string{"e7"}},
		{name: "company filter", filters: model.AuditFilters{CompanyID: &fx.companyB},
			want: []string{"e8", "e7"}},
		{name: "team filter", filters: model.AuditFilters{TeamID: &fx.teamA1},
			want: []string{"e4", "e3", "e2"}},
		{name: "flagset filter", filters: model.AuditFilters{FlagsetID: &fs}, want: []string{"e4", "e3"}},
		{name: "flag filter", filters: model.AuditFilters{FlagID: &flag}, want: []string{"e4"}},
		{name: "actor filter", filters: model.AuditFilters{ActorUserID: &fx.admin}, want: []string{"e3", "e1"}},
		{name: "action filter", filters: model.AuditFilters{Action: &update},
			want: []string{"e7", "e5", "e4", "e1"}},
		{name: "from filter", filters: model.AuditFilters{From: &from}, want: []string{"e9", "e8"}},
		{name: "to filter", filters: model.AuditFilters{To: &to}, want: []string{"e2", "e1"}},
		{name: "scope and filter combine",
			scope:   model.AuditScope{CompanyID: &fx.companyB},
			filters: model.AuditFilters{TeamID: &fx.teamA1}},
		{name: "second page", filters: model.AuditFilters{Page: 2, PageSize: 3},
			want: []string{"e6", "e5", "e4"}, wantTotal: 9},
		{name: "page past the end keeps the total", filters: model.AuditFilters{Page: 4, PageSize: 3},
			wantTotal: 9},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			entries, total, err := repo.List(t.Context(), tt.scope, tt.filters)
			require.NoError(t, err)
			got := []string{}
			for _, e := range entries {
				got = append(got, e.TargetID)
			}
			want := tt.want
			if want == nil {
				want = []string{}
			}
			assert.Equal(t, want, got)
			wantTotal := tt.wantTotal
			if wantTotal == 0 {
				wantTotal = len(want)
			}
			assert.Equal(t, wantTotal, total)
		})
	}
}

func TestAuditRepoListRejectsMemberScopeWithoutCompany(t *testing.T) {
	db := testutil.StartPostgres(t)
	member := "00000000-0000-0000-0000-000000000001"
	_, _, err := repository.NewAuditRepo(db).List(t.Context(), model.AuditScope{MemberUserID: &member}, model.AuditFilters{})
	assert.ErrorIs(t, err, repository.ErrAuditMemberScope)
}

func TestAuditRepoListMalformedFilter(t *testing.T) {
	db := testutil.StartPostgres(t)
	team := "not-a-uuid"
	_, _, err := repository.NewAuditRepo(db).List(t.Context(), model.AuditScope{}, model.AuditFilters{TeamID: &team})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid input syntax for type uuid")
}

func TestAuditRepoListTiesPageByIDDesc(t *testing.T) {
	db := testutil.StartPostgres(t)
	fx := seedAuditFixture(t, db)
	recordAuditEvents(t, db, fx)
	_, err := db.Pool.Exec(t.Context(), `UPDATE audit_log SET occurred_at = '2026-01-01T00:00:00Z'`)
	require.NoError(t, err)

	repo := repository.NewAuditRepo(db)
	page1, _, err := repo.List(t.Context(), model.AuditScope{}, model.AuditFilters{Page: 1, PageSize: 1})
	require.NoError(t, err)
	page2, _, err := repo.List(t.Context(), model.AuditScope{}, model.AuditFilters{Page: 2, PageSize: 1})
	require.NoError(t, err)
	require.Len(t, page1, 1)
	require.Len(t, page2, 1)
	assert.Greater(t, page1[0].ID, page2[0].ID)
}

func TestAuditRepoRecord(t *testing.T) {
	db := testutil.StartPostgres(t)
	fx := seedAuditFixture(t, db)
	repo := repository.NewAuditRepo(db)
	unknownTeam := "00000000-0000-0000-0000-0000000000aa"

	tests := []struct {
		name    string
		in      repository.AuditInput
		wantErr string
		check   func(t *testing.T, e model.AuditEntry)
	}{
		{
			name: "team only resolves the company and snapshots the actor email",
			in:   repository.AuditInput{ActorUserID: &fx.member, TeamID: &fx.teamA1, After: map[string]any{"name": "A1"}},
			check: func(t *testing.T, e model.AuditEntry) {
				assert.Equal(t, fx.companyA, *e.CompanyID)
				assert.Equal(t, "member@acme.com", *e.ActorEmail)
				assert.JSONEq(t, `{"name":"A1"}`, string(e.After))
			},
		},
		{
			name: "nil, typed nil and empty raw payloads are stored as NULL",
			in: repository.AuditInput{CompanyID: &fx.companyA,
				Before: (*model.Team)(nil), After: json.RawMessage{}, Metadata: nil},
			check: func(t *testing.T, e model.AuditEntry) {
				assert.Nil(t, e.Before)
				assert.Nil(t, e.After)
				assert.Nil(t, e.Metadata)
				assert.Nil(t, e.ActorEmail)
			},
		},
		{
			name: "raw message is stored as JSON",
			in:   repository.AuditInput{CompanyID: &fx.companyA, Metadata: json.RawMessage(`{"k":1}`)},
			check: func(t *testing.T, e model.AuditEntry) {
				assert.JSONEq(t, `{"k":1}`, string(e.Metadata))
			},
		},
		{
			name:    "deleted team without company is rejected",
			in:      repository.AuditInput{TeamID: &unknownTeam},
			wantErr: repository.ErrAuditNoCompany.Error(),
		},
		{
			name:    "no company at all is rejected",
			in:      repository.AuditInput{},
			wantErr: repository.ErrAuditNoCompany.Error(),
		},
		{
			name:    "team of another company is rejected",
			in:      repository.AuditInput{CompanyID: &fx.companyB, TeamID: &fx.teamA1},
			wantErr: repository.ErrAuditNoCompany.Error(),
		},
		{
			name:    "unencodable payload is rejected",
			in:      repository.AuditInput{CompanyID: &fx.companyA, After: make(chan int)},
			wantErr: "marshal audit payload: json: unsupported type: chan int",
		},
		{
			name:    "invalid raw payload is rejected",
			in:      repository.AuditInput{CompanyID: &fx.companyA, Metadata: json.RawMessage(`{`)},
			wantErr: "marshal audit payload",
		},
		{
			name:    "unknown action is rejected by the schema",
			in:      repository.AuditInput{CompanyID: &fx.companyA, Action: "login"},
			wantErr: "audit_log_action_check",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			in := tt.in
			if in.Action == "" {
				in.Action = model.AuditActionCreate
			}
			in.TargetType, in.TargetID = model.AuditTargetTeam, tt.name
			err := repo.Record(t.Context(), nil, in)
			if tt.wantErr != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.wantErr)
				return
			}
			require.NoError(t, err)
			entries, _, err := repo.List(t.Context(), model.AuditScope{}, model.AuditFilters{PageSize: 1})
			require.NoError(t, err)
			require.Len(t, entries, 1)
			assert.Equal(t, tt.name, entries[0].TargetID)
			tt.check(t, entries[0])
		})
	}
}

func TestAuditRepoActorEmailSurvivesUserDelete(t *testing.T) {
	db := testutil.StartPostgres(t)
	fx := seedAuditFixture(t, db)
	repo := repository.NewAuditRepo(db)
	ctx := t.Context()

	require.NoError(t, repo.Record(ctx, nil, repository.AuditInput{ActorUserID: &fx.admin, CompanyID: &fx.companyA,
		Action: model.AuditActionUpdate, TargetType: model.AuditTargetCompany, TargetID: fx.companyA}))
	_, err := db.Pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, fx.admin)
	require.NoError(t, err)

	entries, _, err := repo.List(ctx, model.AuditScope{}, model.AuditFilters{})
	require.NoError(t, err)
	require.Len(t, entries, 1)
	assert.Equal(t, "admin@acme.com", *entries[0].ActorEmail)
}

func TestAuditRepoRecordInTx(t *testing.T) {
	db := testutil.StartPostgres(t)
	fx := seedAuditFixture(t, db)
	repo := repository.NewAuditRepo(db)
	ctx := t.Context()
	in := repository.AuditInput{CompanyID: &fx.companyA,
		Action: model.AuditActionUpdate, TargetType: model.AuditTargetCompany, TargetID: fx.companyA}

	bad := in
	bad.Action = "login"

	tests := []struct {
		name        string
		commit      bool
		failedFirst bool
		wantTotal   int
	}{
		{name: "rollback discards the entry", commit: false, wantTotal: 0},
		{name: "commit keeps the entry", commit: true, wantTotal: 1},
		{name: "failed write leaves the tx usable", commit: true, failedFirst: true, wantTotal: 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := db.Pool.Exec(ctx, `TRUNCATE audit_log`)
			require.NoError(t, err)
			tx, err := db.Pool.Begin(ctx)
			require.NoError(t, err)
			if tt.failedFirst {
				require.ErrorContains(t, repo.Record(ctx, tx, bad), "audit_log_action_check")
			}
			require.NoError(t, repo.Record(ctx, tx, in))
			if tt.commit {
				require.NoError(t, tx.Commit(ctx))
			} else {
				require.NoError(t, tx.Rollback(ctx))
			}
			_, total, err := repo.List(ctx, model.AuditScope{}, model.AuditFilters{})
			require.NoError(t, err)
			assert.Equal(t, tt.wantTotal, total)
		})
	}
}

func TestAuditRepoRecordLogsFailure(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewAuditRepo(db)

	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })

	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	err := repo.Record(ctx, nil, repository.AuditInput{
		Action: model.AuditActionCreate, TargetType: model.AuditTargetTeam, TargetID: "t1"})

	require.Error(t, err)
	assert.Contains(t, buf.String(), "audit write failed")
	assert.Contains(t, buf.String(), "action=create")
}
