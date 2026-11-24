import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Notifier } from "@/types/api";

const h = vi.hoisted(() => ({
  notifiers: [] as unknown,
  isLoading: false,
  isPending: false,
  url: "",
  refetch: vi.fn(),
  mutate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useCustom: (args: { url: string }) => {
    h.url = args.url;
    return { query: { data: { data: h.notifiers }, isLoading: h.isLoading, refetch: h.refetch } };
  },
  useCustomMutation: () => ({ mutate: h.mutate, mutation: { isPending: h.isPending } }),
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => h.toastSuccess(...a),
    error: (...a: unknown[]) => h.toastError(...a),
  },
}));

import { NotifiersTab } from "./settings-notifiers-tab";
import { isHttpUrl } from "./notifier-dialog";

const slack: Notifier = { name: "#flags", kind: "slack", enabled: true, webhookUrl: "https://hooks.slack.com/x" };
const hook: Notifier = {
  name: "Audit",
  kind: "webhook",
  enabled: false,
  endpointUrl: "https://audit.example/goff",
  secret: "s3cret",
  headers: { Authorization: "Bearer t" },
};
const user = () => userEvent.setup({ pointerEventsCheck: 0 });
const T = (k: string) => `flagset.settings.notifiers.${k}`;
// The PUT body of the n-th save.
const saved = (n = 0) => (h.mutate.mock.calls[n][0] as { values: { notifiers: Notifier[] } }).values.notifiers;

beforeEach(() => {
  h.notifiers = [];
  h.isLoading = false;
  h.isPending = false;
  h.refetch.mockReset();
  h.mutate.mockReset();
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

describe("NotifiersTab list", () => {
  it("fetches the flagset's notifiers", () => {
    render(<NotifiersTab flagsetId="fs-1" canManage />);
    expect(h.url).toMatch(/\/flagsets\/fs-1\/notifiers$/);
  });

  const states = [
    { name: "loading", setup: () => (h.isLoading = true), wantLoading: true },
    { name: "empty", setup: () => {}, wantLoading: false },
    { name: "non-array payload is empty", setup: () => (h.notifiers = null), wantLoading: false },
  ];
  for (const tt of states) {
    it(tt.name, () => {
      tt.setup();
      render(<NotifiersTab flagsetId="fs-1" canManage />);
      expect(screen.queryByLabelText("common.loading") !== null).toBe(tt.wantLoading);
      expect(screen.queryByText(T("emptyTitle")) !== null).toBe(!tt.wantLoading);
    });
  }

  it("renders each notifier with its kind, target and state", () => {
    h.notifiers = [slack, hook, { name: "Room", kind: "microsoftteams", enabled: true }];
    render(<NotifiersTab flagsetId="fs-1" canManage />);
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("#flags")).toBeInTheDocument();
    expect(within(rows[0]).getByText(T("slack.label"))).toBeInTheDocument();
    expect(within(rows[0]).getByText("https://hooks.slack.com/x")).toBeInTheDocument();
    expect(within(rows[0]).getByRole("switch")).toBeChecked();
    expect(within(rows[1]).getByText("https://audit.example/goff")).toBeInTheDocument();
    expect(within(rows[1]).getByRole("switch")).not.toBeChecked();
    expect(within(rows[2]).getByText(T("noUrl"))).toBeInTheDocument();
    expect(screen.getByText(T("summary"))).toBeInTheDocument();
  });
});

describe("NotifiersTab roles", () => {
  const tests = [
    { name: "admin manages notifiers", canManage: true },
    { name: "editor gets a read-only list", canManage: false },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      h.notifiers = [slack];
      render(<NotifiersTab flagsetId="fs-1" canManage={tt.canManage} />);
      expect(screen.queryAllByRole("button", { name: T("addKind") })).toHaveLength(tt.canManage ? 4 : 0);
      expect(screen.queryByRole("button", { name: T("edit") }) !== null).toBe(tt.canManage);
      expect(screen.getByRole("switch").hasAttribute("disabled")).toBe(!tt.canManage);
      expect(screen.queryByText(T("readOnly")) !== null).toBe(!tt.canManage);
    });
  }

  const empty = [
    { name: "admin's empty state points at the kind cards", canManage: true, want: T("emptyDesc") },
    { name: "editor's empty state says an admin can add one", canManage: false, want: T("emptyReadOnly") },
  ];
  for (const tt of empty) {
    it(tt.name, () => {
      render(<NotifiersTab flagsetId="fs-1" canManage={tt.canManage} />);
      expect(screen.getByText(tt.want)).toBeInTheDocument();
    });
  }
});

describe("NotifiersTab saving", () => {
  it("switching a notifier saves the list with it flipped", async () => {
    h.notifiers = [slack, hook];
    render(<NotifiersTab flagsetId="fs-1" canManage />);
    await user().click(screen.getAllByRole("switch")[1]);
    expect(h.mutate.mock.calls[0][0]).toMatchObject({ method: "put", url: expect.stringMatching(/\/notifiers$/) });
    expect(saved()).toEqual([slack, { ...hook, enabled: true }]);
  });

  const outcomes = [
    { name: "success toasts and refetches", ok: true },
    { name: "failure toasts the error", ok: false },
  ];
  for (const tt of outcomes) {
    it(tt.name, async () => {
      h.notifiers = [slack];
      h.mutate.mockImplementation((_a, o: { onSuccess: () => void; onError: (e: Error) => void }) =>
        tt.ok ? o.onSuccess() : o.onError(new Error("boom")),
      );
      render(<NotifiersTab flagsetId="fs-1" canManage />);
      await user().click(screen.getByRole("switch"));
      if (tt.ok) {
        expect(h.toastSuccess).toHaveBeenCalledWith(T("saved"));
        expect(h.refetch).toHaveBeenCalled();
      } else {
        expect(h.toastError).toHaveBeenCalledWith(T("saveError"), { description: "boom" });
      }
    });
  }
});

describe("NotifierDialog add", () => {
  // Kind cards come in order: slack, discord, microsoftteams, webhook.
  const addKind = async (u: ReturnType<typeof user>, i: number) => {
    await u.click(screen.getAllByRole("button", { name: T("addKind") })[i]);
    return screen.getByRole("dialog");
  };
  const pickSlack = (u: ReturnType<typeof user>) => addKind(u, 0);

  it("picks a kind, names it after the kind and appends it once the URL is valid", async () => {
    h.notifiers = [slack];
    const u = user();
    render(<NotifiersTab flagsetId="fs-1" canManage />);
    const dialog = await pickSlack(u);
    expect(within(dialog).getByText(T("addTitle"))).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "common.remove" })).toBeNull();
    expect(within(dialog).getByLabelText(T("name"))).toHaveValue("flagset.settings.notifiers.slack.label 2");
    const add = within(dialog).getByRole("button", { name: T("add") });
    expect(add).toBeDisabled();

    const url = within(dialog).getByLabelText(T("webhookUrl"));
    await u.type(url, "not a url");
    expect(within(dialog).getByText(T("urlInvalid"))).toBeInTheDocument();
    expect(add).toBeDisabled();

    await u.clear(url);
    await u.type(url, " https://hooks.slack.com/new ");
    await u.click(add);
    expect(saved()).toEqual([
      slack,
      { name: "flagset.settings.notifiers.slack.label 2", kind: "slack", enabled: true, webhookUrl: "https://hooks.slack.com/new" },
    ]);
  });

  const closes = [
    { name: "cancel", close: (u: ReturnType<typeof user>, d: HTMLElement) => u.click(within(d).getByRole("button", { name: "common.cancel" })) },
    { name: "Escape", close: (u: ReturnType<typeof user>) => u.keyboard("{Escape}") },
  ];
  for (const tt of closes) {
    it(`${tt.name} closes without saving`, async () => {
      h.notifiers = [slack];
      const u = user();
      render(<NotifiersTab flagsetId="fs-1" canManage />);
      const dialog = await pickSlack(u);
      await tt.close(u, dialog);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(h.mutate).not.toHaveBeenCalled();
    });
  }

  it("adds a webhook with a secret and its non-blank headers", async () => {
    const u = user();
    render(<NotifiersTab flagsetId="fs-1" canManage />);
    const dialog = await addKind(u, 3);
    await u.type(within(dialog).getByLabelText(T("endpointUrl")), "https://x.example/hook");
    await u.type(within(dialog).getByLabelText(new RegExp(T("secret"))), "k");
    await u.click(within(dialog).getByRole("button", { name: T("addHeader") }));
    await u.click(within(dialog).getByRole("button", { name: T("addHeader") }));
    await u.type(within(dialog).getAllByLabelText(T("headerName"))[0], "X-Team");
    await u.type(within(dialog).getAllByLabelText(T("headerValue"))[0], "web");
    await u.click(within(dialog).getByRole("button", { name: T("add") }));
    expect(saved()).toEqual([
      {
        name: T("webhook.label"),
        kind: "webhook",
        enabled: true,
        endpointUrl: "https://x.example/hook",
        secret: "k",
        headers: { "X-Team": "web" },
      },
    ]);
  });

  it("adds a webhook without a secret or headers, leaving both out", async () => {
    const u = user();
    render(<NotifiersTab flagsetId="fs-1" canManage />);
    const dialog = await addKind(u, 3);
    await u.type(within(dialog).getByLabelText(T("endpointUrl")), "https://x.example/hook");
    await u.click(within(dialog).getByRole("button", { name: T("add") }));
    expect(saved()).toEqual([
      { name: T("webhook.label"), kind: "webhook", enabled: true, endpointUrl: "https://x.example/hook" },
    ]);
  });
});

describe("NotifierDialog edit", () => {
  const openEdit = async (u: ReturnType<typeof user>, row: number) => {
    render(<NotifiersTab flagsetId="fs-1" canManage />);
    await u.click(screen.getAllByRole("button", { name: T("edit") })[row]);
    return screen.getByRole("dialog");
  };

  it("prefills the webhook and saves it in place", async () => {
    h.notifiers = [slack, hook];
    const u = user();
    const dialog = await openEdit(u, 1);
    expect(within(dialog).getByLabelText(T("endpointUrl"))).toHaveValue("https://audit.example/goff");
    expect(within(dialog).getAllByLabelText(T("headerName"))[0]).toHaveValue("Authorization");
    await u.click(within(dialog).getByRole("button", { name: T("removeHeader") }));
    await u.click(within(dialog).getByRole("button", { name: T("save") }));
    expect(saved()).toEqual([slack, { name: "Audit", kind: "webhook", enabled: false, endpointUrl: "https://audit.example/goff", secret: "s3cret" }]);
  });

  it("removes only once confirmed", async () => {
    h.notifiers = [slack, hook];
    const u = user();
    const dialog = await openEdit(u, 0);
    await u.click(within(dialog).getByRole("button", { name: "common.remove" }));
    const confirm = screen.getByRole("alertdialog");
    expect(within(confirm).getByText(T("removeTitle"))).toBeInTheDocument();
    expect(h.mutate).not.toHaveBeenCalled();
    await u.click(within(confirm).getByRole("button", { name: "common.cancel" }));
    expect(h.mutate).not.toHaveBeenCalled();
    await u.click(within(dialog).getByRole("button", { name: "common.remove" }));
    await u.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "common.remove" }));
    expect(saved()).toEqual([hook]);
  });

  it("can't save without a name", async () => {
    h.notifiers = [slack];
    const u = user();
    const dialog = await openEdit(u, 0);
    await u.clear(within(dialog).getByLabelText(T("name")));
    expect(within(dialog).getByRole("button", { name: T("save") })).toBeDisabled();
  });
});

describe("isHttpUrl", () => {
  const tests = [
    { in: "https://hooks.slack.com/x", want: true },
    { in: " http://localhost:8080/hook ", want: true },
    { in: "ftp://x.example", want: false },
    { in: "hooks.slack.com/x", want: false },
    { in: "", want: false },
    { in: undefined, want: false },
  ];
  for (const tt of tests) {
    it(`${JSON.stringify(tt.in)} -> ${tt.want}`, () => expect(isHttpUrl(tt.in)).toBe(tt.want));
  }
});
