import { useEffect, useMemo, useState } from "react";
import { useCustom, useCustomMutation, useTranslate } from "@refinedev/core";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { ListView } from "@/components/views/list-view";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTablePagination } from "@/components/views/data-table-pagination";
import { DistributionBar } from "@/components/flags/display/distribution-bar";
import { ProgressiveIndicator } from "@/components/flags/display/progressive-indicator";
import { useActiveTeam } from "@/hooks/use-active-team";
import { useInvalidateRecentlyEditedFlags } from "@/hooks/use-recently-edited-flags";
import { canEditTeam, effectiveTeamRole } from "@/providers/access-control";
import { API_URL } from "@/providers/constants";
import { errMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { formatExactDateTime, formatRelativeTime } from "@/lib/relative-time";
import { FlagWizard } from "./flag-wizard";
import { TagFilter } from "./tag-filter";
import type { FlagInstance, FlagOwner, Flagset, PaginatedResponse } from "@/types/api";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

const ALL = "__all__";
const UNASSIGNED = "__unassigned__";
const DEFAULT_PAGE_SIZE = 50;
const TYPES = ["boolean", "string", "int", "float", "json"] as const;
// Shared small-caps styling for the table column headers.
const HEAD = "text-xs font-medium uppercase tracking-wider text-muted-foreground";
// Single source for the enable/disable filter: drives both the query-param
// validation set and the rendered dropdown options so they can't drift apart.
const STATES = [
  { value: "enabled", labelKey: "flag.enabledLabel" },
  { value: "disabled", labelKey: "flag.disabledLabel" },
] as const;
const STATE_VALUES = STATES.map((s) => s.value);
// Server-side sort keys, each with its default direction (first click).
// Must match model.TeamFlagSorts.
const SORTS = { updated: "desc", name: "asc", state: "asc" } as const;
type SortKey = keyof typeof SORTS;
type Order = "asc" | "desc";
const DEFAULT_SORT: SortKey = "updated";

// Returns the value when it is in the allowed set, otherwise falls back to ALL.
// Used to silently ignore unknown/invalid query-param values.
const pick = (v: string | null, allowed: readonly string[]) =>
  v && allowed.includes(v) ? v : ALL;

export function FlagsPage() {
  const t = useTranslate();
  const navigate = useNavigate();
  const { activeTeamId } = useActiveTeam();

  // Filters and paging are driven by URL query params so a filtered view is
  // shareable, bookmarkable, and restorable via the browser Back button.
  const [searchParams, setSearchParams] = useSearchParams();
  // Active tag filters: comma-separated in `?tags=`, matched with AND semantics.
  const activeTags = useMemo(() => {
    const raw = searchParams.get("tags");
    return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  }, [searchParams]);
  const tagsKey = activeTags.join(",");

  // Unknown type/state values silently fall back to ALL. flagset/owner go to the
  // server as-is: an unknown one simply matches nothing.
  const search = searchParams.get("search") ?? "";
  const flagset = searchParams.get("flagset") || ALL;
  const type = pick(searchParams.get("type"), TYPES);
  const owner = searchParams.get("owner") || ALL;
  const state = pick(searchParams.get("state"), STATE_VALUES);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Number(searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE;
  const rawSort = searchParams.get("sort");
  const sort: SortKey = rawSort && Object.hasOwn(SORTS, rawSort) ? (rawSort as SortKey) : DEFAULT_SORT;
  const rawOrder = searchParams.get("order");
  const order: Order =
    rawOrder === "asc" || rawOrder === "desc" ? rawOrder : SORTS[sort];

  // Debounce the search box so typing doesn't fire a request per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Every filter and the page are applied server-side.
  const serverQS = new URLSearchParams(
    Object.entries({
      tags: tagsKey,
      name: debouncedSearch,
      flagsetId: flagset === ALL ? "" : flagset,
      type: type === ALL ? "" : type,
      owner: owner === ALL ? "" : owner,
      disabled: state === ALL ? "" : String(state === "disabled"),
      sort: sort === DEFAULT_SORT ? "" : sort,
      order: order === SORTS[sort] ? "" : order,
      page: String(page),
      pageSize: String(pageSize),
    }).filter(([, v]) => v),
  ).toString();
  const { query } = useCustom<PaginatedResponse<FlagInstance>>({
    url: `${API_URL}/teams/${activeTeamId}/flags?${serverQS}`,
    method: "get",
    queryOptions: {
      queryKey: ["team-flags", activeTeamId, serverQS],
      enabled: !!activeTeamId,
      // Keep the current page on screen while the next one loads.
      placeholderData: keepPreviousData,
    },
  });
  const flags = query.data?.data?.data ?? [];
  const total = query.data?.data?.total ?? 0;
  const pageCount = Math.max(1, query.data?.data?.totalPages ?? 1);

  // Filter options come from the team, not the current page of rows.
  const { query: flagsetsQuery } = useCustom<Flagset[]>({
    url: `${API_URL}/teams/${activeTeamId}/flagsets`,
    method: "get",
    queryOptions: { queryKey: ["team-flagsets", activeTeamId], enabled: !!activeTeamId },
  });
  const flagsets = useMemo(
    () =>
      (Array.isArray(flagsetsQuery.data?.data) ? flagsetsQuery.data!.data : [])
        .map((fs) => ({ id: fs.id, name: fs.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [flagsetsQuery.data],
  );
  const { query: ownersQuery } = useCustom<FlagOwner[]>({
    url: `${API_URL}/teams/${activeTeamId}/owners`,
    method: "get",
    queryOptions: { queryKey: ["team-owners", activeTeamId], enabled: !!activeTeamId },
  });
  const owners = Array.isArray(ownersQuery.data?.data) ? ownersQuery.data!.data : [];

  // Team tag registry (all tags in the team) — the source for both the filter
  // combobox and the create/edit autocomplete.
  const { query: teamTagsQuery } = useCustom<string[]>({
    url: `${API_URL}/teams/${activeTeamId}/tags`,
    method: "get",
    queryOptions: { queryKey: ["team-tags", activeTeamId], enabled: !!activeTeamId },
  });
  const tagSuggestions = useMemo(
    () =>
      Array.isArray(teamTagsQuery.data?.data)
        ? teamTagsQuery.data!.data.filter((x): x is string => typeof x === "string")
        : [],
    [teamTagsQuery.data],
  );

  const canToggle =
    !!activeTeamId &&
    (canEditTeam(activeTeamId) || effectiveTeamRole(activeTeamId) === "editor");

  const { mutate } = useCustomMutation();
  const invalidateRecentlyEdited = useInvalidateRecentlyEditedFlags();

  const setParam = (key: string, value: string, opts?: { replace?: boolean }) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!value || value === ALL) next.delete(key); // keep the URL clean
        else next.set(key, value);
        // Any filter change starts over from the first page.
        if (key !== "page") next.delete("page");
        return next;
      },
      { replace: opts?.replace },
    );
  };

  // Same column flips the direction; a new column starts at its default.
  // Defaults are dropped from the URL, and the page resets.
  const toggleSort = (key: SortKey) => {
    const nextOrder: Order =
      key === sort ? (order === "asc" ? "desc" : "asc") : SORTS[key];
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (key === DEFAULT_SORT) next.delete("sort");
      else next.set("sort", key);
      if (nextOrder === SORTS[key]) next.delete("order");
      else next.set("order", nextOrder);
      next.delete("page");
      return next;
    });
  };
  const sortProps = (key: SortKey) => ({
    active: sort === key ? order : undefined,
    onClick: () => toggleSort(key),
  });

  const [pendingToggle, setPendingToggle] = useState<FlagInstance | null>(null);

  const toggleTag = (tag: string) => {
    const next = activeTags.includes(tag)
      ? activeTags.filter((tg) => tg !== tag)
      : [...activeTags, tag];
    setParam("tags", next.join(","));
  };

  const onToggle = (f: FlagInstance) => setPendingToggle(f);

  const confirmToggle = (f: FlagInstance) => {
    mutate(
      {
        url: `${API_URL}/flags/${f.id}/disable`,
        method: "post",
        values: { disabled: !f.disabled },
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => {
          toast.success(
            f.disabled ? t("flag.enabled") : t("flag.disabled"),
          );
          query.refetch();
          invalidateRecentlyEdited();
          setPendingToggle(null);
        },
        onError: (err) => {
          toast.error(t("flag.toggleError"), { description: errMessage(err) });
          setPendingToggle(null);
        },
      },
    );
  };

  const clearFilters = () => setSearchParams({}, { replace: true });
  const dirty =
    search !== "" ||
    flagset !== ALL ||
    type !== ALL ||
    owner !== ALL ||
    state !== ALL ||
    activeTags.length > 0;

  return (
    <ListView>
      <div className="flex flex-col gap-4">
        <PageHeader
          breadcrumb={[{ label: t("flag.title") }]}
          title={t("flag.title")}
          description={t("flag.subtitle", { total, flagsets: flagsets.length })}
        >
          {activeTeamId && canToggle && (
            <FlagWizard
              teamId={activeTeamId}
              onCreated={() => {
                query.refetch();
                ownersQuery.refetch();
              }}
              tagSuggestions={tagSuggestions}
              autoOpen={searchParams.get("create") === "1"}
              onClosed={() => setParam("create", "", { replace: true })}
            />
          )}
        </PageHeader>

        {!activeTeamId ? (
          <EmptyState>
            {t("flag.noTeam")}
          </EmptyState>
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={search}
                onChange={(e) => setParam("search", e.target.value, { replace: true })}
                placeholder={t("flag.search")}
                className="h-9 w-full max-w-xs"
              />
              <FilterSelect
                value={flagset}
                onChange={(v) => setParam("flagset", v)}
                allLabel={t("flag.allFlagsets")}
                options={flagsets.map((fs) => ({ value: fs.id, label: fs.name }))}
              />
              <FilterSelect
                value={type}
                onChange={(v) => setParam("type", v)}
                allLabel={t("flag.allTypes")}
                options={TYPES.map((ty) => ({ value: ty, label: ty }))}
              />
              <FilterSelect
                value={owner}
                onChange={(v) => setParam("owner", v)}
                allLabel={t("flag.allOwners")}
                options={[
                  { value: UNASSIGNED, label: t("flag.unassigned") },
                  ...owners.map((o) => ({ value: o.id, label: o.name || o.id })),
                ]}
              />
              <FilterSelect
                value={state}
                onChange={(v) => setParam("state", v)}
                allLabel={t("flag.allStates")}
                options={STATES.map((s) => ({
                  value: s.value,
                  label: t(s.labelKey),
                }))}
              />
              {(tagSuggestions.length > 0 || activeTags.length > 0) && (
                <TagFilter
                  allTags={tagSuggestions}
                  selected={activeTags}
                  onToggle={toggleTag}
                />
              )}
              {dirty && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  {t("flag.clear")}
                </Button>
              )}
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead className="w-14" {...sortProps("state")}>
                        {t("flag.state")}
                      </SortableHead>
                      <SortableHead className="w-72" {...sortProps("name")}>
                        {t("flag.flag")}
                      </SortableHead>
                      <TableHead className={cn(HEAD, "w-44")}>
                        {t("flag.inFlagset")}
                      </TableHead>
                      <TableHead className={cn(HEAD, "w-24")}>
                        {t("flag.type")}
                      </TableHead>
                      <TableHead className={cn(HEAD, "w-56")}>
                        {t("flag.distribution")}
                      </TableHead>
                      <TableHead className={cn(HEAD, "w-32")}>
                        {t("flag.targeting")}
                      </TableHead>
                      <SortableHead className="w-44" {...sortProps("updated")}>
                        {t("flag.updated")}
                      </SortableHead>
                    </TableRow>
                  </TableHeader>
                  {query.isLoading && (
                    <TableBody>
                      <TableRow>
                        <TableCell colSpan={7}>{t("common.loading")}</TableCell>
                      </TableRow>
                    </TableBody>
                  )}
                  {!query.isLoading && flags.length === 0 && (
                    <TableBody>
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-muted-foreground"
                        >
                          {t("flag.empty")}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  )}
                  {flags.map((f) => {
                    // Modifier-clicks fall through to the name <Link>
                    // (open-in-new-tab) instead of hijacking them into SPA nav.
                    const onRowClick = (e: React.MouseEvent) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                      navigate(`/flags/${f.id}`);
                    };
                    const hasTags = Boolean(f.tags?.length);
                    // Each flag is its own <tbody> group so its data row and its
                    // full-width tags row share one hover highlight and read as a
                    // single unit.
                    return (
                      <TableBody key={f.id} className="group">
                        <TableRow
                          onClick={onRowClick}
                          className={cn(
                            "cursor-pointer hover:bg-muted group-hover:bg-muted",
                            hasTags && "border-b-0",
                          )}
                        >
                          <TableCell
                            className="py-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Switch
                              checked={!f.disabled}
                              disabled={!canToggle}
                              onCheckedChange={() => onToggle(f)}
                              aria-label={t("flag.state")}
                            />
                          </TableCell>
                          <TableCell className={cn("py-3", f.disabled && "opacity-50")}>
                            <Link
                              to={`/flags/${f.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-mono text-sm font-medium hover:text-primary hover:underline"
                            >
                              {f.name}
                            </Link>
                          </TableCell>
                          <TableCell className={cn("py-3", f.disabled && "opacity-50")}>
                            <span className="flex items-center gap-2">
                              <span className="h-2 w-2 shrink-0 rounded-sm bg-primary" />
                              <span className="text-sm">{f.flagsetName}</span>
                            </span>
                          </TableCell>
                          <TableCell className={cn("py-3", f.disabled && "opacity-50")}>
                            <Badge
                              variant="secondary"
                              className="font-mono text-2xs font-normal"
                            >
                              {f.type}
                            </Badge>
                          </TableCell>
                          <TableCell className={cn("py-3", f.disabled && "opacity-50")}>
                            {f.variations?.length &&
                            f.distribution &&
                            Object.keys(f.distribution).length ? (
                              <DistributionBar
                                variations={f.variations}
                                percentages={f.distribution}
                                className="w-40"
                              />
                            ) : f.progressiveRollout ? (
                              <ProgressiveIndicator
                                variations={f.variations ?? []}
                                initialVariation={
                                  f.progressiveRollout.initialVariation
                                }
                                endVariation={f.progressiveRollout.endVariation}
                                title={`${t("flag.detail.progressive")}: ${t(
                                  "flag.detail.progressiveRange",
                                  {
                                    from: f.progressiveRollout.from,
                                    to: f.progressiveRollout.to,
                                  },
                                )}`}
                              />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "py-3 text-sm text-muted-foreground",
                              f.disabled && "opacity-50",
                            )}
                          >
                            {f.targetingRuleCount
                              ? t("flag.rulesCount", {
                                  count: f.targetingRuleCount,
                                })
                              : t("flag.rulesCountNone")}
                          </TableCell>
                          <TableCell className={cn("py-3", f.disabled && "opacity-50")}>
                            <div className="flex flex-col">
                              <span
                                className="text-sm"
                                title={formatExactDateTime(f.updatedAt)}
                              >
                                {formatRelativeTime(f.updatedAt)}
                              </span>
                              {f.owner && (
                                <span className="text-xs text-muted-foreground">
                                  {f.owner}
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {hasTags ? (
                          <TableRow
                            onClick={onRowClick}
                            className="cursor-pointer hover:bg-muted group-hover:bg-muted"
                          >
                            <TableCell className="py-0" />
                            <TableCell
                              colSpan={6}
                              className={cn("pb-2 pt-0", f.disabled && "opacity-50")}
                            >
                              <div className="-mt-2.5 flex flex-wrap gap-1">
                                {f.tags?.map((tag) => {
                                  const active = activeTags.includes(tag);
                                  return (
                                    <Badge
                                      key={tag}
                                      variant={active ? "default" : "outline"}
                                      className="cursor-pointer font-normal hover:bg-primary hover:text-primary-foreground"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleTag(tag);
                                      }}
                                      title={t("flag.filterByTag", { tag })}
                                    >
                                      {tag}
                                    </Badge>
                                  );
                                })}
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    );
                  })}
                </Table>
              </CardContent>
            </Card>
            {total > 0 && (
              <DataTablePagination
                currentPage={page}
                pageCount={pageCount}
                setCurrentPage={(p) => setParam("page", p > 1 ? String(p) : "")}
                pageSize={pageSize}
                setPageSize={(n) =>
                  setParam("pageSize", n === DEFAULT_PAGE_SIZE ? "" : String(n))
                }
              />
            )}
          </>
        )}
      </div>
      <AlertDialog
        open={pendingToggle !== null}
        onOpenChange={(open) => !open && setPendingToggle(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingToggle?.disabled
                ? t("flag.confirmToggle.enableTitle")
                : t("flag.confirmToggle.disableTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingToggle?.disabled
                ? t("flag.confirmToggle.enableDesc", { name: pendingToggle?.name })
                : t("flag.confirmToggle.disableDesc", { name: pendingToggle?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={
                pendingToggle && !pendingToggle.disabled
                  ? buttonVariants({ variant: "destructive" })
                  : undefined
              }
              onClick={() => pendingToggle && confirmToggle(pendingToggle)}
            >
              {t("flag.confirmToggle.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ListView>
  );
}

FlagsPage.displayName = "FlagsPage";

// SortableHead is a column header that toggles the server-side sort; the
// icons mirror DataTableSorter (which needs a tanstack Column we don't have).
function SortableHead({
  active,
  onClick,
  className,
  children,
}: {
  active?: Order;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const Icon = active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <TableHead
      className={cn(HEAD, className)}
      aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : undefined}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={onClick}
        className="-ml-2 h-7 gap-1 px-2 text-xs uppercase tracking-wider text-muted-foreground has-[>svg]:px-2 hover:text-foreground"
      >
        {children}
        <Icon
          className={cn("size-3", active ? "text-primary" : "text-muted-foreground/60")}
        />
      </Button>
    </TableHead>
  );
}

function FilterSelect({
  value,
  onChange,
  allLabel,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[160px] text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
