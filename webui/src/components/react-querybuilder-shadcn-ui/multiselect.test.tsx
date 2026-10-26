import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OptionList } from "react-querybuilder";
import { MultiSelect } from "./multiselect";

const flat: OptionList = [
  { name: "a", label: "Alpha" },
  { name: "b", label: "Beta" },
  { name: "c", label: "Gamma", disabled: true },
];

const grouped: OptionList = [
  { label: "Group 1", options: [{ name: "a", label: "Alpha" }] },
  {
    label: "Group 2",
    options: [
      { name: "b", label: "Beta" },
      { name: "c", label: "Gamma", disabled: true },
    ],
  },
];

describe("MultiSelect trigger", () => {
  const tests = [
    { name: "placeholder when empty", value: [], want: "Choose..." },
    { name: "one chip", value: ["a"], want: "a" },
    { name: "two chips", value: ["a", "b"], want: "ab" },
    { name: "two chips plus overflow count", value: ["a", "b", "c", "d"], want: "ab+2" },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      render(<MultiSelect options={flat} value={tt.value} onValueChange={vi.fn()} />);
      expect(screen.getByRole("button")).toHaveTextContent(tt.want);
    });
  }
});

describe("MultiSelect menu", () => {
  const tests = [
    { name: "flat: adds an unchecked option", options: flat, value: ["b"], click: "Alpha", want: ["b", "a"] },
    { name: "flat: removes a checked option", options: flat, value: ["a", "b"], click: "Alpha", want: ["b"] },
    { name: "groups: adds an unchecked option", options: grouped, value: [], click: "Beta", want: ["b"] },
    { name: "groups: removes a checked option", options: grouped, value: ["a", "b"], click: "Beta", want: ["a"] },
  ];
  for (const tt of tests) {
    it(tt.name, async () => {
      const onValueChange = vi.fn();
      render(<MultiSelect options={tt.options} value={tt.value} onValueChange={onValueChange} />);
      await userEvent.click(screen.getByRole("button"));
      const item = await screen.findByRole("menuitemcheckbox", { name: tt.click });
      expect(item).toHaveAttribute("aria-checked", String(tt.value.includes(tt.click === "Alpha" ? "a" : "b")));
      await userEvent.click(item);
      expect(onValueChange).toHaveBeenCalledWith(tt.want);
    });
  }

  it.each([
    ["flat", flat],
    ["groups", grouped],
  ])("%s: disabled options can't be toggled", async (_, options) => {
    const onValueChange = vi.fn();
    render(<MultiSelect options={options} value={[]} onValueChange={onValueChange} />);
    await userEvent.click(screen.getByRole("button"));
    const item = await screen.findByRole("menuitemcheckbox", { name: "Gamma" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(item);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("renders group labels", async () => {
    render(<MultiSelect options={grouped} value={[]} onValueChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("Group 1")).toBeInTheDocument();
    expect(screen.getByText("Group 2")).toBeInTheDocument();
  });

  it("renders an empty menu without options", async () => {
    render(<MultiSelect value={[]} onValueChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(screen.queryAllByRole("menuitemcheckbox")).toHaveLength(0);
  });
});
