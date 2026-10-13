package model

import (
	"encoding/json"
	"time"
)

type Flagset struct {
	ID                string          `db:"id" json:"id"`
	TeamID            string          `db:"team_id" json:"teamId"`
	Name              string          `db:"name" json:"name"`
	Description       string          `db:"description" json:"description"`
	APIKeyCount       int             `json:"apiKeyCount"`
	FlagCount         int             `json:"flagCount"`
	EnabledFlagCount  int             `json:"enabledFlagCount"`
	PollingIntervalMs *int            `db:"polling_interval_ms" json:"pollingIntervalMs,omitempty"`
	FileFormat        *string         `db:"file_format" json:"fileFormat,omitempty"`
	Retrievers        json.RawMessage `db:"retrievers" json:"retrievers,omitempty" swaggertype:"object"`
	Exporters         json.RawMessage `db:"exporters" json:"exporters,omitempty" swaggertype:"object"`
	Notifiers         json.RawMessage `db:"notifiers" json:"notifiers,omitempty" swaggertype:"object"`
	// EvaluationContextEnrichment is a free-form object merged into every
	// evaluation context for flags in this flagset (enrichment value wins on
	// key collision).
	EvaluationContextEnrichment json.RawMessage `db:"evaluation_context_enrichment" json:"evaluationContextEnrichment,omitempty" swaggertype:"object"`
	// DefaultTestingEvaluationContext is the evaluation context proposed by
	// default in the UI's flag test/evaluate panel for flags in this flagset.
	DefaultTestingEvaluationContext json.RawMessage `db:"default_testing_evaluation_context" json:"defaultTestingEvaluationContext,omitempty" swaggertype:"object"`
	CreatedAt                       time.Time       `db:"created_at" json:"createdAt"`
	UpdatedAt                       time.Time       `db:"updated_at" json:"updatedAt"`
}

type CreateFlagsetRequest struct {
	Name                            string          `json:"name" validate:"required" example:"production"`
	Description                     string          `json:"description"`
	PollingIntervalMs               *int            `json:"pollingIntervalMs,omitempty"`
	FileFormat                      *string         `json:"fileFormat,omitempty"`
	Retrievers                      json.RawMessage `json:"retrievers,omitempty" swaggertype:"object"`
	Exporters                       json.RawMessage `json:"exporters,omitempty" swaggertype:"object"`
	Notifiers                       json.RawMessage `json:"notifiers,omitempty" swaggertype:"object"`
	EvaluationContextEnrichment     json.RawMessage `json:"evaluationContextEnrichment,omitempty" swaggertype:"object"`
	DefaultTestingEvaluationContext json.RawMessage `json:"defaultTestingEvaluationContext,omitempty" swaggertype:"object"`
}

type UpdateFlagsetRequest struct {
	Name                            *string         `json:"name,omitempty"`
	Description                     *string         `json:"description,omitempty"`
	PollingIntervalMs               *int            `json:"pollingIntervalMs,omitempty"`
	FileFormat                      *string         `json:"fileFormat,omitempty"`
	Retrievers                      json.RawMessage `json:"retrievers,omitempty" swaggertype:"object"`
	Exporters                       json.RawMessage `json:"exporters,omitempty" swaggertype:"object"`
	Notifiers                       json.RawMessage `json:"notifiers,omitempty" swaggertype:"object"`
	EvaluationContextEnrichment     json.RawMessage `json:"evaluationContextEnrichment,omitempty" swaggertype:"object"`
	DefaultTestingEvaluationContext json.RawMessage `json:"defaultTestingEvaluationContext,omitempty" swaggertype:"object"`
}

type FlagsetAPIKey struct {
	ID            string    `db:"id" json:"id"`
	FlagsetID     string    `db:"flagset_id" json:"flagsetId"`
	Label         string    `db:"label" json:"label"`
	APIKey        string    `db:"api_key" json:"apiKey"`
	CreatedBy     *string   `db:"created_by" json:"createdBy,omitempty"`
	CreatedByName string    `json:"createdByName,omitempty"`
	CreatedAt     time.Time `db:"created_at" json:"createdAt"`
}

type CreateAPIKeyRequest struct {
	Label string `json:"label"`
}
