import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import type { Flagset } from "@/types/api";

const h = vi.hoisted(() => ({
  flagset: undefined as unknown,
  url: "",
  refetch: vi.fn(),
  canEdit: true,
  role: "admin" as string | undefined,
}));

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useCustom: (args: { url: string }) => {
    h.url = args.url;
    return { query: { data: h.flagset ? { data: h.flagset } : undefined, refetch: h.refetch } };
  },
}));
vi.mock("@/providers/access-control", () => ({
  canEditTeam: () => h.canEdit,
  effectiveTeamRole: () => h.role,
}));
vi.mock("@/components/refine-ui/views/list-view", () => ({
  ListView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Tabs have their own tests; stub them to expose the props the page passes.
type TabProps = { canWrite?: boolean; canManage?: boolean; canReadKeys?: boolean; onSaved?: () => void };
const { stub } = vi.hoisted(() => ({
  stub: (name: string) => (p: TabProps) => (
    <div data-testid={name}>
      {JSON.stringify({ canWrite: p.canWrite, canManage: p.canManage, canReadKeys: p.canReadKeys })}
      {p.onSaved && <button onClick={p.onSaved}>{`${name}-save`}</button>}
    </div>
  ),
}));
vi.mock("./settings-general-tab", () => ({ GeneralTab: stub("general") }));
vi.mock("./settings-api-keys-tab", () => ({ ApiKeysTab: stub("keys") }));
vi.mock("./code-sample-tab", () => ({ CodeSampleTab: stub("codeSample") }));
vi.mock("./settings-context-tab", () => ({ ContextTab: stub("context") }));
vi.mock("./settings-testing-context-tab", () => ({ SettingsTab: stub("settings") }));
vi.mock("./settings-danger-tab", () => ({ DangerTab: stub("danger") }));

import { FlagsetSettingsPage } from "./settings";

const fs = { id: "fs-1", teamId: "team-1", name: "prod" } as Flagset;
const user = () => userEvent.setup({ pointerEventsCheck: 0 });
const props = (testId: string) => JSON.parse(screen.getByTestId(testId).textContent!.replace(/\}.*$/, "}"));

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
  h.refetch.mockReset();
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
    { name: "admin lands on general and can write", canEdit: true, role: "admin", wantTab: "general", wantKeysTab: true, wantProps: { canWrite: true } },
    { name: "editor lands on general, read-only", canEdit: false, role: "editor", wantTab: "general", wantKeysTab: true, wantProps: { canWrite: false } },
    { name: "viewer lands on general and has no keys tab", canEdit: false, role: "viewer", wantTab: "general", wantKeysTab: false, wantProps: { canWrite: false } },
  ];
  for (const tt of roles) {
    it(tt.name, () => {
      h.canEdit = tt.canEdit;
      h.role = tt.role;
      renderAt();
      expect(screen.getByRole("heading", { name: "prod" })).toBeInTheDocument();
      expect(props(tt.wantTab)).toEqual(tt.wantProps);
      expect(screen.queryByRole("button", { name: "flagset.settings.apiKeys" }) !== null).toBe(tt.wantKeysTab);
    });
  }

  const tabs = [
    { label: "flagset.settings.general", testId: "general", want: { canWrite: true } },
    { label: "flagset.settings.apiKeys", testId: "keys", want: { canManage: true } },
    { label: "flagset.settings.codeSample", testId: "codeSample", want: { canReadKeys: true } },
    { label: "flagset.settings.context", testId: "context", want: { canWrite: true } },
    { label: "flagset.settings.settings", testId: "settings", want: { canWrite: true } },
  ];
  for (const tt of tabs) {
    it(`switches to the ${tt.testId} tab and refetches when it saves`, async () => {
      const u = user();
      renderAt();
      await u.click(screen.getByRole("button", { name: tt.label }));
      expect(props(tt.testId)).toEqual(tt.want);
      expect(screen.queryByTestId("general") === null).toBe(tt.testId !== "general");
      const saveBtn = screen.queryByRole("button", { name: `${tt.testId}-save` });
      if (saveBtn) {
        await u.click(saveBtn);
        expect(h.refetch).toHaveBeenCalled();
      }
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
    });
  }
});
