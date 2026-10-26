// Pure flag-form helpers: id/query constants, outcome math, value coercion and
// validation, datetime-local formatting, and variation diff/reconcile logic.
// Extracted from flag-form.tsx; no React, no JSX — just data in/out.

import { defaultOperators, type Field as RqbField, type RuleGroupType } from "react-querybuilder";
import type { FlagType } from "@/types/api";
import type { Outcome, ProgState, Variation } from "./flag-form-types";

let seq = 1;
export const nextId = () => seq++;

export const EMPTY_QUERY: RuleGroupType = { combinator: "and", rules: [] };
// Only targetingKey is predefined; every other attribute is typed by the user
// and remembered via lib/targeting-attributes (proposed by ShadcnUiFieldSelector).
export const QB_FIELDS: RqbField[] = [
  { name: "targetingKey", label: "Targeting key" },
];

// GOFF's jsonlogic has no startsWith/endsWith, so the server rejects queries
// using the begins/ends-with operators (the jsonlogic export emits those ops).
const UNSUPPORTED_OPS = new Set(["beginsWith", "doesNotBeginWith", "endsWith", "doesNotEndWith"]);
export const QB_OPERATORS = defaultOperators.filter((o) => !UNSUPPORTED_OPS.has(o.name));

// nextRuleName returns the first free "Rule N": GOFF rejects duplicate rule
// names, and counting rules would reuse a name after a delete.
export function nextRuleName(names: string[]): string {
  const taken = new Set(names);
  let n = 1;
  while (taken.has(`Rule ${n}`)) n++;
  return `Rule ${n}`;
}

// isoToLocalInput converts a stored UTC ISO timestamp into the local wall-clock
// string a <input type="datetime-local"> expects (YYYY-MM-DDTHH:mm).
const pad2 = (n: number) => String(n).padStart(2, "0");
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// localMidnight returns the datetime-local string (YYYY-MM-DDTHH:mm) for the given
// date at 00:00 local time — the 12:00 AM default for new progressive rollout steps.
export function localMidnight(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T00:00`;
}

export const newProg = (): ProgState => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    initialVariation: "",
    endVariation: "",
    initialPct: 0,
    endPct: 100,
    startDate: localMidnight(today),
    endDate: localMidnight(tomorrow),
  };
};
export const newOutcome = (single = ""): Outcome => ({
  mode: "single",
  single,
  percentages: {},
  prog: newProg(),
});

// outcomeSum sums only the percentages of the CURRENT variations. Percentages
// are keyed by variation name, so renaming/removing a variation can leave an
// orphaned key behind; counting Object.values would double-count it (the "Sum:
// 200%" bug). Always sum over the live variation names instead.
export function outcomeSum(o: Outcome, names: string[]): number {
  return names.reduce((a, n) => a + (o.percentages[n] || 0), 0);
}
// A variation's weight can grow only into the room left by the others, so the
// percentage controls stop at 100% minus every OTHER variation's weight. This
// keeps the total from ever exceeding 100% (e.g. with A at 20%, B caps at 80%).
export function clampPercentage(
  value: number,
  name: string,
  o: Outcome,
  names: string[],
): number {
  // Non-numeric input (a half-typed "1e", a bad paste) must not poison state.
  const safe = Number.isFinite(value) ? value : 0;
  const others = outcomeSum(o, names) - (o.percentages[name] || 0);
  // Floor the ceiling at 0: legacy/unnormalized flags can load with the other
  // variations already summing past 100, and a negative ceiling would otherwise
  // write a negative weight.
  return Math.min(Math.max(safe, 0), Math.max(0, 100 - others));
}
export function outcomeValid(o: Outcome, names: string[]): boolean {
  if (o.mode === "single") return names.includes(o.single);
  if (o.mode === "percentage")
    return Math.abs(outcomeSum(o, names) - 100) < 0.001;
  // The end date must be strictly after the start date: go-feature-flag's
  // progressive rollout treats end <= start as invalid and errors at evaluation
  // (modules/core/flag/rule.go isRolloutValid), so block saving it here.
  return (
    names.includes(o.prog.initialVariation) &&
    names.includes(o.prog.endVariation) &&
    !!o.prog.startDate &&
    !!o.prog.endDate &&
    new Date(o.prog.startDate).getTime() < new Date(o.prog.endDate).getTime()
  );
}
export function buildOutcome(
  o: Outcome,
  names: string[],
): Record<string, unknown> {
  if (o.mode === "single") return { variation: o.single };
  if (o.mode === "percentage") {
    // Only emit weights for current variations, dropping any orphaned keys.
    const percentage: Record<string, number> = {};
    for (const n of names) percentage[n] = o.percentages[n] ?? 0;
    return { percentage };
  }
  return {
    progressiveRollout: {
      initial: {
        variation: o.prog.initialVariation,
        percentage: o.prog.initialPct,
        date: o.prog.startDate ? new Date(o.prog.startDate).toISOString() : "",
      },
      end: {
        variation: o.prog.endVariation,
        percentage: o.prog.endPct,
        date: o.prog.endDate ? new Date(o.prog.endDate).toISOString() : "",
      },
    },
  };
}

export function variationsForType(type: FlagType): Variation[] {
  if (type === "boolean") {
    return [
      { id: nextId(), name: "enabled", value: "true" },
      { id: nextId(), name: "disabled", value: "false" },
    ];
  }
  return [
    { id: nextId(), name: "control", value: "" },
    { id: nextId(), name: "treatment-1", value: "" },
  ];
}

export function coerce(type: FlagType, value: string): unknown {
  switch (type) {
    case "boolean":
      return value === "true";
    case "int":
      return parseInt(value, 10);
    case "float":
      return Number(value);
    case "json":
      return JSON.parse(value);
    default:
      return value;
  }
}

// valueError returns an i18n key for an invalid typed variation value, or null.
export function valueError(type: FlagType, value: string): string | null {
  if (type === "boolean") return null;
  if (value.trim() === "") return "flag.wizard.errValueRequired";
  if (type === "int")
    return Number.isInteger(Number(value)) ? null : "flag.wizard.errInt";
  if (type === "float")
    return Number.isNaN(Number(value)) ? "flag.wizard.errFloat" : null;
  if (type === "json") {
    try {
      JSON.parse(value);
      return null;
    } catch {
      return "flag.wizard.errJson";
    }
  }
  return null;
}

export function valueValid(type: FlagType, value: string): boolean {
  if (type === "int")
    return value.trim() !== "" && Number.isInteger(Number(value));
  if (type === "float")
    return value.trim() !== "" && !Number.isNaN(Number(value));
  if (type === "json") {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }
  return value.trim() !== "" || type === "boolean";
}

// ── Metadata properties ──────────────────────────────────────────────────────
// Flag metadata is a free-form map of typed properties. `owner` and `description`
// have dedicated UI in the Settings tab, so they're reserved and excluded from the
// generic typed-property editor (the Metadata tab) to avoid double-editing. That
// editor (the shared EnrichmentEditor) owns the row state and reports the resolved
// object via `customMetadata`, so the form only tracks the object, not the rows.
// `flagType` is managed by the server (it publishes the flag's OpenFeature type
// for the OpenFeature CLI), so it is reserved too: never editable, never sent.
// `tags` is an array (not a scalar the generic editor supports) with its own
// dedicated TagInput control, so it is reserved as well.
export const RESERVED_META_KEYS = new Set(["owner", "description", "flagType", "tags"]);

// diffVariations detects renames and removals between two variation lists using
// the stable `id`. Used to keep outcomes (which key percentages and variation
// refs by NAME) in sync when a variation is renamed or deleted.
export function diffVariations(
  prev: Variation[],
  next: Variation[],
): { renames: Map<string, string>; removed: Set<string>; nextNames: string[] } {
  const oldById = new Map(prev.map((v) => [v.id, v.name]));
  const renames = new Map<string, string>();
  for (const v of next) {
    const oldName = oldById.get(v.id);
    if (oldName !== undefined && oldName !== v.name) renames.set(oldName, v.name);
  }
  const nextIds = new Set(next.map((v) => v.id));
  const removed = new Set<string>();
  for (const v of prev) if (!nextIds.has(v.id)) removed.add(v.name);
  return { renames, removed, nextNames: next.map((v) => v.name) };
}

// reconcileOutcome rewrites an outcome to a changed variation set: renamed
// variation weights/refs migrate to the new name, removed ones are dropped, and
// any percentage key that isn't a current variation is pruned (kills orphans
// that would otherwise inflate the sum — the "200%" bug).
export function reconcileOutcome(
  o: Outcome,
  renames: Map<string, string>,
  removed: Set<string>,
  nextNames: string[],
): Outcome {
  const names = new Set(nextNames);
  const mapName = (n: string) => renames.get(n) ?? n;

  const percentages: Record<string, number> = {};
  for (const [k, v] of Object.entries(o.percentages)) {
    if (removed.has(k)) continue;
    const nk = mapName(k);
    if (names.has(nk)) percentages[nk] = v;
  }

  const fixRef = (ref: string) => {
    const mapped = mapName(ref);
    return names.has(mapped) ? mapped : "";
  };

  return {
    ...o,
    single: fixRef(o.single),
    percentages,
    prog: {
      ...o.prog,
      initialVariation: fixRef(o.prog.initialVariation),
      endVariation: fixRef(o.prog.endVariation),
    },
  };
}
