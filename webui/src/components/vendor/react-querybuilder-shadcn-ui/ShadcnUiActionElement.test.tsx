import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShadcnUiActionElement, type ShadcnUiActionProps } from "./ShadcnUiActionElement";
import { ShadcnUiActionElementIcon } from "./ShadcnUiActionElementIcon";

const components = [
  ["ShadcnUiActionElement", ShadcnUiActionElement],
  ["ShadcnUiActionElementIcon", ShadcnUiActionElementIcon],
] as const;

const disabledTranslation = { label: "Locked", title: "Unlock first" };

const tests = [
  { name: "enabled", over: {}, wantLabel: "Add", wantTitle: "Add rule", wantDisabled: false, wantClick: true },
  { name: "disabled", over: { disabled: true }, wantLabel: "Add", wantTitle: "Add rule", wantDisabled: true, wantClick: false },
  {
    name: "disabled with translation stays clickable",
    over: { disabled: true, disabledTranslation },
    wantLabel: "Locked",
    wantTitle: "Unlock first",
    wantDisabled: false,
    wantClick: true,
  },
  {
    name: "translation ignored when enabled",
    over: { disabledTranslation },
    wantLabel: "Add",
    wantTitle: "Add rule",
    wantDisabled: false,
    wantClick: true,
  },
];

describe.each(components)("%s", (_, Component) => {
  for (const tt of tests) {
    it(tt.name, async () => {
      const handleOnClick = vi.fn();
      const props = {
        label: "Add",
        title: "Add rule",
        className: "extra",
        handleOnClick,
        path: [0],
        level: 1,
        rules: [],
        schema: {},
        "data-foo": "bar",
        ...tt.over,
      } as unknown as ShadcnUiActionProps;
      render(<Component {...props} />);
      const btn = screen.getByRole("button");
      expect(btn).toHaveTextContent(tt.wantLabel);
      expect(btn).toHaveAttribute("title", tt.wantTitle);
      expect(btn).toHaveClass("extra");
      expect(btn).toHaveAttribute("data-foo", "bar");
      expect((btn as HTMLButtonElement).disabled).toBe(tt.wantDisabled);
      await userEvent.click(btn);
      expect(handleOnClick).toHaveBeenCalledTimes(tt.wantClick ? 1 : 0);
    });
  }
});
