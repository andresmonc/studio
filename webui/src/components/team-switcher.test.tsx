import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CompanyMembership, Team, TeamMembership } from "@/types/api";

const state = vi.hoisted(() => ({
  isSuperAdmin: false,
  company: null as Partial<CompanyMembership> | null,
  activeCompanyId: null as string | null,
  activeTeamId: null as string | null,
  memberships: [] as TeamMembership[],
  companyTeams: undefined as Partial<Team>[] | undefined,
  setActiveTeamId: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useCustom: ({ queryOptions }: { queryOptions: { enabled: boolean } }) => ({
    query: { data: queryOptions.enabled ? { data: state.companyTeams } : undefined },
  }),
}));
vi.mock("react-router", () => ({ useNavigate: () => state.navigate }));
vi.mock("@/providers/auth", () => ({
  getCachedUser: () => ({ isSuperAdmin: state.isSuperAdmin }),
  getCachedCompany: () => state.company,
}));
vi.mock("@/hooks/use-active-team", () => ({
  useActiveTeam: () => ({
    activeTeamId: state.activeTeamId,
    setActiveTeamId: state.setActiveTeamId,
    memberships: state.memberships,
  }),
}));
vi.mock("@/hooks/use-active-company", () => ({
  useActiveCompany: () => ({ activeCompanyId: state.activeCompanyId }),
}));

import { TeamSwitcher } from "./team-switcher";

const core: TeamMembership = { teamId: "t1", teamName: "Core", role: "editor" };
const growth: TeamMembership = { teamId: "t2", teamName: "Growth", role: "viewer" };

beforeEach(() => {
  Object.assign(state, {
    isSuperAdmin: false,
    company: { role: "member" },
    activeCompanyId: "c1",
    activeTeamId: "t1",
    memberships: [core, growth],
    companyTeams: undefined,
  });
  state.setActiveTeamId.mockClear();
  state.navigate.mockClear();
});

describe("TeamSwitcher", () => {
  const tests: {
    name: string;
    state: Partial<typeof state>;
    wantLabel?: string;
    wantItems?: string[];
  }[] = [
    { name: "hidden with a single membership", state: { memberships: [core] } },
    { name: "member picks among their teams", state: {}, wantLabel: "Core", wantItems: ["Core", "Growth"] },
    {
      name: "placeholder when the active team is not listed",
      state: { activeTeamId: "gone" },
      wantLabel: "team.switcher.select",
      wantItems: ["Core", "Growth"],
    },
    {
      name: "company admin picks among every company team",
      state: {
        company: { role: "admin" },
        companyTeams: [
          { id: "t1", name: "Core" },
          { id: "t3", name: "Mobile" },
        ],
      },
      wantLabel: "Core",
      wantItems: ["Core", "Mobile"],
    },
    {
      name: "super admin before company teams load",
      state: { isSuperAdmin: true, company: null, memberships: [core, growth] },
    },
    {
      name: "admin without an active company falls back to memberships",
      state: { company: { role: "admin" }, activeCompanyId: null },
      wantLabel: "Core",
      wantItems: ["Core", "Growth"],
    },
  ];
  for (const tt of tests) {
    it(tt.name, async () => {
      Object.assign(state, tt.state);
      const { container } = render(<TeamSwitcher />);
      if (!tt.wantLabel) {
        expect(container).toBeEmptyDOMElement();
        return;
      }
      const trigger = screen.getByRole("button");
      expect(trigger).toHaveTextContent(tt.wantLabel);
      await userEvent.click(trigger);
      const items = await screen.findAllByRole("menuitem");
      expect(items.map((i) => i.textContent)).toEqual(tt.wantItems);
    });
  }

  it("picking a team makes it active and goes home", async () => {
    render(<TeamSwitcher />);
    await userEvent.click(screen.getByRole("button"));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Growth" }));
    expect(state.setActiveTeamId).toHaveBeenCalledWith("t2");
    expect(state.navigate).toHaveBeenCalledWith("/");
  });
});
