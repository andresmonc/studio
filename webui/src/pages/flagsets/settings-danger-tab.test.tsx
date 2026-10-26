import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Flagset } from "@/types/api";

const h = vi.hoisted(() => ({ mutate: vi.fn() }));

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
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DangerTab } from "./settings-danger-tab";

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
});
