import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm as useRHForm } from "react-hook-form";
import type { Flagset } from "@/types/api";

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useCustomMutation: () => ({ mutate: h.mutate }),
}));
vi.mock("@refinedev/react-hook-form", () => ({ useForm: useRHForm }));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => h.toastSuccess(...a),
    error: (...a: unknown[]) => h.toastError(...a),
  },
}));

import { GeneralTab } from "./settings-general-tab";

const flagset = { id: "fs-1", name: "prod", description: "Production" } as Flagset;
const user = () => userEvent.setup({ pointerEventsCheck: 0 });
const nameInput = () => screen.getAllByRole("textbox")[0] as HTMLInputElement;
const descInput = () => screen.getAllByRole("textbox")[1] as HTMLTextAreaElement;

beforeEach(() => {
  h.mutate.mockReset();
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

describe("GeneralTab", () => {
  it("prefills name and description", () => {
    render(<GeneralTab flagset={flagset} canWrite onSaved={vi.fn()} />);
    expect(nameInput().value).toBe("prod");
    expect(descInput().value).toBe("Production");
  });

  it("is read-only without write access", () => {
    render(<GeneralTab flagset={flagset} canWrite={false} onSaved={vi.fn()} />);
    expect(nameInput()).toBeDisabled();
    expect(descInput()).toBeDisabled();
    expect(screen.queryByRole("button", { name: "common.save" })).toBeNull();
  });

  it("requires a name", async () => {
    const u = user();
    render(<GeneralTab flagset={flagset} canWrite onSaved={vi.fn()} />);
    await u.clear(nameInput());
    await u.click(screen.getByRole("button", { name: "common.save" }));
    expect(await screen.findByText("flagset.nameRequired")).toBeInTheDocument();
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("rejects a description over 500 chars", async () => {
    const u = user();
    render(<GeneralTab flagset={flagset} canWrite onSaved={vi.fn()} />);
    await u.clear(descInput());
    await u.click(descInput());
    await u.paste("x".repeat(501));
    await u.click(screen.getByRole("button", { name: "common.save" }));
    expect(await screen.findByText("common.maxChars")).toBeInTheDocument();
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("patches the flagset and calls onSaved on success", async () => {
    h.mutate.mockImplementation((_o, cbs) => cbs.onSuccess());
    const onSaved = vi.fn();
    const u = user();
    render(<GeneralTab flagset={flagset} canWrite onSaved={onSaved} />);
    await u.clear(nameInput());
    await u.type(nameInput(), "production");
    await u.click(screen.getByRole("button", { name: "common.save" }));

    const [opts] = h.mutate.mock.calls[0];
    expect(opts.method).toBe("patch");
    expect(opts.url).toMatch(/\/flagsets\/fs-1$/);
    expect(opts.values).toEqual({ name: "production", description: "Production" });
    expect(h.toastSuccess).toHaveBeenCalledWith("flagset.settings.saved");
    expect(onSaved).toHaveBeenCalled();
  });

  it("toasts the error on failure", async () => {
    h.mutate.mockImplementation((_o, cbs) => cbs.onError(new Error("taken")));
    const onSaved = vi.fn();
    render(<GeneralTab flagset={flagset} canWrite onSaved={onSaved} />);
    await user().click(screen.getByRole("button", { name: "common.save" }));
    expect(h.toastError).toHaveBeenCalledWith("flagset.updateError", { description: "taken" });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("cancel restores the saved values", async () => {
    const u = user();
    render(<GeneralTab flagset={{ ...flagset, description: null } as unknown as Flagset} canWrite onSaved={vi.fn()} />);
    await u.type(nameInput(), "-edited");
    await u.type(descInput(), "draft");
    await u.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(nameInput().value).toBe("prod");
    expect(descInput().value).toBe("");
  });
});
