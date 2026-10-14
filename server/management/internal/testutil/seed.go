package testutil

import (
	"encoding/json"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/jackc/pgx/v5"
)

// SeedCompany inserts a company and returns it.
func SeedCompany(t *testing.T, db *repository.DB, displayName string) *model.Company {
	t.Helper()
	c, err := repository.NewCompanyRepo(db).Create(t.Context(), displayName, "")
	if err != nil {
		t.Fatalf("seed company: %v", err)
	}
	return c
}

// SeedUser inserts a user (via the OIDC upsert path, using the email as the
// oidc subject) and returns it.
func SeedUser(t *testing.T, db *repository.DB, email, name string, superAdmin bool) *model.User {
	t.Helper()
	u, err := repository.NewUserRepo(db).UpsertFromOIDC(t.Context(), email, name, "", email, superAdmin)
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}
	return u
}

// SeedTeam inserts a team in the given company and returns it.
func SeedTeam(t *testing.T, db *repository.DB, companyID, name string) *model.Team {
	t.Helper()
	team, err := repository.NewTeamRepo(db).Create(t.Context(), companyID, name, "")
	if err != nil {
		t.Fatalf("seed team: %v", err)
	}
	return team
}

// AddTeamMember adds (or upserts) a user as a team member with the given role.
func AddTeamMember(t *testing.T, db *repository.DB, teamID, userID string, role model.Role) {
	t.Helper()
	if err := repository.NewTeamRepo(db).AddMember(t.Context(), teamID, userID, role); err != nil {
		t.Fatalf("add team member: %v", err)
	}
}

// SeedFlagset inserts a minimal flagset in the given team and returns it.
func SeedFlagset(t *testing.T, db *repository.DB, teamID, name string) *model.Flagset {
	t.Helper()
	fs, err := repository.NewFlagsetRepo(db).Create(t.Context(), teamID, &model.CreateFlagsetRequest{Name: name})
	if err != nil {
		t.Fatalf("seed flagset: %v", err)
	}
	return fs
}

// DefaultFlagPayload is a valid boolean flag payload usable in tests.
const DefaultFlagPayload = `{"variations":{"on":true,"off":false},"defaultRule":{"variation":"on"}}`

// SeedFlag creates a flag with an initial version, sets it as current and
// mirrors its tags, like the flag service does (all in one tx).
func SeedFlag(
	t *testing.T, db *repository.DB, flagsetID, name string, payload json.RawMessage, createdBy *string,
) *model.Flag {
	t.Helper()
	if len(payload) == 0 {
		payload = json.RawMessage(DefaultFlagPayload)
	}
	flags := repository.NewFlagRepo(db)
	versions := repository.NewFlagVersionRepo(db)
	var f *model.Flag
	err := pgx.BeginFunc(t.Context(), db.Pool, func(tx pgx.Tx) error {
		ctx := t.Context()
		created, err := flags.Create(ctx, tx, flagsetID, name)
		if err != nil {
			return err
		}
		v, err := versions.Insert(ctx, tx, created.ID, payload, "initial", createdBy)
		if err != nil {
			return err
		}
		if err := flags.UpdateCurrentVersion(ctx, tx, created.ID, v.ID); err != nil {
			return err
		}
		if err := flags.ReplaceFlagTags(ctx, tx, created.ID, model.FlagTagsFromPayload(payload)); err != nil {
			return err
		}
		created.CurrentVersionID, created.CurrentVersion, created.Payload = &v.ID, &v.VersionNumber, v.Payload
		f = created
		return nil
	})
	if err != nil {
		t.Fatalf("seed flag: %v", err)
	}
	return f
}
