import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Flagset } from "@/types/api";

// Shared, hoisted mock state the module mocks below read from.
const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
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
  const t = (key: string) => {
    const s = resolve(key);
    return typeof s === "string" ? s : key;
  };
  return {
    useTranslate: () => t,
    useCustomMutation: () => ({ mutate: h.mutate }),
    // settings.tsx imports these at module scope; stub enough to import cleanly.
    useCustom: () => ({ query: { data: { data: null }, refetch: vi.fn() } }),
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => h.toastSuccess(...a),
    error: (...a: unknown[]) => h.toastError(...a),
  },
}));

import { SettingsTab } from "./settings-testing-context-tab";
import { DEFAULT_TESTING_CONTEXT } from "@/components/flags/evaluate-panel";

const flagset = (over: Partial<Flagset> = {}): Flagset =>
  ({
    id: "fs-1",
    teamId: "t-1",
    name: "Prod",
    description: "",
    apiKeyCount: 0,
    createdAt: "",
    updatedAt: "",
    ...over,
  }) as Flagset;

const textarea = () => screen.getByRole("textbox") as HTMLTextAreaElement;
const saveBtn = () => screen.getByRole("button", { name: "Save" });

beforeEach(() => {
  h.mutate.mockReset();
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

describe("SettingsTab", () => {
  it("seeds the textarea with the shared default when the flagset has none", () => {
    render(<SettingsTab flagset={flagset()} canWrite onSaved={vi.fn()} />);
    expect(textarea().value).toBe(DEFAULT_TESTING_CONTEXT);
  });

  it("seeds the textarea with the flagset's configured value (pretty-printed)", () => {
    render(
      <SettingsTab
        flagset={flagset({ defaultTestingEvaluationContext: { targetingKey: "abc" } })}
        canWrite
        onSaved={vi.fn()}
      />,
    );
    expect(textarea().value).toBe(JSON.stringify({ targetingKey: "abc" }, null, 2));
  });

  it("saves valid JSON via PATCH and calls onSaved on success", () => {
    const onSaved = vi.fn();
    h.mutate.mockImplementation((_opts, cbs) => cbs.onSuccess());
    render(<SettingsTab flagset={flagset()} canWrite onSaved={onSaved} />);

    fireEvent.change(textarea(), { target: { value: '{"targetingKey":"x","plan":"pro"}' } });
    fireEvent.click(saveBtn());

    const [opts] = h.mutate.mock.calls[0];
    expect(opts.method).toBe("patch");
    expect(opts.url).toMatch(/\/flagsets\/fs-1$/);
    expect(opts.values).toEqual({
      defaultTestingEvaluationContext: { targetingKey: "x", plan: "pro" },
    });
    expect(h.toastSuccess).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it("blocks invalid JSON: shows the error and never calls the endpoint", () => {
    render(<SettingsTab flagset={flagset()} canWrite onSaved={vi.fn()} />);

    fireEvent.change(textarea(), { target: { value: "{ broken" } });
    fireEvent.click(saveBtn());

    expect(h.mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid JSON object.")).toBeTruthy();
  });

  it("rejects a non-object JSON body (array)", () => {
    render(<SettingsTab flagset={flagset()} canWrite onSaved={vi.fn()} />);

    fireEvent.change(textarea(), { target: { value: "[1,2]" } });
    fireEvent.click(saveBtn());

    expect(h.mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid JSON object.")).toBeTruthy();
  });

  it("toasts an error when the PATCH fails", () => {
    h.mutate.mockImplementation((_opts, cbs) => cbs.onError(new Error("nope")));
    render(<SettingsTab flagset={flagset()} canWrite onSaved={vi.fn()} />);

    fireEvent.click(saveBtn());
    expect(h.toastError).toHaveBeenCalled();
  });

  it("Cancel restores the seed value and clears the error", () => {
    render(<SettingsTab flagset={flagset()} canWrite onSaved={vi.fn()} />);

    fireEvent.change(textarea(), { target: { value: "{ broken" } });
    fireEvent.click(saveBtn());
    expect(screen.getByText("Enter a valid JSON object.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(textarea().value).toBe(DEFAULT_TESTING_CONTEXT);
    expect(screen.queryByText("Enter a valid JSON object.")).toBeNull();
  });

  it("is read-only for non-admins: no Save button and a disabled textarea", () => {
    render(<SettingsTab flagset={flagset()} canWrite={false} onSaved={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(textarea()).toHaveAttribute("readonly");
  });
});
