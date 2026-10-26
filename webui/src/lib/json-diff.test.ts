import { describe, expect, it } from "vitest";
import { jsonDiff } from "./json-diff";

describe("jsonDiff", () => {
  it("marks every line as add when before is null (create)", () => {
    const lines = jsonDiff(null, { name: "x" });
    expect(lines.every((l) => l.kind === "add")).toBe(true);
    expect(lines.some((l) => l.text.includes('"name"'))).toBe(true);
  });

  it("marks every line as del when after is null (delete)", () => {
    const lines = jsonDiff({ name: "x" }, null);
    expect(lines.every((l) => l.kind === "del")).toBe(true);
  });

  it("keeps unchanged lines as context and flags the changed value", () => {
    const lines = jsonDiff(
      { name: "checkout", disabled: false },
      { name: "checkout", disabled: true },
    );
    const del = lines.filter((l) => l.kind === "del");
    const add = lines.filter((l) => l.kind === "add");
    expect(del).toHaveLength(1);
    expect(add).toHaveLength(1);
    expect(del[0].text).toContain("false");
    expect(add[0].text).toContain("true");
    // the "name" line is identical on both sides => context
    expect(lines.some((l) => l.kind === "ctx" && l.text.includes("checkout"))).toBe(
      true,
    );
  });

  it("returns an empty diff for two identical objects", () => {
    const obj = { a: 1, b: [1, 2, 3] };
    const lines = jsonDiff(obj, { ...obj, b: [1, 2, 3] });
    expect(lines.every((l) => l.kind === "ctx")).toBe(true);
  });

  it("degrades to a single line for non-serializable input instead of throwing", () => {
    // JSON.stringify returns undefined for a bare function -> String() fallback.
    const fnLines = jsonDiff(null, (() => {}) as unknown);
    expect(fnLines).toHaveLength(1);
    expect(fnLines[0].kind).toBe("add");

    // Circular reference makes JSON.stringify throw -> catch -> String() fallback.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const circLines = jsonDiff(circular, null);
    expect(circLines).toHaveLength(1);
    expect(circLines[0].kind).toBe("del");
  });

  it("degrades to all-del + all-add past the size cap (skips the LCS matrix)", () => {
    const big = Array.from({ length: 1200 }, (_, i) => i);
    const lines = jsonDiff(big, [...big, 1200]);
    // No "ctx" lines: the matrix path (which would mark shared lines) is skipped.
    expect(lines.some((l) => l.kind === "ctx")).toBe(false);
    expect(lines.some((l) => l.kind === "del")).toBe(true);
    expect(lines.some((l) => l.kind === "add")).toBe(true);
  });
});
