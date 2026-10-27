import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FlagsetAPIKey } from "@/types/api";

const h = vi.hoisted(() => ({
  keys: [] as unknown,
  isLoading: false,
  url: "",
  refetch: vi.fn(),
  mutate: vi.fn(),
  copyToClipboard: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useCustom: (args: { url: string }) => {
    h.url = args.url;
    return { query: { data: { data: h.keys }, isLoading: h.isLoading, refetch: h.refetch } };
  },
  useCustomMutation: () => ({ mutate: h.mutate }),
}));
vi.mock("@/lib/clipboard", () => ({
  copyToClipboard: (v: string) => h.copyToClipboard(v),
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => h.toastSuccess(...a),
    error: (...a: unknown[]) => h.toastError(...a),
  },
}));

import { ApiKeysTab } from "./settings-api-keys-tab";

const key = (over: Partial<FlagsetAPIKey>): FlagsetAPIKey =>
  ({ id: "k1", label: "ci", apiKey: "goff_abc", createdAt: "", ...over }) as FlagsetAPIKey;
const user = () => userEvent.setup({ pointerEventsCheck: 0 });

beforeEach(() => {
  h.keys = [];
  h.isLoading = false;
  h.refetch.mockReset();
  h.mutate.mockReset();
  h.copyToClipboard.mockReset();
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

describe("ApiKeysTab list", () => {
  it("fetches the flagset's keys", () => {
    render(<ApiKeysTab flagsetId="fs-1" canManage />);
    expect(h.url).toMatch(/\/flagsets\/fs-1\/api-keys$/);
  });

  const tests = [
    { name: "loading", setup: () => (h.isLoading = true), want: "common.loading", notWant: "flagset.settings.keysEmpty" },
    { name: "empty", setup: () => {}, want: "flagset.settings.keysEmpty", notWant: "common.loading" },
    { name: "non-array payload is empty", setup: () => (h.keys = null), want: "flagset.settings.keysEmpty", notWant: "common.loading" },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      tt.setup();
      render(<ApiKeysTab flagsetId="fs-1" canManage />);
      expect(screen.getByText(tt.want)).toBeInTheDocument();
      expect(screen.queryByText(tt.notWant)).toBeNull();
    });
  }

  it("renders each key, with a dash for a missing label and the creator name", () => {
    h.keys = [
      key({ id: "k1", label: "ci", apiKey: "goff_1", createdByName: "Alice" }),
      key({ id: "k2", label: "", apiKey: "goff_2" }),
    ];
    render(<ApiKeysTab flagsetId="fs-1" canManage />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("ci")).toBeInTheDocument();
    expect(within(rows[0]).getByText("goff_1")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/· Alice/)).toBeInTheDocument();
    expect(within(rows[1]).getByText("—")).toBeInTheDocument();
  });
});

describe("ApiKeysTab roles", () => {
  const tests = [
    { name: "admin manages keys", canManage: true, wantManage: true },
    { name: "editor gets a read-only list", canManage: false, wantManage: false },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      h.keys = [key({})];
      render(<ApiKeysTab flagsetId="fs-1" canManage={tt.canManage} />);
      expect(screen.queryByRole("button", { name: "flagset.settings.generate" }) !== null).toBe(tt.wantManage);
      expect(screen.queryByRole("button", { name: "flagset.settings.revokeTitle" }) !== null).toBe(tt.wantManage);
      expect(screen.queryByText("flagset.settings.keysReadOnly") !== null).toBe(!tt.wantManage);
    });
  }
});

describe("ApiKeysTab copy", () => {
  const tests = [
    { name: "toasts success when copied", ok: true, wantToast: () => h.toastSuccess, msg: "common.copied" },
    { name: "toasts an error when the copy fails", ok: false, wantToast: () => h.toastError, msg: "common.copyError" },
  ];
  for (const tt of tests) {
    it(tt.name, async () => {
      h.keys = [key({ apiKey: "goff_secret" })];
      h.copyToClipboard.mockResolvedValue(tt.ok);
      render(<ApiKeysTab flagsetId="fs-1" canManage={false} />);
      await user().click(screen.getByRole("button", { name: "common.copy" }));
      expect(h.copyToClipboard).toHaveBeenCalledWith("goff_secret");
      await waitFor(() => expect(tt.wantToast()).toHaveBeenCalledWith(tt.msg));
    });
  }
});

describe("ApiKeysTab generate", () => {
  const openDialog = async (u: ReturnType<typeof user>) => {
    render(<ApiKeysTab flagsetId="fs-1" canManage />);
    await u.click(screen.getByRole("button", { name: "flagset.settings.generate" }));
    return screen.getByRole("dialog");
  };

  it("keeps Generate disabled until a non-blank label is typed", async () => {
    const u = user();
    const dialog = await openDialog(u);
    const submit = within(dialog).getByRole("button", { name: "flagset.settings.generate" });
    expect(submit).toBeDisabled();
    await u.type(within(dialog).getByRole("textbox"), "   {Enter}");
    expect(submit).toBeDisabled();
    expect(h.mutate).not.toHaveBeenCalled();
  });

  const submits = [
    { name: "via the button", submit: async (u: ReturnType<typeof user>, d: HTMLElement) => u.click(within(d).getByRole("button", { name: "flagset.settings.generate" })) },
    { name: "via Enter", submit: async (u: ReturnType<typeof user>, d: HTMLElement) => u.type(within(d).getByRole("textbox"), "{Enter}") },
  ];
  for (const tt of submits) {
    it(`posts the trimmed label ${tt.name}, then closes and refetches`, async () => {
      h.mutate.mockImplementation((_o, cbs) => cbs.onSuccess());
      const u = user();
      const dialog = await openDialog(u);
      await u.type(within(dialog).getByRole("textbox"), "  ci  ");
      await tt.submit(u, dialog);

      const [opts] = h.mutate.mock.calls[0];
      expect(opts.method).toBe("post");
      expect(opts.url).toMatch(/\/flagsets\/fs-1\/api-keys$/);
      expect(opts.values).toEqual({ label: "ci" });
      expect(h.toastSuccess).toHaveBeenCalledWith("flagset.settings.keyCreated");
      expect(h.refetch).toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  }

  it("toasts the error and keeps the dialog open on failure", async () => {
    h.mutate.mockImplementation((_o, cbs) => cbs.onError(new Error("quota")));
    const u = user();
    const dialog = await openDialog(u);
    await u.type(within(dialog).getByRole("textbox"), "ci{Enter}");
    expect(h.toastError).toHaveBeenCalledWith("flagset.settings.keyCreateError", { description: "quota" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("cancel closes the dialog", async () => {
    const u = user();
    const dialog = await openDialog(u);
    await u.click(within(dialog).getByRole("button", { name: "common.cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("ApiKeysTab revoke", () => {
  const revoke = async () => {
    h.keys = [key({ id: "k7", label: "old" })];
    const u = user();
    render(<ApiKeysTab flagsetId="fs-1" canManage />);
    await u.click(screen.getByRole("button", { name: "flagset.settings.revokeTitle" }));
    const dialog = screen.getByRole("alertdialog");
    await u.click(within(dialog).getByRole("button", { name: "flagset.settings.revoke" }));
  };

  it("deletes the key and refetches on success", async () => {
    h.mutate.mockImplementation((_o, cbs) => cbs.onSuccess());
    await revoke();
    const [opts] = h.mutate.mock.calls[0];
    expect(opts.method).toBe("delete");
    expect(opts.url).toMatch(/\/flagsets\/fs-1\/api-keys\/k7$/);
    expect(h.toastSuccess).toHaveBeenCalledWith("flagset.settings.revoked");
    expect(h.refetch).toHaveBeenCalled();
  });

  it("toasts the error on failure", async () => {
    h.mutate.mockImplementation((_o, cbs) => cbs.onError(new Error("nope")));
    await revoke();
    expect(h.toastError).toHaveBeenCalledWith("flagset.settings.revokeError", { description: "nope" });
    expect(h.refetch).not.toHaveBeenCalled();
  });

  it("cancel closes the confirmation without calling the API", async () => {
    h.keys = [key({})];
    const u = user();
    render(<ApiKeysTab flagsetId="fs-1" canManage />);
    await u.click(screen.getByRole("button", { name: "flagset.settings.revokeTitle" }));
    await u.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "common.cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(h.mutate).not.toHaveBeenCalled();
  });
});
