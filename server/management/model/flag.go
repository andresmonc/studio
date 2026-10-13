package model

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"maps"
	"math"
	"slices"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	coredto "github.com/thomaspoignant/go-feature-flag/modules/core/dto"
	"github.com/thomaspoignant/go-feature-flag/modules/core/flag"
)

type Flag struct {
	ID               string  `db:"id" json:"id"`
	FlagsetID        string  `db:"flagset_id" json:"flagsetId"`
	Name             string  `db:"name" json:"name"`
	CurrentVersionID *string `db:"current_version_id" json:"currentVersionId,omitempty"`
	CurrentVersion   *int    `db:"current_version" json:"currentVersion,omitempty"`
	// Disabled is the source of truth for the flag's on/off state; payloads may
	// not set a top-level disable (see ValidateFlagPayload).
	Disabled  bool            `db:"disabled" json:"disabled"`
	Payload   json.RawMessage `db:"payload" json:"payload,omitempty" swaggertype:"object"`
	CreatedAt time.Time       `db:"created_at" json:"createdAt"`
	UpdatedAt time.Time       `db:"updated_at" json:"updatedAt"`
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
// to preserve object key order. Unknown fields are rejected at every level, so a
// typo in a field name fails instead of being silently dropped; metadata and
// variation values are free-form.
func ParseFlagPayload(raw json.RawMessage) (coredto.DTO, error) {
	var dto coredto.DTO
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&dto); err != nil {
		return dto, err
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		return dto, errors.New("unexpected data after the flag payload")
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

// Flag types returned by InferFlagType.
const (
	flagTypeUnknown = "unknown"
	flagTypeBoolean = "boolean"
	flagTypeString  = "string"
	flagTypeInt     = "int"
	flagTypeFloat   = "float"
	flagTypeJSON    = "json"
)

// InferFlagType derives a flag's type from its version payload variations.
// Type is not stored explicitly: it is the JSON type of the variation values.
// Numbers are split into "int" and "float" (GOFF distinguishes the two): a
// numeric flag is "int" only when every variation value is integral. Variations
// of mixed types (which ValidateFlagPayload rejects) yield "unknown", so the
// result never depends on map iteration order.
func InferFlagType(payload json.RawMessage) string {
	if len(payload) == 0 {
		return flagTypeUnknown
	}
	var p struct {
		Variations map[string]*any `json:"variations"`
	}
	if err := json.Unmarshal(payload, &p); err != nil {
		return flagTypeUnknown
	}
	return variationsType(p.Variations)
}

// variationsType is InferFlagType over decoded variation values.
func variationsType(variations map[string]*any) string {
	if len(variations) == 0 {
		return flagTypeUnknown
	}
	typ := ""
	for _, p := range variations {
		var v any
		if p != nil {
			v = *p
		}
		t := flagTypeJSON
		switch x := v.(type) {
		case bool:
			t = flagTypeBoolean
		case string:
			t = flagTypeString
		case float64:
			t = flagTypeInt
			if x != math.Trunc(x) {
				t = flagTypeFloat
			}
		}
		switch {
		case typ == "" || typ == t:
			typ = t
		case isNumberType(typ) && isNumberType(t):
			typ = flagTypeFloat // int and float variations mix into float
		default:
			return flagTypeUnknown
		}
	}
	return typ
}

func isNumberType(t string) bool {
	return t == flagTypeInt || t == flagTypeFloat
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
func FlagSummaryFromPayload(payload json.RawMessage) (
	variations []string, distribution map[string]float64, ruleCount int, progressive *ProgressiveSummary,
) {
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
				Initial *progressiveStep `json:"initial"`
				End     *progressiveStep `json:"end"`
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
			s.InitialVariation, s.From = pr.Initial.resolve(s.From)
			s.EndVariation, s.To = pr.End.resolve(s.To)
			progressive = s
		}
	}
	return variations, distribution, ruleCount, progressive
}

// progressiveStep is one anchor (initial or end) of a progressive rollout.
type progressiveStep struct {
	Variation  *string  `json:"variation"`
	Percentage *float64 `json:"percentage"`
}

// resolve returns the step's variation name and percentage, falling back to
// defaultPct when the step or its percentage is absent.
func (s *progressiveStep) resolve(defaultPct float64) (variation string, pct float64) {
	pct = defaultPct
	if s == nil {
		return "", pct
	}
	if s.Variation != nil {
		variation = *s.Variation
	}
	if s.Percentage != nil {
		pct = *s.Percentage
	}
	return variation, pct
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
	case flagTypeBoolean:
		return flagTypeBoolean
	case flagTypeString:
		return flagTypeString
	case flagTypeInt:
		return "integer"
	case flagTypeFloat:
		return flagTypeFloat
	case flagTypeJSON:
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
	typeBytes, _ := json.Marshal(ofType) // marshaling a string cannot fail
	meta.set(FlagTypeMetadataKey, typeBytes)
	root.set("metadata", meta.encode())
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
		return payload, nil //nolint:nilerr // malformed payload is left for validation
	}
	metaRaw, ok := root.get("metadata")
	if !ok {
		return payload, nil
	}
	meta, err := parseOrderedObject(metaRaw)
	if err != nil {
		return payload, nil //nolint:nilerr // non-object metadata is left for validation
	}
	tagsRaw, ok := meta.get("tags")
	if !ok {
		return payload, nil
	}
	var arr []json.RawMessage
	if err := json.Unmarshal(tagsRaw, &arr); err != nil {
		return payload, nil //nolint:nilerr // not an array — leave for validation
	}
	norm := dedupeTags(arr)

	// Rebuild metadata, replacing "tags" in place (or dropping it when empty) so
	// the other metadata keys keep their authored order.
	newMeta := newOrderedObject()
	for _, k := range meta.keys {
		if k == "tags" {
			if len(norm) > 0 {
				b, _ := json.Marshal(norm) // marshaling a []string cannot fail
				newMeta.set("tags", b)
			}
			continue
		}
		v, _ := meta.get(k)
		newMeta.set(k, v)
	}
	root.set("metadata", newMeta.encode())
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
		return nil //nolint:nilerr // malformed payload is rejected by ParseFlagPayload
	}
	var arr []json.RawMessage
	if err := json.Unmarshal(*p.Metadata.Tags, &arr); err != nil {
		return nil //nolint:nilerr // non-array legacy scalar — leave it alone (D4:A)
	}
	const field = "payload.metadata.tags"
	var errs ValidationErrors
	if len(arr) > 50 {
		errs = append(errs, ValidationError{Field: field, Message: "at most 50 tags per flag"})
	}
	for _, raw := range arr {
		var s string
		if err := json.Unmarshal(raw, &s); err != nil {
			errs = append(errs, ValidationError{Field: field, Message: "each tag must be a string"})
			continue
		}
		t := strings.TrimSpace(s)
		if t == "" {
			errs = append(errs, ValidationError{Field: field, Message: "tags must not be empty"})
		}
		if utf8.RuneCountInString(t) > 50 {
			errs = append(errs, ValidationError{Field: field, Message: "each tag must be at most 50 characters"})
		}
		if strings.ContainsRune(t, ',') {
			errs = append(errs, ValidationError{Field: field, Message: "tags must not contain commas"})
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
		key, _ := keyTok.(string) // the decoder only yields strings in key position
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
	return o.encode(), nil
}

// encode writes the object with its keys in insertion order. Values are spliced
// in verbatim; json.Marshal on the enclosing document compacts and validates them.
func (o *orderedObject) encode() json.RawMessage {
	var buf bytes.Buffer
	buf.WriteByte('{')
	for i, k := range o.keys {
		if i > 0 {
			buf.WriteByte(',')
		}
		keyBytes, _ := json.Marshal(k) // marshaling a string cannot fail
		buf.Write(keyBytes)
		buf.WriteByte(':')
		buf.Write(o.values[k])
	}
	buf.WriteByte('}')
	return buf.Bytes()
}

func ValidateFlagName(name string) ValidationErrors {
	const field = "name"
	var errs ValidationErrors
	if name == "" {
		errs = append(errs, ValidationError{Field: field, Message: "flag name is required"})
	}
	if utf8.RuneCountInString(name) > 200 {
		errs = append(errs, ValidationError{Field: field, Message: "flag name max 200 characters"})
	}
	if strings.IndexFunc(name, func(r rune) bool { return unicode.IsSpace(r) || unicode.IsControl(r) }) >= 0 {
		errs = append(errs, ValidationError{
			Field:   field,
			Message: "flag name must not contain whitespace or control characters",
		})
	}
	return errs
}

// ValidateFlagPayload checks a flag payload with GOFF's own validation
// (InternalFlag.IsValid) plus studio rules that are deliberately stricter:
//   - A percentage split needs every share within [0, 100] and a total of 100.
//     GOFF buckets relative to the total, so it also accepts {"a": 1, "b": 1} as
//     a 50/50 split; the studio requires the explicit form so a split always
//     reads as the traffic it serves.
//   - A targeting rule needs a query even when disabled. GOFF skips disabled
//     rules, but enabling one must not turn the flag invalid.
//   - A progressive rollout needs an initial and an end step, both dated, the end
//     after the initial, with percentages within [0, 100]. GOFF accepts the rest
//     and then fails every evaluation.
//   - An experimentation must end after it starts.
//   - A boolean flag has at most 2 variations.
//   - A top-level disable is rejected: Flag.Disabled is the source of truth and
//     the export writes disable from it. Scheduled steps may still set disable.
//   - Every scheduledRollout step needs a date, and the flag as GOFF evaluates it
//     once the step applies must pass all of the above and keep the flag's type.
//
// The rule-count and query-size bounds apply to the authored rules and to every
// scheduled step.
func ValidateFlagPayload(p coredto.DTO) ValidationErrors {
	authored := cloneFlag(p.Convert())
	errs := validateFlag("payload", authored)
	if p.Disable != nil {
		errs = append(errs, ValidationError{
			Field:   "payload.disable",
			Message: "disable is not allowed in the payload; use the flag's disabled state",
		})
	}
	if len(errs) > 0 || authored.Scheduled == nil {
		return errs
	}
	flagType := variationsType(authored.GetVariations())
	for i, step := range *authored.Scheduled {
		prefix := fmt.Sprintf("payload.scheduledRollout[%d]", i)
		if step.Date == nil {
			errs = append(errs, ValidationError{Field: prefix + ".date", Message: "date is required"})
			continue
		}
		// Bound the step's own rules first: GOFF's merge can drop them from the
		// evaluated flag, but they are still parsed and stored.
		stepErrs := validateTargetingCost(prefix, step.GetRules())
		if len(stepErrs) == 0 {
			at := flagAt(authored, *step.Date)
			stepErrs = validateFlag(prefix, at)
			if t := variationsType(at.GetVariations()); len(stepErrs) == 0 && t != flagType {
				stepErrs = ValidationErrors{{
					Field:   prefix + ".variations",
					Message: fmt.Sprintf("flag type is immutable: step changes it from %s to %s", flagType, t),
				}}
			}
		}
		errs = append(errs, stepErrs...)
	}
	return errs
}

// validateFlag checks one evaluable state of a flag: as authored, or as it
// stands once a scheduled step applies. Field names are rooted at prefix.
func validateFlag(prefix string, f flag.InternalFlag) ValidationErrors {
	var errs ValidationErrors
	if n := len(f.GetVariations()); n < 2 {
		errs = append(errs, ValidationError{Field: prefix + ".variations", Message: "at least 2 variations are required"})
	} else if n > 2 && variationsType(f.GetVariations()) == flagTypeBoolean {
		errs = append(errs, ValidationError{
			Field:   prefix + ".variations",
			Message: "a boolean flag has at most 2 variations",
		})
	}
	if f.DefaultRule == nil {
		errs = append(errs, ValidationError{Field: prefix + ".defaultRule", Message: "defaultRule is required"})
	} else {
		errs = append(errs, validateRuleOutcome(prefix+".defaultRule", *f.DefaultRule)...)
	}
	errs = append(errs, validateTargetingCost(prefix, f.GetRules())...)
	for i, r := range f.GetRules() {
		field := fmt.Sprintf("%s.targeting[%d]", prefix, i)
		if r.GetQuery() == "" {
			errs = append(errs, ValidationError{Field: field + ".query", Message: "query is required for targeting rules"})
		}
		errs = append(errs, validateRuleOutcome(field, r)...)
	}
	if x := f.Experimentation; x != nil && x.Start != nil && x.End != nil && !x.End.After(*x.Start) {
		errs = append(errs, ValidationError{Field: prefix + ".experimentation.end", Message: "end must be after start"})
	}
	// GOFF's own validation catches what the relay proxy would reject: mixed
	// variation types, rule outcomes naming a missing variation, and invalid
	// queries. It runs last so the cost bounds above hold before queries are parsed.
	if len(errs) == 0 {
		if err := f.IsValid(); err != nil {
			errs = append(errs, ValidationError{Field: prefix, Message: err.Error()})
		}
	}
	return errs
}

// validateTargetingCost enforces the rule-count and query-size bounds.
func validateTargetingCost(prefix string, rules []flag.Rule) ValidationErrors {
	var errs ValidationErrors
	if len(rules) > maxTargetingRules {
		errs = append(errs, ValidationError{
			Field:   prefix + ".targeting",
			Message: fmt.Sprintf("at most %d targeting rules", maxTargetingRules),
		})
	}
	for i, r := range rules {
		field := fmt.Sprintf("%s.targeting[%d].query", prefix, i)
		switch q := r.GetQuery(); {
		case utf8.RuneCountInString(q) > maxQueryLen:
			errs = append(errs, ValidationError{Field: field, Message: fmt.Sprintf("query max %d characters", maxQueryLen)})
		case r.GetQueryFormat() == flag.JSONLogicQueryFormat && usesJSONLogicReduce(q):
			errs = append(errs, ValidationError{Field: field, Message: "jsonlogic reduce is not allowed"})
		}
	}
	return errs
}

// validateRuleOutcome checks a rule's percentage split and progressive rollout.
func validateRuleOutcome(field string, r flag.Rule) ValidationErrors {
	var errs ValidationErrors
	if r.Percentages != nil {
		errs = append(errs, validatePercentages(field+".percentage", *r.Percentages)...)
	}
	if r.ProgressiveRollout != nil {
		errs = append(errs, validateProgressiveRollout(field+".progressiveRollout", *r.ProgressiveRollout)...)
	}
	return errs
}

// validatePercentages checks a traffic split: every share within [0, 100] and
// a total of 100 (stricter than GOFF, see ValidateFlagPayload).
func validatePercentages(field string, pcts map[string]float64) ValidationErrors {
	var sum float64
	for _, name := range slices.Sorted(maps.Keys(pcts)) {
		v := pcts[name]
		if v < 0 || v > 100 {
			return ValidationErrors{{Field: field, Message: fmt.Sprintf("percentage for %q must be between 0 and 100", name)}}
		}
		sum += v
	}
	if sum < 99.999 || sum > 100.001 {
		return ValidationErrors{{Field: field, Message: fmt.Sprintf("percentages must sum to 100, got %.2f", sum)}}
	}
	return nil
}

// validateProgressiveRollout requires both steps, dated, the end after the
// initial, and percentages within [0, 100]. Variation names and the initial ≤ end
// percentage order are left to GOFF's IsValid.
func validateProgressiveRollout(field string, pr flag.ProgressiveRollout) ValidationErrors {
	if pr.Initial == nil || pr.End == nil {
		return ValidationErrors{{Field: field, Message: "initial and end are required"}}
	}
	var errs ValidationErrors
	for _, s := range []struct {
		name string
		step *flag.ProgressiveRolloutStep
	}{{"initial", pr.Initial}, {"end", pr.End}} {
		if s.step.Date == nil {
			errs = append(errs, ValidationError{Field: field + "." + s.name + ".date", Message: "date is required"})
		}
		if p := s.step.Percentage; p != nil && (*p < 0 || *p > 100) {
			errs = append(errs, ValidationError{
				Field:   field + "." + s.name + ".percentage",
				Message: "percentage must be between 0 and 100",
			})
		}
	}
	if pr.Initial.Date != nil && pr.End.Date != nil && !pr.End.Date.After(*pr.Initial.Date) {
		errs = append(errs, ValidationError{Field: field + ".end.date", Message: "end date must be after initial date"})
	}
	return errs
}

// flagAt returns the flag as GOFF evaluates it at date: every scheduled step
// dated at or before date merged in, in order. It mirrors core v0.7.1's
// unexported InternalFlag.applyScheduledRolloutSteps, including merging each
// step's targeting into the authored rules rather than the previous step's
// result. Keep it in sync when bumping the core module.
func flagAt(f flag.InternalFlag, date time.Time) flag.InternalFlag {
	at := cloneFlag(f)
	for _, step := range *f.Scheduled {
		if step.Date == nil || step.Date.After(date) {
			continue
		}
		// Merge into a fresh copy: MergeSetOfRules mutates the rules it is given.
		authored := cloneFlag(f)
		at.Rules = flag.MergeSetOfRules(authored.GetRules(), step.GetRules())
		if step.Disable != nil {
			at.Disable = step.Disable
		}
		if step.DefaultRule != nil {
			at.DefaultRule.MergeRules(*step.DefaultRule)
		}
		maps.Copy(at.GetVariations(), step.GetVariations())
		if x := step.Experimentation; x != nil {
			if at.Experimentation == nil {
				at.Experimentation = &flag.ExperimentationRollout{}
			}
			if x.Start != nil {
				at.Experimentation.Start = x.Start
			}
			if x.End != nil {
				at.Experimentation.End = x.End
			}
		}
	}
	return at
}

// cloneFlag deep-copies a flag through JSON, as GOFF does before applying
// scheduled steps, so merging never mutates the caller's maps.
func cloneFlag(f flag.InternalFlag) flag.InternalFlag {
	var c flag.InternalFlag
	b, _ := json.Marshal(f) // a flag decoded from JSON always re-encodes
	_ = json.Unmarshal(b, &c)
	return c
}

// Bounds on targeting-rule evaluation cost (security audit finding #3). Rules
// run on every evaluation, here and in the relay proxy. The length cap also
// bounds nikunjy nesting depth, whose first parse is O(depth^2); reduce is the
// one JSONLogic operator that goes quadratic over a caller-supplied array.
const maxTargetingRules, maxQueryLen = 100, 4096

// usesJSONLogicReduce reports whether a JSONLogic query uses the reduce
// operator anywhere. It walks the parsed JSON so a "reduce" string value is not
// a false positive; unparseable queries return false (validity is not checked here).
func usesJSONLogicReduce(query string) bool {
	var v any
	if json.Unmarshal([]byte(query), &v) != nil {
		return false
	}
	var walk func(any) bool
	walk = func(n any) bool {
		switch n := n.(type) {
		case map[string]any:
			for k, c := range n {
				if k == "reduce" || walk(c) {
					return true
				}
			}
		case []any:
			for _, c := range n {
				if walk(c) {
					return true
				}
			}
		}
		return false
	}
	return walk(v)
}

// ValidateFlagTypeUnchanged fails if the new payload's inferred type differs from
// the current one. A flag's type is immutable after creation. The check is
// skipped when either side is "unknown" (empty or unparseable payload) so it
// never blocks on missing data.
func ValidateFlagTypeUnchanged(current, next json.RawMessage) ValidationErrors {
	cur := InferFlagType(current)
	nxt := InferFlagType(next)
	if cur != flagTypeUnknown && nxt != flagTypeUnknown && cur != nxt {
		return ValidationErrors{{
			Field:   "payload.variations",
			Message: fmt.Sprintf("flag type is immutable: cannot change from %s to %s", cur, nxt),
		}}
	}
	return nil
}
