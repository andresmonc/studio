import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
}));

import { EnrichmentEditor, type EnrichType } from "./enrichment-editor";

const user = () => userEvent.setup({ pointerEventsCheck: 0 });
const lastCall = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1);
const valueInputs = () => screen.getAllByPlaceholderText("flagset.value");
const keyInputs = () => screen.getAllByPlaceholderText("flagset.attribute");

describe("EnrichmentEditor seeding", () => {
  const tests: {
    name: string;
    initial: Record<string, unknown>;
    types?: EnrichType[];
    wantTypes: string[];
    wantObj?: Record<string, unknown>;
  }[] = [
    {
      name: "infers string / number / boolean / json with the default types",
      initial: { plan: "pro", n: 3, beta: true, meta: { a: 1 } },
      wantTypes: ["string", "number", "boolean", "json"],
    },
    {
      name: "splits numbers into int / float when the caller offers them",
      initial: { a: 3, b: 1.5 },
      types: ["string", "int", "float", "boolean"],
      wantTypes: ["int", "float"],
    },
    {
      name: "falls back to string when no numeric type is offered",
      initial: { a: 3 },
      types: ["string", "boolean"],
      wantTypes: ["string"],
      wantObj: { a: "3" },
    },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      const onChange = vi.fn();
      render(<EnrichmentEditor initial={tt.initial} types={tt.types} onChange={onChange} />);
      expect(screen.getAllByRole("combobox").map((c) => c.textContent)).toEqual(tt.wantTypes);
      // The seeded object is reported once on mount.
      expect(onChange).toHaveBeenCalledWith(tt.wantObj ?? tt.initial, true);
    });
  }

  it("drops reserved keys from the seed", () => {
    const onChange = vi.fn();
    render(
      <EnrichmentEditor
        initial={{ owner: "bob", tier: "gold" }}
        reservedKeys={new Set(["owner"])}
        onChange={onChange}
      />,
    );
    expect(keyInputs().map((i) => (i as HTMLInputElement).value)).toEqual(["tier"]);
    expect(onChange).toHaveBeenCalledWith({ tier: "gold" }, true);
  });
});

describe("EnrichmentEditor value validation", () => {
  const tests: {
    name: string;
    initial: Record<string, unknown>;
    types?: EnrichType[];
    input: string;
    wantErr?: string;
    wantObj: Record<string, unknown>;
  }[] = [
    { name: "number rejects text", initial: { k: 1 }, input: "abc", wantErr: "flagset.enrichmentInvalidNumber", wantObj: {} },
    { name: "number rejects blank", initial: { k: 1 }, input: " ", wantErr: "flagset.enrichmentInvalidNumber", wantObj: {} },
    { name: "number accepts decimals", initial: { k: 1 }, input: "2.5", wantObj: { k: 2.5 } },
    { name: "int rejects decimals", initial: { k: 1 }, types: ["int", "float"], input: "1.5", wantErr: "flagset.enrichmentInvalidInt", wantObj: {} },
    { name: "int accepts whole numbers", initial: { k: 1 }, types: ["int", "float"], input: "42", wantObj: { k: 42 } },
    { name: "float rejects text", initial: { k: 1.5 }, types: ["int", "float"], input: "x", wantErr: "flagset.enrichmentInvalidNumber", wantObj: {} },
    { name: "json rejects malformed input", initial: { k: {} }, input: "{", wantErr: "flagset.enrichmentInvalidJson", wantObj: {} },
    { name: "json parses arrays", initial: { k: {} }, input: "[1,2]", wantObj: { k: [1, 2] } },
    { name: "string keeps the raw value", initial: { k: "a" }, input: "hello", wantObj: { k: "hello" } },
  ];
  for (const tt of tests) {
    it(tt.name, async () => {
      const onChange = vi.fn();
      render(<EnrichmentEditor initial={tt.initial} types={tt.types} onChange={onChange} />);
      const u = user();
      await u.clear(valueInputs()[0]);
      await u.type(valueInputs()[0], tt.input.replace(/[[{]/g, (c) => c + c));

      expect(lastCall(onChange)).toEqual([tt.wantObj, !tt.wantErr]);
      if (tt.wantErr) expect(screen.getByText(tt.wantErr)).toBeInTheDocument();
      else expect(screen.queryByText(/flagset\.enrichmentInvalid/)).toBeNull();
    });
  }
});

describe("EnrichmentEditor rows", () => {
  it("adds a row, ignores it while the key is blank, then reports it", async () => {
    const onChange = vi.fn();
    render(<EnrichmentEditor onChange={onChange} />);
    expect(onChange).toHaveBeenCalledWith({}, true);
    const u = user();

    await u.click(screen.getByRole("button", { name: /flagset.addAttribute/ }));
    expect(lastCall(onChange)).toEqual([{}, true]);

    await u.type(keyInputs()[0], "region");
    await u.type(valueInputs()[0], "eu");
    expect(lastCall(onChange)).toEqual([{ region: "eu" }, true]);
  });

  it("flags a key that collides with a reserved key", async () => {
    const onChange = vi.fn();
    render(<EnrichmentEditor reservedKeys={new Set(["owner"])} onChange={onChange} />);
    const u = user();
    await u.click(screen.getByRole("button", { name: /flagset.addAttribute/ }));
    await u.type(keyInputs()[0], "owner");

    expect(screen.getByText("flagset.enrichmentReservedKey")).toBeInTheDocument();
    expect(lastCall(onChange)).toEqual([{}, false]);
  });

  it("switching to boolean resets the value to false and toggles via buttons", async () => {
    const onChange = vi.fn();
    render(<EnrichmentEditor initial={{ k: "x" }} onChange={onChange} />);
    const u = user();

    await u.click(screen.getByRole("combobox"));
    await u.click(screen.getByRole("option", { name: "boolean" }));
    expect(lastCall(onChange)).toEqual([{ k: false }, true]);
    expect(screen.queryByPlaceholderText("flagset.value")).toBeNull();

    await u.click(screen.getByRole("radio", { name: "true" }));
    expect(lastCall(onChange)).toEqual([{ k: true }, true]);
  });

  it("keeps the value when switching to a non-boolean type", async () => {
    const onChange = vi.fn();
    render(<EnrichmentEditor initial={{ k: "12" }} onChange={onChange} />);
    const u = user();

    await u.click(screen.getByRole("combobox"));
    await u.click(screen.getByRole("option", { name: "number" }));
    expect(lastCall(onChange)).toEqual([{ k: 12 }, true]);
  });

  it("removes a row", async () => {
    const onChange = vi.fn();
    render(<EnrichmentEditor initial={{ a: "1", b: "2" }} onChange={onChange} />);
    await user().click(screen.getAllByRole("button", { name: "common.remove" })[0]);
    expect(lastCall(onChange)).toEqual([{ b: "2" }, true]);
  });
});

describe("EnrichmentEditor display modes", () => {
  it("read-only: no add button and every control disabled", () => {
    render(<EnrichmentEditor initial={{ k: "x", b: true }} readOnly onChange={vi.fn()} />);
    expect(screen.queryByText("flagset.addAttribute")).toBeNull();
    keyInputs().forEach((i) => expect(i).toBeDisabled());
    expect(screen.getAllByRole("button", { name: "common.remove" })[0]).toBeDisabled();
    expect(screen.getByRole("radio", { name: "true" })).toBeDisabled();
  });

  const tests = [
    { name: "shows the label and hint by default", hideChrome: false, wantChrome: true },
    { name: "hideChrome drops the label and hint", hideChrome: true, wantChrome: false },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      const { container } = render(
        <EnrichmentEditor hideChrome={tt.hideChrome} onChange={vi.fn()} />,
      );
      expect(within(container).queryByText("flagset.enrichmentLabel") !== null).toBe(tt.wantChrome);
      expect(within(container).queryByText("flagset.enrichmentHint") !== null).toBe(tt.wantChrome);
    });
  }
});
