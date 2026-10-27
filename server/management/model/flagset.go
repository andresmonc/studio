package model

import (
	"encoding/json"
	"time"
)

// Flagset groups flags served to relay proxies through its API keys. How a
// relay proxy retrieves, exports and notifies is configured in the relay proxy
// itself, not in Studio.
type Flagset struct {
	ID          string `db:"id" json:"id"`
	TeamID      string `db:"team_id" json:"teamId"`
	Name        string `db:"name" json:"name"`
	Description string `db:"description" json:"description"`
	// APIKeyCount, FlagCount and EnabledFlagCount are computed by the query;
	// their db tags name the SELECT aliases.
	APIKeyCount      int `db:"api_key_count" json:"apiKeyCount"`
	FlagCount        int `db:"flag_count" json:"flagCount"`
	EnabledFlagCount int `db:"enabled_flag_count" json:"enabledFlagCount"`
	// EvaluationContextEnrichment is a free-form object merged into every
	// evaluation context for flags in this flagset (enrichment value wins on
	// key collision).
	EvaluationContextEnrichment json.RawMessage `db:"evaluation_context_enrichment" json:"evaluationContextEnrichment,omitempty" swaggertype:"object"` //nolint:lll // struct tags cannot be wrapped
	// DefaultTestingEvaluationContext is the evaluation context proposed by
	// default in the UI's flag test/evaluate panel for flags in this flagset.
	DefaultTestingEvaluationContext json.RawMessage `db:"default_testing_evaluation_context" json:"defaultTestingEvaluationContext,omitempty" swaggertype:"object"` //nolint:lll // struct tags cannot be wrapped
	CreatedAt                       time.Time       `db:"created_at" json:"createdAt"`
	UpdatedAt                       time.Time       `db:"updated_at" json:"updatedAt"`
}

type CreateFlagsetRequest struct {
	Name                            string          `json:"name" validate:"required" example:"production"`
	Description                     string          `json:"description"`
	EvaluationContextEnrichment     json.RawMessage `json:"evaluationContextEnrichment,omitempty" swaggertype:"object"`
	DefaultTestingEvaluationContext json.RawMessage `json:"defaultTestingEvaluationContext,omitempty" swaggertype:"object"`
}

// UpdateFlagsetRequest is a partial update: absent fields are left unchanged,
// and null clears a JSON setting.
type UpdateFlagsetRequest struct {
	Name                            *string         `json:"name,omitempty"`
	Description                     *string         `json:"description,omitempty"`
	EvaluationContextEnrichment     json.RawMessage `json:"evaluationContextEnrichment,omitempty" swaggertype:"object"`
	DefaultTestingEvaluationContext json.RawMessage `json:"defaultTestingEvaluationContext,omitempty" swaggertype:"object"`
}

type FlagsetAPIKey struct {
	ID        string  `db:"id" json:"id"`
	FlagsetID string  `db:"flagset_id" json:"flagsetId"`
	Label     string  `db:"label" json:"label"`
	APIKey    string  `db:"api_key" json:"apiKey"`
	CreatedBy *string `db:"created_by" json:"createdBy,omitempty"`
	// CreatedByName is joined from users; nil once the creator is deleted.
	CreatedByName *string   `db:"created_by_name" json:"createdByName,omitempty"`
	CreatedAt     time.Time `db:"created_at" json:"createdAt"`
}

type CreateAPIKeyRequest struct {
	Label string `json:"label" validate:"required" example:"relay-proxy-prod"`
}

// RelayProxyFlagset is a live flagset with its API keys, as needed to write a
// relay proxy configuration.
type RelayProxyFlagset struct {
	ID       string   `db:"id" json:"id"`
	Name     string   `db:"name" json:"name"`
	TeamName string   `db:"team_name" json:"teamName"`
	APIKeys  []string `db:"api_keys" json:"apiKeys"`
}
