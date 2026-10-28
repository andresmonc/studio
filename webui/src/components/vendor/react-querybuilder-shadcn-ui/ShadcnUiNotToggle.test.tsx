import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NotToggleProps } from "react-querybuilder";
import { ShadcnUiNotToggle } from "./ShadcnUiNotToggle";

const tests = [
  { name: "unchecked → checked", checked: false, disabled: false, want: [true] },
  { name: "checked → unchecked", checked: true, disabled: false, want: [false] },
  { name: "disabled ignores clicks", checked: false, disabled: true, want: undefined },
];

describe("ShadcnUiNotToggle", () => {
  for (const tt of tests) {
    it(tt.name, async () => {
      const handleOnChange = vi.fn();
      const props = {
        label: "Not",
        checked: tt.checked,
        disabled: tt.disabled,
        handleOnChange,
        path: [0],
        level: 1,
        schema: {},
      } as unknown as NotToggleProps;
      render(<ShadcnUiNotToggle {...props} />);
      expect(screen.getByText("Not")).toBeInTheDocument();
      const sw = screen.getByRole("switch");
      expect(sw).toHaveAttribute("aria-checked", String(tt.checked));
      await userEvent.click(sw);
      expect(handleOnChange.mock.calls[0]).toEqual(tt.want);
    });
  }
});
