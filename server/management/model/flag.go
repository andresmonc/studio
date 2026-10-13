package model

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"
	"unicode/utf8"

	coredto "github.com/thomaspoignant/go-feature-flag/modules/core/dto"
)

type Flag struct {
	ID               string          `db:"id" json:"id"`
	FlagsetID        string          `db:"flagset_id" json:"flagsetId"`
	Name             string          `db:"name" json:"name"`
	CurrentVersionID *string         `db:"current_version_id" json:"currentVersionId,omitempty"`
	CurrentVersion   *int            `json:"currentVersion,omitempty"`
	Disabled         bool            `db:"disabled" json:"disabled"`
	Payload          json.RawMessage `json:"payload,omitempty" swaggertype:"object"`
	CreatedAt        time.Time       `db:"created_at" json:"createdAt"`
	UpdatedAt        time.Time       `db:"updated_at" json:"updatedAt"`
}

type FlagListItem struct {
	ID             string    `db:"id" json:"id"`
	FlagsetID      string    `db:"flagset_id" json:"flagsetId"`
	Name           string    `db:"name" json:"name"`
	CurrentVersion *int      `db:"current_version" json:"currentVersion,omitempty"`
	Disabled       bool      `db:"disabled" json:"disabled"`
	UpdatedAt      time.Time `db:"updated_at" json:"updatedAt"`
}

// Payload is kept as raw JSON (not bound straight into coredto.DTO) so the exact
// bytes the client sent — including metadata key order — are preserved through to
// storage. Binding into the DTO's `map[string]any` would lose that order. The DTO
// is still used for validation via ParseFlagPayload.
type CreateFlagRequest struct {
	Name    string          `json:"name" validate:"required" example:"new-checkout"`
	Comment string          `json:"comment,omitempty" example:"initial rollout"`
	Payload json.RawMessage `json:"payload" swaggertype:"object" validate:"required"`
}

type UpdateFlagRequest struct {
	Comment string          `json:"comment,omitempty" example:"raise rollout to 50%"`
	Payload json.RawMessage `json:"payload" swaggertype:"object" validate:"required"`
}

// ParseFlagPayload unmarshals a raw flag payload into the go-feature-flag DTO so it
// can be validated. The raw bytes (not the re-marshaled DTO) are what gets stored,
// to preserve object key order.
func ParseFlagPayload(raw json.RawMessage) (coredto.DTO, error) {
	var dto coredto.DTO
	if err := json.Unmarshal(raw, &dto); err != nil {
		return dto, err
	}
	return dto, nil
}

type DisableFlagRequest struct {
	// Pointer so a missing field is rejected instead of silently enabling the flag.
	Disabled *bool `json:"disabled" validate:"required" example:"true"`
}

type FlagFilters struct {
	Name     *string
	Disabled *bool
	Page     int
	PageSize int
}

// TeamFlagFilters narrows the team-wide flags list. Tags use AND semantics;
// Unassigned selects flags whose current version has no author.
type TeamFlagFilters struct {
	Tags       []string
	Name       *string
	FlagsetID  *string
	Type       *string
	Owner      *string
	Unassigned bool
	Disabled   *bool
	Sort       string // a TeamFlagSorts key; empty means "updated"
	Desc       bool
	Page       int
	PageSize   int
}

// TeamFlagSorts lists the team flags list sort keys, each mapped to whether it
// defaults to descending order.
var TeamFlagSorts = map[string]bool{"updated": true, "name": false, "state": false}

// FlagInstance is a flag enriched with its flagset name, inferred type and
// current owner — used by the cross-flagset (team-wide) flags list.
type FlagInstance struct {
	ID             string    `json:"id"`
	FlagsetID      string    `json:"flagsetId"`
	FlagsetName    string    `json:"flagsetName"`
	Name           string    `json:"name"`
	Type           string    `json:"type"`
	Disabled       bool      `json:"disabled"`
	Owner          *string   `json:"owner,omitempty"`
	CurrentVersion *int      `json:"currentVersion,omitempty"`
	UpdatedAt      time.Time `json:"updatedAt"`
	// Variations are the flag's variation names in payload document order; the
	// webui colors the distribution bar by each name's index in this list.
	Variations []string `json:"variations,omitempty"`
	// Distribution is the default rule's served split (variation name → percent)
	// summarized for the list; a single served variation reads as {name: 100}.
	Distribution map[string]float64 `json:"distribution,omitempty"`
	// TargetingRuleCount is the number of targeting rules on the flag (0 means the
	// flag serves its default rule only).
	TargetingRuleCount int `json:"targetingRuleCount"`
	// Progressive is set only when the default rule is a progressive rollout; the
	// list renders it as a rocket + initial→end indicator instead of a bar.
	Progressive *ProgressiveSummary `json:"progressiveRollout,omitempty"`
	// Tags are the flag's user-authored labels (from payload.metadata.tags), used
	// by the webui to render tag chips and filter the list.
	Tags []string `json:"tags,omitempty"`
}

// ProgressiveSummary describes a default rule that ramps traffic over time
// between two variations; present only when the default rule is a progressive
// rollout. It carries just enough for the flags list to render a compact
// initial→end indicator (the ramp dates aren't needed there).
type ProgressiveSummary struct {
	InitialVariation string  `json:"initialVariation,omitempty"`
	EndVariation     string  `json:"endVariation,omitempty"`
	From             float64 `json:"from"`
	To               float64 `json:"to"`
}

// InferFlagType derives a flag's type from its version payload variations.
// Type is not stored explicitly: it is the JSON type of the variation values.
// Numbers are split into "int" and "float" (GOFF distinguishes the two): a
// numeric flag is "int" only when every variation value is integral.
func InferFlagType(payload json.RawMessage) string {
	if len(payload) == 0 {
		return "unknown"
	}
	var p struct {
		Variations map[string]json.RawMessage `json:"variations"`
	}
	if err := json.Unmarshal(payload, &p); err != nil || len(p.Variations) == 0 {
		return "unknown"
	}
	numeric, allInt := false, true
	for _, raw := range p.Variations {
		var v any
		if err := json.Unmarshal(raw, &v); err != nil {
			continue
		}
		switch x := v.(type) {
		case bool:
			return "boolean"
		case string:
			return "string"
		case float64:
			numeric = true
			if x != math.Trunc(x) {
				allInt = false
			}
		default:
			return "json"
		}
	}
	if numeric {
		if allInt {
			return "int"
		}
		return "float"
	}
	return "unknown"
}

// FlagSummaryFromPayload extracts, for the team-wide flags list, the ordered
// variation names (which drive the distribution colors in the webui), the
// default rule's served distribution (variation name → percent), and the number
// of targeting rules. It reads the same raw payload InferFlagType inspects and
// never errors: an empty or unparseable payload yields nil, nil, 0.
//
// Variation order follows the payload's JSON document order (via parseOrderedObject)
// so the webui assigns stable colors by index — a plain map decode would lose it.
// The distribution covers the two static default-rule shapes: a percentage split, or
// a single served variation (rendered as 100%). A progressive-rollout default has no
// static split, so distribution stays empty and its initial→end variations are
// returned as progressive instead (the webui renders that as a rocket indicator).
// A disabled or empty default yields neither.
func FlagSummaryFromPayload(payload json.RawMessage) (variations []string, distribution map[string]float64, ruleCount int, progressive *ProgressiveSummary) {
	if len(payload) == 0 {
		return nil, nil, 0, nil
	}
	var p struct {
		Variations  json.RawMessage   `json:"variations"`
		Targeting   []json.RawMessage `json:"targeting"`
		DefaultRule *struct {
			Variation          *string            `json:"variation"`
			Percentage         map[string]float64 `json:"percentage"`
			ProgressiveRollout *struct {
				Initial *struct {
					Variation  *string  `json:"variation"`
					Percentage *float64 `json:"percentage"`
				} `json:"initial"`
				End *struct {
					Variation  *string  `json:"variation"`
					Percentage *float64 `json:"percentage"`
				} `json:"end"`
			} `json:"progressiveRollout"`
		} `json:"defaultRule"`
	}
	if err := json.Unmarshal(payload, &p); err != nil {
		return nil, nil, 0, nil
	}
	ruleCount = len(p.Targeting)

	if len(p.Variations) > 0 {
		if obj, err := parseOrderedObject(p.Variations); err == nil {
			variations = obj.keys
		}
	}

	if p.DefaultRule != nil {
		switch {
		case len(p.DefaultRule.Percentage) > 0:
			dist := make(map[string]float64, len(p.DefaultRule.Percentage))
			for name, pct := range p.DefaultRule.Percentage {
				if pct > 0 {
					dist[name] = pct
				}
			}
			if len(dist) > 0 {
				distribution = dist
			}
		case p.DefaultRule.Variation != nil && *p.DefaultRule.Variation != "":
			distribution = map[string]float64{*p.DefaultRule.Variation: 100}
		case p.DefaultRule.ProgressiveRollout != nil:
			pr := p.DefaultRule.ProgressiveRollout
			// A progressive rollout ramps one variation's traffic between two
			// percentage anchors; default from=0/to=100 when a step omits its
			// percentage (mirrors the webui ruleOutcome defaults).
			s := &ProgressiveSummary{From: 0, To: 100}
			if pr.Initial != nil {
				if pr.Initial.Variation != nil {
					s.InitialVariation = *pr.Initial.Variation
				}
				if pr.Initial.Percentage != nil {
					s.From = *pr.Initial.Percentage
				}
			}
			if pr.End != nil {
				if pr.End.Variation != nil {
					s.EndVariation = *pr.End.Variation
				}
				if pr.End.Percentage != nil {
					s.To = *pr.End.Percentage
				}
			}
			progressive = s
		}
	}
	return variations, distribution, ruleCount, progressive
}

// FlagTagsFromPayload extracts the flag's tags from payload.metadata.tags. Only
// string entries are kept; each is trimmed and duplicates are dropped while
// preserving first-seen order. Returns nil when tags are absent, empty, or not a
// JSON array — it never errors, mirroring FlagSummaryFromPayload's tolerance of
// malformed input. It is the single source of truth for both the list projection
// and the rows written to the flag_tags mirror table.
func FlagTagsFromPayload(payload json.RawMessage) []string {
	if len(payload) == 0 {
		return nil
	}
	var p struct {
		Metadata *struct {
			Tags []json.RawMessage `json:"tags"`
		} `json:"metadata"`
	}
	if err := json.Unmarshal(payload, &p); err != nil || p.Metadata == nil {
		return nil
	}
	return dedupeTags(p.Metadata.Tags)
}

// dedupeTags trims each string entry, drops empties and non-strings, and
// de-duplicates case-insensitively while preserving first-seen casing and order.
// "Prod", "prod", and " prod " collapse to a single "Prod". Shared by the list
// projection, the flag_tags mirror, and NormalizeFlagTags so all three agree.
func dedupeTags(raw []json.RawMessage) []string {
	var out []string
	seen := map[string]struct{}{}
	for _, r := range raw {
		var s string
		if err := json.Unmarshal(r, &s); err != nil {
			continue // skip non-string entries
		}
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		key := strings.ToLower(s)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, s)
	}
	return out
}

// OpenFeatureFlagType maps a flag's inferred type to the vocabulary used by the
// OpenFeature CLI flag-manifest schema (boolean, string, integer, float, object).
// The internal "int" and "json" names become "integer" and "object"; the others
// pass through. It returns "" when the type cannot be determined, so callers can
// avoid writing an invalid value.
func OpenFeatureFlagType(payload json.RawMessage) string {
	switch InferFlagType(payload) {
	case "boolean":
		return "boolean"
	case "string":
		return "string"
	case "int":
		return "integer"
	case "float":
		return "float"
	case "json":
		return "object"
	default:
		return ""
	}
}

// FlagTypeMetadataKey is the metadata key under which the flag's OpenFeature type
// is published, so the exported configuration is directly consumable by the
// OpenFeature CLI without re-inferring the type from variations.
const FlagTypeMetadataKey = "flagType"

// SetFlagTypeMetadata returns the flag payload with metadata.flagType set to the
// flag's OpenFeature type (see OpenFeatureFlagType). The value is authoritative:
// any existing flagType is overwritten, since the type is derived from the
// variations and is immutable. When the type cannot be determined (empty or
// unparseable variations) the payload is returned unchanged so an invalid value
// is never written.
//
// Object key order is preserved end-to-end: flag payloads are stored as raw JSON
// precisely to keep user-authored metadata key order (see the init migration), so the
// injection rebuilds the document from an order-preserving representation rather
// than round-tripping through a map (which encoding/json sorts alphabetically).
func SetFlagTypeMetadata(payload json.RawMessage) (json.RawMessage, error) {
	ofType := OpenFeatureFlagType(payload)
	if ofType == "" {
		return payload, nil
	}
	root, err := parseOrderedObject(payload)
	if err != nil {
		return nil, err
	}
	meta := newOrderedObject()
	if raw, ok := root.get("metadata"); ok {
		// Only reuse the existing metadata when it is an object; a null or
		// malformed value is replaced with a fresh object.
		if parsed, perr := parseOrderedObject(raw); perr == nil {
			meta = parsed
		}
	}
	typeBytes, err := json.Marshal(ofType)
	if err != nil {
		return nil, err
	}
	meta.set(FlagTypeMetadataKey, typeBytes)
	metaBytes, err := json.Marshal(meta)
	if err != nil {
		return nil, err
	}
	root.set("metadata", metaBytes)
	return json.Marshal(root)
}

// NormalizeFlagTags rewrites payload.metadata.tags to a trimmed,
// case-insensitive-deduped array (first-seen casing preserved, empty entries
// dropped, the key removed entirely when nothing remains), so the STORED payload
// — not just the flag_tags mirror and list projection — carries a canonical tag
// set. It preserves object key order via the orderedObject path (like
// SetFlagTypeMetadata), and leaves a malformed/absent payload or non-array tags
// value untouched (validation handles rejection). Call it after
// SetFlagTypeMetadata so both metadata rewrites compose.
func NormalizeFlagTags(payload json.RawMessage) (json.RawMessage, error) {
	if len(payload) == 0 {
		return payload, nil
	}
	root, err := parseOrderedObject(payload)
	if err != nil {
		return payload, nil
	}
	metaRaw, ok := root.get("metadata")
	if !ok {
		return payload, nil
	}
	meta, err := parseOrderedObject(metaRaw)
	if err != nil {
		return payload, nil
	}
	tagsRaw, ok := meta.get("tags")
	if !ok {
		return payload, nil
	}
	var arr []json.RawMessage
	if err := json.Unmarshal(tagsRaw, &arr); err != nil {
		return payload, nil // not an array — leave for validation
	}
	norm := dedupeTags(arr)

	// Rebuild metadata, replacing "tags" in place (or dropping it when empty) so
	// the other metadata keys keep their authored order.
	newMeta := newOrderedObject()
	for _, k := range meta.keys {
		if k == "tags" {
			if len(norm) > 0 {
				b, err := json.Marshal(norm)
				if err != nil {
					return nil, err
				}
				newMeta.set("tags", b)
			}
			continue
		}
		v, _ := meta.get(k)
		newMeta.set(k, v)
	}
	metaBytes, err := json.Marshal(newMeta)
	if err != nil {
		return nil, err
	}
	root.set("metadata", metaBytes)
	return json.Marshal(root)
}

// ValidateFlagTags validates payload.metadata.tags straight from the raw payload
// (NOT coredto.DTO, which loses key order and isn't a reliable path to the raw
// tags). Rules: at most 50 tags, each non-empty after trim, at most 50 runes, and
// no commas (a comma would corrupt the webui's `?tags=` CSV filter param). An
// absent tags value is valid. A non-ARRAY tags value is left untouched (D4:A: a
// legacy scalar authored via the old metadata editor isn't this feature's tag
// list — the frontend preserves it verbatim and NormalizeFlagTags/
// FlagTagsFromPayload ignore it, so we must not block the flag's edit either).
func ValidateFlagTags(payload json.RawMessage) ValidationErrors {
	if len(payload) == 0 {
		return nil
	}
	var p struct {
		Metadata *struct {
			Tags *json.RawMessage `json:"tags"`
		} `json:"metadata"`
	}
	if err := json.Unmarshal(payload, &p); err != nil || p.Metadata == nil || p.Metadata.Tags == nil {
		return nil
	}
	var arr []json.RawMessage
	if err := json.Unmarshal(*p.Metadata.Tags, &arr); err != nil {
		return nil // non-array legacy scalar — leave it alone (D4:A)
	}
	var errs ValidationErrors
	if len(arr) > 50 {
		errs = append(errs, ValidationError{Field: "payload.metadata.tags", Message: "at most 50 tags per flag"})
	}
	for _, raw := range arr {
		var s string
		if err := json.Unmarshal(raw, &s); err != nil {
			errs = append(errs, ValidationError{Field: "payload.metadata.tags", Message: "each tag must be a string"})
			continue
		}
		t := strings.TrimSpace(s)
		if t == "" {
			errs = append(errs, ValidationError{Field: "payload.metadata.tags", Message: "tags must not be empty"})
		}
		if utf8.RuneCountInString(t) > 50 {
			errs = append(errs, ValidationError{Field: "payload.metadata.tags", Message: "each tag must be at most 50 characters"})
		}
		if strings.ContainsRune(t, ',') {
			errs = append(errs, ValidationError{Field: "payload.metadata.tags", Message: "tags must not contain commas"})
		}
	}
	return errs
}

// orderedObject is a JSON object that preserves key insertion order across a
// decode/encode round-trip. Values are kept as raw bytes so nested content
// (variations, rules, other metadata keys) is spliced back untouched.
type orderedObject struct {
	keys   []string
	values map[string]json.RawMessage
}

func newOrderedObject() *orderedObject {
	return &orderedObject{values: map[string]json.RawMessage{}}
}

func parseOrderedObject(data []byte) (*orderedObject, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	if d, ok := tok.(json.Delim); !ok || d != '{' {
		return nil, fmt.Errorf("expected JSON object")
	}
	obj := newOrderedObject()
	for dec.More() {
		keyTok, err := dec.Token()
		if err != nil {
			return nil, err
		}
		key, ok := keyTok.(string)
		if !ok {
			return nil, fmt.Errorf("expected string object key")
		}
		var raw json.RawMessage
		if err := dec.Decode(&raw); err != nil {
			return nil, err
		}
		obj.set(key, raw)
	}
	if _, err := dec.Token(); err != nil { // closing '}'
		return nil, err
	}
	return obj, nil
}

func (o *orderedObject) get(key string) (json.RawMessage, bool) {
	v, ok := o.values[key]
	return v, ok
}

func (o *orderedObject) set(key string, value json.RawMessage) {
	if _, exists := o.values[key]; !exists {
		o.keys = append(o.keys, key)
	}
	o.values[key] = value
}

func (o *orderedObject) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteByte('{')
	for i, k := range o.keys {
		if i > 0 {
			buf.WriteByte(',')
		}
		keyBytes, err := json.Marshal(k)
		if err != nil {
			return nil, err
		}
		buf.Write(keyBytes)
		buf.WriteByte(':')
		buf.Write(o.values[k])
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

func ValidateFlagName(name string) ValidationErrors {
	var errs ValidationErrors
	if name == "" {
		errs = append(errs, ValidationError{Field: "name", Message: "flag name is required"})
	}
	if len(name) > 200 {
		errs = append(errs, ValidationError{Field: "name", Message: "flag name max 200 chars"})
	}
	return errs
}

func ValidateFlagPayload(p coredto.DTO) ValidationErrors {
	var errs ValidationErrors
	if p.Variations == nil || len(*p.Variations) < 2 {
		errs = append(errs, ValidationError{Field: "payload.variations", Message: "at least 2 variations are required"})
	}
	if p.DefaultRule == nil {
		errs = append(errs, ValidationError{Field: "payload.defaultRule", Message: "defaultRule is required"})
	} else {
		if p.DefaultRule.Percentages != nil {
			var sum float64
			for _, v := range *p.DefaultRule.Percentages {
				sum += v
			}
			if sum > 0 && (sum < 99.999 || sum > 100.001) {
				errs = append(errs, ValidationError{Field: "payload.defaultRule.percentage", Message: fmt.Sprintf("percentages must sum to 100, got %.2f", sum)})
			}
		}
	}
	if p.Rules != nil {
		for i, r := range *p.Rules {
			if r.Query == nil || *r.Query == "" {
				errs = append(errs, ValidationError{Field: fmt.Sprintf("payload.targeting[%d].query", i), Message: "query is required for targeting rules"})
			}
		}
	}
	return errs
}

// ValidateFlagTypeUnchanged fails if the new payload's inferred type differs from
// the current one. A flag's type is immutable after creation. The check is
// skipped when either side is "unknown" (empty or unparseable payload) so it
// never blocks on missing data.
func ValidateFlagTypeUnchanged(current, next json.RawMessage) ValidationErrors {
	cur := InferFlagType(current)
	nxt := InferFlagType(next)
	if cur != "unknown" && nxt != "unknown" && cur != nxt {
		return ValidationErrors{{
			Field:   "payload.variations",
			Message: fmt.Sprintf("flag type is immutable: cannot change from %s to %s", cur, nxt),
		}}
	}
	return nil
}
