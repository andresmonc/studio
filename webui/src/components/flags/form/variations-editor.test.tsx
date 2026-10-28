import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { VariationsEditor } from "./variations-editor";
import type { Tr } from "./flag-form-types";

describe("VariationsEditor (boolean)", () => {
  const t = ((key: string) => key) as unknown as Tr;

  it("locks boolean name and value fields and offers no add/remove", () => {
    const { container, queryByText } = render(
      <VariationsEditor
        t={t}
        type="boolean"
        variations={[
          { id: 1, name: "enabled", value: "true" },
          { id: 2, name: "disabled", value: "false" },
        ]}
        setVariations={() => {}}
      />,
    );
    // 2 name inputs + 2 value inputs, all read-only/disabled.
    const inputs = Array.from(container.querySelectorAll("input"));
    expect(inputs).toHaveLength(4);
    expect(inputs.every((i) => i.disabled)).toBe(true);
    // Locked to the correct names/values: enabled=true, disabled=false.
    expect(inputs.map((i) => i.value)).toEqual([
      "enabled",
      "true",
      "disabled",
      "false",
    ]);
    // No "add variation" affordance for boolean flags.
    expect(queryByText("flag.wizard.addVariation")).toBeNull();
    // Remove buttons render but are disabled.
    const removeButtons = Array.from(
      container.querySelectorAll("button"),
    ).filter((b) => b.getAttribute("aria-label") === "common.remove");
    expect(removeButtons).toHaveLength(2);
    expect(removeButtons.every((b) => b.disabled)).toBe(true);
  });

  it("keeps non-boolean values editable", () => {
    const { container } = render(
      <VariationsEditor
        t={t}
        type="string"
        variations={[
          { id: 1, name: "control", value: "a" },
          { id: 2, name: "treatment-1", value: "b" },
        ]}
        setVariations={() => {}}
      />,
    );
    const inputs = Array.from(container.querySelectorAll("input"));
    expect(inputs.some((i) => i.disabled)).toBe(false);
  });

  it("renders name/value validation errors for non-boolean variations", () => {
    const { getByText, getAllByText } = render(
      <VariationsEditor
        t={t}
        type="int"
        variations={[
          { id: 1, name: "", value: "1" }, // empty name -> errNameRequired
          { id: 2, name: "dup", value: "" }, // empty value -> errValueRequired + dup name
          { id: 3, name: "dup", value: "2" }, // duplicate name -> errNameDup
        ]}
        setVariations={() => {}}
      />,
    );
    expect(getByText("flag.wizard.errNameRequired")).toBeInTheDocument();
    expect(getAllByText("flag.wizard.errNameDup")).toHaveLength(2);
    expect(getByText("flag.wizard.errValueRequired")).toBeInTheDocument();
  });
});
