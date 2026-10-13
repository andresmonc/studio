package model

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	coredto "github.com/thomaspoignant/go-feature-flag/modules/core/dto"
	"github.com/thomaspoignant/go-feature-flag/modules/core/flag"
)

func TestValidateFlagName(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"valid", "my-flag", false},
		{"empty", "", true},
		{"max length ok", strings.Repeat("a", 200), false},
		{"too long", strings.Repeat("a", 201), true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			errs := ValidateFlagName(tt.input)
			assert.Equal(t, tt.wantErr, len(errs) > 0)
		})
	}
}

func TestValidateFlagPayload(t *testing.T) {
	twoVars := map[string]*any{
		"on":  any3(true),
		"off": any3(false),
	}
	defaultRule := &flag.Rule{VariationResult: new("on")}

	tests := []struct {
		name    string
		dto     coredto.DTO
		wantErr bool
	}{
		{
			name: "valid minimal",
			dto: coredto.DTO{
				Variations:  &twoVars,
				DefaultRule: defaultRule,
			},
			wantErr: false,
		},
		{
			name: "missing variations",
			dto: coredto.DTO{
				DefaultRule: defaultRule,
			},
			wantErr: true,
		},
		{
			name: "missing defaultRule",
			dto: coredto.DTO{
				Variations: &twoVars,
			},
			wantErr: true,
		},
		{
			name: "rule without query",
			dto: coredto.DTO{
				Variations:  &twoVars,
				DefaultRule: defaultRule,
				Rules: &[]flag.Rule{
					{VariationResult: new("on")},
				},
			},
			wantErr: true,
		},
		{
			name: "defaultRule percentages summing to 100",
			dto: coredto.DTO{
				Variations:  &twoVars,
				DefaultRule: &flag.Rule{Percentages: &map[string]float64{"on": 50, "off": 50}},
			},
			wantErr: false,
		},
		{
			name: "defaultRule percentages not summing to 100",
			dto: coredto.DTO{
				Variations:  &twoVars,
				DefaultRule: &flag.Rule{Percentages: &map[string]float64{"on": 50, "off": 30}},
			},
			wantErr: true,
		},
		{
			name: "targeting rule with query is valid",
			dto: coredto.DTO{
				Variations:  &twoVars,
				DefaultRule: defaultRule,
				Rules: &[]flag.Rule{
					{Query: new("country eq \"FR\""), VariationResult: new("on")},
				},
			},
			wantErr: false,
		},
		{
			name:    "too many targeting rules",
			dto:     withRules(twoVars, defaultRule, slices.Repeat([]string{`country eq "FR"`}, maxTargetingRules+1)...),
			wantErr: true,
		},
		{
			name:    "max targeting rules ok",
			dto:     withRules(twoVars, defaultRule, slices.Repeat([]string{`country eq "FR"`}, maxTargetingRules)...),
			wantErr: false,
		},
		{
			name:    "query too long",
			dto:     withRules(twoVars, defaultRule, "b"+strings.Repeat(".b", maxQueryLen/2)+` eq "x"`),
			wantErr: true,
		},
		{
			name:    "jsonlogic reduce rejected",
			dto:     withRules(twoVars, defaultRule, `{"==":[{"reduce":[{"var":"arr"},{"cat":[{"var":"accumulator"},{"var":"current"}]},""]},"nomatch"]}`),
			wantErr: true,
		},
		{
			name:    "jsonlogic reduce string value allowed",
			dto:     withRules(twoVars, defaultRule, `{"==":[{"var":"plan"},"reduce"]}`),
			wantErr: false,
		},
		{
			name:    "nikunjy reduce word allowed",
			dto:     withRules(twoVars, defaultRule, `plan eq "reduce"`),
			wantErr: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			errs := ValidateFlagPayload(tt.dto)
			assert.Equal(t, tt.wantErr, len(errs) > 0, "errors: %+v", errs)
		})
	}
}

func any3(v any) *any { return &v }

func withRules(vars map[string]*any, def *flag.Rule, queries ...string) coredto.DTO {
	rules := make([]flag.Rule, len(queries))
	for i, q := range queries {
		rules[i] = flag.Rule{Query: new(q), VariationResult: new("on")}
	}
	return coredto.DTO{Variations: &vars, DefaultRule: def, Rules: &rules}
}


func TestInferFlagType(t *testing.T) {
	tests := []struct {
		name    string
		payload string
		want    string
	}{
		{"boolean", `{"variations":{"on":true,"off":false}}`, "boolean"},
		{"string", `{"variations":{"a":"x","b":"y"}}`, "string"},
		{"int", `{"variations":{"a":1,"b":2}}`, "int"},
		{"float", `{"variations":{"a":1.5,"b":2.5}}`, "float"},
		{"mixed int/float is float", `{"variations":{"a":1,"b":2.5}}`, "float"},
		{"json object", `{"variations":{"a":{"k":"v"},"b":{"k":"w"}}}`, "json"},
		{"json array", `{"variations":{"a":[1,2],"b":[3]}}`, "json"},
		{"no variations", `{"defaultRule":{}}`, "unknown"},
		{"empty payload", ``, "unknown"},
		{"invalid json", `not-json`, "unknown"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, InferFlagType(json.RawMessage(tt.payload)))
		})
	}
}

func TestFlagSummaryFromPayload(t *testing.T) {
	t.Run("single-variation default serves 100%", func(t *testing.T) {
		vars, dist, rules, prog := FlagSummaryFromPayload(json.RawMessage(
			`{"variations":{"on":true,"off":false},"defaultRule":{"variation":"on"}}`))
		assert.Equal(t, []string{"on", "off"}, vars)
		assert.Equal(t, map[string]float64{"on": 100}, dist)
		assert.Equal(t, 0, rules)
		assert.Nil(t, prog)
	})

	t.Run("percentage default keeps the split and drops zero weights", func(t *testing.T) {
		vars, dist, rules, prog := FlagSummaryFromPayload(json.RawMessage(
			`{"variations":{"a":"x","b":"y","c":"z"},"defaultRule":{"percentage":{"a":60,"b":40,"c":0}}}`))
		assert.Equal(t, []string{"a", "b", "c"}, vars)
		assert.Equal(t, map[string]float64{"a": 60, "b": 40}, dist)
		assert.Equal(t, 0, rules)
		assert.Nil(t, prog)
	})

	t.Run("targeting rules are counted", func(t *testing.T) {
		_, _, rules, _ := FlagSummaryFromPayload(json.RawMessage(
			`{"variations":{"a":"x","b":"y"},"targeting":[{"query":"a eq 1","variation":"a"},{"query":"b eq 2","variation":"b"}],"defaultRule":{"variation":"a"}}`))
		assert.Equal(t, 2, rules)
	})

	t.Run("variation order follows payload document order", func(t *testing.T) {
		vars, _, _, _ := FlagSummaryFromPayload(json.RawMessage(
			`{"variations":{"zebra":"z","alpha":"a","mid":"m"}}`))
		assert.Equal(t, []string{"zebra", "alpha", "mid"}, vars)
	})

	t.Run("progressive-rollout default has no split but reports initial→end", func(t *testing.T) {
		vars, dist, _, prog := FlagSummaryFromPayload(json.RawMessage(
			`{"variations":{"a":"x","b":"y"},"defaultRule":{"progressiveRollout":{"initial":{"variation":"a","percentage":0},"end":{"variation":"b","percentage":100}}}}`))
		assert.Equal(t, []string{"a", "b"}, vars)
		assert.Empty(t, dist)
		assert.Equal(t, &ProgressiveSummary{InitialVariation: "a", EndVariation: "b", From: 0, To: 100}, prog)
	})

	t.Run("progressive-rollout default defaults missing percentages to 0/100", func(t *testing.T) {
		_, _, _, prog := FlagSummaryFromPayload(json.RawMessage(
			`{"variations":{"a":"x","b":"y"},"defaultRule":{"progressiveRollout":{"initial":{"variation":"a"},"end":{"variation":"b"}}}}`))
		assert.Equal(t, &ProgressiveSummary{InitialVariation: "a", EndVariation: "b", From: 0, To: 100}, prog)
	})

	t.Run("empty and invalid payloads yield zero values", func(t *testing.T) {
		for _, p := range []string{``, `not-json`, `{}`} {
			vars, dist, rules, prog := FlagSummaryFromPayload(json.RawMessage(p))
			assert.Nil(t, vars)
			assert.Nil(t, dist)
			assert.Equal(t, 0, rules)
			assert.Nil(t, prog)
		}
	})
}

func TestOpenFeatureFlagType(t *testing.T) {
	tests := []struct {
		name    string
		payload string
		want    string
	}{
		{"boolean", `{"variations":{"on":true,"off":false}}`, "boolean"},
		{"string", `{"variations":{"a":"x","b":"y"}}`, "string"},
		{"int maps to integer", `{"variations":{"a":1,"b":2}}`, "integer"},
		{"float", `{"variations":{"a":1.5,"b":2.5}}`, "float"},
		{"json maps to object", `{"variations":{"a":{"k":"v"},"b":{"k":"w"}}}`, "object"},
		{"unknown maps to empty", `{"defaultRule":{}}`, ""},
		{"empty payload maps to empty", ``, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, OpenFeatureFlagType(json.RawMessage(tt.payload)))
		})
	}
}

func TestSetFlagTypeMetadata(t *testing.T) {
	t.Run("adds metadata block when absent", func(t *testing.T) {
		in := `{"variations":{"on":true,"off":false},"defaultRule":{"variation":"on"}}`
		out, err := SetFlagTypeMetadata(json.RawMessage(in))
		assert.NoError(t, err)
		assert.JSONEq(t, `{"variations":{"on":true,"off":false},"defaultRule":{"variation":"on"},"metadata":{"flagType":"boolean"}}`, string(out))
	})

	t.Run("int maps to integer", func(t *testing.T) {
		out, err := SetFlagTypeMetadata(json.RawMessage(`{"variations":{"a":1,"b":2}}`))
		assert.NoError(t, err)
		assert.Contains(t, string(out), `"flagType":"integer"`)
	})

	t.Run("preserves existing metadata keys and their order", func(t *testing.T) {
		in := `{"variations":{"a":"x","b":"y"},"metadata":{"owner":"team-a","description":"d"}}`
		out, err := SetFlagTypeMetadata(json.RawMessage(in))
		assert.NoError(t, err)
		// flagType is appended after the existing keys, which keep their order.
		assert.Equal(t,
			`{"variations":{"a":"x","b":"y"},"metadata":{"owner":"team-a","description":"d","flagType":"string"}}`,
			string(out))
	})

	t.Run("overwrites a stale flagType authoritatively", func(t *testing.T) {
		in := `{"variations":{"on":true,"off":false},"metadata":{"flagType":"string","owner":"team-a"}}`
		out, err := SetFlagTypeMetadata(json.RawMessage(in))
		assert.NoError(t, err)
		// flagType keeps its original position; only the value changes.
		assert.Equal(t,
			`{"variations":{"on":true,"off":false},"metadata":{"flagType":"boolean","owner":"team-a"}}`,
			string(out))
	})

	t.Run("unknown type is a no-op", func(t *testing.T) {
		in := `{"defaultRule":{"variation":"on"}}`
		out, err := SetFlagTypeMetadata(json.RawMessage(in))
		assert.NoError(t, err)
		assert.Equal(t, in, string(out))
	})

	t.Run("null metadata is replaced with an object", func(t *testing.T) {
		in := `{"variations":{"a":"x","b":"y"},"metadata":null}`
		out, err := SetFlagTypeMetadata(json.RawMessage(in))
		assert.NoError(t, err)
		assert.JSONEq(t, `{"variations":{"a":"x","b":"y"},"metadata":{"flagType":"string"}}`, string(out))
	})

	t.Run("is idempotent", func(t *testing.T) {
		in := `{"variations":{"on":true,"off":false}}`
		first, err := SetFlagTypeMetadata(json.RawMessage(in))
		assert.NoError(t, err)
		second, err := SetFlagTypeMetadata(first)
		assert.NoError(t, err)
		assert.Equal(t, string(first), string(second))
	})
}

func TestParseOrderedObject(t *testing.T) {
	t.Run("preserves key order", func(t *testing.T) {
		obj, err := parseOrderedObject([]byte(`{"b":1,"a":2,"c":3}`))
		assert.NoError(t, err)
		assert.Equal(t, []string{"b", "a", "c"}, obj.keys)
		out, err := json.Marshal(obj)
		assert.NoError(t, err)
		assert.Equal(t, `{"b":1,"a":2,"c":3}`, string(out))
	})

	t.Run("get returns missing keys as not-ok", func(t *testing.T) {
		obj, err := parseOrderedObject([]byte(`{"a":1}`))
		assert.NoError(t, err)
		_, ok := obj.get("missing")
		assert.False(t, ok)
		v, ok := obj.get("a")
		assert.True(t, ok)
		assert.Equal(t, json.RawMessage("1"), v)
	})

	errCases := []struct {
		name  string
		input string
	}{
		{"empty input", ``},
		{"not an object", `[1,2,3]`},
		{"scalar", `42`},
		{"malformed value", `{"a":}`},
		{"truncated", `{"a":1`},
	}
	for _, tc := range errCases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := parseOrderedObject([]byte(tc.input))
			assert.Error(t, err)
		})
	}
}

func TestValidateFlagTypeUnchanged(t *testing.T) {
	boolP := `{"variations":{"on":true,"off":false}}`
	stringP := `{"variations":{"a":"x","b":"y"}}`
	intP := `{"variations":{"a":1,"b":2}}`
	floatP := `{"variations":{"a":1.5,"b":2.5}}`

	tests := []struct {
		name     string
		current  string
		next     string
		wantErrs int
	}{
		{"same boolean type", boolP, boolP, 0},
		{"boolean to string", boolP, stringP, 1},
		{"int to float", intP, floatP, 1},
		{"unknown current is skipped", ``, stringP, 0},
		{"unknown next is skipped", boolP, ``, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			errs := ValidateFlagTypeUnchanged(
				json.RawMessage(tt.current),
				json.RawMessage(tt.next),
			)
			assert.Len(t, errs, tt.wantErrs)
			if tt.wantErrs > 0 {
				assert.Equal(t, "payload.variations", errs[0].Field)
			}
		})
	}
}

func TestFlagTagsFromPayload(t *testing.T) {
	tests := []struct {
		name    string
		payload string
		want    []string
	}{
		{"absent metadata", `{"variations":{"on":true,"off":false}}`, nil},
		{"absent tags", `{"metadata":{"owner":"me"}}`, nil},
		{"empty array", `{"metadata":{"tags":[]}}`, nil},
		{"non-array", `{"metadata":{"tags":"nope"}}`, nil},
		{"simple", `{"metadata":{"tags":["beta","prod"]}}`, []string{"beta", "prod"}},
		{"trim + drop empty + skip non-string", `{"metadata":{"tags":["  beta  ","",42,"prod"]}}`, []string{"beta", "prod"}},
		{"case-insensitive dedupe keeps first casing", `{"metadata":{"tags":["Prod","prod"," PROD "]}}`, []string{"Prod"}},
		{"empty payload", ``, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, FlagTagsFromPayload(json.RawMessage(tt.payload)))
		})
	}
}

func TestNormalizeFlagTags(t *testing.T) {
	// Rewrites metadata.tags to a canonical set while preserving key order and
	// leaving other metadata untouched.
	out, err := NormalizeFlagTags(json.RawMessage(
		`{"variations":{"on":true,"off":false},"metadata":{"owner":"me","tags":["Prod","prod","  beta  ",""],"description":"d"}}`))
	assert.NoError(t, err)
	// tags collapse to ["Prod","beta"], key order preserved (owner, tags, description).
	assert.JSONEq(t, `{"variations":{"on":true,"off":false},"metadata":{"owner":"me","tags":["Prod","beta"],"description":"d"}}`, string(out))
	// Order check: owner before tags before description.
	s := string(out)
	assert.Less(t, strings.Index(s, `"owner"`), strings.Index(s, `"tags"`))
	assert.Less(t, strings.Index(s, `"tags"`), strings.Index(s, `"description"`))

	// Empty result drops the tags key entirely.
	out, err = NormalizeFlagTags(json.RawMessage(`{"metadata":{"owner":"me","tags":["   ",""]}}`))
	assert.NoError(t, err)
	assert.NotContains(t, string(out), "tags")
	assert.Contains(t, string(out), "owner")

	// Absent tags / metadata / malformed payload are returned unchanged, no error.
	for _, p := range []string{`{"metadata":{"owner":"me"}}`, `{"variations":{}}`, `not json`, ``} {
		out, err := NormalizeFlagTags(json.RawMessage(p))
		assert.NoError(t, err)
		assert.Equal(t, p, string(out))
	}
}

func TestValidateFlagTags(t *testing.T) {
	mkTags := func(n int) string {
		parts := make([]string, n)
		for i := range parts {
			parts[i] = `"t` + strings.Repeat("x", 0) + string(rune('a'+i%26)) + `"`
		}
		return `{"metadata":{"tags":[` + strings.Join(parts, ",") + `]}}`
	}
	tests := []struct {
		name    string
		payload string
		wantErr bool
	}{
		{"no tags", `{"metadata":{"owner":"me"}}`, false},
		{"valid", `{"metadata":{"tags":["beta","prod"]}}`, false},
		// D4:A: a non-array legacy scalar `tags` is left untouched, not rejected,
		// so a flag carrying it stays editable.
		{"non-array legacy scalar ok", `{"metadata":{"tags":"x"}}`, false},
		{"empty tag after trim", `{"metadata":{"tags":["  "]}}`, true},
		{"comma in tag", `{"metadata":{"tags":["a,b"]}}`, true},
		{"too long", `{"metadata":{"tags":["` + strings.Repeat("x", 51) + `"]}}`, true},
		{"exactly 50 chars ok", `{"metadata":{"tags":["` + strings.Repeat("x", 50) + `"]}}`, false},
		{"too many", mkTags(51), true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			errs := ValidateFlagTags(json.RawMessage(tt.payload))
			assert.Equal(t, tt.wantErr, len(errs) > 0, "errors: %+v", errs)
		})
	}
}
