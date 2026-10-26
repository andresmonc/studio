// Hydration & payload assembly: converts between the go-feature-flag DTO
// (FlagPayload) and the editor's form state. Inverse pair buildFlagPayload /
// hydrateForm. Extracted from flag-form.tsx; pure functions, no React.

import { formatQuery, type RuleGroupType } from "react-querybuilder";
import { parseJsonLogic } from "react-querybuilder/parseJsonLogic";
import { inferFlagType } from "./payload";
import {
  EMPTY_QUERY,
  RESERVED_META_KEYS,
  buildOutcome,
  coerce,
  isoToLocalInput,
  newOutcome,
  newProg,
  nextId,
} from "./flag-form-helpers";
import type {
  FlagFormState,
  Outcome,
  Rule,
  Variation,
} from "./flag-form-types";
import type { FlagPayload, FlagRule, FlagType } from "@/types/api";

export function valueToInput(v: unknown): string {
  if (typeof v === "string") return v;
  return JSON.stringify(v); // boolean -> "true"/"false", number -> "5", object -> "{…}"
}

export function parseQuery(q?: string): RuleGroupType {
  if (!q) return { ...EMPTY_QUERY };
  try {
    return parseJsonLogic(JSON.parse(q)) as RuleGroupType;
  } catch {
    return { ...EMPTY_QUERY };
  }
}

export function outcomeFromRule(
  rule: FlagRule | undefined,
  fallbackVar = "",
): Outcome {
  if (rule?.variation) {
    return { mode: "single", single: rule.variation, percentages: {}, prog: newProg() };
  }
  if (rule?.percentage) {
    return {
      mode: "percentage",
      single: "",
      percentages: { ...rule.percentage },
      prog: newProg(),
    };
  }
  if (rule?.progressiveRollout) {
    const pr = rule.progressiveRollout;
    return {
      mode: "progressive",
      single: "",
      percentages: {},
      prog: {
        initialVariation: pr.initial?.variation ?? "",
        endVariation: pr.end?.variation ?? "",
        initialPct: pr.initial?.percentage ?? 0,
        endPct: pr.end?.percentage ?? 100,
        startDate: pr.initial?.date ? isoToLocalInput(pr.initial.date) : "",
        endDate: pr.end?.date ? isoToLocalInput(pr.end.date) : "",
      },
    };
  }
  return newOutcome(fallbackVar);
}

export function hydrateVariations(payload: FlagPayload): Variation[] {
  const vars = payload.variations ?? {};
  return Object.entries(vars).map(([name, value]) => ({
    id: nextId(),
    name,
    value: valueToInput(value),
  }));
}

export function hydrateRules(payload: FlagPayload): Rule[] {
  return (payload.targeting ?? []).map((r) => ({
    id: nextId(),
    name: r.name ?? "",
    query: parseQuery(r.query),
    outcome: outcomeFromRule(r),
  }));
}

// ── Payload assembly ─────────────────────────────────────────────────────────
// cleanMetadata trims string values and drops empty/undefined ones so we never
// persist `description: ""` or accidentally blank an attribute.
export function cleanMetadata(
  md?: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(md ?? {})) {
    if (typeof v === "string") {
      const tr = v.trim();
      if (tr) out[k] = tr;
    } else if (Array.isArray(v)) {
      // Drop empty arrays (e.g. tags: []) so we never persist an empty key.
      if (v.length > 0) out[k] = v;
    } else if (v !== undefined && v !== null) {
      out[k] = v;
    }
  }
  return out;
}

// buildFlagPayload assembles the go-feature-flag DTO from form parts. The full
// metadata object is preserved (only empty values dropped) so editing never
// clobbers attributes the form doesn't surface (e.g. owner, issue links).
export function buildFlagPayload(form: FlagFormState): Record<string, unknown> {
  const names = form.variations.map((v) => v.name);
  const variationsObj: Record<string, unknown> = {};
  for (const v of form.variations) variationsObj[v.name] = coerce(form.type, v.value);
  const payload: Record<string, unknown> = { variations: variationsObj };
  // Reserved keys (owner/description) live in `metadata`; the custom typed
  // properties (already coerced to JSON types) are merged on top.
  const md = cleanMetadata({ ...form.metadata, ...form.customMetadata });
  // flagType is server-managed (the API injects the OpenFeature type); never send
  // a client-side value, which could be stale.
  delete md.flagType;
  if (Object.keys(md).length > 0) payload.metadata = md;
  if (form.rules.length > 0) {
    payload.targeting = form.rules.map((r) => ({
      name: r.name,
      query: JSON.stringify(formatQuery(r.query, "jsonlogic")),
      ...buildOutcome(r.outcome, names),
    }));
  }
  payload.defaultRule = buildOutcome(form.defaultOutcome, names);
  payload.trackEvents = form.trackEvents;
  return payload;
}

export function hydrateForm(payload?: FlagPayload): FlagFormState {
  const p = payload ?? {};
  const ty = inferFlagType(p) as FlagType;
  // Split metadata: reserved keys (owner/description) stay in `metadata` and are
  // edited in the Settings tab; everything else is custom metadata edited in the
  // Metadata tab, so removing a key there actually drops it on save.
  const reserved: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p.metadata ?? {})) {
    // Reserved keys (owner/description/tags/flagType) are stored verbatim. DO NOT
    // coerce `tags` to an array here (e.g. `Array.isArray(v) ? v : []`): a
    // pre-existing non-array `tags` (a scalar authored via the old metadata
    // editor) must survive round-trips untouched — buildFlagPayload re-emits this
    // raw value, so coercing it would silently drop the user's data on save
    // (D4:A). The TagInput's array coercion lives in useFlagForm, display-only.
    if (RESERVED_META_KEYS.has(k)) reserved[k] = v;
    else custom[k] = v;
  }
  return {
    type: ty === "unknown" ? "string" : ty,
    variations: hydrateVariations(p),
    rules: hydrateRules(p),
    defaultOutcome: outcomeFromRule(p.defaultRule),
    // Default to true when omitted — matches GO Feature Flag's evaluation default.
    trackEvents: p.trackEvents ?? true,
    metadata: reserved,
    customMetadata: custom,
    customMetaValid: true,
  };
}
