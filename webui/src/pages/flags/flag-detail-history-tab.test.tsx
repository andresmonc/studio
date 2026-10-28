import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FlagVersion } from "@/types/api";
import type { Tr } from "@/components/flags/form/flag-form";

const h = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  mutate: vi.fn(),
  refetch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@refinedev/core", () => ({
  useCustom: () => ({ query: h.query }),
  useCustomMutation: () => ({ mutate: h.mutate }),
}));

vi.mock("sonner", () => ({
  toast: { success: h.toastSuccess, error: h.toastError },
}));

import { HistoryTab } from "./flag-detail-history-tab";

// Renders "key v1 v2" so interpolated params stay visible in assertions.
const t = ((key: string, params?: Record<string, unknown>) =>
  [key, ...Object.values(params ?? {})].join(" ")) as Tr;

const versions: FlagVersion[] = [
  {
    id: "v1",
    flagId: "flag-1",
    versionNumber: 1,
    payload: { variations: { on: true } },
    createdByName: "Alice",
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "v3",
    flagId: "flag-1",
    versionNumber: 3,
    payload: { variations: { on: true, off: false, beta: true } },
    comment: "  ",
    createdByName: null,
    createdAt: "2026-01-03T00:00:00Z",
  },
  {
    id: "v2",
    flagId: "flag-1",
    versionNumber: 2,
    payload: { variations: { on: true, off: false } },
    comment: "add off variation",
    createdByName: "Bob",
    createdAt: "2026-01-02T00:00:00Z",
  },
];

function setVersions(list: FlagVersion[] | undefined, isLoading = false) {
  h.query = {
    data: list && { data: { data: list } },
    isLoading,
    refetch: h.refetch,
  };
}

function renderTab(props: { canEdit?: boolean; onReverted?: () => void } = {}) {
  const onReverted = props.onReverted ?? vi.fn();
  render(
    <HistoryTab
      t={t}
      flagId="flag-1"
      currentVersion={3}
      canEdit={props.canEdit ?? true}
      onReverted={onReverted}
    />,
  );
  return { onReverted };
}

// Each timeline row holds a select button (leading version-number badge) and,
// for editors, a sibling revert button.
function selectButtons() {
  return screen
    .getAllByRole("button")
    .filter((b) => b.querySelector("span.font-mono") !== null);
}

function rows() {
  return selectButtons().map((b) => b.parentElement as HTMLElement);
}

function diffText() {
  return document.querySelector("pre")?.textContent ?? "";
}

// The +/-/space marker of the diff line containing `text`.
function diffMarker(text: string) {
  const line = [...document.querySelectorAll("pre > div")].find((d) =>
    d.textContent?.includes(text),
  );
  return line?.firstElementChild?.textContent;
}

beforeEach(() => {
  vi.clearAllMocks();
  setVersions(versions);
});

describe("HistoryTab", () => {
  const emptyTests = [
    { name: "no data", list: undefined },
    { name: "empty list", list: [] },
  ];
  for (const tt of emptyTests) {
    it(`shows the empty state for ${tt.name}`, () => {
      setVersions(tt.list);
      renderTab();
      expect(screen.getByText("flag.detail.history.empty")).toBeInTheDocument();
      expect(screen.queryByText("flag.detail.history.title")).not.toBeInTheDocument();
    });
  }

  it("does not show the empty state while loading", () => {
    setVersions(undefined, true);
    renderTab();
    expect(screen.queryByText("flag.detail.history.empty")).not.toBeInTheDocument();
    expect(screen.getByText("flag.detail.history.title")).toBeInTheDocument();
  });

  it("lists versions newest first with comment, fallback label and badges", () => {
    renderTab();
    const r = rows();
    expect(r.map((b) => b.querySelector("span.font-mono")?.textContent)).toEqual([
      "3",
      "2",
      "1",
    ]);
    // Blank comment falls back to the version label; missing author to "—".
    expect(within(r[0]).getByText("flag.detail.history.version 3")).toBeInTheDocument();
    expect(within(r[0]).getByText("flag.detail.history.current")).toBeInTheDocument();
    expect(within(r[0]).getByText(/^flag\.detail\.history\.updatedBy — /)).toBeInTheDocument();
    expect(within(r[1]).getByText("add off variation")).toBeInTheDocument();
    expect(within(r[1]).getByText(/^flag\.detail\.history\.updatedBy Bob /)).toBeInTheDocument();
    expect(within(r[2]).getByText("flag.detail.history.initial")).toBeInTheDocument();
  });

  it("diffs the newest version against its predecessor by default", () => {
    renderTab();
    expect(screen.getByText("flag.detail.history.diffTitle 3")).toBeInTheDocument();
    expect(screen.queryByText("flag.detail.history.noPrev")).not.toBeInTheDocument();
    expect(diffMarker('"beta": true')).toBe("+");
    expect(diffMarker('"on": true')).toBe(" ");
  });

  it("switches the diff when another version is selected", async () => {
    const user = userEvent.setup();
    renderTab();

    await user.click(selectButtons()[1]);
    expect(screen.getByText("flag.detail.history.diffTitle 2")).toBeInTheDocument();
    expect(rows()[1]).toHaveClass("bg-muted/60");
    expect(selectButtons()[1]).toHaveAttribute("aria-pressed", "true");
    expect(selectButtons()[0]).toHaveAttribute("aria-pressed", "false");
    expect(diffMarker('"off": false')).toBe("+");
    expect(diffText()).not.toContain("beta");

    // The initial version has nothing to compare against: its lines are added.
    await user.click(selectButtons()[2]);
    expect(screen.getByText("flag.detail.history.diffTitle 1")).toBeInTheDocument();
    expect(screen.getByText("flag.detail.history.noPrev")).toBeInTheDocument();
    expect(diffMarker('"on": true')).toBe("+");
  });

  const revertButtonTests = [
    { name: "editors can revert every non-current version", canEdit: true, want: 2 },
    { name: "read-only viewers cannot revert", canEdit: false, want: 0 },
  ];
  for (const tt of revertButtonTests) {
    it(tt.name, () => {
      renderTab({ canEdit: tt.canEdit });
      expect(
        screen.queryAllByRole("button", { name: "flag.detail.history.revert" }),
      ).toHaveLength(tt.want);
      expect(
        within(rows()[0]).queryByRole("button", { name: "flag.detail.history.revert" }),
      ).not.toBeInTheDocument();
      // Regression: the revert button used to be nested inside the row button.
      expect(document.querySelector("button button")).toBeNull();
    });
  }

  it("rolls back to a version and refreshes on success", async () => {
    const user = userEvent.setup();
    const { onReverted } = renderTab();

    const row = rows()[1];
    const revertBtn = within(row).getByRole("button", { name: "flag.detail.history.revert" });
    await user.click(revertBtn);

    expect(h.mutate).toHaveBeenCalledTimes(1);
    const [args, cbs] = h.mutate.mock.calls[0];
    expect(args.url).toMatch(/\/flags\/flag-1\/versions\/2\/rollback$/);
    expect(args.method).toBe("post");
    // Clicking revert must not change the selected version.
    expect(screen.getByText("flag.detail.history.diffTitle 3")).toBeInTheDocument();
    expect(revertBtn).toBeDisabled();

    act(() => cbs.onSuccess());
    expect(h.toastSuccess).toHaveBeenCalledWith("flag.detail.history.reverted 2");
    expect(h.refetch).toHaveBeenCalled();
    expect(onReverted).toHaveBeenCalled();
    expect(await within(row).findByRole("button", { name: "flag.detail.history.revert" })).toBeEnabled();
  });

  it("reports a failed rollback without refreshing", async () => {
    const user = userEvent.setup();
    const { onReverted } = renderTab();

    const revertBtn = within(rows()[2]).getByRole("button", { name: "flag.detail.history.revert" });
    await user.click(revertBtn);
    const [, cbs] = h.mutate.mock.calls[0];
    act(() => cbs.onError(new Error("boom")));

    expect(h.toastError).toHaveBeenCalledWith("flag.detail.history.revertError", {
      description: "boom",
    });
    expect(h.refetch).not.toHaveBeenCalled();
    expect(onReverted).not.toHaveBeenCalled();
  });
});
