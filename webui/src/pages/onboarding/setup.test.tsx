import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw-server";
import { API_URL } from "@/providers/constants";

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useGetIdentity: () => ({ data: { email: "admin@local" } }),
}));

const refreshIdentity = vi.fn();
vi.mock("@/providers/auth", () => ({
  refreshIdentity: () => refreshIdentity(),
}));

import { OnboardingSetupPage } from "./setup";

type Call = { path: string; body: unknown };

// mockApi answers every setup endpoint and records POSTs in order.
// overrides lets a test replace one endpoint's handler.
function mockApi(
  overrides: Record<string, () => Promise<Response> | Response> = {},
  apiKeyCount = 1,
) {
  const calls: Call[] = [];
  const ok = (data: unknown) =>
    HttpResponse.json({ data }, { status: 201 });
  const routes: Record<string, () => Promise<Response> | Response> = {
    "/onboarding/company": () => ok({ id: "c1" }),
    "/companies/c1/teams": () => ok({ id: "t1" }),
    "/teams/t1/flagsets": () => ok({ id: "fs1", apiKeyCount }),
    "/flagsets/fs1/api-keys": () => ok({ id: "k1" }),
    "/flagsets/fs1/flags": () => ok({ id: "f1" }),
    ...overrides,
  };
  server.use(
    ...Object.entries(routes).map(([path, respond]) =>
      http.post(`${API_URL}${path}`, async ({ request }) => {
        calls.push({ path, body: await request.json() });
        return respond();
      }),
    ),
  );
  return calls;
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/onboarding/setup"]}>
      <Routes>
        <Route
          path="/onboarding/setup"
          element={<OnboardingSetupPage minStepMs={0} />}
        />
        <Route path="/flags" element={<div>flags page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function submitCompany(name: string) {
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText("onboarding.createCompany.nameLabel"),
    name,
  );
  await user.click(screen.getByRole("button", { name: "onboarding.setup.submit" }));
  return user;
}

describe("OnboardingSetupPage", () => {
  // In-memory localStorage: jsdom's storage isn't reliable under Node 25.
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    refreshIdentity.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("runs every step in order, then stores ids and links to /flags", async () => {
    let releaseFlag!: () => void;
    const flagGate = new Promise<void>((r) => (releaseFlag = r));
    const calls = mockApi({
      "/flagsets/fs1/flags": async () => {
        await flagGate;
        return HttpResponse.json({ data: { id: "f1" } });
      },
    });
    renderPage();
    expect(
      screen.queryByText("onboarding.setup.doNotClose"),
    ).not.toBeInTheDocument();

    const user = await submitCompany("Acme");

    // In progress: the flag request is gated, so the warning is showing.
    await waitFor(() => expect(calls).toHaveLength(4));
    expect(screen.getByText("onboarding.setup.doNotClose")).toBeInTheDocument();

    releaseFlag();
    const goBtn = await screen.findByRole("button", {
      name: "onboarding.setup.goToFlags",
    });
    expect(
      screen.queryByText("onboarding.setup.doNotClose"),
    ).not.toBeInTheDocument();

    // apiKeyCount is 1: the server-made default key is reused, no api-keys POST.
    expect(calls).toEqual([
      {
        path: "/onboarding/company",
        body: { displayName: "Acme", description: "" },
      },
      {
        path: "/companies/c1/teams",
        body: { name: "Acme-team", adminEmail: "admin@local" },
      },
      { path: "/teams/t1/flagsets", body: { name: "default-flagset" } },
      {
        path: "/flagsets/fs1/flags",
        body: {
          name: "my-first-feature-flag",
          payload: {
            variations: { enabled: true, disabled: false },
            defaultRule: { variation: "disabled" },
          },
        },
      },
    ]);
    expect(refreshIdentity).toHaveBeenCalled();
    expect(window.localStorage.getItem("activeCompanyId")).toBe("c1");
    expect(window.localStorage.getItem("activeTeamId")).toBe("t1");

    await user.click(goBtn);
    expect(await screen.findByText("flags page")).toBeInTheDocument();
  });

  it("keeps the derived team name within the 120-character limit", async () => {
    const calls = mockApi();
    renderPage();
    await submitCompany("a".repeat(120));

    await screen.findByRole("button", { name: "onboarding.setup.goToFlags" });
    const team = calls.find((c) => c.path === "/companies/c1/teams");
    expect(team?.body).toEqual({
      name: `${"a".repeat(115)}-team`,
      adminEmail: "admin@local",
    });
  });

  it("retries from the failed step without re-creating the company", async () => {
    let flagsetAttempts = 0;
    const calls = mockApi(
      {
        "/teams/t1/flagsets": () =>
          ++flagsetAttempts === 1
            ? HttpResponse.json(
                { message: "boom" },
                { status: 500 },
              )
            : HttpResponse.json(
                { data: { id: "fs1", apiKeyCount: 0 } },
                { status: 201 },
              ),
      },
      0,
    );
    renderPage();
    const user = await submitCompany("Acme");

    expect(await screen.findByText("boom")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "onboarding.setup.retry" }));
    await screen.findByRole("button", { name: "onboarding.setup.goToFlags" });

    // apiKeyCount 0 → the API key step creates one.
    expect(calls.map((c) => c.path)).toEqual([
      "/onboarding/company",
      "/companies/c1/teams",
      "/teams/t1/flagsets",
      "/teams/t1/flagsets",
      "/flagsets/fs1/api-keys",
      "/flagsets/fs1/flags",
    ]);
  });
});
