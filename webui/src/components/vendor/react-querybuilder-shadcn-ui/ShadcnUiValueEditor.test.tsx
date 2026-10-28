import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OptionList } from "react-querybuilder";
import {
  ShadcnUiValueEditor,
  type ShadcnUiValueEditorProps,
} from "./ShadcnUiValueEditor";

// Stub selector: exposes what the editor passed it and reports a fixed pick, so
// the select/multiselect/between branches can be asserted without Radix.
const StubSelector = (p: {
  value?: unknown;
  options: OptionList;
  multiple?: boolean;
  disabled?: boolean;
  handleOnChange: (v: unknown) => void;
}) => (
  <button
    data-testid="selector"
    data-value={String(p.value)}
    data-multiple={String(!!p.multiple)}
    data-options={p.options.length}
    disabled={p.disabled}
    onClick={() => p.handleOnChange("picked")}
  />
);

const values = [
  { name: "x", label: "X" },
  { name: "y", label: "Y" },
];

const setup = (over: Partial<ShadcnUiValueEditorProps> = {}) => {
  const handleOnChange = vi.fn();
  const props = {
    field: "email",
    operator: "=",
    value: "",
    type: "text",
    inputType: "text",
    values,
    valueSource: "value",
    path: [0],
    level: 1,
    skipHook: true,
    fieldData: { name: "email", value: "email", label: "Email", placeholder: "Type…" },
    rule: { id: "r1", field: "email", operator: "=", value: "" },
    schema: { controls: { valueSelector: StubSelector } },
    handleOnChange,
    ...over,
  } as unknown as ShadcnUiValueEditorProps;
  const utils = render(<ShadcnUiValueEditor {...props} />);
  return { ...utils, handleOnChange };
};

describe("ShadcnUiValueEditor", () => {
  it.each(["null", "notNull"])("renders nothing for operator %s", (operator) => {
    const { container } = setup({ operator });
    expect(container).toBeEmptyDOMElement();
  });

  const inputTests: { name: string; over: object; wantType: string; typed?: string }[] = [
    { name: "text input by default", over: {}, wantType: "text" },
    { name: "number input", over: { inputType: "number" }, wantType: "number" },
    { name: "date input", over: { inputType: "date" }, wantType: "date", typed: "2026-10-23" },
    {
      name: "in operator coerces to text",
      over: { inputType: "number", operator: "in" },
      wantType: "text",
    },
    { name: "missing inputType falls back to text", over: { inputType: null }, wantType: "text" },
  ];
  for (const tt of inputTests) {
    it(tt.name, () => {
      const { handleOnChange } = setup(tt.over as Partial<ShadcnUiValueEditorProps>);
      const input = screen.getByPlaceholderText("Type…");
      expect(input).toHaveAttribute("type", tt.wantType);
      const typed = tt.typed ?? "42";
      fireEvent.change(input, { target: { value: typed } });
      expect(handleOnChange).toHaveBeenCalledWith(typed);
    });
  }

  it("uses an empty placeholder without fieldData and spreads extraProps", () => {
    setup({ fieldData: undefined, extraProps: { "aria-label": "custom" } });
    expect(screen.getByLabelText("custom")).toHaveAttribute("placeholder", "");
  });

  it("disables the text input", () => {
    setup({ disabled: true });
    expect(screen.getByPlaceholderText("Type…")).toBeDisabled();
  });

  it("textarea calls handleOnChange with the typed text", () => {
    const { handleOnChange } = setup({ type: "textarea", value: "a" });
    const ta = screen.getByRole("textbox");
    expect(ta.tagName).toBe("TEXTAREA");
    expect(ta).toHaveValue("a");
    fireEvent.change(ta, { target: { value: "multi\nline" } });
    expect(handleOnChange).toHaveBeenCalledWith("multi\nline");
  });

  const toggleTests = [
    { name: "switch off → on", type: "switch", role: "switch", value: false, want: true },
    { name: "switch on → off", type: "switch", role: "switch", value: true, want: false },
    { name: "checkbox off → on", type: "checkbox", role: "checkbox", value: false, want: true },
    { name: "checkbox on → off", type: "checkbox", role: "checkbox", value: true, want: false },
  ];
  for (const tt of toggleTests) {
    it(tt.name, async () => {
      const { handleOnChange } = setup({ type: tt.type as "switch", value: tt.value });
      const el = screen.getByRole(tt.role);
      expect(el).toHaveAttribute("aria-checked", String(tt.value));
      await userEvent.click(el);
      expect(handleOnChange).toHaveBeenCalledWith(tt.want);
    });
  }

  it("checkbox uses the rule id as element id", () => {
    setup({ type: "checkbox" });
    expect(screen.getByRole("checkbox")).toHaveAttribute("id", "r1");
  });

  it.each(["switch", "checkbox"])("disables the %s", (type) => {
    setup({ type: type as "switch", disabled: true });
    expect(screen.getByRole(type)).toBeDisabled();
  });

  it("radio renders one item per value and reports the picked one", async () => {
    const { handleOnChange } = setup({ type: "radio", value: "x" });
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    await userEvent.click(radios[1]);
    expect(handleOnChange).toHaveBeenCalledWith("y");
  });

  const selectorTests = [
    { name: "select", type: "select", wantMultiple: "false" },
    { name: "multiselect", type: "multiselect", wantMultiple: "true" },
  ];
  for (const tt of selectorTests) {
    it(`${tt.name} delegates to the schema value selector`, async () => {
      const { handleOnChange } = setup({ type: tt.type as "select", value: "x" });
      const sel = screen.getByTestId("selector");
      expect(sel).toHaveAttribute("data-value", "x");
      expect(sel).toHaveAttribute("data-multiple", tt.wantMultiple);
      expect(sel).toHaveAttribute("data-options", "2");
      await userEvent.click(sel);
      expect(handleOnChange).toHaveBeenCalledWith("picked");
    });
  }

  it("prefers an explicit selectorComponent over the schema one", () => {
    const Custom = () => <span data-testid="custom-selector" />;
    setup({ type: "select", selectorComponent: Custom });
    expect(screen.getByTestId("custom-selector")).toBeInTheDocument();
    expect(screen.queryByTestId("selector")).toBeNull();
  });

  const betweenTextTests = [
    { name: "between edits the lower bound", operator: "between", idx: 0, want: "5,2" },
    { name: "notBetween edits the upper bound", operator: "notBetween", idx: 1, want: "1,9" },
  ];
  for (const tt of betweenTextTests) {
    it(tt.name, () => {
      const { handleOnChange } = setup({
        operator: tt.operator,
        value: "1,2",
        separator: <span>and</span>,
        testID: "between",
      });
      const inputs = screen.getAllByPlaceholderText("Type…");
      expect(inputs.map((i) => (i as HTMLInputElement).value)).toEqual(["1", "2"]);
      expect(screen.getByTestId("between")).toHaveTextContent("and");
      fireEvent.change(inputs[tt.idx], { target: { value: tt.want.split(",")[tt.idx] } });
      expect(handleOnChange).toHaveBeenCalledWith(tt.want);
    });
  }

  it("between text inputs start empty and honour disabled", () => {
    setup({ operator: "between", value: "", disabled: true });
    const inputs = screen.getAllByPlaceholderText("Type…");
    expect(inputs).toHaveLength(2);
    for (const i of inputs) {
      expect(i).toHaveValue("");
      expect(i).toBeDisabled();
    }
  });

  const betweenSelectTests = [
    { name: "joined string", listsAsArrays: false, want: "x,picked" },
    { name: "array when listsAsArrays", listsAsArrays: true, want: ["x", "picked"] },
  ];
  for (const tt of betweenSelectTests) {
    it(`between select reports a ${tt.name}`, async () => {
      const { handleOnChange } = setup({
        operator: "between",
        type: "select",
        value: "x",
        listsAsArrays: tt.listsAsArrays,
      });
      const [from, to] = screen.getAllByTestId("selector");
      expect(from).toHaveAttribute("data-value", "x");
      // Missing upper bound defaults to the first option.
      expect(to).toHaveAttribute("data-value", "x");
      await userEvent.click(to);
      expect(handleOnChange).toHaveBeenCalledWith(tt.want);
    });
  }

  it("between with a non text/select type falls through to the type branch", () => {
    setup({ operator: "between", type: "switch" });
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });
});
