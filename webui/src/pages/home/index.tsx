import { useMemo, useRef, useState } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { useCustom, useGetIdentity, useTranslate } from "@refinedev/core";
import { Link, useNavigate } from "react-router";
import { PlusIcon, SearchIcon } from "lucide-react";
import { ListView } from "@/components/refine-ui/views/list-view";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { useActiveTeam } from "@/hooks/use-active-team";
import { TEAM_FLAGS_QUERY_KEY } from "@/hooks/use-recently-edited-flags";
import { cn } from "@/lib/utils";
import { canWriteTeam } from "@/providers/access-control";
import { API_URL } from "@/providers/constants";
import type {
  AuditEntry,
  FlagInstance,
  Flagset,
  PaginatedResponse,
  User,
} from "@/types/api";
import { ActivityCard } from "./activity-card";
import { AttentionCard } from "./attention-card";
import { CARD_LIMIT, dayPart, firstName, flagTotals, staleVariation } from "./dashboard";
import { FlagsetsTable } from "./flagsets-table";
import { RolloutsCard } from "./rollouts-card";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// HomePage is the team dashboard at "/": headline numbers, what needs action,
// running rollouts, recent activity and the team's flagsets.
export function HomePage() {
  const t = useTranslate();
  const { data: identity } = useGetIdentity<User>();
  const { activeTeamId } = useActiveTeam();
  const enabled = !!activeTeamId;

  const { query: flagsetsQuery } = useCustom<Flagset[]>({
    url: `${API_URL}/teams/${activeTeamId}/flagsets`,
    method: "get",
    queryOptions: { queryKey: ["team-flagsets", activeTeamId], enabled },
  });
  // ponytail: stats cover the first 200 flags only (pageSize cap); move them to
  // a server-side summary if teams outgrow it. See TODOS.md.
  const { query: flagsQuery } = useCustom<PaginatedResponse<FlagInstance>>({
    url: `${API_URL}/teams/${activeTeamId}/flags?pageSize=200`,
    method: "get",
    queryOptions: { queryKey: [TEAM_FLAGS_QUERY_KEY, activeTeamId], enabled },
  });
  // Fixed per mount so the query key (and URL) stay stable across renders.
  const [weekAgo] = useState(() => new Date(Date.now() - WEEK_MS).toISOString());
  const { query: changesQuery } = useCustom<PaginatedResponse<AuditEntry>>({
    url: `${API_URL}/audit?teamId=${activeTeamId}&from=${encodeURIComponent(weekAgo)}&pageSize=1`,
    method: "get",
    queryOptions: { queryKey: ["home-changes", activeTeamId], enabled },
  });
  const { query: activityQuery } = useCustom<PaginatedResponse<AuditEntry>>({
    url: `${API_URL}/audit?teamId=${activeTeamId}&pageSize=${CARD_LIMIT}`,
    method: "get",
    queryOptions: { queryKey: ["home-activity", activeTeamId], enabled },
  });

  const flagsets = useMemo(
    () => (Array.isArray(flagsetsQuery.data?.data) ? flagsetsQuery.data!.data : []),
    [flagsetsQuery.data],
  );
  const flags = useMemo(() => flagsQuery.data?.data?.data ?? [], [flagsQuery.data]);
  const totals = flagTotals(flagsets);
  const stale = flags.filter((f) => staleVariation(f) !== undefined);
  const rollouts = flags.filter((f) => f.progressiveRollout);
  const unowned = flags.filter((f) => !f.ownerId);
  const attention = new Set([...stale, ...unowned].map((f) => f.id)).size;

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of flags) m.set(f.id, f.name);
    for (const fs of flagsets) m.set(fs.id, fs.name);
    return m;
  }, [flags, flagsets]);

  const name = firstName(identity?.name, identity?.email);
  const title = t(`home.greeting.${dayPart(new Date())}`, { name });

  if (!enabled) {
    return (
      <ListView>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <EmptyState>{t("home.noTeam")}</EmptyState>
      </ListView>
    );
  }

  const flagsLoaded = !flagsQuery.isLoading;
  return (
    <ListView className="gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {flagsLoaded && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("home.summaryRollouts", { count: rollouts.length })} ·{" "}
              {t("home.summaryAttention", { count: attention })}
            </p>
          )}
        </div>
        <JumpToFlag flags={flags} />
        {canWriteTeam(activeTeamId) && (
          <Button asChild>
            <Link to="/flags?create=1">
              <PlusIcon className="h-4 w-4" />
              {t("nav.create")}
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={t("home.stats.flags")}
          value={flagsetsQuery.isLoading ? undefined : totals.total}
          detail={t("home.stats.flagsDetail", totals)}
        />
        <Stat
          label={t("home.stats.rollouts")}
          value={flagsLoaded ? rollouts.length : undefined}
          detail={t("home.stats.rolloutsDetail")}
        />
        <Stat
          label={t("home.stats.changes")}
          value={changesQuery.data?.data?.total}
          detail={t("home.stats.changesDetail")}
        />
        <Stat
          label={t("home.stats.stale")}
          value={flagsLoaded ? stale.length : undefined}
          detail={t("home.stats.staleDetail")}
          warn={stale.length > 0}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <AttentionCard stale={stale} unowned={unowned.length} count={attention} />
        <RolloutsCard rollouts={rollouts} />
        <ActivityCard entries={activityQuery.data?.data?.data ?? []} nameById={nameById} />
        <FlagsetsTable flagsets={flagsets} />
      </div>
    </ListView>
  );
}

function Stat({
  label,
  value,
  detail,
  warn = false,
}: {
  label: string;
  value?: number;
  detail: string;
  warn?: boolean;
}) {
  return (
    <Card className="gap-1 px-5 py-4">
      <div className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("text-3xl font-bold tabular-nums", warn && "text-warning")}>
        {value ?? "–"}
      </div>
      <div className="text-xs text-muted-foreground">{detail}</div>
    </Card>
  );
}

// JumpToFlag suggests the team's flags by name; the last row hands the query to
// the flags list, which already filters on ?search=. Same cmdk setup as TagInput:
// we filter, cmdk only supplies the roving highlight and Enter-selects.
function JumpToFlag({ flags }: { flags: FlagInstance[] }) {
  const t = useTranslate();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const s = q.trim();
  const needle = s.toLowerCase();
  const matches = needle
    ? flags.filter((f) => f.name.toLowerCase().includes(needle)).slice(0, 8)
    : [];

  return (
    <CommandPrimitive
      role="search"
      label={t("home.jump")}
      shouldFilter={false}
      className="relative w-64"
    >
      <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <CommandPrimitive.Input
        asChild
        value={q}
        onValueChange={(next) => {
          setQ(next);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so a mousedown on a dropdown item still registers.
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <Input placeholder={t("home.jump")} className="pl-8" />
      </CommandPrimitive.Input>
      {open && s ? (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- mouse-only focus guard; keyboard selection goes through cmdk
        <div
          className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md"
          onMouseDown={(e) => {
            // Keep the input focused through the click.
            e.preventDefault();
            clearTimeout(blurTimer.current);
          }}
        >
          <CommandList className="max-h-72">
            <CommandGroup>
              {matches.map((f) => (
                <CommandItem key={f.id} value={f.id} onSelect={() => navigate(`/flags/${f.id}`)}>
                  <span className="truncate font-mono">{f.name}</span>
                </CommandItem>
              ))}
              <CommandItem
                value="__search_all__"
                onSelect={() => navigate(`/flags?search=${encodeURIComponent(s)}`)}
              >
                <SearchIcon />
                <span className="truncate">{t("home.jumpAll", { q: s })}</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </div>
      ) : (
        // cmdk always points the input's aria-controls at its list; keep an
        // empty one mounted so that reference resolves while closed.
        <CommandList hidden />
      )}
    </CommandPrimitive>
  );
}

HomePage.displayName = "HomePage";
