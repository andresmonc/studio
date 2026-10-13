package model

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEvaluateFlag(t *testing.T) {
	boolPayload := json.RawMessage(`{
		"variations": {"on": true, "off": false},
		"defaultRule": {"variation": "off"},
		"targeting": [
			{"query": "email eq \"admin@example.com\"", "variation": "on"}
		]
	}`)

	t.Run("default rule when no targeting matches", func(t *testing.T) {
		req := &EvaluateFlagRequest{
			EvaluationContext: EvaluationContextInput{
				TargetingKey: "user-1",
				Attributes:   map[string]any{"email": "someone@example.com"},
			},
		}
		res, err := EvaluateFlag("my-flag", boolPayload, nil, false, req)
		require.NoError(t, err)
		assert.Equal(t, false, res.Value)
		assert.Equal(t, "DEFAULT", res.Reason)
		assert.Empty(t, res.ErrorCode)
		assert.False(t, res.Failed)
		assert.Equal(t, "boolean", res.FlagType)
	})

	t.Run("targeting rule matches custom attribute", func(t *testing.T) {
		req := &EvaluateFlagRequest{
			EvaluationContext: EvaluationContextInput{
				TargetingKey: "user-2",
				Attributes:   map[string]any{"email": "admin@example.com"},
			},
		}
		res, err := EvaluateFlag("my-flag", boolPayload, nil, false, req)
		require.NoError(t, err)
		assert.Equal(t, true, res.Value)
		assert.Equal(t, "TARGETING_MATCH", res.Reason)
		assert.False(t, res.Failed)
	})

	t.Run("targeting matches via flagset enrichment", func(t *testing.T) {
		// The email is supplied by the flagset enrichment, not the request
		// context — proving enrichment is merged before evaluation.
		enrichment := json.RawMessage(`{"email": "admin@example.com"}`)
		req := &EvaluateFlagRequest{
			EvaluationContext: EvaluationContextInput{TargetingKey: "user-3"},
		}
		res, err := EvaluateFlag("my-flag", boolPayload, enrichment, false, req)
		require.NoError(t, err)
		assert.Equal(t, true, res.Value)
		assert.Equal(t, "TARGETING_MATCH", res.Reason)
	})

	t.Run("disabled flag resolves with reason DISABLED", func(t *testing.T) {
		req := &EvaluateFlagRequest{
			EvaluationContext: EvaluationContextInput{
				TargetingKey: "user-4",
				Attributes:   map[string]any{"email": "admin@example.com"},
			},
		}
		res, err := EvaluateFlag("my-flag", boolPayload, nil, true, req)
		require.NoError(t, err)
		assert.Equal(t, "DISABLED", res.Reason)
	})

	t.Run("integer flag returns an int value", func(t *testing.T) {
		intPayload := json.RawMessage(`{
			"variations": {"low": 10, "high": 20},
			"defaultRule": {"variation": "high"}
		}`)
		req := &EvaluateFlagRequest{
			EvaluationContext: EvaluationContextInput{TargetingKey: "user-5"},
		}
		res, err := EvaluateFlag("int-flag", intPayload, nil, false, req)
		require.NoError(t, err)
		assert.Equal(t, 20, res.Value)
		assert.Equal(t, "int", res.FlagType)
	})

	t.Run("empty targetingKey still evaluates the default rule", func(t *testing.T) {
		req := &EvaluateFlagRequest{
			EvaluationContext: EvaluationContextInput{TargetingKey: ""},
		}
		res, err := EvaluateFlag("my-flag", boolPayload, nil, false, req)
		require.NoError(t, err)
		assert.False(t, res.Failed)
		assert.Equal(t, false, res.Value)
	})

	t.Run("malformed enrichment is ignored, evaluation still succeeds", func(t *testing.T) {
		req := &EvaluateFlagRequest{
			EvaluationContext: EvaluationContextInput{TargetingKey: "user-7"},
		}
		res, err := EvaluateFlag("my-flag", boolPayload, json.RawMessage(`not json`), false, req)
		require.NoError(t, err)
		assert.False(t, res.Failed)
		assert.Equal(t, "DEFAULT", res.Reason)
		assert.Equal(t, false, res.Value)
	})

	t.Run("invalid payload returns a validation error", func(t *testing.T) {
		req := &EvaluateFlagRequest{
			EvaluationContext: EvaluationContextInput{TargetingKey: "user-6"},
		}
		_, err := EvaluateFlag("bad-flag", json.RawMessage(`not-json`), nil, false, req)
		var verrs ValidationErrors
		require.ErrorAs(t, err, &verrs)
	})
}

func TestCoreExpectedType(t *testing.T) {
	tests := []struct {
		inferred string
		want     string
	}{
		{"int", "int"},
		{"float", "float"},
		{"string", "string"},
		{"boolean", "bool"},
		{"json", "object"},
		{"unknown", "object"},
	}
	for _, tt := range tests {
		t.Run(tt.inferred, func(t *testing.T) {
			assert.Equal(t, tt.want, coreExpectedType(tt.inferred))
		})
	}
}
