package repository_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFlagRepoCreateAndGet(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	fs := testutil.SeedFlagset(t, db, team.ID, "prod")

	// Create requires a tx; the flag has no current version yet.
	var flagID string
	require.NoError(t, pgx.BeginFunc(ctx, db.Pool, func(tx pgx.Tx) error {
		f, err := repo.Create(ctx, tx, fs.ID, "my-flag")
		if err != nil {
			return err
		}
		flagID = f.ID
		assert.Nil(t, f.CurrentVersionID)
		return nil
	}))

	got, err := repo.GetByID(ctx, flagID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "my-flag", got.Name)

	// Seeded flag has a current version and payload.
	seeded := testutil.SeedFlag(t, db, fs.ID, "bool-flag", nil, nil)
	withVersion, err := repo.GetByID(ctx, seeded.ID)
	require.NoError(t, err)
	require.NotNil(t, withVersion)
	require.NotNil(t, withVersion.CurrentVersion)
	assert.Equal(t, 1, *withVersion.CurrentVersion)
	assert.JSONEq(t, testutil.DefaultFlagPayload, string(withVersion.Payload))
	assert.Equal(t, withVersion.CurrentVersionID, seeded.CurrentVersionID, "SeedFlag returns the current version")
	assert.JSONEq(t, testutil.DefaultFlagPayload, string(seeded.Payload))

	tagged := testutil.SeedFlag(t, db, fs.ID, "tagged", json.RawMessage(
		`{"variations":{"on":true},"defaultRule":{"variation":"on"},"metadata":{"tags":["a","b"]}}`), nil)
	assert.Equal(t, 2, countFlagTags(t, db, tagged.ID), "SeedFlag mirrors the payload tags")
}

// TestFlagRepoWritesOnDeletedParents: writes to a deleted flagset or flag
// return ErrNotFound, including when they race the delete.
func TestFlagRepoWritesOnDeletedParents(t *testing.T) {
	db := testutil.StartPostgres(t)
	flags := repository.NewFlagRepo(db)
	versions := repository.NewFlagVersionRepo(db)
	ctx := t.Context()
	team := testutil.SeedTeam(t, db, testutil.SeedCompany(t, db, "Acme").ID, "Platform")
	inTx := func(fn func(tx pgx.Tx) error) error { return pgx.BeginFunc(ctx, db.Pool, fn) }

	t.Run("create in a deleted flagset", func(t *testing.T) {
		fs := testutil.SeedFlagset(t, db, team.ID, "gone")
		require.NoError(t, repository.NewFlagsetRepo(db).SoftDelete(ctx, fs.ID))
		err := inTx(func(tx pgx.Tx) error { _, err := flags.Create(ctx, tx, fs.ID, "f"); return err })
		assert.ErrorIs(t, err, repository.ErrNotFound)
	})

	t.Run("create racing a flagset delete waits and sees it deleted", func(t *testing.T) {
		fs := testutil.SeedFlagset(t, db, team.ID, "racing")
		tx, err := db.Pool.Begin(ctx)
		require.NoError(t, err)
		t.Cleanup(func() { _ = tx.Rollback(context.Background()) })
		_, err = tx.Exec(ctx, `UPDATE flagsets SET deleted_at = NOW() WHERE id = $1`, fs.ID)
		require.NoError(t, err)

		done := make(chan error, 1)
		go func() {
			done <- inTx(func(tx pgx.Tx) error { _, err := flags.Create(ctx, tx, fs.ID, "f"); return err })
		}()
		select {
		case err := <-done:
			t.Fatalf("create did not wait for the delete: %v", err)
		case <-time.After(200 * time.Millisecond):
		}
		require.NoError(t, tx.Commit(ctx))
		assert.ErrorIs(t, <-done, repository.ErrNotFound)
	})

	t.Run("save a version of a deleted flag", func(t *testing.T) {
		fs := testutil.SeedFlagset(t, db, team.ID, "prod")
		flag := testutil.SeedFlag(t, db, fs.ID, "f", nil, nil)
		require.NoError(t, flags.SoftDelete(ctx, nil, flag.ID))
		err := inTx(func(tx pgx.Tx) error {
			_, err := versions.Insert(ctx, tx, flag.ID, json.RawMessage(testutil.DefaultFlagPayload), "", nil)
			return err
		})
		assert.ErrorIs(t, err, repository.ErrNotFound)
		err = inTx(func(tx pgx.Tx) error {
			_, err := flags.UpdateCurrentVersion(ctx, tx, flag.ID, *flag.CurrentVersionID)
			return err
		})
		assert.ErrorIs(t, err, repository.ErrNotFound)
	})
}

func TestFlagRepoListByFlagsetFilters(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	fs := testutil.SeedFlagset(t, db, team.ID, "prod")

	testutil.SeedFlag(t, db, fs.ID, "alpha", nil, nil)
	beta := testutil.SeedFlag(t, db, fs.ID, "beta", nil, nil)
	testutil.SeedFlag(t, db, fs.ID, "gamma", nil, nil)
	require.NoError(t, repo.SetDisabled(ctx, nil, beta.ID, true))

	// No filters: all three, ordered by name.
	items, total, err := repo.ListByFlagset(ctx, fs.ID, model.FlagFilters{})
	require.NoError(t, err)
	assert.Equal(t, 3, total)
	require.Len(t, items, 3)
	assert.Equal(t, "alpha", items[0].Name)

	// Name filter.
	name := "bet"
	items, total, err = repo.ListByFlagset(ctx, fs.ID, model.FlagFilters{Name: &name})
	require.NoError(t, err)
	assert.Equal(t, 1, total)
	require.Len(t, items, 1)
	assert.Equal(t, "beta", items[0].Name)

	// Disabled filter.
	disabled := true
	items, total, err = repo.ListByFlagset(ctx, fs.ID, model.FlagFilters{Disabled: &disabled})
	require.NoError(t, err)
	assert.Equal(t, 1, total)
	assert.Equal(t, "beta", items[0].Name)

	// Pagination: page size 2 returns 2 items but total still 3.
	items, total, err = repo.ListByFlagset(ctx, fs.ID, model.FlagFilters{Page: 1, PageSize: 2})
	require.NoError(t, err)
	assert.Equal(t, 3, total)
	assert.Len(t, items, 2)
}

func TestFlagRepoListByFlagsetNameFilterEscapesWildcards(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	fs := testutil.SeedFlagset(t, db, team.ID, "prod")
	testutil.SeedFlag(t, db, fs.ID, "my_flag", nil, nil)
	testutil.SeedFlag(t, db, fs.ID, "my-flag", nil, nil)

	// "_" is a literal, not a single-character wildcard.
	name := "my_"
	items, total, err := repo.ListByFlagset(ctx, fs.ID, model.FlagFilters{Name: &name})
	require.NoError(t, err)
	assert.Equal(t, 1, total)
	require.Len(t, items, 1)
	assert.Equal(t, "my_flag", items[0].Name)
}

func TestFlagRepoListByTeamInfersType(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	fs := testutil.SeedFlagset(t, db, team.ID, "prod")
	testutil.SeedFlag(t, db, fs.ID, "bool-flag", nil, nil)
	testutil.SeedFlag(t, db, fs.ID, "str-flag", json.RawMessage(`{"variations":{"a":"x","b":"y"},"defaultRule":{"variation":"a"}}`), nil)
	testutil.SeedFlag(t, db, fs.ID, "pct-flag", json.RawMessage(`{"variations":{"a":"x","b":"y"},"targeting":[{"query":"key eq \"1\"","variation":"a"}],"defaultRule":{"percentage":{"a":30,"b":70}}}`), nil)

	instances, _, err := repo.ListByTeam(ctx, team.ID, model.TeamFlagFilters{})
	require.NoError(t, err)
	require.Len(t, instances, 3)
	byName := map[string]model.FlagInstance{}
	for _, it := range instances {
		byName[it.Name] = it
	}
	assert.Equal(t, "boolean", byName["bool-flag"].Type)
	assert.Equal(t, "string", byName["str-flag"].Type)

	// str-flag: single-variation default rule serves one variation at 100%, no targeting.
	str := byName["str-flag"]
	assert.Equal(t, []string{"a", "b"}, str.Variations)
	assert.Equal(t, map[string]float64{"a": 100}, str.Distribution)
	assert.Equal(t, 0, str.TargetingRuleCount)

	// pct-flag: percentage default split is surfaced along with the targeting rule count.
	pct := byName["pct-flag"]
	assert.Equal(t, map[string]float64{"a": 30, "b": 70}, pct.Distribution)
	assert.Equal(t, 1, pct.TargetingRuleCount)
}

func TestFlagRepoSoftDeleteAndDisable(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	fs := testutil.SeedFlagset(t, db, team.ID, "prod")
	flag := testutil.SeedFlag(t, db, fs.ID, "my-flag", nil, nil)

	// TeamID resolves the owning team through the flagset.
	teamID, err := repo.TeamID(ctx, flag.ID)
	require.NoError(t, err)
	assert.Equal(t, team.ID, teamID)

	// SetDisabled toggles.
	require.NoError(t, repo.SetDisabled(ctx, nil, flag.ID, true))
	got, _ := repo.GetByID(ctx, flag.ID)
	assert.True(t, got.Disabled)

	// SoftDelete hides the flag from reads.
	require.NoError(t, repo.SoftDelete(ctx, nil, flag.ID))
	_, err = repo.GetByID(ctx, flag.ID)
	assert.ErrorIs(t, err, repository.ErrNotFound, "soft-deleted flag is not returned")

	// Operations on a deleted flag report ErrNotFound.
	assert.ErrorIs(t, repo.SoftDelete(ctx, nil, flag.ID), repository.ErrNotFound)
	assert.ErrorIs(t, repo.SetDisabled(ctx, nil, flag.ID, false), repository.ErrNotFound)
	_, err = repo.TeamID(ctx, flag.ID)
	assert.ErrorIs(t, err, repository.ErrNotFound)
}

// countFlagTags is a small helper for the tag-mirror tests.
func countFlagTags(t *testing.T, db *repository.DB, flagID string) int {
	t.Helper()
	var n int
	require.NoError(t, db.Pool.QueryRow(t.Context(),
		`SELECT count(*) FROM flag_tags WHERE flag_id = $1`, flagID).Scan(&n))
	return n
}

func TestFlagRepoReplaceFlagTags(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	fs := testutil.SeedFlagset(t, db, team.ID, "prod")
	flag := testutil.SeedFlag(t, db, fs.ID, "f", nil, nil)

	replace := func(tags []string) {
		require.NoError(t, pgx.BeginFunc(ctx, db.Pool, func(tx pgx.Tx) error {
			return repo.ReplaceFlagTags(ctx, tx, flag.ID, tags)
		}))
	}

	// Insert an initial set.
	replace([]string{"beta", "prod"})
	assert.Equal(t, 2, countFlagTags(t, db, flag.ID))

	// Replace with a different set — old rows gone, new rows present.
	replace([]string{"prod", "canary", "eu"})
	assert.Equal(t, 3, countFlagTags(t, db, flag.ID))

	// CRITICAL regression: clearing all tags leaves zero rows.
	replace(nil)
	assert.Equal(t, 0, countFlagTags(t, db, flag.ID))
}

func TestFlagRepoListTeamTags(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	fsA := testutil.SeedFlagset(t, db, team.ID, "prod")
	fsB := testutil.SeedFlagset(t, db, team.ID, "staging")
	other := testutil.SeedTeam(t, db, company.ID, "Other")
	fsOther := testutil.SeedFlagset(t, db, other.ID, "x")

	f1 := testutil.SeedFlag(t, db, fsA.ID, "f1", nil, nil)
	f2 := testutil.SeedFlag(t, db, fsB.ID, "f2", nil, nil)
	fDel := testutil.SeedFlag(t, db, fsA.ID, "fdel", nil, nil)
	fOther := testutil.SeedFlag(t, db, fsOther.ID, "fo", nil, nil)

	setTags := func(id string, tags []string) {
		require.NoError(t, pgx.BeginFunc(ctx, db.Pool, func(tx pgx.Tx) error {
			return repo.ReplaceFlagTags(ctx, tx, id, tags)
		}))
	}
	setTags(f1.ID, []string{"beta", "prod"})
	setTags(f2.ID, []string{"Beta", "staging"})
	setTags(fDel.ID, []string{"only-on-deleted"})
	setTags(fOther.ID, []string{"other-team-tag"})

	// Distinct (case-insensitively), sorted, team-scoped (excludes the other team's tag).
	tags, err := repo.ListTeamTags(ctx, team.ID)
	require.NoError(t, err)
	assert.Equal(t, []string{"Beta", "only-on-deleted", "prod", "staging"}, tags)

	// Soft-deleting the flag drops its exclusive tag and its mirror rows.
	require.NoError(t, repo.SoftDelete(ctx, nil, fDel.ID))
	assert.Equal(t, 0, countFlagTags(t, db, fDel.ID))
	tags, err = repo.ListTeamTags(ctx, team.ID)
	require.NoError(t, err)
	assert.Equal(t, []string{"Beta", "prod", "staging"}, tags)
}

func TestFlagRepoListByTeamTagFilter(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	fs := testutil.SeedFlagset(t, db, team.ID, "prod")

	both := testutil.SeedFlag(t, db, fs.ID, "both", nil, nil)
	onlyBeta := testutil.SeedFlag(t, db, fs.ID, "only-beta", nil, nil)
	none := testutil.SeedFlag(t, db, fs.ID, "none", nil, nil)

	setTags := func(id string, tags []string) {
		require.NoError(t, pgx.BeginFunc(ctx, db.Pool, func(tx pgx.Tx) error {
			return repo.ReplaceFlagTags(ctx, tx, id, tags)
		}))
	}
	setTags(both.ID, []string{"beta", "prod"})
	setTags(onlyBeta.ID, []string{"Beta"})
	_ = none

	names := func(items []model.FlagInstance) []string {
		out := make([]string, len(items))
		for i, it := range items {
			out[i] = it.Name
		}
		return out
	}

	// No filter → all three.
	all, _, err := repo.ListByTeam(ctx, team.ID, model.TeamFlagFilters{})
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"both", "only-beta", "none"}, names(all))

	// Single tag → flags carrying it, whatever its case.
	betaOnly, _, err := repo.ListByTeam(ctx, team.ID, model.TeamFlagFilters{Tags: []string{"beta"}})
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"both", "only-beta"}, names(betaOnly))

	// Multiple tags → AND (only flags with ALL of them).
	andBoth, _, err := repo.ListByTeam(ctx, team.ID, model.TeamFlagFilters{Tags: []string{"beta", "prod"}})
	require.NoError(t, err)
	assert.Equal(t, []string{"both"}, names(andBoth))

	// A repeated tag in the filter must not zero out the result.
	dup, _, err := repo.ListByTeam(ctx, team.ID, model.TeamFlagFilters{Tags: []string{"beta", "beta"}})
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"both", "only-beta"}, names(dup))

	upper, _, err := repo.ListByTeam(ctx, team.ID, model.TeamFlagFilters{Tags: []string{"BETA"}})
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"both", "only-beta"}, names(upper))

	// A tag no flag has → empty.
	empty, _, err := repo.ListByTeam(ctx, team.ID, model.TeamFlagFilters{Tags: []string{"nonexistent"}})
	require.NoError(t, err)
	assert.Empty(t, empty)
}

func TestFlagRepoListByTeamReturnsTags(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	fs := testutil.SeedFlagset(t, db, team.ID, "prod")
	payload := json.RawMessage(`{"variations":{"on":true,"off":false},"defaultRule":{"variation":"on"},"metadata":{"tags":["beta","prod"]}}`)
	testutil.SeedFlag(t, db, fs.ID, "tagged", payload, nil)

	items, _, err := repo.ListByTeam(ctx, team.ID, model.TeamFlagFilters{})
	require.NoError(t, err)
	require.Len(t, items, 1)
	assert.Equal(t, []string{"beta", "prod"}, items[0].Tags)
}

func TestFlagRepoListByTeamFiltersAndPaging(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	prod := testutil.SeedFlagset(t, db, team.ID, "prod")
	stg := testutil.SeedFlagset(t, db, team.ID, "stg")
	alice := testutil.SeedUser(t, db, "alice@acme.com", "Alice", false)

	payloads := map[string]string{
		"int":   `{"variations":{"a":1,"b":2},"defaultRule":{"variation":"a"}}`,
		"float": `{"variations":{"a":1,"b":2.5},"defaultRule":{"variation":"a"}}`,
		"json":  `{"variations":{"a":{"x":1},"b":[1]},"defaultRule":{"variation":"a"}}`,
	}
	testutil.SeedFlag(t, db, prod.ID, "checkout_int", json.RawMessage(payloads["int"]), &alice.ID)
	testutil.SeedFlag(t, db, prod.ID, "checkout_float", json.RawMessage(payloads["float"]), nil)
	testutil.SeedFlag(t, db, stg.ID, "json_flag", json.RawMessage(payloads["json"]), &alice.ID)
	off := testutil.SeedFlag(t, db, stg.ID, "bool_flag", nil, nil)
	require.NoError(t, repo.SetDisabled(ctx, nil, off.ID, true))

	names := func(items []model.FlagInstance) []string {
		out := make([]string, len(items))
		for i, it := range items {
			out[i] = it.Name
		}
		return out
	}
	// list pins sort=name so filter assertions don't depend on timestamps.
	list := func(f model.TeamFlagFilters) ([]string, int) {
		if f.Sort == "" {
			f.Sort = "name"
		}
		items, total, err := repo.ListByTeam(ctx, team.ID, f)
		require.NoError(t, err)
		out := make([]string, len(items))
		for i, it := range items {
			out[i] = it.Name
		}
		return out, total
	}
	ptr := func(s string) *string { return &s }

	// Paging: total counts every match.
	page1, total := list(model.TeamFlagFilters{Page: 1, PageSize: 3})
	assert.Equal(t, 4, total)
	assert.Equal(t, []string{"bool_flag", "checkout_float", "checkout_int"}, page1)
	page2, _ := list(model.TeamFlagFilters{Page: 2, PageSize: 3})
	assert.Equal(t, []string{"json_flag"}, page2)

	// Name is a case-insensitive literal substring (LIKE wildcards escaped).
	got, total := list(model.TeamFlagFilters{Name: ptr("CHECKOUT_")})
	assert.Equal(t, []string{"checkout_float", "checkout_int"}, got)
	assert.Equal(t, 2, total)
	got, _ = list(model.TeamFlagFilters{Name: ptr("%")})
	assert.Empty(t, got)

	for typ, want := range map[string][]string{
		"int": {"checkout_int"}, "float": {"checkout_float"}, "json": {"json_flag"}, "boolean": {"bool_flag"},
	} {
		got, _ = list(model.TeamFlagFilters{Type: ptr(typ)})
		assert.Equal(t, want, got, typ)
	}

	got, _ = list(model.TeamFlagFilters{FlagsetID: &stg.ID})
	assert.Equal(t, []string{"bool_flag", "json_flag"}, got)
	got, _ = list(model.TeamFlagFilters{Owner: &alice.ID})
	assert.Equal(t, []string{"checkout_int", "json_flag"}, got)
	got, _ = list(model.TeamFlagFilters{Unassigned: true})
	assert.Equal(t, []string{"bool_flag", "checkout_float"}, got)
	disabled := true
	got, _ = list(model.TeamFlagFilters{Disabled: &disabled})
	assert.Equal(t, []string{"bool_flag"}, got)

	owners, err := repo.ListTeamOwners(ctx, team.ID)
	require.NoError(t, err)
	assert.Equal(t, []model.FlagOwner{{ID: alice.ID, Name: "Alice"}}, owners)

	// Sorting: pin updated_at so the recency order is deterministic.
	for name, ago := range map[string]string{"bool_flag": "0", "checkout_int": "1", "checkout_float": "2", "json_flag": "3"} {
		_, err := db.Pool.Exec(ctx, `UPDATE flags SET updated_at = NOW() - $1::int * INTERVAL '1 hour' WHERE name = $2`, ago, name)
		require.NoError(t, err)
	}
	for _, tc := range []struct {
		sort string
		desc bool
		want []string
	}{
		{"", false, []string{"bool_flag", "checkout_int", "checkout_float", "json_flag"}}, // default: updated desc
		{"updated", false, []string{"json_flag", "checkout_float", "checkout_int", "bool_flag"}},
		{"name", true, []string{"json_flag", "checkout_int", "checkout_float", "bool_flag"}},
		{"state", false, []string{"checkout_float", "checkout_int", "json_flag", "bool_flag"}}, // enabled first
		{"state", true, []string{"bool_flag", "checkout_float", "checkout_int", "json_flag"}},
	} {
		items, _, err := repo.ListByTeam(ctx, team.ID, model.TeamFlagFilters{Sort: tc.sort, Desc: tc.desc})
		require.NoError(t, err)
		assert.Equal(t, tc.want, names(items), "%s desc=%v", tc.sort, tc.desc)
	}
}

func TestFlagRepoCreateNameTaken(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagRepo(db)
	ctx := t.Context()
	team := testutil.SeedTeam(t, db, testutil.SeedCompany(t, db, "Acme").ID, "Platform")
	fs := testutil.SeedFlagset(t, db, team.ID, "prod")
	testutil.SeedFlag(t, db, fs.ID, "a", nil, nil)

	err := pgx.BeginFunc(ctx, db.Pool, func(tx pgx.Tx) error { _, err := repo.Create(ctx, tx, fs.ID, "a"); return err })
	assert.ErrorIs(t, err, repository.ErrFlagNameTaken)
}

// TestFlagRepoListByTeamScoping: team-wide reads never return another team's
// flags, and the "unknown" type filter finds flags without a version.
func TestFlagRepoListByTeamScoping(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagRepo(db)
	ctx := t.Context()
	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	other := testutil.SeedTeam(t, db, company.ID, "Other")
	alice := testutil.SeedUser(t, db, "alice@acme.com", "Alice", false)
	bob := testutil.SeedUser(t, db, "bob@acme.com", "Bob", false)
	fs := testutil.SeedFlagset(t, db, team.ID, "prod")
	testutil.SeedFlag(t, db, fs.ID, "mine", nil, &alice.ID)
	testutil.SeedFlag(t, db, testutil.SeedFlagset(t, db, other.ID, "x").ID, "theirs", nil, &bob.ID)
	require.NoError(t, pgx.BeginFunc(ctx, db.Pool, func(tx pgx.Tx) error {
		_, err := repo.Create(ctx, tx, fs.ID, "no-version")
		return err
	}))

	tests := []struct {
		name    string
		filters model.TeamFlagFilters
		want    []string
	}{
		{name: "only the team's flags", want: []string{"mine", "no-version"}},
		{name: "unknown type finds version-less flags", filters: model.TeamFlagFilters{Type: new("unknown")},
			want: []string{"no-version"}},
		{name: "another team's owner matches nothing", filters: model.TeamFlagFilters{Owner: &bob.ID}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			items, total, err := repo.ListByTeam(ctx, team.ID, tt.filters)
			require.NoError(t, err)
			got := make([]string, 0, len(items))
			for _, it := range items {
				got = append(got, it.Name)
			}
			assert.ElementsMatch(t, tt.want, got)
			assert.Equal(t, len(tt.want), total)
		})
	}

	owners, err := repo.ListTeamOwners(ctx, team.ID)
	require.NoError(t, err)
	assert.Equal(t, []model.FlagOwner{{ID: alice.ID, Name: "Alice"}}, owners)
}

// Owners are users, not names: two authors named "Alice" stay two owners, and
// one with an empty name is still an owner, not unassigned.
func TestFlagRepoOwnersKeyedByUserID(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagRepo(db)
	ctx := t.Context()
	team := testutil.SeedTeam(t, db, testutil.SeedCompany(t, db, "Acme").ID, "Platform")
	fs := testutil.SeedFlagset(t, db, team.ID, "prod")
	alice1 := testutil.SeedUser(t, db, "alice1@acme.com", "Alice", false)
	alice2 := testutil.SeedUser(t, db, "alice2@acme.com", "Alice", false)
	nameless := testutil.SeedUser(t, db, "nameless@acme.com", "", false)
	testutil.SeedFlag(t, db, fs.ID, "a1", nil, &alice1.ID)
	testutil.SeedFlag(t, db, fs.ID, "a2", nil, &alice2.ID)
	testutil.SeedFlag(t, db, fs.ID, "blank", nil, &nameless.ID)
	testutil.SeedFlag(t, db, fs.ID, "none", nil, nil)

	tests := []struct {
		name    string
		filters model.TeamFlagFilters
		want    []string
	}{
		{"first Alice", model.TeamFlagFilters{Owner: &alice1.ID}, []string{"a1"}},
		{"second Alice", model.TeamFlagFilters{Owner: &alice2.ID}, []string{"a2"}},
		{"empty name is an owner", model.TeamFlagFilters{Owner: &nameless.ID}, []string{"blank"}},
		{"unassigned", model.TeamFlagFilters{Unassigned: true}, []string{"none"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.filters.Sort = "name"
			items, _, err := repo.ListByTeam(ctx, team.ID, tt.filters)
			require.NoError(t, err)
			got := make([]string, 0, len(items))
			for _, it := range items {
				got = append(got, it.Name)
				if it.Name != "none" {
					require.NotNil(t, it.OwnerID)
					assert.Equal(t, *tt.filters.Owner, *it.OwnerID)
				}
			}
			assert.Equal(t, tt.want, got)
		})
	}

	owners, err := repo.ListTeamOwners(ctx, team.ID)
	require.NoError(t, err)
	assert.ElementsMatch(t, []model.FlagOwner{
		{ID: nameless.ID, Name: ""}, {ID: alice1.ID, Name: "Alice"}, {ID: alice2.ID, Name: "Alice"},
	}, owners)
}

// TestFlagRepoFlagsetDeleteRacingSave: a flagset delete that starts while a
// flag save is between its version insert and its tag mirror waits for the
// save instead of deadlocking, then deletes the tags the save wrote.
func TestFlagRepoFlagsetDeleteRacingSave(t *testing.T) {
	db := testutil.StartPostgres(t)
	flags := repository.NewFlagRepo(db)
	versions := repository.NewFlagVersionRepo(db)
	ctx := t.Context()
	team := testutil.SeedTeam(t, db, testutil.SeedCompany(t, db, "Acme").ID, "Platform")
	fs := testutil.SeedFlagset(t, db, team.ID, "prod")
	flag := testutil.SeedFlag(t, db, fs.ID, "f", nil, nil)

	tx, err := db.Pool.Begin(ctx)
	require.NoError(t, err)
	t.Cleanup(func() { _ = tx.Rollback(context.Background()) })
	v, err := versions.Insert(ctx, tx, flag.ID, json.RawMessage(testutil.DefaultFlagPayload), "", nil)
	require.NoError(t, err)
	_, err = flags.UpdateCurrentVersion(ctx, tx, flag.ID, v.ID)
	require.NoError(t, err)

	done := make(chan error, 1)
	go func() { done <- repository.NewFlagsetRepo(db).SoftDelete(ctx, fs.ID) }()
	select {
	case err := <-done:
		t.Fatalf("delete did not wait for the save: %v", err)
	case <-time.After(200 * time.Millisecond):
	}
	require.NoError(t, flags.ReplaceFlagTags(ctx, tx, flag.ID, []string{"a", "b"}))
	require.NoError(t, tx.Commit(ctx))

	require.NoError(t, <-done)
	assert.Equal(t, 0, countFlagTags(t, db, flag.ID))
}

func TestFlagRepoQueryErrors(t *testing.T) {
	db := testutil.StartPostgres(t)
	flags := repository.NewFlagRepo(db)
	versions := repository.NewFlagVersionRepo(db)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	id := "00000000-0000-0000-0000-000000000000"

	_, err := flags.GetByID(ctx, id)
	assert.ErrorIs(t, err, context.Canceled)
	_, _, err = flags.ListByFlagset(ctx, id, model.FlagFilters{})
	assert.ErrorIs(t, err, context.Canceled)
	_, _, err = flags.ListByTeam(ctx, id, model.TeamFlagFilters{})
	assert.ErrorIs(t, err, context.Canceled)
	_, err = flags.ListTeamOwners(ctx, id)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = flags.ListTeamTags(ctx, id)
	assert.ErrorIs(t, err, context.Canceled)
	assert.ErrorIs(t, flags.SoftDelete(ctx, nil, id), context.Canceled)
	_, err = flags.TeamID(ctx, id)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = versions.GetByFlagAndNumber(ctx, id, 1)
	assert.ErrorIs(t, err, context.Canceled)
	_, _, err = versions.ListByFlag(ctx, id, 10, 0)
	assert.ErrorIs(t, err, context.Canceled)
	assert.ErrorIs(t, flags.SetDisabled(ctx, nil, id, true), context.Canceled)

	// Writes take the caller's tx: a failed statement surfaces its error.
	tx, err := db.Pool.Begin(t.Context())
	require.NoError(t, err)
	t.Cleanup(func() { _ = tx.Rollback(context.Background()) })
	_, err = tx.Exec(t.Context(), `SELECT 1/0`)
	require.Error(t, err)
	_, err = flags.Create(t.Context(), tx, id, "f")
	assert.ErrorContains(t, err, "25P02", "aborted tx")
	_, err = flags.UpdateCurrentVersion(t.Context(), tx, id, id)
	assert.ErrorContains(t, err, "25P02")
	assert.ErrorContains(t, flags.SetDisabled(t.Context(), tx, id, true), "25P02")
	assert.ErrorContains(t, flags.SoftDelete(t.Context(), tx, id), "25P02")
	assert.ErrorContains(t, flags.ReplaceFlagTags(t.Context(), tx, id, nil), "25P02")
	_, err = versions.Insert(t.Context(), tx, id, nil, "", nil)
	assert.ErrorContains(t, err, "25P02")
}

func TestFlagRepoGetForUpdate(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagRepo(db)
	ctx := t.Context()
	fs := testutil.SeedFlagset(t, db, testutil.SeedTeam(t, db, testutil.SeedCompany(t, db, "Acme").ID, "P").ID, "prod")
	live := testutil.SeedFlag(t, db, fs.ID, "live", nil, nil)
	gone := testutil.SeedFlag(t, db, fs.ID, "gone", nil, nil)
	require.NoError(t, repo.SoftDelete(ctx, nil, gone.ID))

	tests := []struct {
		name     string
		id       string
		wantFlag bool
	}{
		{"live flag with its current version", live.ID, true},
		{"deleted flag", gone.ID, false},
		{"unknown flag", "00000000-0000-0000-0000-000000000000", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.NoError(t, pgx.BeginFunc(ctx, db.Pool, func(tx pgx.Tx) error {
				f, err := repo.GetForUpdate(ctx, tx, tt.id)
				if !tt.wantFlag {
					assert.ErrorIs(t, err, repository.ErrNotFound)
					assert.Nil(t, f)
					return nil
				}
				require.NoError(t, err)
				require.NotNil(t, f)
				assert.Equal(t, 1, *f.CurrentVersion)
				assert.JSONEq(t, testutil.DefaultFlagPayload, string(f.Payload))
				return nil
			}))
		})
	}

	t.Run("malformed id aborts the tx and is reported", func(t *testing.T) {
		tx, err := db.Pool.Begin(ctx)
		require.NoError(t, err)
		defer func() { _ = tx.Rollback(ctx) }()
		_, err = repo.GetForUpdate(ctx, tx, "abc")
		assert.ErrorContains(t, err, "22P02")
	})

	t.Run("aborted tx", func(t *testing.T) {
		tx, err := db.Pool.Begin(ctx)
		require.NoError(t, err)
		defer func() { _ = tx.Rollback(ctx) }()
		_, err = tx.Exec(ctx, `SELECT 1/0`)
		require.Error(t, err)
		_, err = repo.GetForUpdate(ctx, tx, live.ID)
		assert.ErrorContains(t, err, "25P02")
	})
}
