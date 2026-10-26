import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createElement, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CompanyMembership } from "@/types/api";

const state = vi.hoisted(() => ({
  isSuperAdmin: false,
  company: null as CompanyMembership | null,
}));

vi.mock("@refinedev/core", () => ({
  useGetIdentity: () => ({ data: { isSuperAdmin: state.isSuperAdmin } }),
}));
vi.mock("@/providers/auth", () => ({
  getCachedCompany: () => state.company,
}));

import { ActiveCompanyProvider, useActiveCompany } from "./use-active-company";

const membership: CompanyMembership = {
  companyId: "own",
  companyDisplayName: "Own",
  role: "admin",
};

function setup() {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(
      QueryClientProvider,
      { client },
      createElement(ActiveCompanyProvider, null, children),
    );
  return { ...renderHook(() => useActiveCompany(), { wrapper }), invalidate };
}

describe("useActiveCompany", () => {
  beforeEach(() => {
    localStorage.clear();
    state.isSuperAdmin = false;
    state.company = null;
  });

  const tests: {
    name: string;
    isSuperAdmin: boolean;
    stored: string | null;
    company: CompanyMembership | null;
    wantId: string | null;
    wantSource: "super-admin" | "membership" | "none";
  }[] = [
    { name: "super admin uses the stored pick", isSuperAdmin: true, stored: "picked", company: membership, wantId: "picked", wantSource: "super-admin" },
    { name: "super admin falls back to own company", isSuperAdmin: true, stored: null, company: membership, wantId: "own", wantSource: "membership" },
    { name: "member ignores the stored pick", isSuperAdmin: false, stored: "picked", company: membership, wantId: "own", wantSource: "membership" },
    { name: "no company at all", isSuperAdmin: false, stored: null, company: null, wantId: null, wantSource: "none" },
  ];

  for (const tt of tests) {
    it(tt.name, () => {
      state.isSuperAdmin = tt.isSuperAdmin;
      state.company = tt.company;
      if (tt.stored) localStorage.setItem("activeCompanyId", tt.stored);
      const { result } = setup();
      expect(result.current.activeCompanyId).toBe(tt.wantId);
      expect(result.current.source).toBe(tt.wantSource);
      expect(result.current.isSuperAdmin).toBe(tt.isSuperAdmin);
    });
  }

  it("setActiveCompanyId persists, re-renders and invalidates access queries", () => {
    state.isSuperAdmin = true;
    const { result, invalidate } = setup();

    act(() => result.current.setActiveCompanyId("c9"));
    expect(localStorage.getItem("activeCompanyId")).toBe("c9");
    expect(result.current.activeCompanyId).toBe("c9");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["access"] });

    act(() => result.current.setActiveCompanyId(null));
    expect(localStorage.getItem("activeCompanyId")).toBeNull();
    expect(result.current.activeCompanyId).toBeNull();
  });

  it("picks up changes made in another tab via the storage event", () => {
    state.isSuperAdmin = true;
    const { result } = setup();
    localStorage.setItem("activeCompanyId", "other-tab");
    act(() => {
      window.dispatchEvent(new Event("storage"));
    });
    expect(result.current.activeCompanyId).toBe("other-tab");
  });

  it("throws outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useActiveCompany())).toThrow(
      "useActiveCompany must be used inside ActiveCompanyProvider",
    );
    spy.mockRestore();
  });
});
