import { cn } from "@/lib/utils";
import type { AuditEntry } from "@/types/api";
import { ActorAvatar } from "./actor-avatar";
import { VerbChip } from "./verb-chip";
import { actorName, hhmm } from "./format";
import { auditKey, type TranslateFn } from "./vocabulary";

// One clickable event line in the stream: time, actor, verb, target, and an
// optional flagset hint. The selected row gets a chroma left-border cue.
export function AuditRow({
  e,
  target,
  flagsetName,
  selected,
  onSelect,
  t,
}: {
  e: AuditEntry;
  target: string;
  flagsetName?: string;
  selected: boolean;
  onSelect: () => void;
  t: TranslateFn;
}) {
  const d = new Date(e.occurredAt);
  const typeLabel = t(`auditLog.type.${e.targetType}`);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted",
        selected && "bg-primary/5 shadow-[inset_3px_0_0_var(--color-primary)]",
      )}
    >
      <span className="w-10 shrink-0 pt-1 font-mono text-2xs text-muted-foreground">
        {hhmm(d)}
      </span>
      <ActorAvatar e={e} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <b className="text-xs font-semibold">{actorName(e)}</b>
          <VerbChip action={auditKey(e)} t={t} />
          <span className="text-2xs text-muted-foreground">{typeLabel}</span>
          <code className="rounded bg-muted px-1.5 py-px font-mono text-2xs font-medium">
            {target}
          </code>
        </span>
        {flagsetName && e.targetType === "flag" && (
          <span className="mt-1 block text-xs text-muted-foreground">
            {t("auditLog.inFlagset", { name: flagsetName })}
          </span>
        )}
      </span>
    </button>
  );
}
