import { describe, expect, it } from "vitest";
import { humanizeQuery } from "./rule-display";

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
