import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Shared, hoisted mock state the module mocks below read from.
const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
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
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => h.toastSuccess(...a),
    error: (...a: unknown[]) => h.toastError(...a),
  },
}));

import { EvaluatePanel, DEFAULT_TESTING_CONTEXT } from "./evaluate-panel";

type Result = {
  value: unknown;
  variationType: string;
  reason: string;
  failed: boolean;
  trackEvents: boolean;
  cacheable: boolean;
  errorCode?: string;
  errorDetails?: string;
  flagType?: string;
  version?: string;
};

// A passing evaluation result with sensible defaults; override per test.
const ok = (over: Partial<Result> = {}): Result => ({
  value: true,
  variationType: "on",
  reason: "TARGETING_MATCH",
  failed: false,
  trackEvents: true,
  cacheable: true,
  ...over,
});

// Render with defaults; override individual props per test.
function renderPanel(over: Partial<Parameters<typeof EvaluatePanel>[0]> = {}) {
  const saveAndThen = vi.fn();
  render(
    <EvaluatePanel
      flagId="flag-1"
      isDirty={false}
      saving={false}
      saveAndThen={saveAndThen}
      defaultContext={'{\n  "targetingKey": "u1",\n  "email": "a@b.co"\n}'}
      {...over}
    />,
  );
  return { saveAndThen };
}

const runButton = () =>
  screen.getByRole("button", { name: /Run evaluation/i });

beforeEach(() => {
  h.mutate.mockReset();
  h.toastError.mockReset();
  h.toastSuccess.mockReset();
});

describe("EvaluatePanel", () => {
  it("seeds the context textarea from the defaultContext prop", () => {
    renderPanel({ defaultContext: DEFAULT_TESTING_CONTEXT });
    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(ta.value).toBe(DEFAULT_TESTING_CONTEXT);
    expect(ta.value).toContain("thomas@gofeatureflag.org");
  });

  it("splits the JSON into targetingKey + attributes and posts to the evaluate endpoint", () => {
    h.mutate.mockImplementation((opts) => {
      void opts;
    });
    renderPanel();
    fireEvent.click(runButton());

    expect(h.mutate).toHaveBeenCalledTimes(1);
    const [opts] = h.mutate.mock.calls[0];
    expect(opts.method).toBe("post");
    expect(opts.url).toMatch(/\/flags\/flag-1\/evaluate$/);
    expect(opts.values).toEqual({
      evaluationContext: {
        targetingKey: "u1",
        attributes: { email: "a@b.co" },
      },
    });
  });

  it("renders value, variation and reason on a successful evaluation", () => {
    h.mutate.mockImplementation((_opts, cbs) =>
      cbs.onSuccess({ data: ok({ value: "blue", variationType: "variantA", reason: "DEFAULT" }) }),
    );
    renderPanel();
    fireEvent.click(runButton());

    expect(screen.getByText("blue")).toBeTruthy();
    expect(screen.getByText(/Variation: variantA/)).toBeTruthy();
    expect(screen.getByText(/Reason: DEFAULT/)).toBeTruthy();
  });

  it("pretty-prints an object value as JSON", () => {
    h.mutate.mockImplementation((_opts, cbs) =>
      cbs.onSuccess({ data: ok({ value: { a: 1 }, flagType: "json" }) }),
    );
    renderPanel();
    fireEvent.click(runButton());

    // JSON.stringify(value, null, 2) keeps the key on its own indented line.
    expect(screen.getByText(/"a": 1/)).toBeTruthy();
  });

  it("renders a falsy boolean value verbatim (the common boolean-flag result)", () => {
    h.mutate.mockImplementation((_opts, cbs) =>
      cbs.onSuccess({ data: ok({ value: false, trackEvents: false, cacheable: false }) }),
    );
    renderPanel();
    fireEvent.click(runButton());

    // value pre + trackEvents + cacheable all render "false" → at least one node.
    expect(screen.getAllByText("false").length).toBeGreaterThan(0);
  });

  it("shows the failure panel with error code and details when the result failed", () => {
    h.mutate.mockImplementation((_opts, cbs) =>
      cbs.onSuccess({
        data: ok({ failed: true, errorCode: "FLAG_NOT_FOUND", errorDetails: "no such flag" }),
      }),
    );
    renderPanel();
    fireEvent.click(runButton());

    expect(screen.getByText("Evaluation failed")).toBeTruthy();
    expect(screen.getByText("FLAG_NOT_FOUND")).toBeTruthy();
    expect(screen.getByText("no such flag")).toBeTruthy();
  });

  it("toasts an error when the mutation fails", () => {
    h.mutate.mockImplementation((_opts, cbs) => cbs.onError(new Error("boom")));
    renderPanel();
    fireEvent.click(runButton());

    expect(h.toastError).toHaveBeenCalledTimes(1);
  });

  it("blocks invalid JSON: shows the error and never calls the endpoint", () => {
    renderPanel({ defaultContext: "{ not json" });
    fireEvent.click(runButton());

    expect(h.mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid JSON object.")).toBeTruthy();
  });

  it("rejects a non-object JSON body (array) as invalid", () => {
    renderPanel({ defaultContext: "[1, 2, 3]" });
    fireEvent.click(runButton());

    expect(h.mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid JSON object.")).toBeTruthy();
  });

  it("clears the invalid-JSON error once the user edits the context", () => {
    renderPanel({ defaultContext: "{ not json" });
    fireEvent.click(runButton());
    expect(screen.getByText("Enter a valid JSON object.")).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: '{"targetingKey":"x"}' },
    });
    expect(screen.queryByText("Enter a valid JSON object.")).toBeNull();
  });

  it("defaults a missing targetingKey to an empty string", () => {
    h.mutate.mockImplementation(() => {});
    renderPanel({ defaultContext: '{"email":"a@b.co"}' });
    fireEvent.click(runButton());

    const [opts] = h.mutate.mock.calls[0];
    expect(opts.values.evaluationContext.targetingKey).toBe("");
    expect(opts.values.evaluationContext.attributes).toEqual({ email: "a@b.co" });
  });

  it("when dirty, Run opens the confirm dialog instead of evaluating immediately", async () => {
    const user = userEvent.setup();
    renderPanel({ isDirty: true });
    await user.click(runButton());

    expect(h.mutate).not.toHaveBeenCalled();
    expect(await screen.findByText("You have unsaved changes")).toBeTruthy();
  });

  it("dirty → 'Evaluate saved version' evaluates without saving", async () => {
    const user = userEvent.setup();
    h.mutate.mockImplementation(() => {});
    const { saveAndThen } = renderPanel({ isDirty: true });

    await user.click(runButton());
    await user.click(await screen.findByRole("button", { name: "Evaluate saved version" }));

    expect(saveAndThen).not.toHaveBeenCalled();
    expect(h.mutate).toHaveBeenCalledTimes(1);
  });

  it("dirty → 'Save & evaluate' routes through saveAndThen", async () => {
    const user = userEvent.setup();
    const { saveAndThen } = renderPanel({ isDirty: true });

    await user.click(runButton());
    await user.click(await screen.findByRole("button", { name: "Save & evaluate" }));

    expect(saveAndThen).toHaveBeenCalledTimes(1);
    // The callback handed to saveAndThen is the evaluate function.
    expect(typeof saveAndThen.mock.calls[0][0]).toBe("function");
  });

  it("disables the Run button while saving", () => {
    renderPanel({ saving: true });
    expect(runButton()).toBeDisabled();
  });

  it("renders flagType and version meta only when present", () => {
    h.mutate.mockImplementation((_opts, cbs) =>
      cbs.onSuccess({ data: ok({ flagType: "boolean", version: "7" }) }),
    );
    renderPanel();
    fireEvent.click(runButton());

    expect(screen.getByText(/Type:/)).toBeTruthy();
    expect(screen.getByText("boolean")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
  });
});
