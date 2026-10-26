import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import type { FlagInstance } from "@/types/api";

// --- Mocks ---------------------------------------------------------------

const refetch = vi.fn();
const ownersRefetch = vi.fn();
const useCustomMock = vi.fn();
const mutateMock = vi.fn();
const team = vi.hoisted(() => ({ id: "team-1" as string | undefined }));

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  // Pass the call args through so tests can react to the request URL (e.g. the
  // server-side filters and paging).
  useCustom: (args: { url: string }) => useCustomMock(args),
  useCustomMutation: () => ({ mutate: mutateMock }),
}));

vi.mock("@/hooks/use-active-team", () => ({
  useActiveTeam: () => ({ activeTeamId: team.id }),
}));

vi.mock("@/hooks/use-recently-edited-flags", () => ({
  useInvalidateRecentlyEditedFlags: () => () => {},
}));

vi.mock("@/providers/access-control", () => ({
  canEditTeam: () => true,
  effectiveTeamRole: () => "editor",
}));

// ListView and FlagWizard pull in refine/router context we don't need here.
vi.mock("@/components/refine-ui/views/list-view", () => ({
  ListView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// A stand-in that only exposes the onCreated callback the page hands the wizard.
vi.mock("./flag-wizard", () => ({
  FlagWizard: ({ onCreated }: { onCreated: () => void }) => (
    <button onClick={onCreated}>fake-wizard-created</button>
  ),
}));

import { FlagsPage } from "./index";

// Radix Select relies on pointer-capture and scrollIntoView APIs that jsdom
// does not implement; stub them so the dropdown can open during tests.
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

const flags: FlagInstance[] = [
  {
    id: "flag-abc",
    flagsetId: "fs-1",
    flagsetName: "default",
    name: "my-first-flag",
    type: "boolean",
    disabled: false,
    owner: "alice",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "flag-xyz",
    flagsetId: "fs-2",
    flagsetName: "payments",
    name: "my-second-flag",
    type: "string",
    disabled: true,
    owner: "bob",
    updatedAt: "2026-02-01T00:00:00Z",
  },
  {
    id: "flag-no-owner",
    flagsetId: "fs-1",
    flagsetName: "default",
    name: "ownerless-flag",
    type: "int",
    disabled: false,
    owner: null,
    updatedAt: "2026-03-01T00:00:00Z",
  },
];

// Surfaces the current URL query string so tests can assert two-way sync.
function LocationProbe() {
  const { search } = useLocation();
  return <div data-testid="location-search">{search}</div>;
}

function renderPage(initialEntry = "/flags") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <Routes>
        <Route path="/flags" element={<FlagsPage />} />
        <Route path="/flags/:id" element={<div>DETAIL PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// Routes the page's useCustom calls by URL: the filter-option endpoints get
// static lists, the team flags endpoint gets `rows` as one paginated page.
function mockApi(rows: FlagInstance[] | undefined, pageInfo = { total: rows?.length ?? 0, totalPages: 1 }) {
  useCustomMock.mockImplementation((args: { url: string }) => {
    if (args.url.endsWith("/tags")) return { query: { data: { data: ["beta", "prod"] } } };
    if (args.url.endsWith("/flagsets"))
      return {
        query: {
          data: {
            data: [
              { id: "fs-1", name: "default" },
              { id: "fs-2", name: "payments" },
            ],
          },
        },
      };
    if (args.url.endsWith("/owners"))
      return {
        query: {
          data: { data: [{ id: "u-alice", name: "alice" }, { id: "u-bob", name: "bob" }] },
          refetch: ownersRefetch,
        },
      };
    return {
      query: { data: rows && { data: { data: rows, page: 1, pageSize: 50, ...pageInfo } }, refetch },
    };
  });
}

// The query string of the most recent team-flags request.
function lastFlagsQuery(): URLSearchParams {
  const urls = useCustomMock.mock.calls
    .map(([args]) => (args as { url: string }).url)
    .filter((u) => u.includes("/flags?"));
  return new URL(urls[urls.length - 1], "http://x").searchParams;
}

describe("FlagsPage - row navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi(flags);
  });

  it("navigates to the flag detail page when clicking anywhere on the row", async () => {
    const user = userEvent.setup();
    renderPage();

    // Click on a non-name cell (the owner cell) to prove the whole row is clickable.
    await user.click(screen.getByText("alice"));

    expect(screen.getByText("DETAIL PAGE")).toBeInTheDocument();
  });

  it("navigates when clicking the flag name cell", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("my-first-flag"));

    expect(screen.getByText("DETAIL PAGE")).toBeInTheDocument();
  });

  it("exposes the flag name as a keyboard-accessible link to the detail page", () => {
    renderPage();

    // A real <a href> keeps the detail page reachable by keyboard / screen reader,
    // not just by clicking the row (which a <tr onClick> alone would not provide).
    const link = screen.getByRole("link", { name: "my-first-flag" });
    expect(link).toHaveAttribute("href", "/flags/flag-abc");
  });

  it("does not navigate when clicking the state toggle switch", async () => {
    const user = userEvent.setup();
    renderPage();

    const row = screen.getByText("my-first-flag").closest("tr") as HTMLElement;
    await user.click(within(row).getByRole("switch"));

    // Still on the list, never reached the detail route.
    expect(screen.queryByText("DETAIL PAGE")).not.toBeInTheDocument();
    expect(screen.getByText("my-first-flag")).toBeInTheDocument();
  });
});

describe("FlagsPage - query-param filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi(flags);
  });

  it("sends a preset filter from the URL to the server", () => {
    renderPage("/flags?type=string");
    expect(lastFlagsQuery().get("type")).toBe("string");
  });

  it("combines multiple query params", () => {
    renderPage("/flags?type=string&state=disabled");
    const q = lastFlagsQuery();
    expect(q.get("type")).toBe("string");
    expect(q.get("disabled")).toBe("true");
  });

  it("ignores an unknown type value instead of sending it", () => {
    renderPage("/flags?type=bogus");
    expect(lastFlagsQuery().has("type")).toBe(false);
  });

  it("writes the selected filter into the URL and the request (two-way sync)", async () => {
    const user = userEvent.setup();
    renderPage();

    // The type filter is the second combobox (after flagset).
    const typeSelect = screen.getAllByRole("combobox")[1];
    await user.click(typeSelect);
    await user.click(screen.getByRole("option", { name: "string" }));

    expect(screen.getByTestId("location-search").textContent).toContain("type=string");
    expect(lastFlagsQuery().get("type")).toBe("string");
  });

  it("clears the query params when filters are cleared", async () => {
    const user = userEvent.setup();
    renderPage("/flags?type=string");

    await user.click(screen.getByRole("button", { name: "flag.clear" }));

    expect(screen.getByTestId("location-search").textContent).toBe("");
    expect(lastFlagsQuery().has("type")).toBe(false);
  });

  it("sends the preset search text as the name filter", () => {
    renderPage("/flags?search=second");
    expect(lastFlagsQuery().get("name")).toBe("second");
  });

  it("writes the search text into the URL and sends it after a debounce", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("flag.search"), "first");

    expect(screen.getByTestId("location-search").textContent).toContain("search=first");
    await waitFor(() => expect(lastFlagsQuery().get("name")).toBe("first"));
  });

  it("removes a single param when its filter is reset to All", async () => {
    const user = userEvent.setup();
    renderPage("/flags?type=string");

    // Re-selecting "All" in the type dropdown hits setParam's delete branch.
    const typeSelect = screen.getAllByRole("combobox")[1];
    await user.click(typeSelect);
    await user.click(screen.getByRole("option", { name: "flag.allTypes" }));

    expect(screen.getByTestId("location-search").textContent).not.toContain("type");
  });

  it("sends flagset, owner and state filters to the server", () => {
    renderPage("/flags?flagset=fs-2&owner=u-bob&state=enabled");
    const q = lastFlagsQuery();
    expect(q.get("flagsetId")).toBe("fs-2");
    expect(q.get("owner")).toBe("u-bob");
    expect(q.get("disabled")).toBe("false");
  });

  it("passes the special unassigned owner value through", () => {
    renderPage("/flags?owner=__unassigned__");
    expect(lastFlagsQuery().get("owner")).toBe("__unassigned__");
  });

  it("offers the team's flagsets and owners as filter options", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getAllByRole("combobox")[0]);
    expect(screen.getByRole("option", { name: "payments" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getAllByRole("combobox")[2]);
    // Owners are labelled by name but filtered by user id.
    await user.click(screen.getByRole("option", { name: "bob" }));
    expect(lastFlagsQuery().get("owner")).toBe("u-bob");
  });

  it("removes the search param when the search box is cleared", async () => {
    const user = userEvent.setup();
    renderPage("/flags?search=first");

    // Clearing the input back to empty hits setParam's delete branch.
    await user.clear(screen.getByPlaceholderText("flag.search"));

    expect(screen.getByTestId("location-search").textContent).not.toContain("search");
  });

  it("shows the empty state while the flags are loading", () => {
    mockApi(undefined);
    renderPage("/flags?flagset=fs-2");
    expect(screen.getByText("flag.empty")).toBeInTheDocument();
  });
});

describe("FlagsPage - pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi(flags, { total: 120, totalPages: 3 });
  });

  it("requests the page from the URL and renders the pager", () => {
    renderPage("/flags?page=2");
    const q = lastFlagsQuery();
    expect(q.get("page")).toBe("2");
    expect(q.get("pageSize")).toBe("50");
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("moves to the next page", async () => {
    const user = userEvent.setup();
    renderPage("/flags?page=2");
    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(screen.getByTestId("location-search").textContent).toContain("page=3");
  });

  it("goes back to the first page when a filter changes", async () => {
    const user = userEvent.setup();
    renderPage("/flags?page=2");
    await user.click(screen.getAllByRole("combobox")[1]);
    await user.click(screen.getByRole("option", { name: "string" }));
    const search = screen.getByTestId("location-search").textContent;
    expect(search).toContain("type=string");
    expect(search).not.toContain("page=");
  });

  it("hides the pager when nothing matches", () => {
    mockApi([]);
    renderPage();
    expect(screen.queryByText(/Page \d+ of/)).not.toBeInTheDocument();
  });
});

describe("FlagsPage - distribution & targeting columns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the distribution bar and the pluralized rule count", () => {
    mockApi([
            {
              id: "flag-rich",
              flagsetId: "fs-1",
              flagsetName: "default",
              name: "rich-flag",
              type: "boolean",
              disabled: false,
              owner: "carol",
              updatedAt: "2026-01-01T00:00:00Z",
              variations: ["on", "off"],
              distribution: { on: 100 },
              targetingRuleCount: 2,
            },
          ] satisfies FlagInstance[]);

    renderPage();

    // DistributionBar tags each served segment with a "name · pct%" title.
    expect(screen.getByTitle("on · 100%")).toBeInTheDocument();
    // With rules present, the pluralized rules label is used (mock t echoes the key).
    const row = screen.getByText("rich-flag").closest("tr") as HTMLElement;
    expect(within(row).getByText("flag.rulesCount")).toBeInTheDocument();
  });

  it("renders the progressive rollout indicator instead of an em-dash", () => {
    mockApi([
            {
              id: "flag-prog",
              flagsetId: "fs-1",
              flagsetName: "default",
              name: "prog-flag",
              type: "string",
              disabled: false,
              owner: null,
              updatedAt: "2026-01-01T00:00:00Z",
              variations: ["variationA", "variationB"],
              // No static distribution — a progressive rollout ramps over time.
              targetingRuleCount: 0,
              progressiveRollout: {
                initialVariation: "variationA",
                endVariation: "variationB",
                from: 0,
                to: 100,
              },
            },
          ] satisfies FlagInstance[]);

    renderPage();

    const row = screen.getByText("prog-flag").closest("tr") as HTMLElement;
    // The initial→end variation pills render (proving it's not the em-dash fallback).
    expect(within(row).getByText("variationA")).toBeInTheDocument();
    expect(within(row).getByText("variationB")).toBeInTheDocument();
    // Scope the em-dash check to the Distribution cell (index 4) — the Tags cell
    // legitimately shows an em-dash when a flag has no tags.
    const distributionCell = within(row).getAllByRole("cell")[4];
    expect(within(distributionCell).queryByText("—")).not.toBeInTheDocument();
  });

  it("shows the 'default only' label when a flag has no targeting rules", () => {
    mockApi([
            {
              id: "flag-plain",
              flagsetId: "fs-1",
              flagsetName: "default",
              name: "plain-flag",
              type: "boolean",
              disabled: false,
              owner: null,
              updatedAt: "2026-01-01T00:00:00Z",
              variations: ["on", "off"],
              distribution: { on: 100 },
              targetingRuleCount: 0,
            },
          ] satisfies FlagInstance[]);

    renderPage();

    expect(screen.getByText("flag.rulesCountNone")).toBeInTheDocument();
  });
});

describe("FlagsPage - tags", () => {
  const tagged: FlagInstance[] = [
    {
      id: "flag-a",
      flagsetId: "fs-1",
      flagsetName: "default",
      name: "alpha-flag",
      type: "boolean",
      disabled: false,
      updatedAt: "2026-01-01T00:00:00Z",
      tags: ["beta", "prod"],
    },
    {
      id: "flag-b",
      flagsetId: "fs-1",
      flagsetName: "default",
      name: "bravo-flag",
      type: "boolean",
      disabled: false,
      updatedAt: "2026-01-02T00:00:00Z",
      tags: ["beta"],
    },
    {
      id: "flag-c",
      flagsetId: "fs-1",
      flagsetName: "default",
      name: "charlie-flag",
      type: "boolean",
      disabled: false,
      updatedAt: "2026-01-03T00:00:00Z",
      tags: [],
    },
  ];

  // Tag filtering is server-side: the endpoint applies `?tags=` (AND) and returns
  // the matching rows. This mock mirrors that — it reads the `?tags=` from the
  // team-flags request URL and returns the AND-filtered set, and serves the tag
  // registry for the `/tags` endpoint.
  beforeEach(() => {
    vi.clearAllMocks();
    useCustomMock.mockImplementation((args: { url: string }) => {
      if (args.url.endsWith("/tags")) {
        return { query: { data: { data: ["beta", "prod"] } } };
      }
      if (!args.url.includes("/flags?")) return { query: { data: { data: [] } } };
      const q = new URL(args.url, "http://x").searchParams.get("tags");
      const wanted = q ? q.split(",") : [];
      const data = wanted.length
        ? tagged.filter((f) => wanted.every((tg) => (f.tags ?? []).includes(tg)))
        : tagged;
      return {
        query: { data: { data: { data, total: data.length, page: 1, pageSize: 50, totalPages: 1 } }, refetch },
      };
    });
  });

  it("renders each flag's tags as chips under the flag name", () => {
    renderPage();
    // Tags render in a sibling row within the flag's <tbody> group.
    const row = screen.getByText("alpha-flag").closest("tbody") as HTMLElement;
    expect(within(row).getByText("beta")).toBeInTheDocument();
    expect(within(row).getByText("prod")).toBeInTheDocument();
  });

  it("adds a ?tags= filter to the URL when a tag chip is clicked", async () => {
    const user = userEvent.setup();
    renderPage();
    const row = screen.getByText("bravo-flag").closest("tbody") as HTMLElement;
    await user.click(within(row).getByText("beta"));
    expect(screen.getByTestId("location-search").textContent).toContain("tags=beta");
  });

  it("requests the server-side tag filter and renders the returned rows", () => {
    renderPage("/flags?tags=prod");
    // The endpoint was queried with the tag filter…
    expect(lastFlagsQuery().get("tags")).toBe("prod");
    // …and only the server-matched flag (alpha has "prod") renders.
    expect(screen.getByText("alpha-flag")).toBeInTheDocument();
    expect(screen.queryByText("bravo-flag")).not.toBeInTheDocument();
    expect(screen.queryByText("charlie-flag")).not.toBeInTheDocument();
  });

  it("passes multiple tags to the server for AND filtering", () => {
    renderPage("/flags?tags=beta,prod");
    expect(lastFlagsQuery().get("tags")).toBe("beta,prod");
    // Server returns only alpha-flag (has BOTH beta and prod).
    expect(screen.getByText("alpha-flag")).toBeInTheDocument();
    expect(screen.queryByText("bravo-flag")).not.toBeInTheDocument();
  });
});

describe("FlagsPage - sorting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi(flags);
  });

  it("sends no sort params for the default (updated, newest first)", () => {
    renderPage();
    const q = lastFlagsQuery();
    expect(q.has("sort")).toBe(false);
    expect(q.has("order")).toBe(false);
    expect(screen.getByRole("columnheader", { name: /flag\.updated/ })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
  });

  it("sorts by a column, flips on the second click and resets the page", async () => {
    const user = userEvent.setup();
    renderPage("/flags?page=2");
    const flagHeader = () => screen.getByRole("button", { name: "flag.flag" });

    await user.click(flagHeader());
    let q = lastFlagsQuery();
    expect(q.get("sort")).toBe("name");
    expect(q.has("order")).toBe(false); // asc is the name default
    expect(screen.getByTestId("location-search").textContent).not.toContain("page=");

    await user.click(flagHeader());
    q = lastFlagsQuery();
    expect(q.get("sort")).toBe("name");
    expect(q.get("order")).toBe("desc");
  });

  it("ignores an unknown sort value", () => {
    renderPage("/flags?sort=constructor");
    expect(lastFlagsQuery().has("sort")).toBe(false);
  });
});

describe("FlagsPage - state toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi(flags);
  });

  async function confirmToggleOf(user: ReturnType<typeof userEvent.setup>, flagName: string) {
    const row = screen.getByText(flagName).closest("tr") as HTMLElement;
    await user.click(within(row).getByRole("switch"));
    return screen.getByRole("alertdialog");
  }

  const tests = [
    {
      name: "disables an enabled flag",
      flag: "my-first-flag",
      title: "flag.confirmToggle.disableTitle",
      url: /\/flags\/flag-abc\/disable$/,
      disabled: true,
    },
    {
      name: "enables a disabled flag",
      flag: "my-second-flag",
      title: "flag.confirmToggle.enableTitle",
      url: /\/flags\/flag-xyz\/disable$/,
      disabled: false,
    },
  ];
  for (const tt of tests) {
    it(`${tt.name} after confirmation and refreshes the list`, async () => {
      const user = userEvent.setup();
      renderPage();
      const dialog = await confirmToggleOf(user, tt.flag);
      expect(within(dialog).getByText(tt.title)).toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: "flag.confirmToggle.confirm" }));
      expect(mutateMock).toHaveBeenCalledTimes(1);
      const [args, cbs] = mutateMock.mock.calls[0];
      expect(args.url).toMatch(tt.url);
      expect(args.values).toEqual({ disabled: tt.disabled });

      act(() => cbs.onSuccess());
      expect(refetch).toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    });
  }

  it("closes the dialog without refreshing when the toggle fails", async () => {
    const user = userEvent.setup();
    renderPage();
    const dialog = await confirmToggleOf(user, "my-first-flag");
    await user.click(within(dialog).getByRole("button", { name: "flag.confirmToggle.confirm" }));

    act(() => mutateMock.mock.calls[0][1].onError(new Error("nope")));
    expect(refetch).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("does nothing when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    renderPage();
    const dialog = await confirmToggleOf(user, "my-first-flag");
    await user.click(within(dialog).getByRole("button", { name: "common.cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mutateMock).not.toHaveBeenCalled();
  });
});

describe("FlagsPage - misc states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    team.id = "team-1";
    mockApi(flags);
  });

  it("asks to pick a team when none is active", () => {
    team.id = undefined;
    renderPage();
    expect(screen.getByText("flag.noTeam")).toBeInTheDocument();
    expect(screen.queryByText("fake-wizard-created")).not.toBeInTheDocument();
    team.id = "team-1";
  });

  it("shows a loading row while the flags load", () => {
    useCustomMock.mockImplementation(() => ({ query: { isLoading: true, refetch } }));
    renderPage();
    expect(screen.getByText("common.loading")).toBeInTheDocument();
  });

  it("refreshes flags and owners after the wizard creates a flag", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "fake-wizard-created" }));
    expect(refetch).toHaveBeenCalled();
    expect(ownersRefetch).toHaveBeenCalled();
  });

  it("removes a tag filter when its chip is clicked again", async () => {
    mockApi([{ ...flags[0], tags: ["beta", "prod"] }]);
    const user = userEvent.setup();
    renderPage("/flags?tags=beta,prod");
    const row = screen.getByText("my-first-flag").closest("tbody") as HTMLElement;
    await user.click(within(row).getByText("beta"));
    expect(screen.getByTestId("location-search").textContent).toBe("?tags=prod");
  });

  it("drops the page param when going back to the first page", async () => {
    mockApi(flags, { total: 120, totalPages: 3 });
    const user = userEvent.setup();
    renderPage("/flags?page=2");
    await user.click(screen.getByRole("button", { name: "Go to previous page" }));
    expect(screen.getByTestId("location-search").textContent).not.toContain("page=");
  });
});
