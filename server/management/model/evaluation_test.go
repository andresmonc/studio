package model

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEvaluateFlag(t *testing.T) {
	boolPayload := `{
		"variations": {"on": true, "off": false},
		"defaultRule": {"variation": "off"},
		"targeting": [
			{"query": "email eq \"admin@example.com\"", "variation": "on"}
		]
	}`
	// typed builds a rule-less payload serving variation "b" (reason STATIC).
	typed := func(variations string) string {
		return `{"variations": ` + variations + `, "defaultRule": {"variation": "b"}}`
	}
	admin := map[string]any{"email": "admin@example.com"}

	tests := []struct {
		name          string
		payload       string
		enrichment    string
		disabled      bool
		targetingKey  string
		attributes    map[string]any
		wantErr       bool
		wantValue     any
		wantReason    string
		wantVariation string
		wantType      string
	}{
		{
			name:         "default rule when no targeting matches",
			payload:      boolPayload,
			targetingKey: "user-1",
			attributes:   map[string]any{"email": "someone@example.com"},
			wantValue:    false, wantReason: "DEFAULT", wantVariation: "off", wantType: "boolean",
		},
		{
			name:         "targeting rule matches custom attribute",
			payload:      boolPayload,
			targetingKey: "user-2",
			attributes:   admin,
			wantValue:    true, wantReason: "TARGETING_MATCH", wantVariation: "on", wantType: "boolean",
		},
		{
			// The email comes from the flagset enrichment, not the request.
			name:         "targeting matches via flagset enrichment",
			payload:      boolPayload,
			enrichment:   `{"email": "admin@example.com"}`,
			targetingKey: "user-3",
			wantValue:    true, wantReason: "TARGETING_MATCH", wantVariation: "on", wantType: "boolean",
		},
		{
			name:         "enrichment wins over a colliding request attribute",
			payload:      boolPayload,
			enrichment:   `{"email": "someone@example.com"}`,
			targetingKey: "user-4",
			attributes:   admin,
			wantValue:    false, wantReason: "DEFAULT", wantVariation: "off", wantType: "boolean",
		},
		{
			name:         "malformed enrichment is ignored",
			payload:      boolPayload,
			enrichment:   `not json`,
			targetingKey: "user-5",
			wantValue:    false, wantReason: "DEFAULT", wantVariation: "off", wantType: "boolean",
		},
		{
			name:         "disabled flag resolves to the SDK default",
			payload:      boolPayload,
			disabled:     true,
			targetingKey: "user-6",
			attributes:   admin,
			wantValue:    nil, wantReason: "DISABLED", wantVariation: "SdkDefault", wantType: "boolean",
		},
		{
			name:      "empty targetingKey still evaluates the default rule",
			payload:   boolPayload,
			wantValue: false, wantReason: "DEFAULT", wantVariation: "off", wantType: "boolean",
		},
		{
			name:         "int",
			payload:      typed(`{"a": 10, "b": 20}`),
			targetingKey: "user-7",
			wantValue:    20, wantReason: "STATIC", wantVariation: "b", wantType: "int",
		},
		{
			name:         "float is not truncated to int",
			payload:      typed(`{"a": 1.5, "b": 2.5}`),
			targetingKey: "user-7",
			wantValue:    2.5, wantReason: "STATIC", wantVariation: "b", wantType: "float",
		},
		{
			name:         "string",
			payload:      typed(`{"a": "blue", "b": "red"}`),
			targetingKey: "user-7",
			wantValue:    "red", wantReason: "STATIC", wantVariation: "b", wantType: "string",
		},
		{
			name:         "object",
			payload:      typed(`{"a": {"k": "v"}, "b": {"k": "w"}}`),
			targetingKey: "user-7",
			wantValue:    map[string]any{"k": "w"}, wantReason: "STATIC", wantVariation: "b", wantType: "json",
		},
		{
			name:         "array",
			payload:      typed(`{"a": [1, 2], "b": ["x", "y"]}`),
			targetingKey: "user-7",
			wantValue:    []any{"x", "y"}, wantReason: "STATIC", wantVariation: "b", wantType: "json",
		},
		{
			name:         "unparseable stored payload is a server error, not a validation error",
			payload:      `not-json`,
			targetingKey: "user-8",
			wantErr:      true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := &EvaluateFlagRequest{EvaluationContext: EvaluationContextInput{
				TargetingKey: tt.targetingKey,
				Attributes:   tt.attributes,
			}}
			var enrichment json.RawMessage
			if tt.enrichment != "" {
				enrichment = json.RawMessage(tt.enrichment)
			}
			res, err := EvaluateFlag("my-flag", json.RawMessage(tt.payload), enrichment, tt.disabled, req)
			if tt.wantErr {
				require.Error(t, err)
				var verrs ValidationErrors
				assert.NotErrorAs(t, err, &verrs)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.wantValue, res.Value)
			assert.Equal(t, tt.wantReason, res.Reason)
			assert.Equal(t, tt.wantVariation, res.VariationType)
			assert.Equal(t, tt.wantType, res.FlagType)
			assert.Empty(t, res.ErrorCode)
			assert.False(t, res.Failed)
		})
	}
}
