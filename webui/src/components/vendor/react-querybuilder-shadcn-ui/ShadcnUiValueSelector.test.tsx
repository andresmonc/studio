import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OptionList } from "react-querybuilder";
import {
  ShadcnUiValueSelector,
  type ShadcnUiValueSelectorProps,
} from "./ShadcnUiValueSelector";

const flat: OptionList = [
  { name: "a", label: "Alpha" },
  { name: "b", label: "Beta", disabled: true },
];

const grouped: OptionList = [
  { label: "Letters", options: [{ name: "a", label: "Alpha" }] },
  { label: "Others", options: [{ name: "b", label: "Beta", disabled: true }] },
];

const setup = (over: Record<string, unknown> = {}) => {
  const handleOnChange = vi.fn();
  const props = {
    options: flat,
    value: undefined,
    title: "Pick one",
    path: [0],
    level: 1,
    schema: {},
    handleOnChange,
    ...over,
  } as unknown as ShadcnUiValueSelectorProps;
  render(<ShadcnUiValueSelector {...props} />);
  return { handleOnChange };
};

describe("ShadcnUiValueSelector single", () => {
  it.each([
    ["flat options", flat],
    ["option groups", grouped],
  ])("selects an option from %s", async (_, options) => {
    const { handleOnChange } = setup({ options });
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("Pick one");
    await userEvent.click(trigger);
    expect(await screen.findByRole("option", { name: "Beta" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await userEvent.click(screen.getByRole("option", { name: "Alpha" }));
    expect(handleOnChange).toHaveBeenCalledWith("a");
  });

  it("renders group labels", async () => {
    setup({ options: grouped });
    await userEvent.click(screen.getByRole("combobox"));
    expect(await screen.findByText("Letters")).toBeInTheDocument();
    expect(screen.getByText("Others")).toBeInTheDocument();
  });

  it("shows the current value and honours disabled", () => {
    setup({ value: "a", disabled: true });
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("Alpha");
    expect(trigger).toBeDisabled();
  });
});

describe("ShadcnUiValueSelector multiple", () => {
  const tests = [
    { name: "splits a comma string into chips", value: "a,b", want: "ab" },
    { name: "empty string shows the placeholder", value: "", want: "Choose..." },
    { name: "non-string value shows the placeholder", value: ["a"], want: "Choose..." },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      setup({ multiple: true, value: tt.value });
      expect(screen.getByRole("button")).toHaveTextContent(tt.want);
    });
  }

  it("reports the toggled selection", async () => {
    const { handleOnChange } = setup({ multiple: true, value: "" });
    await userEvent.click(screen.getByRole("button"));
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Alpha" }));
    expect(handleOnChange).toHaveBeenCalledWith(["a"]);
  });
});
