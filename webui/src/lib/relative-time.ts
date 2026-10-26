import i18n from "@/i18n";

// Largest-first divisions used to pick the coarsest sensible unit for a duration
// (e.g. render 90 minutes as "2 hours ago", not "90 minutes ago").
const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

// formatRelativeTime renders an ISO timestamp as a short relative phrase
// ("2 days ago", "in 3 hours"), matching the reference's compact updated column.
// Returns "" for an empty/unparseable input so callers can render a blank cell.
export function formatRelativeTime(iso: string, lang: string = i18n.language): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  let duration = (ms - Date.now()) / 1000; // seconds; negative for the past
  for (const div of DIVISIONS) {
    if (Math.abs(duration) < div.amount) {
      return rtf.format(Math.round(duration), div.unit);
    }
    duration /= div.amount;
  }
  return new Date(iso).toLocaleDateString(lang);
}

// formatExactDateTime renders the full locale date+time, used as the hover title
// on a relative timestamp so the precise moment stays available.
export function formatExactDateTime(iso: string, lang: string = i18n.language): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(lang);
}
