import { describe, expect, it } from "vitest";
import { variationColor } from "./variation-colors";

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
