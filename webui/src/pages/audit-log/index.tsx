import { useEffect, useMemo, useRef, useState } from "react";
import { useCustom, useTranslate } from "@refinedev/core";
import { useSearchParams } from "react-router";
import { DownloadIcon } from "lucide-react";
import { ListView } from "@/components/refine-ui/views/list-view";
import { Button } from "@/components/ui/button";
import { useActiveTeam } from "@/hooks/use-active-team";
import { API_URL } from "@/providers/constants";
import type {
  AuditEntry,
  Flagset,
  FlagInstance,
  PaginatedResponse,
} from "@/types/api";
import { ActionBreakdown } from "./action-breakdown";
import { AuditFilters } from "./audit-filters";
import { EventDetail } from "./event-detail";
import { EventStream, type DayGroup } from "./event-stream";
import { dayKey, dayLabel } from "./format";
import { ALL, PAGE_SIZE, RANGE_DAYS, scopeOf, type Scope } from "./vocabulary";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export function AuditLogPage() {
  const t = useTranslate();
  const { activeTeamId, memberships } = useActiveTeam();

  const teamName = useMemo(
    () => memberships.find((m) => m.teamId === activeTeamId)?.teamName,
    [memberships, activeTeamId],
  );

  // Filters live in the URL so a filtered view is shareable/bookmarkable.
  const [searchParams, setSearchParams] = useSearchParams();
  const setParam = (key: string, value: string, opts?: { replace?: boolean }) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!value || value === ALL) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: opts?.replace },
    );
  };

  const search = searchParams.get("q") ?? "";
  const scope = (searchParams.get("scope") ?? ALL) as Scope | typeof ALL;
  const actor = searchParams.get("actor") ?? ALL;
  const flagsetParam = searchParams.get("flagset") ?? ALL;
  const range = searchParams.get("range") ?? ALL;

  // Server-side filters (flagset, date range) -> reset the accumulator.
  const days = RANGE_DAYS[range] ?? null;
  const fromIso = useMemo(() => {
    if (!days) return "";
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }, [days]);
  const serverQS =
    (flagsetParam !== ALL ? `&flagsetId=${encodeURIComponent(flagsetParam)}` : "") +
    (fromIso ? `&from=${encodeURIComponent(fromIso)}` : "");
  const serverKey = `${flagsetParam}|${range}`;

  // Paginated fetch with "load earlier" accumulation.
  const [page, setPage] = useState(1);
  const [accum, setAccum] = useState<AuditEntry[]>([]);
  const mergedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setPage(1);
    setAccum([]);
    mergedRef.current = new Set();
  }, [activeTeamId, serverKey]);

  const { query } = useCustom<PaginatedResponse<AuditEntry>>({
    url: `${API_URL}/audit?teamId=${activeTeamId}&page=${page}&pageSize=${PAGE_SIZE}${serverQS}`,
    method: "get",
    queryOptions: {
      queryKey: ["team-audit", activeTeamId, serverKey, page],
      enabled: !!activeTeamId,
    },
  });

  const pageData = query.data?.data;
  const total = pageData?.total ?? 0;

  useEffect(() => {
    if (!pageData) return;
    const tag = `${serverKey}#${page}`;
    if (mergedRef.current.has(tag)) return;
    mergedRef.current.add(tag);
    setAccum((prev) => {
      const seen = new Set(prev.map((e) => e.id));
      return [...prev, ...pageData.data.filter((e) => !seen.has(e.id))];
    });
  }, [pageData, page, serverKey]);

  // Resolve target UUIDs -> names via the team's flags & flagsets.
  // ponytail: names resolved for the first 200 flags only (pageSize cap); add an ?ids= filter if teams outgrow it.
  const { query: flagsQuery } = useCustom<PaginatedResponse<FlagInstance>>({
    url: `${API_URL}/teams/${activeTeamId}/flags?pageSize=200`,
    method: "get",
    queryOptions: { queryKey: ["team-flags", activeTeamId], enabled: !!activeTeamId },
  });
  const { query: flagsetsQuery } = useCustom<Flagset[]>({
    url: `${API_URL}/teams/${activeTeamId}/flagsets`,
    method: "get",
    queryOptions: { queryKey: ["team-flagsets", activeTeamId], enabled: !!activeTeamId },
  });
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of flagsQuery.data?.data?.data ?? []) m.set(f.id, f.name);
    if (Array.isArray(flagsetsQuery.data?.data))
      for (const fs of flagsetsQuery.data!.data) m.set(fs.id, fs.name);
    return m;
  }, [flagsQuery.data, flagsetsQuery.data]);

  const resolveTarget = (e: AuditEntry): string => {
    if (e.targetType === "team" && e.targetId === activeTeamId && teamName)
      return teamName;
    // Key events snapshot the key's label; the id alone means nothing to a reader.
    if (e.targetType === "api_key") {
      const snap = (e.after ?? e.before) as { label?: unknown } | null | undefined;
      if (typeof snap?.label === "string") return snap.label;
    }
    return nameById.get(e.targetId) ?? e.targetId;
  };

  const flagsets = useMemo(
    () =>
      Array.isArray(flagsetsQuery.data?.data)
        ? [...flagsetsQuery.data!.data].sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [flagsetsQuery.data],
  );

  const actors = useMemo(() => {
    const s = new Set<string>();
    for (const e of accum) if (e.actorEmail) s.add(e.actorEmail);
    return Array.from(s).sort();
  }, [accum]);

  // Client-side filters over the accumulated list.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accum.filter((e) => {
      if (scope !== ALL && scopeOf(e.targetType) !== scope) return false;
      if (actor !== ALL && (e.actorEmail ?? "") !== actor) return false;
      if (q) {
        const hay = `${e.action} ${e.actorEmail ?? "system"} ${resolveTarget(e)} ${e.targetId}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // resolveTarget depends on nameById; including accum + nameById covers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accum, search, scope, actor, nameById]);

  // Day grouping (filtered list is already newest-first from the server).
  const groups = useMemo<DayGroup[]>(() => {
    const out: DayGroup[] = [];
    let curKey = "";
    for (const e of filtered) {
      const d = new Date(e.occurredAt);
      const k = dayKey(d);
      if (k !== curKey) {
        out.push({ label: dayLabel(d, t), items: [] });
        curKey = k;
      }
      out[out.length - 1].items.push(e);
    }
    return out;
  }, [filtered, t]);

  // Selection for the detail rail. Default to the first visible event.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected =
    filtered.find((e) => e.id === selectedId) ?? filtered[0] ?? null;

  const dirty =
    search !== "" ||
    scope !== ALL ||
    actor !== ALL ||
    flagsetParam !== ALL ||
    range !== ALL;
  const clearFilters = () => setSearchParams({}, { replace: true });

  const exportCsv = () => {
    const head = ["id", "occurredAt", "actor", "action", "targetType", "target"];
    // Quote-escape, and neutralize spreadsheet formula injection: a leading
    // =/+/-/@/tab/CR in a user-authored field (flag name, actor email) would
    // execute as a formula in Excel/Sheets on open. Prefix those with a quote.
    const esc = (v: string) => {
      const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const rows = filtered.map((e) =>
      [
        String(e.id),
        e.occurredAt,
        e.actorEmail ?? "system",
        e.action,
        e.targetType,
        resolveTarget(e),
      ]
        .map(esc)
        .join(","),
    );
    const csv = [head.map(esc).join(","), ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${teamName ?? activeTeamId ?? "team"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ListView>
      <div className="flex flex-col gap-4">
        <PageHeader
          breadcrumb={[{ label: t("auditLog.title") }]}
          title={t("auditLog.title")}
          description={t("auditLog.subtitle")}
        >
          {activeTeamId && (
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={filtered.length === 0}
            >
              <DownloadIcon className="h-4 w-4" />
              {t("auditLog.exportCsv")}
            </Button>
          )}
        </PageHeader>

        {!activeTeamId ? (
          <EmptyState>
            {t("auditLog.noTeam")}
          </EmptyState>
        ) : (
          <>
            <AuditFilters
              search={search}
              scope={scope}
              actor={actor}
              flagset={flagsetParam}
              range={range}
              setParam={setParam}
              actors={actors}
              flagsets={flagsets}
              dirty={dirty}
              clearFilters={clearFilters}
              t={t}
            />

            <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]">
              <EventStream
                groups={groups}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
                resolveTarget={resolveTarget}
                nameById={nameById}
                loading={query.isLoading && accum.length === 0}
                isEmpty={!query.isLoading && filtered.length === 0}
                canLoadMore={accum.length > 0 && accum.length < total}
                isFetching={query.isFetching}
                onLoadMore={() => setPage((p) => p + 1)}
                t={t}
              />

              <div className="flex flex-col gap-4 lg:sticky lg:top-4">
                <EventDetail
                  e={selected}
                  target={selected ? resolveTarget(selected) : ""}
                  t={t}
                />
                <ActionBreakdown entries={accum} t={t} />
              </div>
            </div>
          </>
        )}
      </div>
    </ListView>
  );
}

AuditLogPage.displayName = "AuditLogPage";
