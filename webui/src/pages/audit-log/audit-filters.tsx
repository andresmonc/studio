import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import type { Flagset } from "@/types/api";
import { FilterSelect } from "./filter-select";
import { ALL, type TranslateFn } from "./vocabulary";

const SCOPES = ["all", "flags", "flagsets", "teams", "keys"] as const;
const RANGES = ["7d", "30d", "90d"] as const;

// Filter bar: free-text search, scope segmented control, and the actor /
// flagset / date-range dropdowns. All state lives in the parent's URL params;
// this component just renders and calls back via setParam.
export function AuditFilters({
  search,
  scope,
  actor,
  flagset,
  range,
  setParam,
  actors,
  flagsets,
  dirty,
  clearFilters,
  t,
}: {
  search: string;
  scope: string;
  actor: string;
  flagset: string;
  range: string;
  setParam: (key: string, value: string, opts?: { replace?: boolean }) => void;
  actors: string[];
  flagsets: Flagset[];
  dirty: boolean;
  clearFilters: () => void;
  t: TranslateFn;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={search}
        onChange={(e) => setParam("q", e.target.value, { replace: true })}
        placeholder={t("auditLog.search")}
        className="h-9 w-full max-w-xs"
      />
      <Segmented
        className="h-9 flex-nowrap bg-background"
        value={scope}
        onChange={(v) => setParam("scope", v)}
        options={SCOPES.map((s) => ({
          value: s === "all" ? ALL : s,
          label: t(`auditLog.scope.${s}`),
        }))}
      />
      <FilterSelect
        value={actor}
        onChange={(v) => setParam("actor", v)}
        allLabel={t("auditLog.allActors")}
        options={actors.map((a) => ({ value: a, label: a.split("@")[0] }))}
      />
      <FilterSelect
        value={flagset}
        onChange={(v) => setParam("flagset", v)}
        allLabel={t("auditLog.allFlagsets")}
        options={flagsets.map((fs) => ({ value: fs.id, label: fs.name }))}
      />
      <FilterSelect
        value={range}
        onChange={(v) => setParam("range", v)}
        allLabel={t("auditLog.range.all")}
        options={RANGES.map((r) => ({
          value: r,
          label: t(`auditLog.range.${r}`),
        }))}
      />
      {dirty && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          {t("auditLog.clear")}
        </Button>
      )}
    </div>
  );
}
