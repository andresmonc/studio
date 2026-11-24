import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Flagset } from "@/types/api";

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@refinedev/core", async () => {
  const en = (await import("@/i18n/locales/en.json")).default as Record<
    string,
    unknown
  >;
  const t = (key: string, opts?: Record<string, unknown>) => {
    const s = key
      .split(".")
      .reduce<unknown>(
        (o, p) => (o && typeof o === "object" ? (o as never)[p] : undefined),
        en,
      );
    if (typeof s !== "string") return key;
    return s.replace(/{{(\w+)}}/g, (_, k) => String(opts?.[k] ?? ""));
  };
  return {
    useTranslate: () => t,
    useCustomMutation: () => ({ mutate: h.mutate }),
  };
});
vi.mock("react-router", () => ({ useNavigate: () => h.navigate }));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => h.toastSuccess(...a),
    error: (...a: unknown[]) => h.toastError(...a),
  },
}));

import { DangerTab } from "./settings-danger-tab";

const confirmDelete = async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(
    <DangerTab flagset={{ id: "fs-1", name: "Prod", flagCount: 2 } as Flagset} />,
  );
  await user.click(screen.getByRole("button", { name: /delete/i }));
  const dialog = screen.getByRole("alertdialog");
  await user.type(within(dialog).getByRole("textbox"), "Prod");
  await user.click(within(dialog).getByRole("button", { name: "Delete flagset" }));
};

beforeEach(() => {
  h.mutate.mockReset();
  h.navigate.mockReset();
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

describe("DangerTab", () => {
  it("requires typing the exact flagset name before deleting", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <DangerTab flagset={{ id: "fs-1", name: "Prod", flagCount: 2 } as Flagset} />,
    );

    await user.click(screen.getByRole("button", { name: /delete/i }));
    const dialog = screen.getByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", { name: "Delete flagset" });
    expect(within(dialog).getByText("Prod").tagName).toBe("CODE");
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByRole("textbox"), "prod");
    expect(confirm).toBeDisabled();

    await user.clear(within(dialog).getByRole("textbox"));
    await user.type(within(dialog).getByRole("textbox"), "Prod");
    await user.click(confirm);

    const [opts] = h.mutate.mock.calls[0];
    expect(opts.method).toBe("delete");
    expect(opts.url).toMatch(/\/flagsets\/fs-1$/);
  });

  const outcomes = [
    { name: "success toasts and goes back to the list", ok: true },
    { name: "failure toasts the error and stays", ok: false },
  ];
  for (const tt of outcomes) {
    it(tt.name, async () => {
      h.mutate.mockImplementation((_o, cbs) =>
        tt.ok ? cbs.onSuccess() : cbs.onError(new Error("in use")),
      );
      await confirmDelete();
      if (tt.ok) {
        expect(h.toastSuccess).toHaveBeenCalledWith("Flagset deleted");
        expect(h.navigate).toHaveBeenCalledWith("/flagsets");
      } else {
        expect(h.toastError).toHaveBeenCalledWith("Failed to delete flagset", { description: "in use" });
        expect(h.navigate).not.toHaveBeenCalled();
      }
    });
  }
});
