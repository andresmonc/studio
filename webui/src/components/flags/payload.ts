import type { FlagPayload, FlagRule } from "@/types/api";

// variationNames returns the flag's variation names in their declared order.
export function variationNames(payload: FlagPayload | undefined): string[] {
  return payload?.variations ? Object.keys(payload.variations) : [];
}

// formatVariationValue renders a variation value (bool/string/number/object)
// for display in a pill or table cell.
export function formatVariationValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

// inferFlagType derives a flag's type from its variation values, mirroring the
// server's model.InferFlagType (the type isn't stored explicitly).
export function inferFlagType(payload?: FlagPayload): string {
  const values = payload?.variations ? Object.values(payload.variations) : [];
  if (values.length === 0) return "unknown";
  let numeric = false;
  let allInt = true;
  for (const v of values) {
    if (typeof v === "boolean") return "boolean";
    if (typeof v === "string") return "string";
    if (typeof v === "number") {
      numeric = true;
      if (!Number.isInteger(v)) allInt = false;
    } else {
      return "json";
    }
  }
  return numeric ? (allInt ? "int" : "float") : "unknown";
}

export type RuleOutcome =
  | { kind: "single"; variation: string }
  | { kind: "percentage"; percentages: Record<string, number> }
  | {
      kind: "progressive";
      from: number;
      to: number;
      initialVariation?: string;
      endVariation?: string;
      startDate?: string;
      endDate?: string;
    }
  | { kind: "none" };

// ruleOutcome classifies how a rule (or the defaultRule) serves a variation:
// a single variation, a percentage split, or a progressive rollout.
export function ruleOutcome(rule: FlagRule | undefined): RuleOutcome {
  if (!rule) return { kind: "none" };
  if (rule.variation) return { kind: "single", variation: rule.variation };
  if (rule.percentage) {
    return { kind: "percentage", percentages: rule.percentage };
  }
  if (rule.progressiveRollout) {
    const pr = rule.progressiveRollout;
    return {
      kind: "progressive",
      from: pr.initial?.percentage ?? 0,
      to: pr.end?.percentage ?? 100,
      initialVariation: pr.initial?.variation,
      endVariation: pr.end?.variation,
      startDate: pr.initial?.date ?? undefined,
      endDate: pr.end?.date ?? undefined,
    };
  }
  return { kind: "none" };
}
