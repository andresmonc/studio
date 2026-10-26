import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => h.toastSuccess(...a),
    error: (...a: unknown[]) => h.toastError(...a),
  },
}));

import { ContextTab } from "./settings-context-tab";

const flagset = (enrichment?: Record<string, unknown> | null) =>
  ({ id: "fs-1", name: "prod", evaluationContextEnrichment: enrichment }) as Flagset;
const user = () => userEvent.setup({ pointerEventsCheck: 0 });
const valueInput = () => screen.getByPlaceholderText("flagset.value") as HTMLInputElement;
const save = () => screen.getByRole("button", { name: "common.save" });

beforeEach(() => {
  h.mutate.mockReset();
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

describe("ContextTab", () => {
  it("patches the edited enrichment and calls onSaved", async () => {
    h.mutate.mockImplementation((_o, cbs) => cbs.onSuccess());
    const onSaved = vi.fn();
    const u = user();
    render(<ContextTab flagset={flagset({ region: "eu" })} canWrite onSaved={onSaved} />);
    await u.clear(valueInput());
    await u.type(valueInput(), "us");
    await u.click(save());

    const [opts] = h.mutate.mock.calls[0];
    expect(opts.method).toBe("patch");
    expect(opts.url).toMatch(/\/flagsets\/fs-1$/);
    expect(opts.values).toEqual({ evaluationContextEnrichment: { region: "us" } });
    expect(h.toastSuccess).toHaveBeenCalledWith("flagset.settings.saved");
    expect(onSaved).toHaveBeenCalled();
  });

  it("saves an empty object when the flagset has no enrichment", async () => {
    render(<ContextTab flagset={flagset(null)} canWrite onSaved={vi.fn()} />);
    await user().click(save());
    expect(h.mutate.mock.calls[0][0].values).toEqual({ evaluationContextEnrichment: {} });
  });

  it("disables save while a value is invalid", async () => {
    const u = user();
    render(<ContextTab flagset={flagset({ n: 1 })} canWrite onSaved={vi.fn()} />);
    await u.clear(valueInput());
    await u.type(valueInput(), "abc");
    expect(save()).toBeDisabled();
  });

  it("toasts the error on failure", async () => {
    h.mutate.mockImplementation((_o, cbs) => cbs.onError(new Error("bad")));
    const onSaved = vi.fn();
    render(<ContextTab flagset={flagset({})} canWrite onSaved={onSaved} />);
    await user().click(save());
    expect(h.toastError).toHaveBeenCalledWith("flagset.updateError", { description: "bad" });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("cancel remounts the editor with the saved values", async () => {
    const u = user();
    render(<ContextTab flagset={flagset({ region: "eu" })} canWrite onSaved={vi.fn()} />);
    await u.type(valueInput(), "-draft");
    await u.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(valueInput().value).toBe("eu");
  });

  it("is read-only without write access", () => {
    render(<ContextTab flagset={flagset({ region: "eu" })} canWrite={false} onSaved={vi.fn()} />);
    expect(valueInput()).toBeDisabled();
    expect(screen.queryByRole("button", { name: "common.save" })).toBeNull();
  });
});
