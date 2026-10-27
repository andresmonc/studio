import { Badge } from "@/components/ui/badge";
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
    <Badge className={cn("rounded-full border-transparent text-2xs", TONE_CLASS[tone])}>
      <Icon />
      {label}
    </Badge>
  );
}
