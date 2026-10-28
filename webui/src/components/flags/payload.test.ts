import { describe, expect, it } from "vitest";
import {
  inferFlagType,
  ruleOutcome,
  variationNames,
  formatVariationValue,
} from "./payload";

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
