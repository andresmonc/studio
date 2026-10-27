import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { jsonDiff } from "@/lib/json-diff";
import type { AuditEntry } from "@/types/api";
import { ActorAvatar } from "./actor-avatar";
import { VerbChip } from "./verb-chip";
import { actorName, isPrimitive } from "./format";
import { auditKey, type TranslateFn } from "./vocabulary";
import { CodeChip } from "@/components/ui/code-chip";

// Right-rail detail for the selected event: actor + verb, target, a before/after
// diff, and a provenance grid (target, actor, plus any primitive metadata).
export function EventDetail({
  e,
  target,
  t,
}: {
  e: AuditEntry | null;
  target: string;
  t: TranslateFn;
}) {
  const diff = useMemo(() => (e ? jsonDiff(e.before, e.after) : []), [e]);
  if (!e) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          {t("auditLog.detail.none")}
        </CardContent>
      </Card>
    );
  }
  const d = new Date(e.occurredAt);
  const meta =
    e.metadata && typeof e.metadata === "object"
      ? Object.entries(e.metadata).filter(([, v]) => isPrimitive(v))
      : [];

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">{t("auditLog.detail.title")}</h2>
          <CodeChip size="sm" className="ml-auto text-muted-foreground">
            #{e.id}
          </CodeChip>
        </div>

        <div className="flex items-center gap-2.5">
          <ActorAvatar e={e} />
          <div>
            <div className="text-xs">
              <b>{actorName(e)}</b> <VerbChip action={auditKey(e)} t={t} />
            </div>
            <div className="mt-0.5 text-2xs text-muted-foreground">
              {d.toLocaleString()}
            </div>
          </div>
        </div>

        <CodeChip size="sm" className="self-start font-medium">
          {target}
        </CodeChip>

        <div>
          <div className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("auditLog.detail.changes")}
          </div>
          {diff.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("auditLog.detail.noDiff")}
            </p>
          ) : (
            <div className="overflow-hidden rounded-md border font-mono text-2xs leading-[1.7]">
              {diff.map((l, i) => (
                <div
                  key={i}
                  className={cn(
                    "whitespace-pre px-3",
                    l.kind === "del" && "bg-destructive/10 text-destructive",
                    l.kind === "add" &&
                      "bg-success/10 text-success",
                    l.kind === "ctx" && "text-muted-foreground",
                  )}
                >
                  {l.kind === "del" ? "- " : l.kind === "add" ? "+ " : "  "}
                  {l.text}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-md border bg-muted/40 p-3">
          <ProvItem label={t("auditLog.detail.target")} value={target} />
          <ProvItem
            label={t("auditLog.detail.actor")}
            value={e.actorEmail ?? "system"}
          />
          {meta.map(([k, v]) => (
            <ProvItem key={k} label={k} value={String(v)} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ProvItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-2xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="truncate text-xs font-medium" title={value}>
        {value}
      </span>
    </div>
  );
}
