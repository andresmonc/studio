import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import type { CompanyMembership, TeamMembership } from "@/types/api";

const state = vi.hoisted(() => ({
  isSuperAdmin: false,
  mono: true,
  company: null as CompanyMembership | null,
  membership: [] as TeamMembership[],
}));

vi.mock("@refinedev/core", () => ({
  useGetIdentity: () => ({
    data: { id: "u1", isSuperAdmin: state.isSuperAdmin },
    isLoading: false,
  }),
}));
vi.mock("@/providers/auth", () => ({
  getCachedCompany: () => state.company,
  getCachedMembership: () => state.membership,
}));
vi.mock("@/providers/ui-config", () => ({ isMonoCompany: () => state.mono }));

import { OnboardingGuard } from "./onboarding-guard";

const company = (role: CompanyMembership["role"]): CompanyMembership => ({
  companyId: "c1",
  companyDisplayName: "Acme",
  role,
});
const team: TeamMembership = { teamId: "t1", teamName: "t", role: "viewer" };

function renderGuard() {
  render(
    <MemoryRouter initialEntries={["/flags"]}>
      <Routes>
        <Route
          path="/flags"
          element={
            <OnboardingGuard>
              <div>flags page</div>
            </OnboardingGuard>
          }
        />
        <Route path="/onboarding" element={<div>choice page</div>} />
        <Route path="/onboarding/setup" element={<div>setup page</div>} />
        <Route path="/onboarding/join" element={<div>join page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OnboardingGuard", () => {
  it.each([
    { name: "mono super admin, no company", mono: true, isSuperAdmin: true, company: null, membership: [], want: "setup page" },
    { name: "mono super admin with company", mono: true, isSuperAdmin: true, company: company("admin"), membership: [], want: "flags page" },
    { name: "mono member, no company yet", mono: true, isSuperAdmin: false, company: null, membership: [], want: "join page" },
    { name: "mono member, no team", mono: true, isSuperAdmin: false, company: company("member"), membership: [], want: "join page" },
    { name: "mono member with a team", mono: true, isSuperAdmin: false, company: company("member"), membership: [team], want: "flags page" },
    { name: "mono company admin, no team", mono: true, isSuperAdmin: false, company: company("admin"), membership: [], want: "flags page" },
    { name: "multi super admin, no company", mono: false, isSuperAdmin: true, company: null, membership: [], want: "flags page" },
    { name: "multi member, no company", mono: false, isSuperAdmin: false, company: null, membership: [], want: "choice page" },
    { name: "multi member, no team", mono: false, isSuperAdmin: false, company: company("member"), membership: [], want: "flags page" },
  ])("$name → $want", ({ want, ...s }) => {
    Object.assign(state, s);
    renderGuard();
    expect(screen.getByText(want)).toBeInTheDocument();
  });
});
