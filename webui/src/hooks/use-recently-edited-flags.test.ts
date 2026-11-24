import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type PropsWithChildren } from "react";
import type { AuditEntry } from "@/types/api";

// useCustom responses keyed by URL path (audit scan / team flags); undefined = not loaded.
const state = vi.hoisted(() => ({
  responses: {} as Record<string, unknown>,
  urls: [] as string[],
}));

vi.mock("@refinedev/core", () => ({
  useGetIdentity: () => ({ data: { id: "u1" } }),
  useCustom: ({ url }: { url: string }) => {
    state.urls.push(url);
    const data = state.responses[new URL(url, "http://x").pathname.split("/").pop()!];
    return { query: { data: data && { data: { data } } } };
  },
}));
vi.mock("@/hooks/use-active-team", () => ({
  useActiveTeam: () => ({ activeTeamId: "t1" }),
}));

import {
  selectRecentlyEditedFlags,
  useInvalidateRecentlyEditedFlags,
  useRecentlyEditedFlags,
} from "./use-recently-edited-flags";

// Minimal AuditEntry factory — only the fields the selector reads matter.
function entry(
  action: string,
  flagId: string | null,
  id = 0,
  targetType = "flag",
): AuditEntry {
  return {
    id,
    occurredAt: "2026-01-01T00:00:00Z",
    action,
    flagId,
    targetType,
    targetId: flagId ?? "",
  };
}

const names = new Map<string, string>([
  ["f1", "flag-one"],
  ["f2", "flag-two"],
  ["f3", "flag-three"],
  ["f4", "flag-four"],
  ["f5", "flag-five"],
  ["f6", "flag-six"],
]);

describe("selectRecentlyEditedFlags", () => {
  it("keeps only flag edits (create/update/rollback)", () => {
    const entries = [
      entry("create", "f1"),
      entry("update", "f2"),
      entry("rollback", "f3"),
      entry("update", "f6"),
      entry("delete", "f4"),
      // A flagset event carrying a flagId is not a flag edit.
      entry("update", "f5", 0, "flagset"),
    ];
    expect(selectRecentlyEditedFlags(entries, names)).toEqual([
      { id: "f1", name: "flag-one" },
      { id: "f2", name: "flag-two" },
      { id: "f3", name: "flag-three" },
      { id: "f6", name: "flag-six" },
    ]);
  });

  it("dedupes by flag keeping the first (newest) occurrence and preserves order", () => {
    const entries = [
      entry("update", "f2"),
      entry("update", "f1"),
      entry("update", "f2"), // older duplicate of f2, ignored
      entry("create", "f1"), // older duplicate of f1, ignored
    ];
    expect(selectRecentlyEditedFlags(entries, names)).toEqual([
      { id: "f2", name: "flag-two" },
      { id: "f1", name: "flag-one" },
    ]);
  });

  it("drops entries without a flagId and flags missing from the name map", () => {
    const entries = [
      entry("update", null),
      entry("update", "unknown"),
      entry("create", "f1"),
    ];
    expect(selectRecentlyEditedFlags(entries, names)).toEqual([
      { id: "f1", name: "flag-one" },
    ]);
  });

  it("caps the result at the limit", () => {
    const entries = [
      entry("update", "f1"),
      entry("update", "f2"),
      entry("update", "f3"),
      entry("update", "f4"),
      entry("update", "f5"),
      entry("update", "f6"),
    ];
    const result = selectRecentlyEditedFlags(entries, names);
    expect(result).toHaveLength(5);
    expect(result.map((f) => f.id)).toEqual(["f1", "f2", "f3", "f4", "f5"]);
  });

  it("returns an empty array when there is no matching activity", () => {
    expect(selectRecentlyEditedFlags([], names)).toEqual([]);
    expect(
      selectRecentlyEditedFlags([entry("delete", "f1")], names),
    ).toEqual([]);
  });
});

describe("useInvalidateRecentlyEditedFlags", () => {
  it("invalidates the audit scan and the team-flags name map", () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useInvalidateRecentlyEditedFlags(), {
      wrapper,
    });
    result.current();

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["recently-edited-audit"],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["team-flags"] });
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});

describe("useRecentlyEditedFlags", () => {
  const flags = [
    { id: "f1", name: "flag-one" },
    { id: "f2", name: "flag-two" },
  ];
  const tests: { name: string; audit?: AuditEntry[]; flags?: unknown[]; want: unknown[] }[] = [
    { name: "audit not loaded", audit: undefined, flags, want: [] },
    { name: "no audit activity", audit: [], flags, want: [] },
    { name: "team flags not loaded", audit: [entry("update", "f1")], flags: undefined, want: [] },
    { name: "team without flags", audit: [entry("update", "f1")], flags: [], want: [] },
    {
      name: "maps the user's edits to flag names",
      audit: [entry("update", "f2"), entry("create", "f1")],
      flags,
      want: [
        { id: "f2", name: "flag-two" },
        { id: "f1", name: "flag-one" },
      ],
    },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      state.urls = [];
      state.responses = { audit: tt.audit, flags: tt.flags };
      const { result } = renderHook(() => useRecentlyEditedFlags());
      expect(result.current).toEqual(tt.want);
      expect(state.urls[0]).toContain("/audit?teamId=t1&actorId=u1&");
      expect(state.urls[1]).toContain("/teams/t1/flags?");
    });
  }
});
