import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Company } from "@/types/api";

const state = vi.hoisted(() => ({
  companies: [] as Partial<Company>[],
  isLoading: false,
  activeCompanyId: null as string | null,
  isSuperAdmin: true,
  setActiveCompanyId: vi.fn(),
  useList: vi.fn(),
}));

vi.mock("@refinedev/core", () => ({
  useGetIdentity: () => ({ data: { isSuperAdmin: state.isSuperAdmin } }),
  useList: () => {
    state.useList();
    return {
      result: { data: state.companies },
      query: { isLoading: state.isLoading },
    };
  },
  useTranslate: () => (key: string) => key,
}));
vi.mock("@/hooks/use-active-company", () => ({
  useActiveCompany: () => ({
    activeCompanyId: state.activeCompanyId,
    setActiveCompanyId: state.setActiveCompanyId,
    isSuperAdmin: state.isSuperAdmin,
  }),
}));
vi.mock("@/providers/ui-config", () => ({ isMonoCompany: vi.fn() }));

import { isMonoCompany } from "@/providers/ui-config";
import { CompanySwitcher } from "./company-switcher";

const mockMono = isMonoCompany as unknown as ReturnType<typeof vi.fn>;
const acme = { id: "c1", displayName: "Acme" };
const globex = { id: "c2", displayName: "Globex" };

describe("CompanySwitcher", () => {
  beforeEach(() => {
    Object.assign(state, {
      companies: [],
      isLoading: false,
      activeCompanyId: null,
      isSuperAdmin: true,
    });
    state.useList.mockClear();
    state.setActiveCompanyId.mockClear();
    mockMono.mockReturnValue(false);
  });

  it("is hidden and fetches nothing in mono company mode", () => {
    mockMono.mockReturnValue(true);
    const { container } = render(<CompanySwitcher />);
    expect(container).toBeEmptyDOMElement();
    expect(state.useList).not.toHaveBeenCalled();
  });

  it("is hidden for a non super admin", () => {
    state.isSuperAdmin = false;
    const { container } = render(<CompanySwitcher />);
    expect(container).toBeEmptyDOMElement();
  });

  const menuTests: {
    name: string;
    companies: Partial<Company>[];
    isLoading: boolean;
    activeCompanyId: string | null;
    wantLabel: string;
    wantItems: string[];
    absentItems: string[];
  }[] = [
    {
      name: "loading",
      companies: [],
      isLoading: true,
      activeCompanyId: null,
      wantLabel: "company.switcher.select",
      wantItems: ["common.loading"],
      absentItems: ["company.switcher.none", "company.switcher.clear"],
    },
    {
      name: "no companies",
      companies: [],
      isLoading: false,
      activeCompanyId: null,
      wantLabel: "company.switcher.select",
      wantItems: ["company.switcher.none"],
      absentItems: ["common.loading", "company.switcher.clear"],
    },
    {
      name: "a selected company",
      companies: [acme, globex],
      isLoading: false,
      activeCompanyId: "c2",
      wantLabel: "Globex",
      wantItems: ["Acme", "company.switcher.clear"],
      absentItems: ["company.switcher.none"],
    },
  ];

  for (const tt of menuTests) {
    it(`menu shows ${tt.name}`, async () => {
      Object.assign(state, {
        companies: tt.companies,
        isLoading: tt.isLoading,
        activeCompanyId: tt.activeCompanyId,
      });
      render(<CompanySwitcher />);
      const trigger = screen.getByRole("button", { name: tt.wantLabel });
      await userEvent.click(trigger);
      for (const item of tt.wantItems) {
        expect(screen.getByRole("menuitem", { name: item })).toBeInTheDocument();
      }
      for (const item of tt.absentItems) {
        expect(screen.queryByRole("menuitem", { name: item })).toBeNull();
      }
    });
  }

  const clickTests: { name: string; item: string; want: string | null }[] = [
    { name: "picking a company activates it", item: "Acme", want: "c1" },
    { name: "clear resets the selection", item: "company.switcher.clear", want: null },
  ];

  for (const tt of clickTests) {
    it(tt.name, async () => {
      Object.assign(state, { companies: [acme, globex], activeCompanyId: "c2" });
      render(<CompanySwitcher />);
      await userEvent.click(screen.getByRole("button", { name: "Globex" }));
      await userEvent.click(screen.getByRole("menuitem", { name: tt.item }));
      expect(state.setActiveCompanyId).toHaveBeenCalledWith(tt.want);
    });
  }

  it("clears a stale active company that is no longer listed", () => {
    Object.assign(state, { companies: [acme], activeCompanyId: "gone" });
    render(<CompanySwitcher />);
    expect(state.setActiveCompanyId).toHaveBeenCalledWith(null);
  });

  it("keeps the active company while the list is loading", () => {
    Object.assign(state, { isLoading: true, activeCompanyId: "c1" });
    render(<CompanySwitcher />);
    expect(state.setActiveCompanyId).not.toHaveBeenCalled();
  });
});
