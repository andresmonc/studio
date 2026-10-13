package model

import (
	"encoding/json"
	"fmt"

	"github.com/thomaspoignant/go-feature-flag/modules/core/evaluation"
	"github.com/thomaspoignant/go-feature-flag/modules/core/ffcontext"
	"github.com/thomaspoignant/go-feature-flag/modules/core/flag"
)

// EvaluateFlagRequest is the body of POST /flags/:id/evaluate. It describes the
// evaluation context (the user/entity) the flag should be tested against.
type EvaluateFlagRequest struct {
	EvaluationContext EvaluationContextInput `json:"evaluationContext"`
}

// EvaluationContextInput is the subject of a flag evaluation: a mandatory
// targetingKey plus arbitrary custom attributes used by targeting rules.
type EvaluationContextInput struct {
	TargetingKey string         `json:"targetingKey"`
	Attributes   map[string]any `json:"attributes,omitempty"`
}

// EvaluationResult mirrors go-feature-flag's model.VariationResult, exposing the
// resolved value and the metadata explaining how it was resolved.
type EvaluationResult struct {
	Value         any            `json:"value"`
	VariationType string         `json:"variationType"`
	Reason        string         `json:"reason"`
	ErrorCode     string         `json:"errorCode,omitempty"`
	ErrorDetails  string         `json:"errorDetails,omitempty"`
	Failed        bool           `json:"failed"`
	TrackEvents   bool           `json:"trackEvents"`
	Version       string         `json:"version,omitempty"`
	Cacheable     bool           `json:"cacheable"`
	Metadata      map[string]any `json:"metadata,omitempty"`
	FlagType      string         `json:"flagType,omitempty"`
}

// EvaluateFlag runs the real go-feature-flag evaluation engine against a flag's
// stored payload and the supplied evaluation context, returning the resolved
// result. It is a pure function (no I/O): callers fetch the flag payload, its
// disabled state and the flagset enrichment, and pass them in.
//
// enrichment is the flagset's evaluationContextEnrichment (raw JSON object,
// possibly empty): it is merged into every evaluation context exactly as it is
// in production, so the test mirrors real behaviour.
//
// Evaluation problems (missing targeting key, type mismatch, …) are reported in
// the result's Reason/ErrorCode rather than as an error — that is what a test
// endpoint should surface. A non-nil error is returned only when the stored
// payload itself cannot be parsed: that is corrupt server data, not a caller
// mistake, so it is a plain error (500) rather than ValidationErrors (400).
func EvaluateFlag(
	flagName string, payload, enrichment json.RawMessage, disabled bool, req *EvaluateFlagRequest,
) (*EvaluationResult, error) {
	dto, err := ParseFlagPayload(payload)
	if err != nil {
		return nil, fmt.Errorf("parse stored flag payload: %w", err)
	}
	internalFlag := dto.Convert()
	// Mirror production: a flag disabled at the management layer resolves to the
	// SDK default with reason DISABLED, regardless of the payload's own disable.
	if disabled {
		d := true
		internalFlag.Disable = &d
	}

	builder := ffcontext.NewEvaluationContextBuilder(req.EvaluationContext.TargetingKey)
	for k, v := range req.EvaluationContext.Attributes {
		builder.AddCustom(k, v)
	}
	evalCtx := builder.Build()

	flagCtx := flag.Context{}
	if len(enrichment) > 0 {
		var m map[string]any
		if err := json.Unmarshal(enrichment, &m); err == nil {
			flagCtx.EvaluationContextEnrichment = m
		}
	}

	flagType := InferFlagType(payload)
	// any covers every flag value type (bool, string, number, object), so a
	// single generic call handles all flags and the type-mismatch error Evaluate
	// can return is impossible. The core only reads expectedType to coerce
	// float64->int when it is "int", which InferFlagType returns for integer flags.
	res, _ := evaluation.Evaluate[any](&internalFlag, flagName, evalCtx, flagCtx, flagType, nil)

	return &EvaluationResult{
		Value:         res.Value,
		VariationType: res.VariationType,
		Reason:        res.Reason,
		ErrorCode:     res.ErrorCode,
		ErrorDetails:  res.ErrorDetails,
		Failed:        res.Failed,
		TrackEvents:   res.TrackEvents,
		Version:       res.Version,
		Cacheable:     res.Cacheable,
		Metadata:      res.Metadata,
		FlagType:      flagType,
	}, nil
}
