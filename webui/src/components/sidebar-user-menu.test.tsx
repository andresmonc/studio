import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { CompanyMembership, TeamMembership, User } from "@/types/api";
import { SidebarProvider } from "./ui/sidebar";

const state = vi.hoisted(() => ({
  user: null as Partial<User> | null,
  isLoading: false,
  company: null as Partial<CompanyMembership> | null,
  membership: [] as TeamMembership[],
  activeTeamId: null as string | null,
  mono: false,
  isLoggingOut: false,
  logout: vi.fn(),
}));

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useGetIdentity: () => ({ data: state.user, isLoading: state.isLoading }),
  useLogout: () => ({ mutate: state.logout, isPending: state.isLoggingOut }),
}));
vi.mock("@/providers/auth", () => ({
  getCachedUser: () => state.user,
  getCachedCompany: () => state.company,
  getCachedMembership: () => state.membership,
}));
vi.mock("@/providers/ui-config", () => ({ isMonoCompany: () => state.mono }));
vi.mock("@/hooks/use-active-team", () => ({
  useActiveTeam: () => ({ activeTeamId: state.activeTeamId }),
}));
vi.mock("@/components/refine-ui/theme/theme-switcher", () => ({
  ThemeSwitcher: () => null,
}));

import { SidebarUserMenu } from "./sidebar-user-menu";

const ada: Partial<User> = {
  id: "u1",
  name: "Ada Lovelace",
  email: "ada@acme.dev",
  avatar: "https://example.com/ada.png",
  isSuperAdmin: false,
};

function renderMenu(open = true) {
  return render(
    <MemoryRouter>
      <SidebarProvider defaultOpen={open}>
        <SidebarUserMenu />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  Object.assign(state, {
    user: ada,
    isLoading: false,
    company: null,
    membership: [],
    activeTeamId: null,
    mono: false,
    isLoggingOut: false,
  });
  state.logout.mockClear();
});

describe("SidebarUserMenu", () => {
  it.each([
    { name: "loading", isLoading: true, user: ada },
    { name: "no identity", isLoading: false, user: null },
  ])("shows a placeholder while $name", (s) => {
    Object.assign(state, s);
    renderMenu();
    expect(screen.queryByRole("button")).toBeNull();
  });

  const triggerTests: {
    name: string;
    user: Partial<User>;
    company?: Partial<CompanyMembership>;
    membership?: TeamMembership[];
    wantName: string;
    wantRole: string;
  }[] = [
    { name: "super admin", user: { ...ada, isSuperAdmin: true }, wantName: "Ada Lovelace", wantRole: "profile.superAdmin" },
    { name: "company role", user: ada, company: { role: "admin" }, wantName: "Ada Lovelace", wantRole: "Admin" },
    {
      name: "active team role",
      user: ada,
      membership: [{ teamId: "t1", teamName: "Core", role: "editor" }],
      wantName: "Ada Lovelace",
      wantRole: "Editor",
    },
    { name: "no role", user: { ...ada, name: "" }, wantName: "ada@acme.dev", wantRole: "-" },
  ];
  for (const tt of triggerTests) {
    it(`trigger shows the name and ${tt.name}`, () => {
      Object.assign(state, {
        user: tt.user,
        company: tt.company ?? null,
        membership: tt.membership ?? [],
        activeTeamId: "t1",
      });
      renderMenu();
      expect(screen.getByRole("button")).toHaveTextContent(tt.wantName + tt.wantRole);
    });
  }

  it.each([
    { user: ada, want: "Ada Lovelace" },
    { user: { ...ada, name: "" }, want: "ada@acme.dev" },
  ])("names the collapsed avatar-only trigger $want", ({ user, want }) => {
    state.user = user;
    renderMenu(false);
    const trigger = screen.getByRole("button", { name: want });
    expect(trigger).not.toHaveTextContent(want);
  });

  const menuTests: {
    name: string;
    user: Partial<User>;
    company?: Partial<CompanyMembership>;
    membership?: TeamMembership[];
    mono?: boolean;
    want: string[];
    absent: string[];
  }[] = [
    {
      name: "member",
      user: { ...ada, name: "" },
      company: { role: "member" },
      want: ["profile.settings", "profile.documentation", "profile.support", "header.logout"],
      absent: ["profile.companySettings", "profile.teamSettings", "profile.manageCompanies"],
    },
    {
      name: "team admin",
      user: ada,
      company: { role: "member" },
      membership: [{ teamId: "t1", teamName: "Core", role: "admin" }],
      want: ["profile.teamSettings"],
      absent: ["profile.companySettings", "profile.manageCompanies"],
    },
    {
      name: "company admin",
      user: ada,
      company: { role: "admin" },
      want: ["profile.companySettings", "profile.teamSettings"],
      absent: ["profile.manageCompanies"],
    },
    {
      name: "super admin",
      user: { ...ada, isSuperAdmin: true },
      want: ["profile.companySettings", "profile.teamSettings", "profile.manageCompanies"],
      absent: [],
    },
    {
      name: "super admin in mono company mode",
      user: { ...ada, isSuperAdmin: true },
      mono: true,
      want: ["profile.companySettings"],
      absent: ["profile.manageCompanies"],
    },
  ];
  for (const tt of menuTests) {
    it(`menu for a ${tt.name}`, async () => {
      Object.assign(state, {
        user: tt.user,
        company: tt.company ?? null,
        membership: tt.membership ?? [],
        mono: !!tt.mono,
        activeTeamId: "t1",
      });
      renderMenu();
      await userEvent.click(screen.getByRole("button"));
      expect(await screen.findByRole("menu")).toHaveTextContent(tt.user.email!);
      for (const item of tt.want) {
        expect(screen.getByRole("menuitem", { name: item })).toBeInTheDocument();
      }
      for (const item of tt.absent) {
        expect(screen.queryByRole("menuitem", { name: item })).toBeNull();
      }
    });
  }

  it("logs out from the menu", async () => {
    renderMenu();
    await userEvent.click(screen.getByRole("button"));
    await userEvent.click(await screen.findByRole("menuitem", { name: "header.logout" }));
    expect(state.logout).toHaveBeenCalledOnce();
  });

  it("shows the logging-out state", async () => {
    state.isLoggingOut = true;
    renderMenu();
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByRole("menuitem", { name: "header.loggingOut" })).toBeInTheDocument();
  });
});
