import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createElement, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TeamMembership } from "@/types/api";

const state = vi.hoisted(() => ({
  membership: null as TeamMembership[] | null,
}));

vi.mock("@/providers/auth", () => ({
  getCachedMembership: () => state.membership,
}));

import { ActiveTeamProvider, useActiveTeam } from "./use-active-team";

const team = (teamId: string): TeamMembership => ({
  teamId,
  teamName: teamId,
  role: "viewer",
});

function setup() {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(
      QueryClientProvider,
      { client },
      createElement(ActiveTeamProvider, null, children),
    );
  return { ...renderHook(() => useActiveTeam(), { wrapper }), invalidate };
}

describe("useActiveTeam", () => {
  beforeEach(() => {
    localStorage.clear();
    state.membership = null;
  });

  const tests: {
    name: string;
    stored: string | null;
    membership: TeamMembership[] | null;
    wantId: string | null;
    wantMemberships: TeamMembership[];
  }[] = [
    { name: "stored pick wins", stored: "t9", membership: [team("t1")], wantId: "t9", wantMemberships: [team("t1")] },
    { name: "falls back to the first membership", stored: null, membership: [team("t1"), team("t2")], wantId: "t1", wantMemberships: [team("t1"), team("t2")] },
    { name: "no membership cached", stored: null, membership: null, wantId: null, wantMemberships: [] },
  ];

  for (const tt of tests) {
    it(tt.name, () => {
      state.membership = tt.membership;
      if (tt.stored) localStorage.setItem("activeTeamId", tt.stored);
      const { result } = setup();
      expect(result.current.activeTeamId).toBe(tt.wantId);
      expect(result.current.memberships).toEqual(tt.wantMemberships);
    });
  }

  it("setActiveTeamId persists, re-renders and invalidates access queries", () => {
    state.membership = [team("t1")];
    const { result, invalidate } = setup();

    act(() => result.current.setActiveTeamId("t2"));
    expect(localStorage.getItem("activeTeamId")).toBe("t2");
    expect(result.current.activeTeamId).toBe("t2");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["access"] });

    act(() => result.current.setActiveTeamId(null));
    expect(localStorage.getItem("activeTeamId")).toBeNull();
    expect(result.current.activeTeamId).toBe("t1");
  });

  it("picks up changes made in another tab via the storage event", () => {
    const { result } = setup();
    localStorage.setItem("activeTeamId", "other-tab");
    act(() => {
      window.dispatchEvent(new Event("storage"));
    });
    expect(result.current.activeTeamId).toBe("other-tab");
  });

  it("throws outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useActiveTeam())).toThrow(
      "useActiveTeam must be used inside ActiveTeamProvider",
    );
    spy.mockRestore();
  });
});
