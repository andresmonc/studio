// Pure formatting helpers for actors, dates, and values in the audit log.

import type { AuditEntry } from "@/types/api";
import type { TranslateFn } from "./vocabulary";

// --- actor ---------------------------------------------------------------

export const AVATAR_BG = [
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-red-500",
  "bg-cyan-500",
  "bg-blue-500",
  "bg-pink-500",
  "bg-teal-500",
];

export function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function actorName(e: AuditEntry): string {
  if (!e.actorEmail) return "system";
  return e.actorEmail.split("@")[0];
}

export function initials(e: AuditEntry): string {
  if (!e.actorEmail) return "SY";
  return e.actorEmail.slice(0, 2).toUpperCase();
}

// --- date ----------------------------------------------------------------

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function dayLabel(d: Date, t: TranslateFn): string {
  const now = new Date();
  if (dayKey(d) === dayKey(now)) return t("auditLog.today");
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(y)) return t("auditLog.yesterday");
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

export function hhmm(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// --- value ---------------------------------------------------------------

export function isPrimitive(v: unknown): v is string | number | boolean {
  return (
    typeof v === "string" || typeof v === "number" || typeof v === "boolean"
  );
}
