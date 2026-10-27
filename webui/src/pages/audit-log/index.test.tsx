import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import type { AuditEntry } from "@/types/api";

const h = vi.hoisted(() => ({
  team: {
    activeTeamId: "team-1" as string | null,
    memberships: [{ teamId: "team-1", teamName: "Core" }],
  },
  useCustom: vi.fn(),
}));

vi.mock("@refinedev/core", () => ({
  // Echo interpolation options so counts and names are assertable.
  useTranslate: () => (key: string, opts?: Record<string, unknown>) =>
    opts ? `${key} ${JSON.stringify(opts)}` : key,
  useCustom: (args: { url: string }) => h.useCustom(args),
}));
vi.mock("@/hooks/use-active-team", () => ({ useActiveTeam: () => h.team }));
vi.mock("@/components/refine-ui/views/list-view", () => ({
  ListView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { AuditLogPage } from "./index";

const now = new Date();
const yesterday = new Date(now);
yesterday.setDate(now.getDate() - 1);

const ev = (e: Partial<AuditEntry> & Pick<AuditEntry, "id" | "action" | "targetType" | "targetId">): AuditEntry => ({
  occurredAt: now.toISOString(),
  actorEmail: "alice@acme.io",
  ...e,
});

// Newest first, like the server.
const entries: AuditEntry[] = [
  ev({
    id: 6,
    action: "update",
    targetType: "flag",
    targetId: "flag-1",
    flagsetId: "fs-1",
    before: { variation: "a" },
    after: { variation: "b" },
    metadata: { reason: "rollout", nested: { x: 1 } },
  }),
  ev({ id: 5, actorEmail: "bob@acme.io", action: "update", targetType: "flag", targetId: "flag-1", after: { disabled: true } }),
  ev({ id: 4, occurredAt: yesterday.toISOString(), actorEmail: null, action: "create", targetType: "api_key", targetId: "key-1", after: { label: "=ci-key" } }),
  ev({ id: 3, occurredAt: yesterday.toISOString(), action: "update", targetType: "team", targetId: "team-1" }),
  ev({ id: 2, occurredAt: "2025-01-15T12:00:00Z", actorEmail: "bob@acme.io", action: "create", targetType: "flagset", targetId: "fs-1" }),
  ev({ id: 1, occurredAt: "2025-01-15T11:00:00Z", actorEmail: "bob@acme.io", action: "ping", targetType: "webhook", targetId: '-wh"9' }),
];
const older = ev({ id: 0, occurredAt: "2025-01-14T10:00:00Z", action: "delete", targetType: "flag", targetId: "flag-gone" });

// Stable response objects per URL, so the page's effects see the same data
// across re-renders like they would with react-query.
function mockApi({ isLoading = false, data = entries, total = data.length }: { isLoading?: boolean; data?: AuditEntry[]; total?: number } = {}) {
  const page1 = { data: { data, total } };
  const page2 = { data: { data: [older], total } };
  const flags = { data: { data: [{ id: "flag-1", name: "checkout-flag" }] } };
  const flagsets = { data: [{ id: "fs-2", name: "zeta" }, { id: "fs-1", name: "payments" }] };
  h.useCustom.mockImplementation(({ url }: { url: string }) => {
    if (url.includes("/flags?")) return { query: { data: flags } };
    if (url.endsWith("/flagsets")) return { query: { data: flagsets } };
    if (isLoading) return { query: { isLoading: true, isFetching: true } };
    return { query: { data: url.includes("page=2") ? page2 : page1, isLoading: false, isFetching: false } };
  });
}

const auditUrls = () =>
  h.useCustom.mock.calls.map(([a]) => (a as { url: string }).url).filter((u) => u.includes("/audit?"));
const lastAuditQuery = () => new URL(auditUrls().at(-1)!, "http://x").searchParams;

function LocationProbe() {
  return <div data-testid="loc">{useLocation().search}</div>;
}

function renderPage(entry = "/audit-log") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <LocationProbe />
      <Routes>
        <Route path="/audit-log" element={<AuditLogPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const loc = () => new URLSearchParams(screen.getByTestId("loc").textContent ?? "");
const rows = () => screen.queryAllByRole("button", { name: /\d{2}:\d{2}/ });
// jsdom's Blob has no .text().
const readText = (b: Blob) =>
  new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.readAsText(b);
  });
const card = (title: string) => screen.getByText(title).parentElement!.parentElement!;

beforeEach(() => {
  h.team.activeTeamId = "team-1";
  h.useCustom.mockReset();
  mockApi();
});

describe("AuditLogPage states", () => {
  it("asks to pick a team when none is active", () => {
    h.team.activeTeamId = null;
    renderPage();
    expect(screen.getByText("auditLog.noTeam")).toBeInTheDocument();
    expect(screen.queryByText("auditLog.exportCsv")).not.toBeInTheDocument();
  });

  it("shows loading until the first page arrives", () => {
    mockApi({ isLoading: true });
    renderPage();
    expect(screen.getByText("auditLog.loading")).toBeInTheDocument();
    expect(screen.queryByText("auditLog.empty", { selector: ".p-10" })).not.toBeInTheDocument();
  });

  it("shows the empty state with no events", () => {
    mockApi({ data: [] });
    renderPage();
    expect(screen.getAllByText("auditLog.empty")).toHaveLength(2); // stream + breakdown
    expect(screen.getByText("auditLog.detail.none")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auditLog.exportCsv" })).toBeDisabled();
  });
});

describe("AuditLogPage stream", () => {
  it("requests the team's first page and groups events by day", () => {
    renderPage();
    const q = lastAuditQuery();
    expect(q.get("teamId")).toBe("team-1");
    expect(q.get("page")).toBe("1");
    expect(q.get("pageSize")).toBe("50");
    expect(q.has("flagsetId")).toBe(false);
    expect(q.has("from")).toBe(false);

    expect(screen.getByText("auditLog.today")).toBeInTheDocument();
    expect(screen.getByText("auditLog.yesterday")).toBeInTheDocument();
    expect(screen.getByText(/2025/)).toBeInTheDocument();
    expect(screen.getAllByText('auditLog.eventCount {"count":2}')).toHaveLength(3);
    expect(rows()).toHaveLength(6);
  });

  const targets = [
    { name: "flag id resolves to the flag name, with flagset hint", id: 6, want: /checkout-flag.*auditLog\.inFlagset \{"name":"payments"\}/ },
    { name: "toggle reads as disabled", id: 5, want: /bob.*auditLog\.verb\.disabled.*checkout-flag/ },
    { name: "api key shows its snapshot label, system actor", id: 4, want: /system.*auditLog\.verb\.createdKey.*=ci-key/ },
    { name: "active team resolves to its name", id: 3, want: /auditLog\.type\.team.*Core/ },
    { name: "flagset id resolves to the flagset name", id: 2, want: /auditLog\.verb\.created.*payments/ },
    { name: "unknown target falls back to the raw id and last action segment", id: 1, want: /ping.*-wh"9/ },
  ];
  for (const tt of targets) {
    it(tt.name, () => {
      renderPage();
      const row = rows()[entries.findIndex((e) => e.id === tt.id)];
      expect(row).toHaveAccessibleName(tt.want);
    });
  }

  it("loads earlier events and appends them", async () => {
    mockApi({ total: 7 });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "auditLog.loadMore" }));
    expect(lastAuditQuery().get("page")).toBe("2");
    expect(rows()).toHaveLength(7);
    expect(screen.getByRole("button", { name: /flag-gone/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "auditLog.loadMore" })).not.toBeInTheDocument();
  });

  it("counts loaded events per action category", () => {
    renderPage();
    const breakdown = card("auditLog.breakdown.title");
    expect(within(breakdown).getByText('auditLog.breakdown.total {"count":6}')).toBeInTheDocument();
    const count = (label: string) => within(breakdown).getByText(label).parentElement!.lastElementChild!.textContent;
    expect(count("auditLog.verb.updated")).toBe("2");
    expect(count("auditLog.verb.disabled")).toBe("1");
    expect(count("auditLog.verb.createdKey")).toBe("1");
    expect(count("auditLog.verb.created")).toBe("1");
    expect(within(breakdown).queryByText("auditLog.verb.deleted")).not.toBeInTheDocument();
  });
});

describe("AuditLogPage detail", () => {
  it("defaults to the newest event with its diff and metadata", () => {
    renderPage();
    const detail = card("auditLog.detail.title");
    expect(within(detail).getByText("#6")).toBeInTheDocument();
    expect(within(detail).getByText('- "variation": "a"')).toBeInTheDocument();
    expect(within(detail).getByText('+ "variation": "b"')).toBeInTheDocument();
    expect(within(detail).getByText("reason")).toBeInTheDocument();
    expect(within(detail).getByText("rollout")).toBeInTheDocument();
    expect(within(detail).queryByText("nested")).not.toBeInTheDocument();
    expect(within(detail).getByText("alice@acme.io")).toBeInTheDocument();
    expect(rows()[0].className).toContain("bg-primary/5");
  });

  it("shows the clicked event", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /auditLog\.verb\.created .*payments/ }));
    const detail = card("auditLog.detail.title");
    expect(within(detail).getByText("#2")).toBeInTheDocument();
    expect(within(detail).getByText("auditLog.detail.noDiff")).toBeInTheDocument();
    expect(within(detail).getByText("bob@acme.io")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /=ci-key/ }));
    const keyDetail = card("auditLog.detail.title");
    expect(within(keyDetail).getByText("#4")).toBeInTheDocument();
    expect(within(keyDetail).getByTitle("system")).toBeInTheDocument();
  });
});

describe("AuditLogPage filters", () => {
  it("search filters client-side and syncs ?q", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByPlaceholderText("auditLog.search"), "core");
    expect(loc().get("q")).toBe("core");
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveAccessibleName(/Core/);

    await user.click(screen.getByRole("button", { name: "auditLog.clear" }));
    expect(loc().toString()).toBe("");
    expect(rows()).toHaveLength(6);
  });

  it("a search with no match shows empty and disables export", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByPlaceholderText("auditLog.search"), "zzz");
    expect(screen.getByText("auditLog.empty", { selector: ".p-10" })).toBeInTheDocument();
    expect(screen.getByText("auditLog.detail.none")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auditLog.exportCsv" })).toBeDisabled();
  });

  it("scope buttons filter by target type and sync ?scope", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "auditLog.scope.keys" }));
    expect(loc().get("scope")).toBe("keys");
    expect(screen.getByRole("button", { name: "auditLog.scope.keys" })).toHaveAttribute("aria-pressed", "true");
    expect(rows()).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "auditLog.scope.all" }));
    expect(loc().has("scope")).toBe(false);
    expect(rows()).toHaveLength(6);
  });

  const selects = [
    { name: "actor filters client-side", box: 0, option: "bob", param: "actor", want: "bob@acme.io", rows: 3 },
    { name: "flagset refetches with flagsetId", box: 1, option: "payments", param: "flagset", want: "fs-1", apiParam: "flagsetId", apiWant: "fs-1" },
    { name: "range refetches with from", box: 2, option: "auditLog.range.7d", param: "range", want: "7d", apiParam: "from" },
  ];
  for (const tt of selects) {
    it(`${tt.name} and syncs ?${tt.param}`, async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getAllByRole("combobox")[tt.box]);
      await user.click(await screen.findByRole("option", { name: tt.option }));
      expect(loc().get(tt.param)).toBe(tt.want);
      if (tt.rows) expect(rows()).toHaveLength(tt.rows);
      if (tt.apiParam) {
        const got = lastAuditQuery().get(tt.apiParam);
        if (tt.apiWant) expect(got).toBe(tt.apiWant);
        else expect(new Date(got!).getTime()).toBeLessThan(Date.now() - 6 * 86_400_000);
        expect(lastAuditQuery().get("page")).toBe("1");
      }
    });
  }

  it("lists actors and flagsets (sorted) as options", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByRole("combobox")[1]);
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["auditLog.allFlagsets", "payments", "zeta"]);
    await user.keyboard("{Escape}");
    await user.click(screen.getAllByRole("combobox")[0]);
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["auditLog.allActors", "alice", "bob"]);
  });

  it("reads server filters from the URL and clears them", async () => {
    const user = userEvent.setup();
    renderPage("/audit-log?flagset=fs-1&range=30d");
    expect(lastAuditQuery().get("flagsetId")).toBe("fs-1");
    expect(lastAuditQuery().has("from")).toBe(true);
    await user.click(screen.getByRole("button", { name: "auditLog.clear" }));
    expect(lastAuditQuery().has("flagsetId")).toBe(false);
    expect(lastAuditQuery().has("from")).toBe(false);
    expect(screen.queryByRole("button", { name: "auditLog.clear" })).not.toBeInTheDocument();
  });
});

describe("AuditLogPage CSV export", () => {
  it("downloads the filtered events, quoted and formula-safe", async () => {
    let blob: Blob | undefined;
    const createObjectURL = vi.fn((b: Blob) => ((blob = b), "blob:x"));
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    let download = "";
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        download = this.download;
      });

    const user = userEvent.setup();
    renderPage("/audit-log?scope=keys");
    await user.click(screen.getByRole("button", { name: "auditLog.exportCsv" }));

    expect(download).toBe("audit-log-Core.csv");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:x");
    expect((await readText(blob!)).split("\n")).toEqual([
      '"id","occurredAt","actor","action","targetType","target"',
      `"4","${yesterday.toISOString()}","system","create","api_key","'=ci-key"`,
    ]);
    click.mockRestore();
  });

  it("escapes quotes and leading dashes", async () => {
    let blob: Blob | undefined;
    Object.assign(URL, { createObjectURL: (b: Blob) => ((blob = b), "blob:x"), revokeObjectURL: () => {} });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup();
    renderPage("/audit-log?q=ping");
    await user.click(screen.getByRole("button", { name: "auditLog.exportCsv" }));
    expect((await readText(blob!)).split("\n")[1]).toBe(
      '"1","2025-01-15T11:00:00Z","bob@acme.io","ping","webhook","\'-wh""9"',
    );
    click.mockRestore();
  });
});
