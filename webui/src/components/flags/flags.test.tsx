import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { variationColor } from "./variation-colors";
import { diffLines } from "./diff";
import {
  inferFlagType,
  ruleOutcome,
  variationNames,
  formatVariationValue,
} from "./payload";
import { humanizeQuery } from "./rule-display";
import { DistributionBar } from "./distribution-bar";
import { VariationPill } from "./variation-pill";
import { VariationsEditor, type Tr } from "./flag-form";

describe("variationColor", () => {
  it("maps negative-side keys to a neutral color", () => {
    expect(variationColor("off", 1)).toContain("muted-foreground");
    expect(variationColor("false", 3)).toContain("muted-foreground");
  });

  it("assigns a distinct oklch color per index that never repeats", () => {
    // Every non-neutral variation gets a generated full-spectrum color.
    expect(variationColor("on", 0)).toMatch(/^oklch\(/);
    // Deterministic: same index -> same color.
    expect(variationColor("on", 3)).toBe(variationColor("whatever", 3));
    // Adjacent indices differ.
    expect(variationColor("a", 0)).not.toBe(variationColor("b", 1));
    // No repeat at the old 5-entry wrap point.
    expect(variationColor("v1", 0)).not.toBe(variationColor("v6", 5));
    // Distinct across a realistic range of variations.
    const colors = Array.from({ length: 12 }, (_, i) =>
      variationColor(`v${i}`, i),
    );
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe("inferFlagType", () => {
  it("derives the type from variation values", () => {
    expect(inferFlagType({ variations: { on: true, off: false } })).toBe(
      "boolean",
    );
    expect(inferFlagType({ variations: { a: "x", b: "y" } })).toBe("string");
    expect(inferFlagType({ variations: { a: 1, b: 2 } })).toBe("int");
    expect(inferFlagType({ variations: { a: 1.5, b: 2 } })).toBe("float");
    expect(inferFlagType({ variations: { a: { k: 1 } } })).toBe("json");
    expect(inferFlagType(undefined)).toBe("unknown");
  });
});

describe("ruleOutcome", () => {
  it("classifies single / percentage / progressive / none", () => {
    expect(ruleOutcome({ variation: "on" })).toEqual({
      kind: "single",
      variation: "on",
    });
    expect(ruleOutcome({ percentage: { on: 30, off: 70 } })).toEqual({
      kind: "percentage",
      percentages: { on: 30, off: 70 },
    });
    const prog = ruleOutcome({
      progressiveRollout: {
        initial: { variation: "off", percentage: 0 },
        end: { variation: "on", percentage: 100 },
      },
    });
    expect(prog).toEqual({
      kind: "progressive",
      from: 0,
      to: 100,
      initialVariation: "off",
      endVariation: "on",
      startDate: undefined,
      endDate: undefined,
    });
    expect(ruleOutcome(undefined)).toEqual({ kind: "none" });
  });
});

describe("variationNames / formatVariationValue", () => {
  it("returns names in declared order", () => {
    expect(variationNames({ variations: { on: true, off: false } })).toEqual([
      "on",
      "off",
    ]);
  });
  it("formats values for display", () => {
    expect(formatVariationValue("hello")).toBe("hello");
    expect(formatVariationValue(true)).toBe("true");
    expect(formatVariationValue({ a: 1 })).toBe('{"a":1}');
  });
});

describe("humanizeQuery", () => {
  it("renders json-logic as natural language", () => {
    const q = JSON.stringify({ "==": [{ var: "email" }, "a@b.co"] });
    expect(humanizeQuery(q)).toContain("email");
  });
  it("falls back to the raw string for non-json-logic", () => {
    expect(humanizeQuery('email ew "@acme.co"')).toBe('email ew "@acme.co"');
    expect(humanizeQuery("")).toBe("");
  });
});

describe("diffLines", () => {
  it("marks added and removed lines", () => {
    const d = diffLines("a\nb\nc", "a\nx\nc");
    expect(d).toContainEqual({ type: "del", text: "b" });
    expect(d).toContainEqual({ type: "add", text: "x" });
    expect(d).toContainEqual({ type: "context", text: "a" });
  });
});

describe("flag atoms render", () => {
  it("renders a distribution bar segment per non-zero variation", () => {
    const { container } = render(
      <DistributionBar
        variations={["on", "off"]}
        percentages={{ on: 40, off: 60 }}
      />,
    );
    // outer bar + 2 segments
    expect(container.querySelectorAll("div").length).toBeGreaterThanOrEqual(3);
  });

  it("sizes segments against a full 100% bar, leaving blank space below 100%", () => {
    // Sum is 60, not 100 — segments keep their raw widths so the unallocated
    // 40% shows the muted background instead of stretching to fill the bar.
    const { container } = render(
      <DistributionBar
        variations={["on", "off"]}
        percentages={{ on: 40, off: 20 }}
      />,
    );
    const bar = container.firstElementChild as HTMLElement;
    const segments = Array.from(bar.children) as HTMLElement[];
    expect(segments.map((el) => el.style.width)).toEqual(["40%", "20%"]);
    // shrink-0 keeps the widths literal so the bar stays a 0-100 scale.
    expect(segments.every((el) => el.className.includes("shrink-0"))).toBe(true);
  });

  it("keeps segment widths literal even when weights sum past 100", () => {
    // Legacy/unnormalized data can sum > 100; widths stay the raw values
    // (shrink-0 + overflow-hidden clip the excess) rather than rescaling.
    const { container } = render(
      <DistributionBar
        variations={["on", "off"]}
        percentages={{ on: 80, off: 80 }}
      />,
    );
    const bar = container.firstElementChild as HTMLElement;
    const widths = Array.from(bar.children).map(
      (el) => (el as HTMLElement).style.width,
    );
    expect(widths).toEqual(["80%", "80%"]);
  });

  it("shows decimal weights in the segment tooltip without rounding", () => {
    const { container } = render(
      <DistributionBar variations={["on"]} percentages={{ on: 42.56 }} />,
    );
    const seg = (container.firstElementChild as HTMLElement)
      .firstElementChild as HTMLElement;
    expect(seg.title).toBe("on · 42.56%");
  });

  it("renders a variation pill with name and value", () => {
    const { getByText } = render(
      <VariationPill name="on" index={0} value="true" />,
    );
    expect(getByText("on")).toBeInTheDocument();
    expect(getByText("true")).toBeInTheDocument();
  });
});

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
