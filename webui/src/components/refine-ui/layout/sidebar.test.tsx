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
  getCachedMembership: () => [],
}));

vi.mock("@/hooks/use-active-company", () => ({
  useActiveCompany: vi.fn(),
}));

const team = vi.hoisted(() => ({ id: null as string | null }));
vi.mock("@/hooks/use-active-team", () => ({
  useActiveTeam: () => ({ activeTeamId: team.id }),
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

describe("Sidebar - branding", () => {
  beforeEach(() => {
    mockUseMenu.mockReturnValue({ menuItems: [], selectedKey: undefined });
    mockActive.mockReturnValue({
      activeCompanyId: null,
      setActiveCompanyId: vi.fn(),
      isSuperAdmin: false,
      source: "none",
    });
    mockUser.mockReturnValue(null);
    mockCompany.mockReturnValue(null);
  });

  it("shows the GO Feature Flag logo with its name on top", () => {
    renderSidebar();
    expect(screen.getByText("GO Feature Flag")).toBeInTheDocument();
  });
});

describe("Sidebar - Create", () => {
  beforeEach(() => {
    mockUseMenu.mockReturnValue({ menuItems: [], selectedKey: undefined });
    mockActive.mockReturnValue({
      activeCompanyId: null,
      setActiveCompanyId: vi.fn(),
      isSuperAdmin: false,
      source: "none",
    });
    mockUser.mockReturnValue({ isSuperAdmin: false });
    team.id = "team-1";
  });

  const tests = [
    { name: "links to the flag wizard for a team admin", role: "admin", teamId: "team-1", want: true },
    { name: "hides it for a plain member", role: "member", teamId: "team-1", want: false },
    { name: "hides it without an active team", role: "admin", teamId: null, want: false },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      mockCompany.mockReturnValue({ role: tt.role });
      team.id = tt.teamId;
      renderSidebar();
      const link = screen.queryByRole("link", { name: "Create flag" });
      if (tt.want) expect(link).toHaveAttribute("href", "/flags?create=1");
      else expect(link).not.toBeInTheDocument();
    });
  }
});
