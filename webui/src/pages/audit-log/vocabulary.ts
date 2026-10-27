// Shared constants, types, and classifiers for the audit log page.
// Pure data (no JSX) so it can be imported by both the page container and the
// presentational components without tripping react-refresh.

import {
  KeyRoundIcon,
  PencilIcon,
  PlusIcon,
  PowerIcon,
  Trash2Icon,
  Undo2Icon,
  UserMinusIcon,
  UserPlusIcon,
  type LucideIcon,
} from "lucide-react";

export const PAGE_SIZE = 50;
export const ALL = "__all__";

// Refine's useTranslate() return type, narrowed to what the components need.
export type TranslateFn = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export type Tone = "success" | "accent" | "warn" | "danger" | "violet" | "muted";
export type IconType = LucideIcon;

// Verb chip tints (text + soft background) per tone.
export const TONE_CLASS: Record<Tone, string> = {
  success: "text-success bg-success/10",
  accent: "text-info bg-info/10",
  warn: "text-warning bg-warning/10",
  danger: "text-destructive bg-destructive/10",
  violet: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
  muted: "text-muted-foreground bg-muted",
};

// Solid fills for the "By action" breakdown bars.
export const BAR_BG: Record<Tone, string> = {
  success: "bg-success",
  accent: "bg-info",
  warn: "bg-warning",
  danger: "bg-destructive",
  violet: "bg-violet-500",
  muted: "bg-muted-foreground/50",
};

// auditKey names an event as `${targetType}.${action}` (e.g. "flag.create",
// "api_key.delete"). A flag toggle is recorded as an update whose before/after
// carry only `disabled`; it reads as flag.enable / flag.disable instead.
export function auditKey(e: {
  action: string;
  targetType: string;
  after?: unknown;
}): string {
  const key = `${e.targetType}.${e.action}`;
  if (key === "flag.update" && isToggle(e.after)) {
    return (e.after as { disabled: boolean }).disabled ? "flag.disable" : "flag.enable";
  }
  return key;
}

function isToggle(v: unknown): boolean {
  return (
    typeof v === "object" &&
    v !== null &&
    Object.keys(v).length === 1 &&
    typeof (v as { disabled?: unknown }).disabled === "boolean"
  );
}

// auditKey -> verb chip (i18n label key under auditLog.verb, tone, icon).
export const VERB: Record<string, { key: string; tone: Tone; icon: IconType }> = {
  "flag.create": { key: "created", tone: "success", icon: PlusIcon },
  "flagset.create": { key: "created", tone: "success", icon: PlusIcon },
  "team.create": { key: "created", tone: "success", icon: PlusIcon },
  "company.create": { key: "created", tone: "success", icon: PlusIcon },
  "flag.update": { key: "updated", tone: "accent", icon: PencilIcon },
  "flagset.update": { key: "updated", tone: "accent", icon: PencilIcon },
  "team.update": { key: "updated", tone: "accent", icon: PencilIcon },
  "company.update": { key: "updated", tone: "accent", icon: PencilIcon },
  "flag.disable": { key: "disabled", tone: "muted", icon: PowerIcon },
  "flag.enable": { key: "enabled", tone: "success", icon: PowerIcon },
  "flag.delete": { key: "deleted", tone: "danger", icon: Trash2Icon },
  "flagset.delete": { key: "deleted", tone: "danger", icon: Trash2Icon },
  "team.delete": { key: "deleted", tone: "danger", icon: Trash2Icon },
  "company.delete": { key: "deleted", tone: "danger", icon: Trash2Icon },
  "flag.rollback": { key: "reverted", tone: "warn", icon: Undo2Icon },
  "api_key.create": { key: "createdKey", tone: "violet", icon: KeyRoundIcon },
  "api_key.delete": { key: "deletedKey", tone: "danger", icon: KeyRoundIcon },
  "team_member.create": { key: "addedMember", tone: "success", icon: UserPlusIcon },
  "company_member.create": { key: "addedMember", tone: "success", icon: UserPlusIcon },
  "team_member.delete": { key: "removedMember", tone: "danger", icon: UserMinusIcon },
  "company_member.delete": { key: "removedMember", tone: "danger", icon: UserMinusIcon },
  "team_member.update": { key: "updatedMember", tone: "accent", icon: PencilIcon },
  "company_member.update": { key: "updatedMember", tone: "accent", icon: PencilIcon },
};

export const FALLBACK_VERB = { tone: "muted" as Tone, icon: PencilIcon };

// Coarse scope used by the segmented filter and target labelling.
export type Scope = "flags" | "flagsets" | "teams" | "keys" | "other";
const SCOPE: Record<string, Scope> = {
  flag: "flags",
  flagset: "flagsets",
  team: "teams",
  team_member: "teams",
  api_key: "keys",
};
export function scopeOf(targetType: string): Scope {
  return SCOPE[targetType] ?? "other";
}

// Coarse bucket for the "By action" breakdown chart.
export const BREAKDOWN: { cat: string; tone: Tone }[] = [
  { cat: "created", tone: "success" },
  { cat: "updated", tone: "accent" },
  { cat: "disabled", tone: "muted" },
  { cat: "enabled", tone: "success" },
  { cat: "reverted", tone: "warn" },
  { cat: "key", tone: "violet" },
  { cat: "member", tone: "success" },
  { cat: "deleted", tone: "danger" },
];
const CATEGORY: Record<string, string> = {
  create: "created",
  update: "updated",
  delete: "deleted",
  disable: "disabled",
  enable: "enabled",
  rollback: "reverted",
};
// categoryOf takes an auditKey.
export function categoryOf(key: string): string {
  const [type, verb] = key.split(".");
  if (type === "api_key") return "key";
  if (type.endsWith("_member")) return "member";
  return CATEGORY[verb] ?? "other";
}

// Date-range presets (days back) for the server-side `from` filter. The
// "all" option keys off the shared ALL sentinel so it matches FilterSelect's
// all-item (otherwise the range dropdown renders blank when unset).
export const RANGE_DAYS: Record<string, number | null> = {
  [ALL]: null,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};
