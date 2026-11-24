// Pure helpers behind the home dashboard. No JSX, so the cards and tests can
// share them without tripping react-refresh.

import type { AuditEntry, FlagInstance, Flagset } from "@/types/api";

// How many rows the dashboard lists per card before pointing to the full page.
export const CARD_LIMIT = 5;

export type DayPart = "morning" | "afternoon" | "evening";

export function dayPart(d: Date): DayPart {
  const h = d.getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

export function firstName(name: string | undefined, email = ""): string {
  return name?.trim().split(/\s+/)[0] || email.split("@")[0];
}

export function flagTotals(flagsets: Flagset[]) {
  const total = flagsets.reduce((sum, fs) => sum + fs.flagCount, 0);
  const enabled = flagsets.reduce((sum, fs) => sum + fs.enabledFlagCount, 0);
  return { total, enabled, disabled: total - enabled };
}

// staleVariation returns the variation an enabled flag serves to everyone (no
// targeting rules, a single variation at 100%), i.e. a candidate for removal.
// ponytail: no "for 30+ days" rule; the API has no "distribution last changed"
// timestamp (updatedAt also moves on enable/disable). See TODOS.md.
export function staleVariation(f: FlagInstance): string | undefined {
  if (f.disabled || f.progressiveRollout || (f.targetingRuleCount ?? 0) > 0) {
    return undefined;
  }
  const entries = Object.entries(f.distribution ?? {});
  if (entries.length !== 1 || entries[0][1] !== 100) return undefined;
  return entries[0][0];
}

// targetName labels an audit target: the live name when it still exists, else
// the name/label snapshotted on the event (deleted flags, API keys), else its id.
export function targetName(e: AuditEntry, nameById: Map<string, string>): string {
  const live = nameById.get(e.targetId);
  if (live) return live;
  const snap = (e.after ?? e.before) as { name?: unknown; label?: unknown } | null | undefined;
  if (typeof snap?.name === "string") return snap.name;
  if (typeof snap?.label === "string") return snap.label;
  return e.targetId;
}
