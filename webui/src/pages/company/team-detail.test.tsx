import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

const h = vi.hoisted(() => ({
  companyId: "c1" as string | null,
  team: { name: "Platform" } as unknown,
  editable: false,
  companyAdmin: false,
}));

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useCustom: () => ({ query: { data: h.team ? { data: h.team } : undefined } }),
}));
vi.mock("@/hooks/use-active-company", () => ({
  useActiveCompany: () => ({ activeCompanyId: h.companyId }),
}));
vi.mock("@/providers/access-control", () => ({
  canEditTeam: () => h.editable,
  canSync: () => ({ can: h.companyAdmin }),
}));
// The cards have their own tests; stub them to observe the props they get.
vi.mock("./team-details-card", () => ({
  TeamDetailsCard: (p: { teamId: string; editable: boolean }) => <p>details:{p.teamId}:{String(p.editable)}</p>,
}));
vi.mock("./team-members-card", () => ({
  TeamMembersCard: (p: { teamId: string; editable: boolean }) => <p>members:{p.teamId}:{String(p.editable)}</p>,
}));

import { TeamDetailPage } from "./team-detail";

function Location() {
  return <output>{useLocation().pathname}</output>;
}

const renderPage = (path = "/company/teams/t1") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>home</p>} />
        <Route path="/company/teams" element={<p>teams list</p>} />
        <Route path="/company/teams/:teamId" element={<><TeamDetailPage /><Location /></>} />
        <Route path="/no-param" element={<TeamDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  h.companyId = "c1";
  h.team = { name: "Platform" };
  h.editable = false;
  h.companyAdmin = false;
});

describe("TeamDetailPage", () => {
  const redirects = [
    { name: "no active company redirects to the teams list", companyId: null, path: "/company/teams/t1" },
    { name: "no team id redirects to the teams list", companyId: "c1", path: "/no-param" },
  ];
  for (const tt of redirects) {
    it(tt.name, () => {
      h.companyId = tt.companyId;
      renderPage(tt.path);
      expect(screen.getByText("teams list")).toBeInTheDocument();
    });
  }

  const titles = [
    { name: "shows the team name", team: { name: "Platform" }, want: "Platform" },
    { name: "falls back to a generic title while loading", team: undefined, want: "team.detail.title" },
  ];
  for (const tt of titles) {
    it(tt.name, () => {
      h.team = tt.team;
      renderPage();
      expect(screen.getByRole("heading", { name: tt.want })).toBeInTheDocument();
    });
  }

  const editable = [true, false];
  for (const e of editable) {
    it(`passes editable=${e} to both cards`, () => {
      h.editable = e;
      renderPage();
      expect(screen.getByText(`details:t1:${e}`)).toBeInTheDocument();
      expect(screen.getByText(`members:t1:${e}`)).toBeInTheDocument();
    });
  }

  const access = [
    { name: "company admin: company crumbs, back goes to the teams list", admin: true, wantCrumbs: true, want: "teams list" },
    { name: "team member: no company crumbs, back goes home", admin: false, wantCrumbs: false, want: "home" },
  ];
  for (const tt of access) {
    it(tt.name, async () => {
      h.companyAdmin = tt.admin;
      const user = userEvent.setup();
      renderPage();
      expect(screen.queryByRole("link", { name: "nav.company" }) !== null).toBe(tt.wantCrumbs);
      expect(screen.queryByRole("link", { name: "nav.teams" }) !== null).toBe(tt.wantCrumbs);
      await user.click(screen.getByRole("button", { name: "common.back" }));
      expect(screen.getByText(tt.want)).toBeInTheDocument();
    });
  }
});
