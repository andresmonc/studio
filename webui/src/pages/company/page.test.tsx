import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

const h = vi.hoisted(() => ({
  companyId: "c1" as string | null,
  members: [] as unknown,
  teams: [] as unknown,
  company: undefined as unknown,
}));

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
  useCustom: ({ url }: { url: string }) => ({
    query: { data: { data: url.endsWith("/members") ? h.members : h.teams } },
  }),
  useOne: () => ({ result: h.company }),
}));
vi.mock("@/hooks/use-active-company", () => ({
  useActiveCompany: () => ({ activeCompanyId: h.companyId }),
}));
// The cards have their own tests; stub them so only the page shell is under test.
vi.mock("./details", () => ({ CompanyDetailsCard: ({ companyId }: { companyId: string }) => <p>details:{companyId}</p> }));
vi.mock("./members", () => ({ CompanyMembersCard: ({ companyId }: { companyId: string }) => <p>members:{companyId}</p> }));
vi.mock("./relay-proxy-card", () => ({
  CompanyRelayProxyCard: ({ companyId }: { companyId: string }) => <p>relay:{companyId}</p>,
}));
vi.mock("./teams", () => ({ CompanyTeamsCard: ({ companyId }: { companyId: string }) => <p>teams:{companyId}</p> }));

import { CompanyPage } from "./page";

function Location() {
  return <output>{useLocation().pathname}</output>;
}

const renderPage = (section?: "details" | "members" | "teams" | "relayProxy") =>
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
  h.company = { id: "c1", displayName: "Acme" };
});

describe("CompanyPage", () => {
  it("redirects home when there is no active company", () => {
    h.companyId = null;
    renderPage();
    expect(screen.getByText("home")).toBeInTheDocument();
  });

  it("titles the page with the company name", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Acme");
  });

  it("shows a placeholder title while the company loads", () => {
    h.company = undefined;
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("…");
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
      expect(screen.getByRole("button", { name: `nav.members ${tt.users}` })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `nav.teams ${tt.teamCount}` })).toBeInTheDocument();
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

  const nav = [
    { name: "members nav opens members", button: /^nav\.members/, want: /^\/company\/members$/ },
    { name: "teams nav opens teams", button: /^nav\.teams/, want: /^\/company\/teams$/ },
    { name: "details nav opens details", button: /^nav\.details/, want: /^\/company$/ },
  ];
  for (const tt of nav) {
    it(tt.name, async () => {
      const user = userEvent.setup();
      renderPage("members");
      await user.click(screen.getByRole("button", { name: tt.button }));
      expect(screen.getByRole("status")).toHaveTextContent(tt.want);
    });
  }

  it("marks the current section in the nav", () => {
    renderPage("teams");
    expect(screen.getByRole("button", { name: /^nav\.teams/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /^nav\.details/ })).not.toHaveAttribute("aria-current");
  });

  it("relay proxy section shows the relay proxy card", () => {
    renderPage("relayProxy");
    expect(screen.getByText("relay:c1")).toBeInTheDocument();
  });

  it("relay proxy nav opens the relay proxy section", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "nav.relayProxy" }));
    expect(screen.getByRole("status")).toHaveTextContent("/company/relay-proxy");
  });
});
