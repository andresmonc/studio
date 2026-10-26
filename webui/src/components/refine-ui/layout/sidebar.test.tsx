import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Sidebar } from "./sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

vi.mock("@refinedev/core", () => ({
  useMenu: vi.fn(),
  useCustom: () => ({ query: { data: undefined } }),
  useGetIdentity: () => ({ data: undefined, isLoading: false }),
  useList: () => ({ result: { data: [] }, query: { isLoading: false } }),
  useLogout: () => ({ mutate: vi.fn(), isPending: false }),
  useTranslate: () => (key: string, defaultMessage?: string) =>
    defaultMessage ?? key,
  useLink: () => (props: { to: string; children: React.ReactNode }) => (
    <a href={props.to}>{props.children}</a>
  ),
  useRefineOptions: () => ({ title: { icon: null, text: "GO Feature Flag" } }),
}));

vi.mock("@/providers/auth", () => ({
  getCachedUser: vi.fn(),
  getCachedCompany: vi.fn(),
}));

vi.mock("@/hooks/use-active-company", () => ({
  useActiveCompany: vi.fn(),
}));

vi.mock("@/hooks/use-active-team", () => ({
  useActiveTeam: () => ({ activeTeamId: null }),
}));

vi.mock("@/components/team-switcher", () => ({
  TeamSwitcher: () => null,
}));

import { useMenu } from "@refinedev/core";
import { getCachedUser, getCachedCompany } from "@/providers/auth";
import { useActiveCompany } from "@/hooks/use-active-company";

const mockUseMenu = useMenu as unknown as ReturnType<typeof vi.fn>;
const mockUser = getCachedUser as unknown as ReturnType<typeof vi.fn>;
const mockCompany = getCachedCompany as unknown as ReturnType<typeof vi.fn>;
const mockActive = useActiveCompany as unknown as ReturnType<typeof vi.fn>;

const menuItems = [
  {
    key: "admin",
    name: "Admin",
    label: "Admin",
    meta: { label: "Admin", requiresSuperAdmin: true },
    children: [
      {
        key: "companies",
        name: "companies",
        route: "/companies",
        meta: { label: "Companies", parent: "Admin", requiresSuperAdmin: true },
        children: [],
      },
    ],
  },
];

function renderSidebar() {
  return render(
    <MemoryRouter>
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("Sidebar - Admin visibility", () => {
  beforeEach(() => {
    mockUseMenu.mockReturnValue({ menuItems, selectedKey: undefined });
    mockActive.mockReturnValue({
      activeCompanyId: null,
      setActiveCompanyId: vi.fn(),
      isSuperAdmin: false,
      source: "none",
    });
  });

  // The "Admin" group is intentionally hidden from the sidebar nav (see the
  // hiddenNames set in sidebar.tsx); super-admin actions are surfaced in the
  // user menu as "Manage companies" instead. So it stays hidden even for a
  // super admin.
  it("hides Admin group from the sidebar nav even for super admin", () => {
    mockUser.mockReturnValue({ isSuperAdmin: true });
    mockCompany.mockReturnValue(null);
    renderSidebar();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("hides Admin group for non-super admin", () => {
    mockUser.mockReturnValue({ isSuperAdmin: false });
    mockCompany.mockReturnValue({ role: "admin" });
    renderSidebar();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("hides everything when no user is cached", () => {
    mockUser.mockReturnValue(null);
    mockCompany.mockReturnValue(null);
    renderSidebar();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });
});
