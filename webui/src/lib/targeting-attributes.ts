// Remembered targeting attributes — the field combobox proposes only
// `targetingKey` out of the box; every other attribute is typed by the user.
// We persist typed attributes in localStorage so they're proposed again on
// later rules and future sessions (global per browser).

const STORAGE_KEY = "goff:targeting-attributes";
const MAX_REMEMBERED = 50;

// Attributes already offered by the field selector — never remembered as custom.
export const PREDEFINED_ATTRIBUTES = ["targetingKey"];

// getRememberedAttributes returns previously-typed attribute names, most recent
// first. Returns [] if storage is empty, corrupt, or unavailable (e.g. SSR).
export function getRememberedAttributes(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

// rememberAttribute records a typed attribute name. No-ops for empty values and
// predefined attributes. Keeps the list deduped, most-recent-first, capped.
export function rememberAttribute(name: string): void {
  const trimmed = name.trim();
  if (!trimmed || PREDEFINED_ATTRIBUTES.includes(trimmed)) return;
  try {
    const existing = getRememberedAttributes().filter((a) => a !== trimmed);
    const next = [trimmed, ...existing].slice(0, MAX_REMEMBERED);
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable / quota exceeded — remembering is best-effort.
  }
}
