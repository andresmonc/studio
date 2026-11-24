import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import type { Flagset } from "@/types/api";

const h = vi.hoisted(() => ({
  flagset: undefined as unknown,
  url: "",
  refetch: vi.fn(),
  mutate: vi.fn(),
  setWarnWhen: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  canEdit: true,
  role: "admin" as string | undefined,
}));

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useCustom: (args: { url: string }) => {
    h.url = args.url;
    return { query: { data: h.flagset ? { data: h.flagset } : undefined, refetch: h.refetch } };
  },
  useCustomMutation: () => ({ mutate: h.mutate }),
  useWarnAboutChange: () => ({ setWarnWhen: h.setWarnWhen }),
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => h.toastSuccess(...a),
    error: (...a: unknown[]) => h.toastError(...a),
  },
}));
vi.mock("@/providers/access-control", () => ({
  canEditTeam: () => h.canEdit,
  effectiveTeamRole: () => h.role,
}));
vi.mock("@/components/refine-ui/views/list-view", () => ({
  ListView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Keys, notifiers and danger zone have their own tests and their own actions; stub them.
// The editable sections stay real: the page owns their draft and save bar.
type TabProps = { canManage?: boolean };
const { stub } = vi.hoisted(() => ({
  stub: (name: string) => (p: TabProps) => (
    <div data-testid={name}>{JSON.stringify({ canManage: p.canManage })}</div>
  ),
}));
vi.mock("./settings-api-keys-tab", () => ({ ApiKeysTab: stub("keys") }));
vi.mock("./settings-notifiers-tab", () => ({ NotifiersTab: stub("notifiers") }));
vi.mock("./settings-danger-tab", () => ({ DangerTab: stub("danger") }));

import { FlagsetSettingsPage } from "./settings";

const fs = {
  id: "fs-1",
  teamId: "team-1",
  name: "prod",
  description: "Production",
  defaultTestingEvaluationContext: { targetingKey: "abc" },
  evaluationContextEnrichment: { limit: 1 },
  pollingInterval: 60000,
  startWithRetrieverError: false,
  enablePollingJitter: true,
  disableNotifierOnInit: false,
  environment: "staging",
} as unknown as Flagset;
const user = () => userEvent.setup({ pointerEventsCheck: 0 });
const props = (testId: string) => JSON.parse(screen.getByTestId(testId).textContent!);
const nameInput = () => screen.getByLabelText("common.name") as HTMLInputElement;
const testingCtx = () => screen.getByDisplayValue(/targetingKey/) as HTMLTextAreaElement;
const pollingInput = () => screen.getByLabelText("flagset.settings.pollingInterval") as HTMLInputElement;
const enrichValue = () => screen.getByPlaceholderText("flagset.value") as HTMLInputElement;
const saveBtn = () => screen.queryByRole("button", { name: "flagset.settings.saveChanges" });
const openTab = (label: string) => fireEvent.click(screen.getByRole("button", { name: label }));

const renderAt = (path = "/flagsets/fs-1") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/flagsets" element={<div>LIST PAGE</div>} />
        <Route path="/flagsets/:id" element={<FlagsetSettingsPage />} />
        <Route path="/no-id" element={<FlagsetSettingsPage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  h.flagset = fs;
  h.canEdit = true;
  h.role = "admin";
  h.refetch.mockReset().mockResolvedValue(undefined);
  h.mutate.mockReset();
  h.setWarnWhen.mockReset();
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

describe("FlagsetSettingsPage", () => {
  it("redirects to the list when there is no id", () => {
    renderAt("/no-id");
    expect(screen.getByText("LIST PAGE")).toBeInTheDocument();
  });

  it("shows a loading state until the flagset arrives", () => {
    h.flagset = undefined;
    renderAt();
    expect(h.url).toMatch(/\/flagsets\/fs-1$/);
    expect(screen.getByText("common.loading")).toBeInTheDocument();
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.getByText("flagset.settings.title")).toBeInTheDocument();
  });

  it("links to the flagset's flags", () => {
    renderAt();
    expect(screen.getByRole("link", { name: /flagset.settings.viewFlags/ })).toHaveAttribute(
      "href",
      "/flags?flagset=fs-1",
    );
  });

  const roles = [
    { name: "admin lands on settings and can write", canEdit: true, role: "admin", wantDisabled: false, wantKeysTab: true },
    { name: "editor lands on settings, read-only", canEdit: false, role: "editor", wantDisabled: true, wantKeysTab: true },
    { name: "viewer lands on settings and has no keys or notifiers tab", canEdit: false, role: "viewer", wantDisabled: true, wantKeysTab: false },
  ];
  for (const tt of roles) {
    it(tt.name, () => {
      h.canEdit = tt.canEdit;
      h.role = tt.role;
      renderAt();
      expect(screen.getByRole("heading", { name: "prod" })).toBeInTheDocument();
      expect(nameInput().disabled).toBe(tt.wantDisabled);
      expect(screen.queryByRole("button", { name: "flagset.settings.apiKeys" }) !== null).toBe(tt.wantKeysTab);
      expect(screen.queryByRole("button", { name: "flagset.settings.notifiers.title" }) !== null).toBe(tt.wantKeysTab);
    });
  }

  it("a flagset without contexts seeds the default testing context and no enrichment", () => {
    h.flagset = { ...fs, defaultTestingEvaluationContext: undefined, evaluationContextEnrichment: undefined };
    renderAt();
    expect(screen.getByDisplayValue(/targetingKey/)).toBeInTheDocument();
    openTab("flagset.settings.context");
    expect(screen.queryByPlaceholderText("flagset.value")).toBeNull();
    expect(saveBtn()).toBeNull();
  });

  it("falls back to settings when the open secret tab is no longer readable", () => {
    const { rerender } = renderAt();
    openTab("flagset.settings.apiKeys");
    expect(screen.getByTestId("keys")).toBeInTheDocument();
    // Permissions are refetched: the user is now a viewer.
    h.canEdit = false;
    h.role = "viewer";
    rerender(
      <MemoryRouter initialEntries={["/flagsets/fs-1"]}>
        <Routes>
          <Route path="/flagsets/:id" element={<FlagsetSettingsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("keys")).toBeNull();
    expect(nameInput()).toBeDisabled();
  });

  it("switches to the keys tab", () => {
    renderAt();
    openTab("flagset.settings.apiKeys");
    expect(props("keys")).toEqual({ canManage: true });
    expect(screen.queryByLabelText("common.name")).toBeNull();
  });

  it("switches to the notifiers tab, which saves on its own", () => {
    renderAt();
    openTab("flagset.settings.notifiers.title");
    expect(props("notifiers")).toEqual({ canManage: true });
    expect(saveBtn()).toBeNull();
  });

  it("shows no save bar until something changes, and none after editing back", () => {
    renderAt();
    expect(saveBtn()).toBeNull();
    fireEvent.change(nameInput(), { target: { value: "production" } });
    expect(screen.getByText("flagset.settings.unsavedChanges")).toBeInTheDocument();
    fireEvent.change(nameInput(), { target: { value: "prod" } });
    expect(saveBtn()).toBeNull();
  });

  it("asks before leaving only while there are unsaved changes", () => {
    const { unmount } = renderAt();
    expect(h.setWarnWhen).toHaveBeenLastCalledWith(false);
    fireEvent.change(nameInput(), { target: { value: "production" } });
    expect(h.setWarnWhen).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "flagset.settings.discard" }));
    expect(h.setWarnWhen).toHaveBeenLastCalledWith(false);
    fireEvent.change(nameInput(), { target: { value: "production" } });
    unmount();
    expect(h.setWarnWhen).toHaveBeenLastCalledWith(false);
  });

  it("never asks read-only users", () => {
    h.canEdit = false;
    h.role = "editor";
    renderAt();
    fireEvent.change(nameInput(), { target: { value: "production" } });
    expect(h.setWarnWhen).not.toHaveBeenCalledWith(true);
  });

  it("saves edits from both tabs in one PATCH with only the changed fields", async () => {
    h.mutate.mockImplementation((_o, cbs) => cbs.onSuccess());
    renderAt();
    fireEvent.change(nameInput(), { target: { value: "production" } });
    openTab("flagset.settings.context");
    fireEvent.change(enrichValue(), { target: { value: "2" } });
    openTab("flagset.settings.settings");
    // The draft survives the tab round-trip.
    expect(nameInput().value).toBe("production");
    fireEvent.click(saveBtn()!);

    expect(h.mutate).toHaveBeenCalledTimes(1);
    const [opts] = h.mutate.mock.calls[0];
    expect(opts.method).toBe("patch");
    expect(opts.url).toMatch(/\/flagsets\/fs-1$/);
    expect(opts.values).toEqual({ name: "production", evaluationContextEnrichment: { limit: 2 } });
    expect(h.toastSuccess).toHaveBeenCalledWith("flagset.settings.saved");
    expect(h.refetch).toHaveBeenCalled();
    // Refetch is mocked to return the old flagset, so once the draft is
    // dropped the form mirrors it again and the bar goes away.
    expect(await screen.findByDisplayValue("prod")).toBeInTheDocument();
    expect(saveBtn()).toBeNull();
  });

  it("sends an edited description, capped natively", () => {
    renderAt();
    const desc = screen.getByLabelText("common.description");
    expect(nameInput()).toHaveAttribute("maxLength", "120");
    expect(desc).toHaveAttribute("maxLength", "500");
    fireEvent.change(desc, { target: { value: "Live" } });
    fireEvent.click(saveBtn()!);
    expect(h.mutate.mock.calls[0][0].values).toEqual({ description: "Live" });
  });

  it("sends the polling interval as a number and links its docs", () => {
    renderAt();
    expect(pollingInput().value).toBe("60000");
    expect(screen.getByRole("link", { name: "flagset.settings.pollingIntervalDocs" })).toHaveAttribute(
      "href",
      expect.stringContaining("#flagsetpollinginterval"),
    );
    fireEvent.change(pollingInput(), { target: { value: "5000" } });
    fireEvent.click(saveBtn()!);
    expect(h.mutate.mock.calls[0][0].values).toEqual({ pollingInterval: 5000 });
  });

  const relayEdits = [
    { name: "turns a switch on", label: "flagset.settings.startWithRetrieverError", toggle: true, want: { startWithRetrieverError: true } },
    { name: "turns a switch off", label: "flagset.settings.enablePollingJitter", toggle: true, want: { enablePollingJitter: false } },
    { name: "turns disable-notifier on", label: "flagset.settings.disableNotifierOnInit", toggle: true, want: { disableNotifierOnInit: true } },
    { name: "sets the environment", label: "flagset.settings.environment", value: "production", want: { environment: "production" } },
    { name: "clears the environment", label: "flagset.settings.environment", value: "", want: { environment: "" } },
  ];
  for (const tt of relayEdits) {
    it(`relay proxy: ${tt.name}`, () => {
      renderAt();
      const control = screen.getByLabelText(tt.label);
      // Each control is described by the hint shown above/beside it.
      expect(control).toHaveAccessibleDescription(`${tt.label}Hint`);
      if (tt.toggle) fireEvent.click(control);
      else fireEvent.change(control, { target: { value: tt.value } });
      fireEvent.click(saveBtn()!);
      expect(h.mutate.mock.calls[0][0].values).toEqual(tt.want);
    });
  }

  it("caps the environment natively", () => {
    renderAt();
    expect(screen.getByLabelText("flagset.settings.environment")).toHaveAttribute("maxLength", "120");
  });

  it("sends the parsed testing context", () => {
    renderAt();
    fireEvent.change(testingCtx(), { target: { value: '{"targetingKey":"x"}' } });
    fireEvent.click(saveBtn()!);
    expect(h.mutate.mock.calls[0][0].values).toEqual({ defaultTestingEvaluationContext: { targetingKey: "x" } });
  });

  it("toasts the error and keeps the draft when the PATCH fails", () => {
    h.mutate.mockImplementation((_o, cbs) => cbs.onError(new Error("taken")));
    renderAt();
    fireEvent.change(nameInput(), { target: { value: "production" } });
    fireEvent.click(saveBtn()!);
    expect(h.toastError).toHaveBeenCalledWith("flagset.updateError", { description: "taken" });
    expect(nameInput().value).toBe("production");
    expect(saveBtn()).toBeEnabled();
  });

  it("discard restores the server values in both tabs", () => {
    renderAt();
    fireEvent.change(nameInput(), { target: { value: "production" } });
    openTab("flagset.settings.context");
    fireEvent.change(enrichValue(), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "flagset.settings.discard" }));
    expect(enrichValue().value).toBe("1");
    openTab("flagset.settings.settings");
    expect(nameInput().value).toBe("prod");
    expect(saveBtn()).toBeNull();
  });

  const invalid = [
    { name: "empty name", edit: () => fireEvent.change(nameInput(), { target: { value: " " } }), wantText: "flagset.nameRequired" },
    { name: "testing context not JSON", edit: () => fireEvent.change(testingCtx(), { target: { value: "{ broken" } }), wantText: "flagset.settings.defaultTestingContextInvalid" },
    { name: "testing context is an array", edit: () => fireEvent.change(testingCtx(), { target: { value: "[1]" } }), wantText: "flagset.settings.defaultTestingContextInvalid" },
    ...["999", "86400001", "1500.5", ""].map((v) => ({
      name: `polling interval "${v}"`,
      edit: () => fireEvent.change(pollingInput(), { target: { value: v } }),
      wantText: "flagset.settings.pollingIntervalInvalid",
    })),
    {
      name: "invalid enrichment value",
      edit: () => {
        openTab("flagset.settings.context");
        fireEvent.change(enrichValue(), { target: { value: "abc" } });
      },
      wantText: "flagset.settings.invalid",
    },
  ];
  for (const tt of invalid) {
    it(`blocks saving on ${tt.name}`, () => {
      renderAt();
      tt.edit();
      expect(saveBtn()).toBeDisabled();
      expect(screen.getByText("flagset.settings.invalid")).toBeInTheDocument();
      expect(screen.getAllByText(tt.wantText).length).toBeGreaterThan(0);
    });
  }

  const danger = [
    { name: "admin sees the danger zone", canEdit: true, role: "admin", want: true },
    { name: "editor does not", canEdit: false, role: "editor", want: false },
  ];
  for (const tt of danger) {
    it(tt.name, async () => {
      h.canEdit = tt.canEdit;
      h.role = tt.role;
      renderAt();
      await user().click(screen.getByRole("button", { name: "flagset.settings.settings" }));
      expect(screen.queryByTestId("danger") !== null).toBe(tt.want);
      fireEvent.change(nameInput(), { target: { value: "x" } });
      // Read-only users never get a save bar.
      expect(saveBtn() !== null).toBe(tt.want);
    });
  }
});
