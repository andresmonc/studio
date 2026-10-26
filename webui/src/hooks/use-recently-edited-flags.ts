import { useCallback, useMemo } from "react";
import { useCustom, useGetIdentity } from "@refinedev/core";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveTeam } from "@/hooks/use-active-team";
import { API_URL } from "@/providers/constants";
import type {
  AuditEntry,
  FlagInstance,
  PaginatedResponse,
  User,
} from "@/types/api";

// Audit actions that count as "editing" a flag (toggles and rollbacks are
// recorded as updates / rollbacks). Deletes are intentionally excluded — the
// flag no longer opens.
const EDIT_ACTIONS = new Set(["create", "update", "rollback"]);

export const RECENTLY_EDITED_LIMIT = 5;

// React Query keys the "Recently edited" list derives from. Exported so the
// reader hook and the invalidation hook below share one source of truth.
export const RECENTLY_EDITED_AUDIT_QUERY_KEY = "recently-edited-audit";
export const TEAM_FLAGS_QUERY_KEY = "team-flags";

// How many recent audit entries to scan when resolving distinct edited flags.
const AUDIT_SCAN_SIZE = 50;

export type RecentlyEditedFlag = { id: string; name: string };

// selectRecentlyEditedFlags reduces newest-first audit entries to the most
// recently edited distinct flags. Entries are expected already ordered
// `occurred_at DESC`, so the first occurrence of each flagId is its latest edit.
// Flags absent from `nameById` (deleted / out of scope) are dropped.
export function selectRecentlyEditedFlags(
  entries: AuditEntry[],
  nameById: Map<string, string>,
  limit: number = RECENTLY_EDITED_LIMIT,
): RecentlyEditedFlag[] {
  const out: RecentlyEditedFlag[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (!e.flagId || e.targetType !== "flag" || !EDIT_ACTIONS.has(e.action)) continue;
    if (seen.has(e.flagId)) continue;
    const name = nameById.get(e.flagId);
    if (name === undefined) continue;
    seen.add(e.flagId);
    out.push({ id: e.flagId, name });
    if (out.length >= limit) break;
  }
  return out;
}

// useRecentlyEditedFlags returns the current user's most recently edited flags
// (create / update / enable-disable) within the active team, newest first,
// capped at RECENTLY_EDITED_LIMIT. Returns an empty array when there is no
// active team, no identity, or no matching activity.
export function useRecentlyEditedFlags(): RecentlyEditedFlag[] {
  const { activeTeamId } = useActiveTeam();
  const { data: identity } = useGetIdentity<User>();
  const userId = identity?.id;

  const { query: auditQuery } = useCustom<PaginatedResponse<AuditEntry>>({
    url: `${API_URL}/audit?teamId=${activeTeamId}&actorId=${userId}&page=1&pageSize=${AUDIT_SCAN_SIZE}`,
    method: "get",
    queryOptions: {
      queryKey: [RECENTLY_EDITED_AUDIT_QUERY_KEY, activeTeamId, userId],
      enabled: !!activeTeamId && !!userId,
    },
  });

  // Resolves flag ids to display names.
  // ponytail: names resolved for the first 200 flags only (pageSize cap); add an ?ids= filter if teams outgrow it.
  const { query: flagsQuery } = useCustom<PaginatedResponse<FlagInstance>>({
    url: `${API_URL}/teams/${activeTeamId}/flags?pageSize=200`,
    method: "get",
    queryOptions: { queryKey: [TEAM_FLAGS_QUERY_KEY, activeTeamId], enabled: !!activeTeamId },
  });

  return useMemo(() => {
    const entries = auditQuery.data?.data?.data;
    if (!Array.isArray(entries) || entries.length === 0) return [];
    const nameById = new Map<string, string>();
    for (const f of flagsQuery.data?.data?.data ?? []) nameById.set(f.id, f.name);
    if (nameById.size === 0) return [];
    return selectRecentlyEditedFlags(entries, nameById);
  }, [auditQuery.data, flagsQuery.data]);
}

// useInvalidateRecentlyEditedFlags returns a callback that refreshes the sidebar
// "Recently edited" list. Call it in the onSuccess of any flag create / update /
// enable-disable. It invalidates the audit scan that orders the list and the
// team-flags name map (so a newly created flag can resolve its display name).
// Both queries are always mounted via useRecentlyEditedFlags, so invalidating
// refetches them immediately; keys are passed as prefixes, which React Query
// matches against the team/user-scoped variants.
export function useInvalidateRecentlyEditedFlags(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [RECENTLY_EDITED_AUDIT_QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: [TEAM_FLAGS_QUERY_KEY] });
  }, [queryClient]);
}
