import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AuditEntry } from "@/types/api";
import { AuditRow } from "./audit-row";
import type { TranslateFn } from "./vocabulary";

export type DayGroup = { label: string; items: AuditEntry[] };

// Left card: day-grouped event stream with sticky day headers, loading/empty
// states, and a "Load earlier events" footer.
export function EventStream({
  groups,
  selectedId,
  onSelect,
  resolveTarget,
  nameById,
  loading,
  isEmpty,
  canLoadMore,
  isFetching,
  onLoadMore,
  t,
}: {
  groups: DayGroup[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  resolveTarget: (e: AuditEntry) => string;
  nameById: Map<string, string>;
  loading: boolean;
  isEmpty: boolean;
  canLoadMore: boolean;
  isFetching: boolean;
  onLoadMore: () => void;
  t: TranslateFn;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        {loading && (
          <div className="p-4 text-sm text-muted-foreground">
            {t("auditLog.loading")}
          </div>
        )}
        {isEmpty && (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {t("auditLog.empty")}
          </div>
        )}
        {groups.map((g) => (
          <div key={g.label + g.items[0]?.id}>
            <div className="sticky top-0 z-[2] flex items-center gap-2 border-b bg-background px-4 py-2">
              <span className="text-2xs font-semibold uppercase tracking-wide text-foreground/80">
                {g.label}
              </span>
              <span className="ml-auto text-2xs text-muted-foreground">
                {t("auditLog.eventCount", { count: g.items.length })}
              </span>
            </div>
            {g.items.map((e) => (
              <AuditRow
                key={e.id}
                e={e}
                target={resolveTarget(e)}
                flagsetName={e.flagsetId ? nameById.get(e.flagsetId) : undefined}
                selected={selectedId === e.id}
                onSelect={() => onSelect(e.id)}
                t={t}
              />
            ))}
          </div>
        ))}
        {canLoadMore && (
          <div className="flex justify-center p-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={isFetching}
              onClick={onLoadMore}
            >
              {t("auditLog.loadMore")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
