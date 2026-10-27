import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => ({
  flagsets: [
    { id: "fs-1", name: "default" },
    { id: "fs-2", name: "payments" },
  ] as unknown,
  mutate: vi.fn(),
  invalidate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@refinedev/core", async () => {
  const en = (await import("@/i18n/locales/en.json")).default as Record<string, unknown>;
  const resolve = (key: string): unknown =>
    key.split(".").reduce<unknown>(
      (o, p) => (o && typeof o === "object" ? (o as never)[p] : undefined),
      en,
    );
  const t = (key: string, params?: Record<string, unknown>) => {
    let s = resolve(key);
    if (typeof s !== "string") return key;
    if (params)
      for (const [k, v] of Object.entries(params))
        s = (s as string).replaceAll(`{{${k}}}`, String(v));
    return s as string;
  };
  return {
    useTranslate: () => t,
    useCustom: () => ({ query: { data: { data: h.flagsets } } }),
    useCustomMutation: () => ({ mutate: h.mutate }),
  };
});

vi.mock("@/hooks/use-recently-edited-flags", () => ({
  useInvalidateRecentlyEditedFlags: () => h.invalidate,
}));

vi.mock("sonner", () => ({
  toast: { success: h.toastSuccess, error: h.toastError },
}));

import { FlagWizard } from "./flag-wizard";

type User = ReturnType<typeof userEvent.setup>;

function renderWizard() {
  const onCreated = vi.fn();
  render(<FlagWizard teamId="team-1" onCreated={onCreated} tagSuggestions={["beta"]} />);
  return { onCreated };
}

async function openWizard(user: User) {
  await user.click(screen.getByRole("button", { name: "Create flag" }));
  const dialog = await screen.findByRole("dialog");
  // The form resets (and preselects the first flagset) on the next frame.
  await waitFor(() => expect(within(dialog).getAllByText("default").length).toBeGreaterThan(0));
  return dialog;
}

const btn = (name: string) => screen.getByRole("button", { name });
// Segmented options are radios (single-choice ToggleGroup).
const option = (name: string) => screen.getByRole("radio", { name });
const keyInput = () => screen.getByPlaceholderText("checkout-progress-banner");
// The sidekick check label is muted until its condition passes.
const checkOk = (label: string) => !screen.getByText(label).className.includes("text-muted-foreground");

async function pickDefaultVariation(user: User, variation: string) {
  await user.click(screen.getByRole("combobox"));
  await user.click(await screen.findByRole("option", { name: variation }));
}

// Walks a boolean flag named `name` to the review step.
async function toReview(user: User, name = "my-flag") {
  await user.type(keyInput(), name);
  await user.click(btn("Continue"));
  await pickDefaultVariation(user, "enabled");
  await user.click(btn("Continue"));
  expect(screen.getByText("step 3 of 3")).toBeInTheDocument();
}

beforeEach(() => {
  vi.clearAllMocks();
  h.flagsets = [
    { id: "fs-1", name: "default" },
    { id: "fs-2", name: "payments" },
  ];
});

describe("FlagWizard navigation and validation", () => {
  it("blocks the basics step until a key is set", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWizard();
    await openWizard(user);

    expect(screen.getByText("step 1 of 3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    expect(btn("Continue")).toBeDisabled();
    expect(checkOk("Flagset selected")).toBe(true);
    expect(checkOk("Key is set")).toBe(false);
    expect(checkOk("At least 2 unique, valid variations")).toBe(true);

    // Whitespace alone is not a key.
    await user.type(keyInput(), "  ");
    expect(btn("Continue")).toBeDisabled();
    await user.type(keyInput(), "my-flag");
    expect(checkOk("Key is set")).toBe(true);
    expect(btn("Continue")).toBeEnabled();
  });

  it("validates non-boolean variations after a type change", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWizard();
    await openWizard(user);
    await user.type(keyInput(), "my-flag");

    await user.click(option("int"));
    // Switching type resets to two empty variations, which aren't valid ints.
    const values = screen.getAllByPlaceholderText("value");
    expect(values).toHaveLength(2);
    expect(btn("Continue")).toBeDisabled();
    expect(checkOk("At least 2 unique, valid variations")).toBe(false);

    await user.type(values[0], "1");
    await user.type(values[1], "2");
    expect(btn("Continue")).toBeEnabled();

    // Duplicate variation names are rejected.
    const names = screen.getAllByPlaceholderText("name");
    await user.clear(names[1]);
    await user.type(names[1], "control");
    expect(btn("Continue")).toBeDisabled();
  });

  it("blocks the rules step until the default rule and every rule are valid", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWizard();
    await openWizard(user);
    await user.type(keyInput(), "my-flag");
    await user.click(btn("Continue"));

    expect(screen.getByText("step 2 of 3")).toBeInTheDocument();
    expect(btn("Continue")).toBeDisabled();
    expect(checkOk("Default rule is valid")).toBe(false);
    expect(checkOk("Targeting rules are complete")).toBe(true);

    await pickDefaultVariation(user, "disabled");
    expect(checkOk("Default rule is valid")).toBe(true);
    expect(btn("Continue")).toBeEnabled();

    // A new rule has no conditions yet, so it blocks progress.
    await user.click(btn("Add rule"));
    expect(checkOk("Targeting rules are complete")).toBe(false);
    expect(btn("Continue")).toBeDisabled();
    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    expect(btn("Continue")).toBeEnabled();
  });

  it("goes back without losing entered values", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWizard();
    await openWizard(user);
    await user.type(keyInput(), "my-flag");
    await user.click(btn("Continue"));

    await user.click(btn("Back"));
    expect(screen.getByText("step 1 of 3")).toBeInTheDocument();
    expect(keyInput()).toHaveValue("my-flag");
  });

  it("migrates the default rule when its variation is renamed", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWizard();
    await openWizard(user);
    await user.type(keyInput(), "my-flag");
    await user.click(option("string"));
    const values = screen.getAllByPlaceholderText("value");
    await user.type(values[0], "a");
    await user.type(values[1], "b");
    await user.click(btn("Continue"));
    await pickDefaultVariation(user, "control");

    await user.click(btn("Back"));
    const name = screen.getAllByPlaceholderText("name")[0];
    await user.clear(name);
    await user.type(name, "ctrl");
    await user.click(btn("Continue"));

    // The default rule follows the rename, so the step is still valid.
    expect(screen.getByRole("combobox")).toHaveTextContent("ctrl");
    expect(btn("Continue")).toBeEnabled();
  });

  it("previews the payload as YAML or JSON keyed by the trimmed flag name", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWizard();
    await openWizard(user);
    await toReview(user, " my-flag ");

    expect(checkOk("Ready to create")).toBe(true);
    const preview = () => document.querySelector("pre")?.textContent ?? "";
    expect(preview()).toMatch(/^my-flag:\n/);
    expect(preview()).toContain("variation: enabled");

    await user.click(option("JSON"));
    expect(JSON.parse(preview())).toEqual({
      "my-flag": {
        variations: { enabled: true, disabled: false },
        defaultRule: { variation: "enabled" },
        trackEvents: true,
      },
    });
  });

  it("closes on cancel and starts fresh when reopened", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { onCreated } = renderWizard();
    await openWizard(user);
    await user.type(keyInput(), "my-flag");
    await user.click(btn("Continue"));

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(h.mutate).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();

    await openWizard(user);
    await waitFor(() => expect(screen.getByText("step 1 of 3")).toBeInTheDocument());
    expect(keyInput()).toHaveValue("");
  });

  it("opens on each autoOpen rising edge and reports closing", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onClosed = vi.fn();
    const props = { teamId: "team-1", onCreated: vi.fn(), onClosed };
    const { rerender } = render(<FlagWizard {...props} autoOpen />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.type(keyInput(), "my-flag");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onClosed).toHaveBeenCalledOnce();

    rerender(<FlagWizard {...props} autoOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(<FlagWizard {...props} autoOpen />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(keyInput()).toHaveValue("");
  });

  it("shows the subtitle when no flagset is available", async () => {
    h.flagsets = undefined;
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWizard();
    await user.click(btn("Create flag"));
    await screen.findByRole("dialog");

    expect(screen.getByText("Choose a flagset")).toBeInTheDocument();
    await user.type(keyInput(), "my-flag");
    expect(checkOk("Flagset selected")).toBe(false);
    expect(btn("Continue")).toBeDisabled();
  });
});

describe("FlagWizard create", () => {
  async function fillAndSubmit(user: User, opts: { disableOnSave?: boolean } = {}) {
    await openWizard(user);
    // Pick the second flagset to prove the selection drives the URL.
    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: "payments" }));
    await user.type(keyInput(), "my-flag");
    await user.type(screen.getAllByRole("textbox")[1], "  Checkout banner ");
    await user.type(screen.getByPlaceholderText("Add a tag…"), "beta{Enter}");
    if (opts.disableOnSave) await user.click(screen.getByRole("switch"));
    await user.click(btn("Continue"));
    await pickDefaultVariation(user, "enabled");
    await user.click(btn("Continue"));
    await user.type(screen.getByPlaceholderText("feat(flags): add new flag"), " feat: add ");
    await user.click(btn("Create flag"));
  }

  it("posts the flag to the selected flagset and closes on success", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { onCreated } = renderWizard();
    await fillAndSubmit(user);

    expect(h.mutate).toHaveBeenCalledTimes(1);
    const [args, cbs] = h.mutate.mock.calls[0];
    expect(args.url).toMatch(/\/flagsets\/fs-2\/flags$/);
    expect(args.method).toBe("post");
    expect(args.values).toEqual({
      name: "my-flag",
      comment: "feat: add",
      payload: {
        variations: { enabled: true, disabled: false },
        metadata: { description: "Checkout banner", tags: ["beta"] },
        defaultRule: { variation: "enabled" },
        trackEvents: true,
      },
    });
    expect(btn("Create flag")).toBeDisabled();

    act(() => cbs.onSuccess({ data: { id: "flag-new" } }));
    expect(h.mutate).toHaveBeenCalledTimes(1); // enabled on save: no disable call
    expect(h.toastSuccess).toHaveBeenCalledWith("Flag created");
    expect(onCreated).toHaveBeenCalled();
    expect(h.invalidate).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  const disableTests = [
    { name: "disable succeeds", settle: "onSuccess" as const },
    { name: "disable fails", settle: "onError" as const },
  ];
  for (const tt of disableTests) {
    it(`disables the new flag when 'Enable on save' is off (${tt.name})`, async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const { onCreated } = renderWizard();
      await fillAndSubmit(user, { disableOnSave: true });

      act(() => h.mutate.mock.calls[0][1].onSuccess({ data: { id: "flag-new" } }));
      expect(h.mutate).toHaveBeenCalledTimes(2);
      const [args, cbs] = h.mutate.mock.calls[1];
      expect(args.url).toMatch(/\/flags\/flag-new\/disable$/);
      expect(args.values).toEqual({ disabled: true });
      expect(onCreated).not.toHaveBeenCalled();

      // The flag exists either way, so the wizard finishes even if disabling fails.
      act(() => cbs[tt.settle]());
      expect(h.toastSuccess).toHaveBeenCalledWith("Flag created");
      expect(onCreated).toHaveBeenCalled();
    });
  }

  it("keeps the wizard open and reports the error when creation fails", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { onCreated } = renderWizard();
    await fillAndSubmit(user);

    act(() => h.mutate.mock.calls[0][1].onError(new Error("name taken")));
    expect(h.toastError).toHaveBeenCalledWith("Failed to create flag", {
      description: "name taken",
    });
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(btn("Create flag")).toBeEnabled();
  });
});
