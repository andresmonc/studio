import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { useForm as useRHForm } from "react-hook-form";
import type { Flagset } from "@/types/api";

const h = vi.hoisted(() => ({
  activeTeamId: "team-1" as string | null,
  canEdit: true,
  role: "admin" as string | undefined,
  flagsets: [] as unknown,
  isLoading: false,
  refetch: vi.fn(),
  mutate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useCustom: () => ({
    query: { data: { data: h.flagsets }, isLoading: h.isLoading, refetch: h.refetch },
  }),
  useCustomMutation: () => ({ mutate: h.mutate }),
}));
vi.mock("@refinedev/react-hook-form", () => ({ useForm: useRHForm }));
vi.mock("@/hooks/use-active-team", () => ({
  useActiveTeam: () => ({
    activeTeamId: h.activeTeamId,
    memberships: [{ teamId: "team-1", teamName: "Checkout" }],
  }),
}));
vi.mock("@/providers/access-control", () => ({
  canEditTeam: () => h.canEdit,
  effectiveTeamRole: () => h.role,
}));
vi.mock("@/components/views/list-view", () => ({
  ListView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => h.toastSuccess(...a),
    error: (...a: unknown[]) => h.toastError(...a),
  },
}));

import { FlagsetsPage } from "./index";

const fs = (over: Partial<Flagset>): Flagset =>
  ({
    id: "fs-1",
    teamId: "team-1",
    name: "prod",
    description: "",
    apiKeyCount: 0,
    flagCount: 0,
    enabledFlagCount: 0,
    createdAt: "",
    updatedAt: "",
    ...over,
  }) as Flagset;

const renderPage = () =>
  render(
    <MemoryRouter>
      <FlagsetsPage />
    </MemoryRouter>,
  );
const user = () => userEvent.setup({ pointerEventsCheck: 0 });
// Stat cards render label then value as siblings.
const stat = (label: string) =>
  screen.getAllByText(label).find((el) => el.nextElementSibling)?.nextElementSibling
    ?.textContent;

beforeEach(() => {
  h.activeTeamId = "team-1";
  h.canEdit = true;
  h.role = "admin";
  h.flagsets = [];
  h.isLoading = false;
  h.refetch.mockReset();
  h.mutate.mockReset();
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

describe("FlagsetsPage states", () => {
  const tests = [
    { name: "no active team", setup: () => (h.activeTeamId = null), want: "flagset.noTeam" },
    { name: "loading", setup: () => (h.isLoading = true), want: "common.loading" },
    { name: "empty list", setup: () => {}, want: "flagset.empty" },
    { name: "non-array payload is treated as empty", setup: () => (h.flagsets = { oops: 1 }), want: "flagset.empty" },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      tt.setup();
      renderPage();
      expect(screen.getByText(tt.want)).toBeInTheDocument();
    });
  }

  it("lists cards and sums flags and API keys in the stats strip", () => {
    h.flagsets = [
      fs({ id: "a", name: "alpha", flagCount: 2, apiKeyCount: 1 }),
      fs({ id: "b", name: "beta", flagCount: 5, apiKeyCount: 3 }),
    ];
    renderPage();
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(stat("flagset.statFlags")).toBe("7");
    expect(stat("flagset.apiKeys")).toBe("4");
  });
});

describe("FlagsetsPage role-based actions", () => {
  const tests = [
    { name: "admin can create and delete", canEdit: true, role: "admin", wantCreate: true, wantDelete: true },
    { name: "editor can create but not delete", canEdit: false, role: "editor", wantCreate: true, wantDelete: false },
    { name: "viewer can do neither", canEdit: false, role: "viewer", wantCreate: false, wantDelete: false },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      h.canEdit = tt.canEdit;
      h.role = tt.role;
      h.flagsets = [fs({})];
      renderPage();
      expect(screen.queryByRole("button", { name: "flagset.newFlagset" }) !== null).toBe(tt.wantCreate);
      expect(screen.queryByRole("button", { name: "common.actions" }) !== null).toBe(tt.wantDelete);
    });
  }
});

describe("FlagsetsPage create", () => {
  const openDialog = async (u: ReturnType<typeof user>) => {
    renderPage();
    await u.click(screen.getByRole("button", { name: "flagset.newFlagset" }));
    return screen.getByRole("dialog");
  };

  it("requires a name and never calls the API", async () => {
    const u = user();
    const dialog = await openDialog(u);
    await u.click(within(dialog).getByRole("button", { name: "flagset.createCta" }));
    expect(await within(dialog).findByText("flagset.nameRequired")).toBeInTheDocument();
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("posts name + description, then toasts, closes and refetches", async () => {
    h.mutate.mockImplementation((_o, cbs) => cbs.onSuccess());
    const u = user();
    const dialog = await openDialog(u);
    await u.type(within(dialog).getByPlaceholderText("checkout-team"), "payments");
    await u.type(within(dialog).getByPlaceholderText("flagset.descPlaceholder"), "Money");
    await u.click(within(dialog).getByRole("button", { name: "flagset.createCta" }));

    const [opts] = h.mutate.mock.calls[0];
    expect(opts.method).toBe("post");
    expect(opts.url).toMatch(/\/teams\/team-1\/flagsets$/);
    expect(opts.values).toEqual({ name: "payments", description: "Money" });
    expect(h.toastSuccess).toHaveBeenCalledWith("flagset.created");
    expect(h.refetch).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("includes the enrichment object when attributes are set", async () => {
    const u = user();
    const dialog = await openDialog(u);
    await u.type(within(dialog).getByPlaceholderText("checkout-team"), "payments");
    await u.click(within(dialog).getByRole("button", { name: "flagset.addAttribute" }));
    await u.type(within(dialog).getByPlaceholderText("flagset.attribute"), "region");
    await u.type(within(dialog).getByPlaceholderText("flagset.value"), "eu");
    await u.click(within(dialog).getByRole("button", { name: "flagset.createCta" }));

    expect(h.mutate.mock.calls[0][0].values).toEqual({
      name: "payments",
      description: "",
      evaluationContextEnrichment: { region: "eu" },
    });
  });

  it("disables create while the enrichment is invalid", async () => {
    const u = user();
    const dialog = await openDialog(u);
    await u.click(within(dialog).getByRole("button", { name: "flagset.addAttribute" }));
    await u.type(within(dialog).getByPlaceholderText("flagset.attribute"), "n");
    await u.click(within(dialog).getByRole("combobox"));
    await u.click(screen.getByRole("option", { name: "json" }));
    await u.type(within(dialog).getByPlaceholderText("flagset.value"), "{{");
    expect(within(dialog).getByRole("button", { name: "flagset.createCta" })).toBeDisabled();
  });

  it("toasts the error and keeps the dialog open when create fails", async () => {
    h.mutate.mockImplementation((_o, cbs) => cbs.onError(new Error("boom")));
    const u = user();
    const dialog = await openDialog(u);
    await u.type(within(dialog).getByPlaceholderText("checkout-team"), "payments");
    await u.click(within(dialog).getByRole("button", { name: "flagset.createCta" }));

    expect(h.toastError).toHaveBeenCalledWith("flagset.createError", { description: "boom" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("cancel closes the dialog", async () => {
    const u = user();
    const dialog = await openDialog(u);
    await u.click(within(dialog).getByRole("button", { name: "common.cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("FlagsetsPage delete", () => {
  const confirmDelete = async () => {
    h.flagsets = [fs({ id: "fs-9", name: "legacy" })];
    const u = user();
    renderPage();
    await u.click(screen.getByRole("button", { name: "common.actions" }));
    await u.click(await screen.findByRole("menuitem", { name: "common.delete" }));
    const dialog = screen.getByRole("alertdialog");
    await u.type(within(dialog).getByRole("textbox"), "legacy");
    await u.click(within(dialog).getByRole("button", { name: "flagset.deleteConfirm" }));
  };

  it("deletes the flagset and refetches on success", async () => {
    h.mutate.mockImplementation((_o, cbs) => cbs.onSuccess());
    await confirmDelete();

    const [opts] = h.mutate.mock.calls[0];
    expect(opts.method).toBe("delete");
    expect(opts.url).toMatch(/\/flagsets\/fs-9$/);
    expect(h.toastSuccess).toHaveBeenCalledWith("flagset.deleted");
    expect(h.refetch).toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("toasts the error on failure and resets the pending state", async () => {
    h.mutate.mockImplementation((_o, cbs) => cbs.onError(new Error("in use")));
    await confirmDelete();
    expect(h.toastError).toHaveBeenCalledWith("flagset.deleteError", { description: "in use" });

    // Radix's AlertDialogAction closes the dialog on click; reopening shows the
    // idle label again, i.e. `deleting` was reset.
    const u = user();
    await u.click(screen.getByRole("button", { name: "common.actions" }));
    await u.click(await screen.findByRole("menuitem", { name: "common.delete" }));
    expect(screen.getByRole("button", { name: "flagset.deleteConfirm" })).toBeInTheDocument();
  });
});
