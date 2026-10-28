import { describe, expect, it } from "vitest";
import { diffLines } from "./diff";

describe("diffLines", () => {
  it("marks added and removed lines", () => {
    const d = diffLines("a\nb\nc", "a\nx\nc");
    expect(d).toContainEqual({ type: "del", text: "b" });
    expect(d).toContainEqual({ type: "add", text: "x" });
    expect(d).toContainEqual({ type: "context", text: "a" });
  });
});
