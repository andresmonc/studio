package service_test

import (
	"encoding/json"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A write that changes nothing leaves no trace: no audit entry, no new flag
// version, no updated_at bump.
func TestNoOpWritesAreNotRecorded(t *testing.T) {
	db := testutil.StartPostgres(t)
	ctx := t.Context()
	teams, companies, flagsets, flags := newTeamService(db), newCompanyService(db), newFlagsetService(db), newFlagService(db)
	actor := testutil.SeedUser(t, db, "actor@acme.com", "Actor", true)
	fs := flagsetWithTeam(t, db)
	team, err := teams.Get(ctx, fs.TeamID)
	require.NoError(t, err)
	company, err := companies.Get(ctx, team.CompanyID)
	require.NoError(t, err)
	member := testutil.SeedUser(t, db, "m@acme.com", "M", false)
	testutil.SetCompanyMember(t, db, company.ID, member.ID, model.CompanyRoleMember)
	testutil.AddTeamMember(t, db, team.ID, member.ID, model.RoleViewer)

	// State the no-ops below repeat: a flagset setting and a saved flag payload.
	_, err = flagsets.Update(ctx, actor.ID, fs.ID, &model.UpdateFlagsetRequest{
		EvaluationContextEnrichment: json.RawMessage(`{"a":1,"b":[2]}`),
	})
	require.NoError(t, err)
	flag := testutil.SeedFlag(t, db, fs.ID, "f", nil, &actor.ID)
	saved, err := flags.Update(ctx, actor.ID, flag.ID, &model.UpdateFlagRequest{Payload: json.RawMessage(testutil.DefaultFlagPayload)})
	require.NoError(t, err)

	tests := []struct {
		name  string
		write func() error
	}{
		{"team: empty body", func() error {
			_, err := teams.Update(ctx, actor.ID, team.ID, &model.UpdateTeamRequest{})
			return err
		}},
		{"team: same values", func() error {
			_, err := teams.Update(ctx, actor.ID, team.ID, &model.UpdateTeamRequest{
				Name: new(" " + team.Name + " "), Description: new(team.Description)})
			return err
		}},
		{"team: re-add with the same role", func() error {
			_, _, err := teams.AddMember(ctx, actor.ID, team.ID, &model.AddMemberRequest{Email: member.Email, Role: model.RoleViewer})
			return err
		}},
		{"team: update to the same role", func() error {
			return teams.UpdateMember(ctx, actor.ID, team.ID, member.ID, model.RoleViewer)
		}},
		{"company: empty body", func() error {
			_, err := companies.Update(ctx, actor.ID, company.ID, &model.UpdateCompanyRequest{})
			return err
		}},
		{"company: same name", func() error {
			_, err := companies.Update(ctx, actor.ID, company.ID, &model.UpdateCompanyRequest{DisplayName: new(company.DisplayName)})
			return err
		}},
		{"flagset: empty body", func() error {
			_, err := flagsets.Update(ctx, actor.ID, fs.ID, &model.UpdateFlagsetRequest{})
			return err
		}},
		{"flagset: same JSON, other key order and spacing", func() error {
			_, err := flagsets.Update(ctx, actor.ID, fs.ID, &model.UpdateFlagsetRequest{
				EvaluationContextEnrichment: json.RawMessage(`{ "b": [2], "a": 1 }`)})
			return err
		}},
		{"flag: byte-identical payload", func() error {
			got, err := flags.Update(ctx, actor.ID, flag.ID, &model.UpdateFlagRequest{Payload: json.RawMessage(testutil.DefaultFlagPayload)})
			if err == nil {
				assert.Equal(t, saved.CurrentVersion, got.CurrentVersion)
			}
			return err
		}},
		{"flag: enable an enabled flag", func() error { return flags.SetDisabled(ctx, actor.ID, flag.ID, false) }},
	}
	count := func(q string) int {
		var n int
		require.NoError(t, db.Pool.QueryRow(ctx, q).Scan(&n))
		return n
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			audits, versions := count(`SELECT COUNT(*) FROM audit_log`), count(`SELECT COUNT(*) FROM flag_versions`)
			stamps := count(`SELECT COUNT(DISTINCT updated_at) FROM (SELECT updated_at FROM teams UNION ALL
				SELECT updated_at FROM companies UNION ALL SELECT updated_at FROM flagsets) x`)
			require.NoError(t, tt.write())
			assert.Equal(t, audits, count(`SELECT COUNT(*) FROM audit_log`), "no audit entry")
			assert.Equal(t, versions, count(`SELECT COUNT(*) FROM flag_versions`), "no new version")
			assert.Equal(t, stamps, count(`SELECT COUNT(DISTINCT updated_at) FROM (SELECT updated_at FROM teams UNION ALL
				SELECT updated_at FROM companies UNION ALL SELECT updated_at FROM flagsets) x`), "no updated_at bump")
		})
	}
}
