import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

const h = vi.hoisted(() => ({
  companyId: "c1" as string | null,
  members: [] as unknown,
  teams: [] as unknown,
}));

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
  useCustom: ({ url }: { url: string }) => ({
    query: { data: { data: url.endsWith("/members") ? h.members : h.teams } },
  }),
}));
vi.mock("@/hooks/use-active-company", () => ({
  useActiveCompany: () => ({ activeCompanyId: h.companyId }),
}));
// The cards have their own tests; stub them so only the page shell is under test.
vi.mock("./details", () => ({ CompanyDetailsCard: ({ companyId }: { companyId: string }) => <p>details:{companyId}</p> }));
vi.mock("./members", () => ({ CompanyMembersCard: ({ companyId }: { companyId: string }) => <p>members:{companyId}</p> }));
vi.mock("./teams", () => ({ CompanyTeamsCard: ({ companyId }: { companyId: string }) => <p>teams:{companyId}</p> }));

import { CompanyPage } from "./page";

function Location() {
  return <output>{useLocation().pathname}</output>;
}

const renderPage = (section?: "details" | "members" | "teams") =>
  render(
    <MemoryRouter initialEntries={["/company"]}>
      <Routes>
        <Route path="/" element={<p>home</p>} />
        <Route
          path="/company/*"
          element={
            <>
              <CompanyPage section={section} />
              <Location />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  h.companyId = "c1";
  h.members = [{ id: "u1" }, { id: "u2" }];
  h.teams = [{ id: "t1" }];
});

describe("CompanyPage", () => {
  it("redirects home when there is no active company", () => {
    h.companyId = null;
    renderPage();
    expect(screen.getByText("home")).toBeInTheDocument();
  });

  const counts = [
    { name: "counts members and teams", members: [{}, {}], teams: [{}], users: 2, teamCount: 1 },
    { name: "non-array payloads count as zero", members: null, teams: undefined, users: 0, teamCount: 0 },
  ];
  for (const tt of counts) {
    it(tt.name, () => {
      h.members = tt.members;
      h.teams = tt.teams;
      renderPage();
      expect(
        screen.getByText(`company.subtitle ${JSON.stringify({ users: tt.users, teams: tt.teamCount })}`),
      ).toBeInTheDocument();
      const [usersCard, teamsCard] = screen.getAllByRole("button");
      expect(usersCard).toHaveTextContent(`company.stats.users${tt.users}`);
      expect(teamsCard).toHaveTextContent(`company.stats.teams${tt.teamCount}`);
    });
  }

  const sections = [
    { name: "default section shows details", section: undefined, want: "details:c1" },
    { name: "members section", section: "members" as const, want: "members:c1" },
    { name: "teams section", section: "teams" as const, want: "teams:c1" },
  ];
  for (const tt of sections) {
    it(tt.name, () => {
      renderPage(tt.section);
      expect(screen.getByText(tt.want)).toBeInTheDocument();
    });
  }

  const statNav = [
    { name: "clicking the users stat opens members", card: 0, how: "click", want: "/company/members" },
    { name: "Enter on the teams stat opens teams", card: 1, how: "{Enter}", want: "/company/teams" },
    { name: "Space on the users stat opens members", card: 0, how: " ", want: "/company/members" },
  ];
  for (const tt of statNav) {
    it(tt.name, async () => {
      const user = userEvent.setup();
      renderPage();
      const card = screen.getAllByRole("button")[tt.card];
      if (tt.how === "click") {
        await user.click(card);
      } else {
        card.focus();
        await user.keyboard(tt.how);
      }
      expect(screen.getByRole("status")).toHaveTextContent(tt.want);
    });
  }

  it("ignores other keys on a stat card", async () => {
    const user = userEvent.setup();
    renderPage();
    screen.getAllByRole("button")[0].focus();
    await user.keyboard("a");
    expect(screen.getByRole("status")).toHaveTextContent(/^\/company$/);
  });

  it("switching tabs navigates to the tab's path", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("tab", { name: "nav.teams" }));
    expect(screen.getByRole("status")).toHaveTextContent("/company/teams");
  });
});
