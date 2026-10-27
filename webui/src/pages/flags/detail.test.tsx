import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";

// Shared, hoisted mock state the module mocks below read from.
const h = vi.hoisted(() => ({
  useCustomImpl: (() => ({})) as (args: { url: string }) => unknown,
  mutate: vi.fn(),
  copyToClipboard: vi.fn().mockResolvedValue(true),
  perms: { canEdit: false, role: undefined as string | undefined, admin: false },
  // Per-test overrides merged into the mocked useFlagForm() result.
  form: {} as Record<string, unknown>,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: h.toastSuccess, error: h.toastError },
}));

vi.mock("@refinedev/core", async () => {
  const en = (await import("@/i18n/locales/en.json")).default as Record<
    string,
    unknown
  >;
  const resolve = (key: string): unknown =>
    key.split(".").reduce<unknown>(
      (o, p) => (o && typeof o === "object" ? (o as never)[p] : undefined),
      en,
    );
  const t = (key: string, params?: Record<string, unknown>) => {
    let s = resolve(key);
    if (typeof s !== "string") return key;
    if (params)
      for (const [k, v] of Object.entries(params))
        s = (s as string).replaceAll(`{{${k}}}`, String(v));
    return s as string;
  };
  return {
    useTranslate: () => t,
    useCustom: (args: { url: string }) => h.useCustomImpl(args),
    useCustomMutation: () => ({ mutate: h.mutate }),
  };
});

vi.mock("@/hooks/use-active-team", () => ({
  useActiveTeam: () => ({ activeTeamId: "team-1" }),
}));

vi.mock("@/hooks/use-recently-edited-flags", () => ({
  useInvalidateRecentlyEditedFlags: () => () => {},
}));

vi.mock("@/providers/access-control", () => ({
  canEditTeam: () => h.perms.canEdit,
  effectiveTeamRole: () => h.perms.role,
}));

vi.mock("@/lib/clipboard", () => ({
  copyToClipboard: (v: string) => h.copyToClipboard(v),
}));

// Keep the heavy editor internals out of these page-level tests.
vi.mock("@/components/flags/flag-form", () => ({
  useFlagForm: () => ({
    isDirty: false,
    valid: true,
    variationNames: ["on", "off"],
    rules: [],
    setRules: vi.fn(),
    defaultOutcome: {},
    setDefaultOutcome: vi.fn(),
    type: "boolean",
    variations: [],
    setVariations: vi.fn(),
    description: "",
    setDescription: vi.fn(),
    owner: "",
    setOwner: vi.fn(),
    tags: [],
    setTags: vi.fn(),
    customMetadata: {},
    setCustomMetadata: vi.fn(),
    buildPayload: vi.fn(),
    reset: vi.fn(),
    ...h.form,
  }),
  Field: ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <div>
      <span>{label}</span>
      {children}
    </div>
  ),
  RulesEditor: () => <div data-testid="rules-editor" />,
  VariationsEditor: () => <div data-testid="variations-editor" />,
  TagInput: () => <div data-testid="tag-input" />,
  RESERVED_META_KEYS: new Set(["owner", "description", "flagType", "tags"]),
}));

vi.mock("@/components/refine-ui/views/list-view", () => ({
  ListView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { FlagDetailPage } from "./detail";
import { DEFAULT_TESTING_CONTEXT } from "@/components/flags/evaluate-panel";

const FLAGSET = {
  id: "fs-1",
  name: "Checkout flagset",
  teamId: "team-1",
  description: "",
  apiKeyCount: 0,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

function makeFlag(disabled = false) {
  return {
    id: "flag-1",
    flagsetId: "fs-1",
    name: "my-feature",
    disabled,
    currentVersion: 1,
    payload: {
      variations: { on: true, off: false },
      targeting: [],
      defaultRule: { variation: "off" },
      metadata: { owner: "alice", description: "A feature" },
    },
  };
}

const refetchFlag = vi.fn();

function wireData(flag: ReturnType<typeof makeFlag> | undefined, isLoading = false) {
  h.useCustomImpl = (args: { url: string }) => {
    if (args.url.endsWith("/tags")) return { query: { data: { data: ["beta"] } } };
    if (args.url.endsWith("/versions"))
      return {
        query: {
          data: {
            data: {
              data: [
                {
                  id: "v1",
                  flagId: "flag-1",
                  versionNumber: 1,
                  payload: {},
                  createdByName: "Jane Doe",
                  createdAt: "2024-01-01T00:00:00Z",
                },
              ],
            },
          },
          isLoading: false,
        },
      };
    if (args.url.includes("/flagsets/"))
      return { query: { data: { data: FLAGSET }, isLoading: false } };
    return {
      query: { data: flag && { data: flag }, isLoading, refetch: refetchFlag },
    };
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/flags/flag-1"]}>
      <Routes>
        <Route path="/flags/:id" element={<FlagDetailPage />} />
        <Route path="/flagsets/:id" element={<div>flagset page</div>} />
        <Route path="/flags" element={<div>flags list page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openSettingsTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Settings" }));
}

beforeEach(() => {
  h.mutate.mockReset();
  h.form = {};
  refetchFlag.mockClear();
  h.toastSuccess.mockClear();
  h.toastError.mockClear();
  h.copyToClipboard.mockClear().mockResolvedValue(true);
  h.perms = { canEdit: false, role: undefined, admin: false };
  wireData(makeFlag(false));
});

describe("FlagDetailPage header", () => {
  it("renders the flag name and a flagset badge", () => {
    renderPage();
    expect(screen.getAllByText("my-feature").length).toBeGreaterThan(0);
    expect(screen.getByText("Checkout flagset")).toBeInTheDocument();
  });

  it("shows a Disabled badge only when the flag is disabled", () => {
    const { unmount } = renderPage();
    expect(screen.queryByText("Disabled")).not.toBeInTheDocument();
    unmount();

    wireData(makeFlag(true));
    renderPage();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });

  it("copies the flag key when the copy button is clicked", async () => {
    renderPage();
    // Synchronous click (no hover) so the Radix Tooltip trigger doesn't
    // re-render and detach the node mid-interaction under parallel load.
    fireEvent.click(
      screen.getByRole("button", { name: "Copy Feature Flag Name" }),
    );
    await waitFor(() =>
      expect(h.copyToClipboard).toHaveBeenCalledWith("my-feature"),
    );
  });

  it("no longer renders a 'View flagset' button", () => {
    renderPage();
    expect(
      screen.queryByRole("link", { name: /view flagset/i }),
    ).not.toBeInTheDocument();
  });
});

describe("FlagDetailPage settings tab", () => {
  it("links to the flagset configuration page", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await openSettingsTab(user);

    const link = screen.getByRole("link", { name: /Checkout flagset/ });
    expect(link).toHaveAttribute("href", "/flagsets/fs-1");
  });

  it("hides the Danger zone for read-only viewers", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await openSettingsTab(user);

    expect(screen.queryByText("Danger zone")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Disable flag" }),
    ).not.toBeInTheDocument();
  });

  it("shows the creator as a read-only 'Created by' field", async () => {
    h.perms = { canEdit: true, role: "editor", admin: true };
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await openSettingsTab(user);

    expect(screen.getByText("Created by")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    // No editable Owner input remains.
    expect(screen.queryByText("Owner")).not.toBeInTheDocument();
  });
});

describe("FlagDetailPage danger zone", () => {
  beforeEach(() => {
    h.perms = { canEdit: true, role: "editor", admin: true };
  });

  it("shows a 'Disable flag' action when the flag is enabled", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await openSettingsTab(user);

    expect(screen.getByText("Danger zone")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Disable flag" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Enable flag" }),
    ).not.toBeInTheDocument();
  });

  it("lets an editor (non-admin) delete the flag", async () => {
    // Pure editor: not a team admin, but holds the editor role.
    h.perms = { canEdit: false, role: "editor", admin: false };
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await openSettingsTab(user);

    expect(screen.getByText("Danger zone")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete flag" }),
    ).toBeInTheDocument();
  });

  it("shows an 'Enable flag' action when the flag is disabled", async () => {
    wireData(makeFlag(true));
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await openSettingsTab(user);

    expect(
      screen.getByRole("button", { name: "Enable flag" }),
    ).toBeInTheDocument();
  });

  it("confirms before toggling the flag", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await openSettingsTab(user);

    await user.click(screen.getByRole("button", { name: "Disable flag" }));
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(h.mutate).toHaveBeenCalledTimes(1));
    const callArgs = h.mutate.mock.calls[0][0];
    expect(callArgs.url).toMatch(/\/flags\/flag-1\/disable$/);
    expect(callArgs.values).toEqual({ disabled: true });
  });

  it("keeps the confirm button disabled until the flag name is typed", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await openSettingsTab(user);

    await user.click(screen.getByRole("button", { name: "Delete flag" }));
    const dialog = screen.getByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", { name: "Delete flag" });

    // Disabled with no input, and with a non-matching name.
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox"), "wrong-name");
    expect(confirm).toBeDisabled();

    // Enabled once the exact name is typed.
    await user.clear(within(dialog).getByRole("textbox"));
    await user.type(within(dialog).getByRole("textbox"), "my-feature");
    expect(confirm).toBeEnabled();
  });

  it("deletes the flag from the danger zone", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await openSettingsTab(user);

    await user.click(screen.getByRole("button", { name: "Delete flag" }));
    const dialog = screen.getByRole("alertdialog");
    await user.type(within(dialog).getByRole("textbox"), "my-feature");
    await user.click(within(dialog).getByRole("button", { name: "Delete flag" }));

    await waitFor(() => expect(h.mutate).toHaveBeenCalledTimes(1));
    const callArgs = h.mutate.mock.calls[0][0];
    expect(callArgs.url).toMatch(/\/flags\/flag-1$/);
    expect(callArgs.method).toBe("delete");
  });
});

describe("FlagDetailPage targeting tab", () => {
  // The targeting tab is the default tab, so its content renders on mount.

  it("shows the editor Tips callout for users who can edit", () => {
    h.perms = { canEdit: true, role: "editor", admin: true };
    renderPage();
    expect(screen.getByText("Tips")).toBeInTheDocument();
    expect(
      screen.getByText(/the first one that matches wins/i),
    ).toBeInTheDocument();
  });

  it("hides the editor Tips callout for read-only viewers", () => {
    // Default beforeEach perms are read-only.
    renderPage();
    expect(screen.queryByText("Tips")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/the first one that matches wins/i),
    ).not.toBeInTheDocument();
  });

  it("shows a rules-count badge on the Targeting tab when rules exist", () => {
    const flag = makeFlag(false);
    flag.payload.targeting = [
      { query: "a", variation: "on" },
      { query: "b", variation: "off" },
    ] as never;
    wireData(flag);
    renderPage();

    const tab = screen.getByRole("button", { name: /Targeting/ });
    expect(within(tab).getByText("2")).toBeInTheDocument();
  });

  it("omits the rules-count badge when there are no targeting rules", () => {
    // makeFlag() defaults to an empty targeting array (rulesCount === 0).
    renderPage();
    const tab = screen.getByRole("button", { name: /Targeting/ });
    expect(within(tab).queryByText("0")).not.toBeInTheDocument();
  });
});

describe("FlagDetailPage delete confirmation modal", () => {
  beforeEach(() => {
    h.perms = { canEdit: true, role: "editor", admin: true };
  });

  // Opens the Settings tab and the delete modal, returning the dialog element.
  async function openDeleteModal(user: ReturnType<typeof userEvent.setup>) {
    await openSettingsTab(user);
    await user.click(screen.getByRole("button", { name: "Delete flag" }));
    return screen.getByRole("alertdialog");
  }

  it("renders the title, description and the flag name as an inline code block", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    const dialog = await openDeleteModal(user);

    expect(within(dialog).getByText("Delete flag?")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/permanently removes the flag/i),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Type", { exact: false })).toBeInTheDocument();

    // The flag name is rendered inside a <code> element (markdown-style).
    const code = within(dialog).getByText("my-feature");
    expect(code.tagName).toBe("CODE");
  });

  it("requires an exact, case-sensitive match to enable the confirm button", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    const dialog = await openDeleteModal(user);
    const confirm = within(dialog).getByRole("button", { name: "Delete flag" });
    const input = within(dialog).getByRole("textbox");

    expect(confirm).toBeDisabled();

    // Wrong case stays disabled.
    await user.type(input, "MY-FEATURE");
    expect(confirm).toBeDisabled();

    // Trailing whitespace stays disabled.
    await user.clear(input);
    await user.type(input, "my-feature ");
    expect(confirm).toBeDisabled();

    // Exact match enables it.
    await user.clear(input);
    await user.type(input, "my-feature");
    expect(confirm).toBeEnabled();
  });

  it("cancelling closes the modal without deleting", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    const dialog = await openDeleteModal(user);

    // Even after typing the correct name, Cancel must not trigger a delete.
    await user.type(within(dialog).getByRole("textbox"), "my-feature");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("resets the typed confirmation when reopened after cancelling", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    const dialog = await openDeleteModal(user);

    await user.type(within(dialog).getByRole("textbox"), "my-feature");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );

    // Reopen: the input is cleared and the confirm button disabled again.
    await user.click(screen.getByRole("button", { name: "Delete flag" }));
    const reopened = screen.getByRole("alertdialog");
    expect(within(reopened).getByRole("textbox")).toHaveValue("");
    expect(
      within(reopened).getByRole("button", { name: "Delete flag" }),
    ).toBeDisabled();
  });
});

describe("FlagDetailPage left-menu navigation", () => {
  it("keeps the metadata pane mounted (only hidden) while another section is active", async () => {
    // The metadata editor is uncontrolled and must survive section switches so
    // in-progress rows aren't discarded — it stays in the DOM behind `hidden`
    // rather than being conditionally rendered like the other panes.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();

    // Default section is Targeting; the metadata pane should already be mounted.
    const metadataPane = screen.getByText(
      "Custom typed properties attached to this flag",
    );
    expect(metadataPane).toBeInTheDocument();
    // ...but its wrapper carries the `hidden` class while Targeting is active.
    expect(metadataPane.closest(".hidden")).not.toBeNull();

    // Switching to Settings keeps the metadata pane in the DOM (still mounted).
    await openSettingsTab(user);
    expect(
      screen.getByText("Custom typed properties attached to this flag"),
    ).toBeInTheDocument();
  });

  it("switches sections, unmounting the previously active pane", async () => {
    // Targeting and Settings panes are conditionally rendered, so navigating
    // away should remove the previous pane's content from the DOM.
    h.perms = { canEdit: true, role: "editor", admin: true };
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();

    // Targeting is the default section; its editor Tips callout is visible.
    expect(screen.getByText("Tips")).toBeInTheDocument();

    await openSettingsTab(user);

    // Settings content is now shown and the Targeting pane is unmounted.
    expect(screen.getByText("Danger zone")).toBeInTheDocument();
    expect(screen.queryByText("Tips")).not.toBeInTheDocument();
  });

  it("marks the active menu button and updates it on navigation", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();

    const targeting = screen.getByRole("button", { name: /Targeting/ });
    const settings = screen.getByRole("button", { name: "Settings" });

    // Targeting is active on mount: active gets the muted background + medium
    // weight; inactive buttons render muted-foreground text instead.
    expect(targeting).toHaveClass("bg-muted", "font-medium");
    expect(targeting).toHaveAttribute("aria-current", "true");
    expect(settings).toHaveClass("text-muted-foreground");
    expect(settings).not.toHaveAttribute("aria-current");

    await user.click(settings);

    expect(settings).toHaveClass("bg-muted", "font-medium");
    expect(settings).toHaveAttribute("aria-current", "true");
    expect(targeting).toHaveClass("text-muted-foreground");
    expect(targeting).not.toHaveAttribute("aria-current");
  });
});

describe("FlagDetailPage evaluate tab", () => {
  it("renders the Evaluate panel and seeds the default context fallback", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage(); // FLAGSET has no defaultTestingEvaluationContext → fallback
    await user.click(screen.getByRole("button", { name: "Evaluate" }));

    expect(screen.getByText("Test this flag")).toBeInTheDocument();
    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(ta.value).toBe(DEFAULT_TESTING_CONTEXT);
  });

  it("seeds the context from the flagset's configured default when set", async () => {
    // Wire a flagset that has a configured default testing context.
    h.useCustomImpl = (args: { url: string }) => {
      if (args.url.endsWith("/versions"))
        return { query: { data: { data: { data: [] } }, isLoading: false } };
      if (args.url.includes("/flagsets/"))
        return {
          query: {
            data: {
              data: { ...FLAGSET, defaultTestingEvaluationContext: { targetingKey: "cfg-key" } },
            },
            isLoading: false,
          },
        };
      return {
        query: { data: { data: makeFlag(false) }, isLoading: false, refetch: vi.fn() },
      };
    };
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await user.click(screen.getByRole("button", { name: "Evaluate" }));

    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(ta.value).toContain("cfg-key");
    expect(ta.value).not.toContain("thomas@gofeatureflag.org");
  });
});

describe("FlagDetailPage load states", () => {
  const tests = [
    { name: "shows a loading card", isLoading: true, want: "Loading..." },
    { name: "shows not found when the flag is missing", isLoading: false, want: "Flag not found." },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      wireData(undefined, tt.isLoading);
      renderPage();
      expect(screen.getByText(tt.want)).toBeInTheDocument();
      // The breadcrumb falls back to the route id.
      expect(screen.getByText("flag-1")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
    });
  }

  it("renders a flag whose payload has no metadata or targeting", () => {
    const flag = makeFlag(false);
    flag.payload = { variations: { on: true, off: false } } as never;
    wireData(flag);
    renderPage();
    expect(screen.queryByText(/alice/)).not.toBeInTheDocument();
    expect(screen.queryByText("A feature")).not.toBeInTheDocument();
    expect(screen.getByText("No targeting rules — every evaluation falls through to the default rule.")).toBeInTheDocument();
  });
});

describe("FlagDetailPage variations tab", () => {
  it("shows the variations editor to editors", async () => {
    h.perms = { canEdit: true, role: "editor", admin: true };
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await user.click(screen.getByRole("button", { name: /Variations/ }));

    expect(screen.getByTestId("variations-editor")).toBeInTheDocument();
    expect(screen.getByText("Type can't be changed after creation")).toBeInTheDocument();
  });

  it("shows read-only variation values to viewers", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await user.click(screen.getByRole("button", { name: /Variations/ }));

    expect(screen.queryByTestId("variations-editor")).not.toBeInTheDocument();
    expect(screen.getByText("true")).toBeInTheDocument();
    expect(screen.getByText("false")).toBeInTheDocument();
  });
});

describe("FlagDetailPage history and code sample tabs", () => {
  it("shows the version timeline", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await user.click(screen.getByRole("button", { name: "History" }));

    expect(screen.getByText("Timeline")).toBeInTheDocument();
    expect(screen.getByText("v1 · changes")).toBeInTheDocument();
  });

  it("shows the SDK code sample", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await user.click(screen.getByRole("button", { name: "Code sample" }));

    expect(screen.getByRole("radio", { name: "Python" })).toBeInTheDocument();
  });
});

describe("FlagDetailPage save bar", () => {
  beforeEach(() => {
    h.perms = { canEdit: true, role: "editor", admin: true };
  });

  it("is hidden while the form is pristine", () => {
    renderPage();
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("is hidden for read-only viewers even when the form is dirty", () => {
    h.perms = { canEdit: false, role: undefined, admin: false };
    h.form = { isDirty: true };
    renderPage();
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("saves the form as a new version with the trimmed comment", async () => {
    h.form = { isDirty: true, buildPayload: () => ({ variations: { a: 1 } }) };
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();

    await user.type(screen.getByPlaceholderText("Describe this change (optional)"), "  tweak  ");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(h.mutate).toHaveBeenCalledTimes(1);
    const [args, cbs] = h.mutate.mock.calls[0];
    expect(args.url).toMatch(/\/flags\/flag-1$/);
    expect(args.method).toBe("put");
    expect(args.values).toEqual({ comment: "tweak", payload: { variations: { a: 1 } } });
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

    act(() => cbs.onSuccess());
    expect(h.toastSuccess).toHaveBeenCalledWith("Flag saved");
    expect(refetchFlag).toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Describe this change (optional)")).toHaveValue("");
  });

  it("reports a failed save and re-enables the button", async () => {
    h.form = { isDirty: true };
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    act(() => h.mutate.mock.calls[0][1].onError(new Error("conflict")));
    expect(h.toastError).toHaveBeenCalledWith("Failed to save flag", { description: "conflict" });
    expect(refetchFlag).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("blocks saving an invalid form", () => {
    h.form = { isDirty: true, valid: false };
    renderPage();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByText("Fix validation errors before saving.")).toBeInTheDocument();
  });

  it("discards the changes", async () => {
    const reset = vi.fn();
    h.form = { isDirty: true, reset };
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(reset).toHaveBeenCalled();
  });
});

describe("FlagDetailPage danger zone results", () => {
  beforeEach(() => {
    h.perms = { canEdit: true, role: "editor", admin: true };
  });

  async function confirmDisable(user: ReturnType<typeof userEvent.setup>) {
    await openSettingsTab(user);
    await user.click(screen.getByRole("button", { name: "Disable flag" }));
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
  }

  it("refreshes the flag after toggling it", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await confirmDisable(user);

    act(() => h.mutate.mock.calls[0][1].onSuccess());
    expect(h.toastSuccess).toHaveBeenCalledWith("Flag disabled");
    expect(refetchFlag).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("reports a failed toggle", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await confirmDisable(user);

    act(() => h.mutate.mock.calls[0][1].onError(new Error("denied")));
    expect(h.toastError).toHaveBeenCalledWith("Failed to update flag", { description: "denied" });
    expect(refetchFlag).not.toHaveBeenCalled();
  });

  async function confirmDelete(user: ReturnType<typeof userEvent.setup>) {
    await openSettingsTab(user);
    await user.click(screen.getByRole("button", { name: "Delete flag" }));
    const dialog = screen.getByRole("alertdialog");
    await user.type(within(dialog).getByRole("textbox"), "my-feature");
    await user.click(within(dialog).getByRole("button", { name: "Delete flag" }));
  }

  it("returns to the flags list after deleting", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await confirmDelete(user);

    act(() => h.mutate.mock.calls[0][1].onSuccess());
    expect(h.toastSuccess).toHaveBeenCalledWith("Flag deleted");
    expect(await screen.findByText("flags list page")).toBeInTheDocument();
  });

  it("stays on the page when deleting fails", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await confirmDelete(user);

    act(() => h.mutate.mock.calls[0][1].onError(new Error("in use")));
    expect(h.toastError).toHaveBeenCalledWith("Failed to delete flag", { description: "in use" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.queryByText("flags list page")).not.toBeInTheDocument();
  });
});
