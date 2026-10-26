import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AuditEntry } from "@/types/api";
import {
  BAR_BG,
  BREAKDOWN,
  auditKey,
  categoryOf,
  type TranslateFn,
} from "./vocabulary";

// "By action" card: horizontal bars counting the loaded events per coarse
// category. Computed over everything loaded, not just the filtered view.
export function ActionBreakdown({
  entries,
  t,
}: {
  entries: AuditEntry[];
  t: TranslateFn;
}) {
  const { rows, max, total } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const c = categoryOf(auditKey(e));
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const computed = BREAKDOWN.map((b) => ({
      ...b,
      n: counts.get(b.cat) ?? 0,
    })).filter((b) => b.n > 0);
    return {
      rows: computed,
      max: Math.max(1, ...computed.map((r) => r.n)),
      total: entries.length,
    };
  }, [entries]);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center">
          <h2 className="text-sm font-semibold">
            {t("auditLog.breakdown.title")}
          </h2>
          <span className="ml-auto text-xs text-muted-foreground">
            {t("auditLog.breakdown.total", { count: total })}
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("auditLog.empty")}</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {rows.map((b) => (
              <div key={b.cat} className="flex items-center gap-2.5">
                <span className="w-20 shrink-0 text-xs text-muted-foreground">
                  {t(
                    `auditLog.verb.${b.cat === "key" ? "createdKey" : b.cat === "member" ? "addedMember" : b.cat}`,
                  )}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", BAR_BG[b.tone])}
                    style={{ width: `${(b.n / max) * 100}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right font-mono text-xs font-semibold">
                  {b.n}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
