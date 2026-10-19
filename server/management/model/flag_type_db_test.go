package model_test

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The generated flag_versions.flag_type column (filtered on by the team flags
// list) must agree with model.InferFlagType on every case of its table. Each
// flag is looked up by name, so a wrong SQL type can't match another case.
func TestFlagTypeColumnMatchesInferFlagType(t *testing.T) {
	db := testutil.StartPostgres(t)
	fs := testutil.SeedFlagset(t, db,
		testutil.SeedTeam(t, db, testutil.SeedCompany(t, db, "Acme").ID, "Platform").ID, "prod")
	// Mixed variation types never reach the column: ValidateFlagPayload rejects
	// them on write, and the column relies on that (first matching branch wins).
	unstorable := map[string]bool{"mixed types are unknown": true}
	want := map[string]string{}
	for i, tt := range model.InferFlagTypeCases {
		if !json.Valid([]byte(tt.Payload)) || unstorable[tt.Name] {
			continue // the payload column only stores JSON
		}
		name := fmt.Sprintf("case-%d", i)
		testutil.SeedFlag(t, db, fs.ID, name, json.RawMessage(tt.Payload), nil)
		want[name] = tt.Want
	}
	require.NotEmpty(t, want)

	rows, err := db.Pool.Query(t.Context(), `SELECT f.name, fv.flag_type FROM flags f
		JOIN flag_versions fv ON fv.id = f.current_version_id WHERE f.flagset_id = $1`, fs.ID)
	require.NoError(t, err)
	got, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) ([2]string, error) {
		var p [2]string
		return p, r.Scan(&p[0], &p[1])
	})
	require.NoError(t, err)
	require.Len(t, got, len(want))
	for _, p := range got {
		assert.Equal(t, want[p[0]], p[1], "%s: %s", p[0], model.InferFlagTypeCases[indexOf(p[0])].Payload)
	}
}

func indexOf(name string) int {
	var i int
	_, _ = fmt.Sscanf(name, "case-%d", &i)
	return i
}
