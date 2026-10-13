package model

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"
	"time"

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
		{"multibyte counts characters", strings.Repeat("旗", 200), false},
		{"space", "my flag", true},
		{"whitespace only", "   ", true},
		{"tab", "my\tflag", true},
		{"newline", "my-flag\n", true},
		{"control character", "my\x00flag", true},
		{"accented letters ok", "drapeau-ç", false},
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
	stringVars := map[string]*any{"on": any3("a"), "off": any3("b")}
	defaultRule := &flag.Rule{VariationResult: new("on")}
	day := func(d int) *time.Time {
		t := time.Date(2030, time.January, d, 0, 0, 0, 0, time.UTC)
		return &t
	}
	progressive := func(initial, end *flag.ProgressiveRolloutStep) coredto.DTO {
		return coredto.DTO{
			Variations:  &twoVars,
			DefaultRule: &flag.Rule{ProgressiveRollout: &flag.ProgressiveRollout{Initial: initial, End: end}},
		}
	}
	scheduled := func(def *flag.Rule, steps ...flag.ScheduledStep) coredto.DTO {
		return coredto.DTO{Variations: &twoVars, DefaultRule: def, Scheduled: &steps}
	}
	step := func(date *time.Time, f flag.InternalFlag) flag.ScheduledStep {
		return flag.ScheduledStep{InternalFlag: f, Date: date}
	}
	longQuery := "b" + strings.Repeat(".b", maxQueryLen/2) + ` eq "x"`
	reduceQuery := `{"==":[{"reduce":[{"var":"arr"},{"cat":[{"var":"accumulator"},{"var":"current"}]},""]},"nomatch"]}`

	// field is the expected error field ("" means valid) and msg a substring of
	// its message, so each case pins the rule that fired.
	tests := []struct {
		name  string
		dto   coredto.DTO
		field string
		msg   string
	}{
		{
			name: "valid minimal",
			dto:  coredto.DTO{Variations: &twoVars, DefaultRule: defaultRule},
		},
		{
			name:  "missing variations",
			dto:   coredto.DTO{DefaultRule: defaultRule},
			field: "payload.variations", msg: "at least 2 variations",
		},
		{
			name:  "missing defaultRule",
			dto:   coredto.DTO{Variations: &twoVars},
			field: "payload.defaultRule", msg: "defaultRule is required",
		},
		{
			name: "rule without query",
			dto: coredto.DTO{
				Variations: &twoVars, DefaultRule: defaultRule,
				Rules: &[]flag.Rule{{VariationResult: new("on")}},
			},
			field: "payload.targeting[0].query", msg: "query is required",
		},
		{
			name: "disabled rule still needs a query",
			dto: coredto.DTO{
				Variations: &twoVars, DefaultRule: defaultRule,
				Rules: &[]flag.Rule{{Disable: new(true), VariationResult: new("on")}},
			},
			field: "payload.targeting[0].query", msg: "query is required",
		},
		{
			name: "defaultRule percentages summing to 100",
			dto: coredto.DTO{
				Variations:  &twoVars,
				DefaultRule: &flag.Rule{Percentages: &map[string]float64{"on": 50, "off": 50}},
			},
		},
		{
			name: "defaultRule percentages not summing to 100",
			dto: coredto.DTO{
				Variations:  &twoVars,
				DefaultRule: &flag.Rule{Percentages: &map[string]float64{"on": 50, "off": 30}},
			},
			field: "payload.defaultRule.percentage", msg: "must sum to 100, got 80.00",
		},
		{
			name: "defaultRule relative percentages rejected",
			dto: coredto.DTO{
				Variations:  &twoVars,
				DefaultRule: &flag.Rule{Percentages: &map[string]float64{"on": 1, "off": 1}},
			},
			field: "payload.defaultRule.percentage", msg: "must sum to 100, got 2.00",
		},
		{
			name: "defaultRule percentages all zero",
			dto: coredto.DTO{
				Variations:  &twoVars,
				DefaultRule: &flag.Rule{Percentages: &map[string]float64{"on": 0, "off": 0}},
			},
			field: "payload.defaultRule.percentage", msg: "must sum to 100, got 0.00",
		},
		{
			name: "defaultRule percentage out of range names the first share by name",
			dto: coredto.DTO{
				Variations:  &twoVars,
				DefaultRule: &flag.Rule{Percentages: &map[string]float64{"on": 150, "off": -50}},
			},
			field: "payload.defaultRule.percentage", msg: `percentage for "off" must be between 0 and 100`,
		},
		{
			name: "targeting rule percentages not summing to 100",
			dto: coredto.DTO{
				Variations: &twoVars, DefaultRule: defaultRule,
				Rules: &[]flag.Rule{
					{Query: new(`country eq "FR"`), Percentages: &map[string]float64{"on": 50, "off": 30}},
				},
			},
			field: "payload.targeting[0].percentage", msg: "must sum to 100",
		},
		{
			name: "defaultRule names a missing variation",
			dto: coredto.DTO{
				Variations:  &twoVars,
				DefaultRule: &flag.Rule{VariationResult: new("missing")},
			},
			field: "payload", msg: "invalid variation: missing does not exist",
		},
		{
			name: "targeting percentage names a missing variation",
			dto: coredto.DTO{
				Variations: &twoVars, DefaultRule: defaultRule,
				Rules: &[]flag.Rule{
					{Query: new(`country eq "FR"`), Percentages: &map[string]float64{"on": 50, "missing": 50}},
				},
			},
			field: "payload", msg: "variation missing does not exist",
		},
		{
			name: "variations of mixed types",
			dto: coredto.DTO{
				Variations:  &map[string]*any{"on": any3(true), "off": any3("off")},
				DefaultRule: defaultRule,
			},
			field: "payload", msg: "all variations should have the same type",
		},
		{
			name: "targeting rule with query is valid",
			dto:  withRules(twoVars, defaultRule, `country eq "FR"`),
		},
		{
			name:  "too many targeting rules",
			dto:   withRules(twoVars, defaultRule, slices.Repeat([]string{`country eq "FR"`}, maxTargetingRules+1)...),
			field: "payload.targeting", msg: "at most 100 targeting rules",
		},
		{
			name: "max targeting rules ok",
			dto:  withRules(twoVars, defaultRule, slices.Repeat([]string{`country eq "FR"`}, maxTargetingRules)...),
		},
		{
			name:  "query too long",
			dto:   withRules(twoVars, defaultRule, longQuery),
			field: "payload.targeting[0].query", msg: "query max 4096 characters",
		},
		{
			name: "query length counts characters, not bytes",
			dto:  withRules(twoVars, defaultRule, `plan eq "`+strings.Repeat("é", maxQueryLen-20)+`"`),
		},
		{
			name:  "jsonlogic reduce rejected",
			dto:   withRules(twoVars, defaultRule, reduceQuery),
			field: "payload.targeting[0].query", msg: "jsonlogic reduce is not allowed",
		},
		{
			name: "jsonlogic reduce string value allowed",
			dto:  withRules(twoVars, defaultRule, `{"==":[{"var":"plan"},"reduce"]}`),
		},
		{
			name: "nikunjy reduce word allowed",
			dto:  withRules(twoVars, defaultRule, `plan eq "reduce"`),
		},
		{
			name: "progressive rollout valid",
			dto: progressive(
				&flag.ProgressiveRolloutStep{Variation: new("off"), Percentage: new(0.0), Date: day(1)},
				&flag.ProgressiveRolloutStep{Variation: new("on"), Percentage: new(100.0), Date: day(2)},
			),
		},
		{
			name:  "progressive rollout without end",
			dto:   progressive(&flag.ProgressiveRolloutStep{Variation: new("off"), Date: day(1)}, nil),
			field: "payload.defaultRule.progressiveRollout", msg: "initial and end are required",
		},
		{
			name: "progressive rollout without dates",
			dto: progressive(
				&flag.ProgressiveRolloutStep{Variation: new("off")},
				&flag.ProgressiveRolloutStep{Variation: new("on")},
			),
			field: "payload.defaultRule.progressiveRollout.initial.date", msg: "date is required",
		},
		{
			name: "progressive rollout ending before it starts",
			dto: progressive(
				&flag.ProgressiveRolloutStep{Variation: new("off"), Date: day(2)},
				&flag.ProgressiveRolloutStep{Variation: new("on"), Date: day(1)},
			),
			field: "payload.defaultRule.progressiveRollout.end.date", msg: "end date must be after initial date",
		},
		{
			name: "progressive rollout percentage out of range",
			dto: progressive(
				&flag.ProgressiveRolloutStep{Variation: new("off"), Percentage: new(-50.0), Date: day(1)},
				&flag.ProgressiveRolloutStep{Variation: new("on"), Percentage: new(150.0), Date: day(2)},
			),
			field: "payload.defaultRule.progressiveRollout.initial.percentage", msg: "between 0 and 100",
		},
		{
			name: "experimentation valid",
			dto: coredto.DTO{
				Variations: &twoVars, DefaultRule: defaultRule,
				Experimentation: &coredto.ExperimentationDto{Start: day(1), End: day(2)},
			},
		},
		{
			name: "experimentation ending before it starts",
			dto: coredto.DTO{
				Variations: &twoVars, DefaultRule: defaultRule,
				Experimentation: &coredto.ExperimentationDto{Start: day(2), End: day(1)},
			},
			field: "payload.experimentation.end", msg: "end must be after start",
		},
		{
			name: "scheduled step valid",
			dto:  scheduled(defaultRule, step(day(1), flag.InternalFlag{DefaultRule: &flag.Rule{VariationResult: new("off")}})),
		},
		{
			name:  "scheduled step without date",
			dto:   scheduled(defaultRule, step(nil, flag.InternalFlag{DefaultRule: &flag.Rule{VariationResult: new("off")}})),
			field: "payload.scheduledRollout[0].date", msg: "date is required",
		},
		{
			name: "scheduled step query too long",
			dto: scheduled(defaultRule, step(day(1), flag.InternalFlag{
				Rules: &[]flag.Rule{{Query: new(longQuery), VariationResult: new("on")}},
			})),
			field: "payload.scheduledRollout[0].targeting[0].query", msg: "query max 4096 characters",
		},
		{
			name: "scheduled step jsonlogic reduce rejected",
			dto: scheduled(defaultRule, step(day(1), flag.InternalFlag{
				Rules: &[]flag.Rule{{Query: new(reduceQuery), VariationResult: new("on")}},
			})),
			field: "payload.scheduledRollout[0].targeting[0].query", msg: "jsonlogic reduce is not allowed",
		},
		{
			name: "scheduled step names a missing variation",
			dto: scheduled(defaultRule, step(day(1), flag.InternalFlag{
				Rules: &[]flag.Rule{{Query: new(`country eq "FR"`), VariationResult: new("zzz")}},
			})),
			field: "payload.scheduledRollout[0]", msg: "zzz does not exist",
		},
		{
			name: "scheduled step percentage out of range",
			dto: scheduled(defaultRule, step(day(1), flag.InternalFlag{
				DefaultRule: &flag.Rule{Percentages: &map[string]float64{"on": 500}},
			})),
			field: "payload.scheduledRollout[0].defaultRule.percentage", msg: "between 0 and 100",
		},
		{
			name: "scheduled step removes a share with a negative percentage",
			dto: scheduled(
				&flag.Rule{Percentages: &map[string]float64{"on": 50, "off": 50}},
				step(day(1), flag.InternalFlag{
					DefaultRule: &flag.Rule{Percentages: &map[string]float64{"on": 100, "off": -1}},
				}),
			),
		},
		{
			name: "scheduled step changes the flag type",
			dto: scheduled(defaultRule, step(day(1), flag.InternalFlag{
				Variations: &map[string]*any{"on": any3("yes"), "off": any3("no")},
			})),
			field: "payload.scheduledRollout[0].variations", msg: "from boolean to string",
		},
		{
			name: "scheduled step mixes variation types",
			dto: scheduled(defaultRule, step(day(1), flag.InternalFlag{
				Variations: &map[string]*any{"on": any3("yes")},
			})),
			field: "payload.scheduledRollout[0]", msg: "all variations should have the same type",
		},
		{
			name: "scheduled step disables the flag and starts an experimentation",
			dto: scheduled(defaultRule, step(day(1), flag.InternalFlag{
				Disable:         new(true),
				Experimentation: &flag.ExperimentationRollout{Start: day(3), End: day(4)},
			})),
		},
		{
			name: "scheduled step ends the experimentation before it starts",
			dto: coredto.DTO{
				Variations: &twoVars, DefaultRule: defaultRule,
				Experimentation: &coredto.ExperimentationDto{Start: day(5)},
				Scheduled: &[]flag.ScheduledStep{
					step(day(1), flag.InternalFlag{Experimentation: &flag.ExperimentationRollout{End: day(2)}}),
				},
			},
			field: "payload.scheduledRollout[0].experimentation.end", msg: "end must be after start",
		},
		{
			name: "scheduled step uses a variation added by an earlier step",
			dto: coredto.DTO{
				Variations: &stringVars, DefaultRule: defaultRule,
				Scheduled: &[]flag.ScheduledStep{
					step(day(1), flag.InternalFlag{Variations: &map[string]*any{"third": any3("c")}}),
					step(day(2), flag.InternalFlag{DefaultRule: &flag.Rule{VariationResult: new("third")}}),
				},
			},
		},
		{
			name: "scheduled step uses a variation added by a later step",
			dto: coredto.DTO{
				Variations: &stringVars, DefaultRule: defaultRule,
				Scheduled: &[]flag.ScheduledStep{
					step(day(2), flag.InternalFlag{Variations: &map[string]*any{"third": any3("c")}}),
					step(day(1), flag.InternalFlag{DefaultRule: &flag.Rule{VariationResult: new("third")}}),
				},
			},
			field: "payload.scheduledRollout[1]", msg: "third does not exist",
		},
		{
			name: "scheduled step adds a third boolean variation",
			dto: scheduled(defaultRule, step(day(1), flag.InternalFlag{
				Variations: &map[string]*any{"maybe": any3(true)},
			})),
			field: "payload.scheduledRollout[0].variations", msg: "a boolean flag has at most 2 variations",
		},
		{
			name: "boolean flag with 3 variations",
			dto: coredto.DTO{
				Variations:  &map[string]*any{"on": any3(true), "off": any3(false), "maybe": any3(true)},
				DefaultRule: defaultRule,
			},
			field: "payload.variations", msg: "a boolean flag has at most 2 variations",
		},
		{
			name: "string flag with 3 variations",
			dto: coredto.DTO{
				Variations:  &map[string]*any{"on": any3("a"), "off": any3("b"), "third": any3("c")},
				DefaultRule: defaultRule,
			},
		},
		{
			name:  "top-level disable rejected",
			dto:   coredto.DTO{Variations: &twoVars, DefaultRule: defaultRule, Disable: new(true)},
			field: "payload.disable", msg: "use the flag's disabled state",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			errs := ValidateFlagPayload(tt.dto)
			if tt.field == "" {
				assert.Empty(t, errs)
				return
			}
			assert.True(t, slices.ContainsFunc(errs, func(e ValidationError) bool {
				return e.Field == tt.field && strings.Contains(e.Message, tt.msg)
			}), "want %s: %q, got %+v", tt.field, tt.msg, errs)
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
		{"mixed float/int is float", `{"variations":{"a":2.5,"b":1}}`, "float"},
		{"mixed types are unknown", `{"variations":{"on":true,"off":"off"}}`, "unknown"},
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

	t.Run("progressive-rollout default with a missing step uses its default", func(t *testing.T) {
		_, _, _, prog := FlagSummaryFromPayload(json.RawMessage(
			`{"variations":{"a":"x","b":"y"},"defaultRule":{"progressiveRollout":{"initial":{"variation":"a","percentage":10}}}}`))
		assert.Equal(t, &ProgressiveSummary{InitialVariation: "a", From: 10, To: 100}, prog)
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

func TestParseFlagPayload(t *testing.T) {
	dto, err := ParseFlagPayload(json.RawMessage(`{"variations":{"on":true,"off":false},"defaultRule":{"variation":"on"}}`))
	assert.NoError(t, err)
	assert.Len(t, *dto.Variations, 2)
	assert.Equal(t, "on", *dto.DefaultRule.VariationResult)

	_, err = ParseFlagPayload(json.RawMessage(`not json`))
	assert.Error(t, err)

	_, err = ParseFlagPayload(json.RawMessage(`{"variations":{"on":true},"metadata":{"anything":{"goes":1}}}`))
	assert.NoError(t, err, "metadata keys are free-form")

	for name, payload := range map[string]string{
		"unknown top-level field":      `{"rules":[]}`,
		"unknown rule field":           `{"targeting":[{"query":"a eq 1","varation":"on"}]}`,
		"unknown default rule field":   `{"defaultRule":{"variaton":"on"}}`,
		"unknown scheduled step field": `{"scheduledRollout":[{"date":"2030-01-01T00:00:00Z","dfaultRule":{}}]}`,
		"trailing data":                `{"variations":{"on":true}}{}`,
	} {
		_, err := ParseFlagPayload(json.RawMessage(payload))
		assert.Error(t, err, name)
	}
}

func TestUsesJSONLogicReduceUnparseable(t *testing.T) {
	assert.False(t, usesJSONLogicReduce(`{"reduce":`))
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
		{"trailing comma", `{"a":1,}`},
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
	for _, p := range []string{
		`{"metadata":{"owner":"me"}}`, `{"variations":{}}`, `not json`, ``,
		`{"metadata":"x"}`, `{"metadata":{"tags":"x"}}`,
	} {
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
		{"empty payload", ``, false},
		{"no tags", `{"metadata":{"owner":"me"}}`, false},
		{"non-string tag", `{"metadata":{"tags":[1]}}`, true},
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
