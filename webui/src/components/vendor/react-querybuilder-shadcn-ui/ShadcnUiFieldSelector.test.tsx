import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OptionList } from "react-querybuilder";
import { getRememberedAttributes } from "@/lib/targeting-attributes";
import {
  ShadcnUiFieldSelector,
  type ShadcnUiFieldSelectorProps,
} from "./ShadcnUiFieldSelector";

const STORAGE_KEY = "goff:targeting-attributes";

const options: OptionList = [
  { name: "targetingKey", label: "Targeting key" },
  { name: "email", label: "Email" },
];

const setup = (over: Record<string, unknown> = {}) => {
  const handleOnChange = vi.fn();
  const props = {
    options,
    value: undefined,
    path: [0],
    level: 1,
    schema: {},
    handleOnChange,
    ...over,
  } as unknown as ShadcnUiFieldSelectorProps;
  render(<ShadcnUiFieldSelector {...props} />);
  return { handleOnChange };
};

const open = async () => {
  await userEvent.click(screen.getByRole("combobox"));
  return screen.findByPlaceholderText("Search or type an attribute…");
};

beforeEach(() => localStorage.clear());

describe("ShadcnUiFieldSelector trigger label", () => {
  const tests = [
    { name: "known option label", over: { value: "email" }, want: "Email" },
    { name: "unknown value verbatim", over: { value: "plan" }, want: "plan" },
    { name: "title when empty", over: { title: "Field" }, want: "Field" },
    { name: "default placeholder", over: {}, want: "Select attribute" },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      setup(tt.over);
      expect(screen.getByRole("combobox")).toHaveTextContent(tt.want);
    });
  }

  it("honours disabled", () => {
    setup({ disabled: true });
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});

describe("ShadcnUiFieldSelector menu", () => {
  it("lists options, flattens groups and appends remembered attributes once", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["email", "country"]));
    setup({
      options: [
        { label: "Known", options: [{ name: "targetingKey", label: "Targeting key" }] },
        { label: "More", options: [{ name: "email", label: "Email" }] },
      ],
    });
    await open();
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Targeting key",
      "Email",
      "country",
    ]);
  });

  it("picks an existing option and closes", async () => {
    const { handleOnChange } = setup({ value: "email" });
    await open();
    await userEvent.click(screen.getByRole("option", { name: "Targeting key" }));
    expect(handleOnChange).toHaveBeenCalledWith("targetingKey");
    expect(screen.queryByRole("option")).toBeNull();
    // Predefined attributes are never remembered.
    expect(getRememberedAttributes()).toEqual([]);
  });

  const searchTests = [
    { name: "filters by label", q: "mai", wantOptions: ["Email", "Use “mai”"] },
    { name: "filters by name", q: "targetingk", wantOptions: ["Targeting key", "Use “targetingk”"] },
    { name: "exact name hides create", q: "email", wantOptions: ["Email"] },
    { name: "exact label hides create", q: "targeting key", wantOptions: ["Targeting key"] },
    { name: "no match only offers create", q: "plan", wantOptions: ["Use “plan”"] },
  ];
  for (const tt of searchTests) {
    it(`search ${tt.name}`, async () => {
      setup();
      await userEvent.type(await open(), tt.q);
      expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(tt.wantOptions);
    });
  }

  it("creates and remembers a typed attribute", async () => {
    const { handleOnChange } = setup();
    await userEvent.type(await open(), "  plan ");
    await userEvent.click(screen.getByRole("option", { name: "Use “plan”" }));
    expect(handleOnChange).toHaveBeenCalledWith("plan");
    expect(getRememberedAttributes()).toEqual(["plan"]);
  });

  it("refreshes remembered attributes on open", async () => {
    setup({ options: [] });
    expect(screen.getByRole("combobox")).toHaveTextContent("Select attribute");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["country"]));
    await open();
    expect(screen.getByRole("option", { name: "country" })).toBeInTheDocument();
  });

  it("shows the empty state with no options at all", async () => {
    setup({ options: [] });
    await open();
    expect(screen.getByText("No attribute found.")).toBeInTheDocument();
  });
});
