import { cn } from "@/lib/utils";
import { FALLBACK_VERB, TONE_CLASS, VERB, type TranslateFn } from "./vocabulary";

// Pill describing what happened (verb + icon + tone), derived from the audit
// action string. Unknown actions fall back to the last action segment.
export function VerbChip({ action, t }: { action: string; t: TranslateFn }) {
  const v = VERB[action];
  const tone = v?.tone ?? FALLBACK_VERB.tone;
  const Icon = v?.icon ?? FALLBACK_VERB.icon;
  const label = v ? t(`auditLog.verb.${v.key}`) : action.split(".").pop();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        TONE_CLASS[tone],
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
