import { describe, expect, it } from "vitest";
import { coerce, valueValid } from "./flag-form-helpers";
import type { FlagType } from "@/types/api";

describe("coerce", () => {
  const tests: { name: string; type: FlagType; value: string; want: unknown }[] =
    [
      { name: "boolean true", type: "boolean", value: "true", want: true },
      { name: "boolean other", type: "boolean", value: "yes", want: false },
      { name: "int truncates", type: "int", value: "42.9", want: 42 },
      { name: "float", type: "float", value: "1.5", want: 1.5 },
      { name: "json object", type: "json", value: '{"a":1}', want: { a: 1 } },
      { name: "string passthrough", type: "string", value: "hi", want: "hi" },
    ];

  for (const tt of tests) {
    it(tt.name, () => {
      expect(coerce(tt.type, tt.value)).toEqual(tt.want);
    });
  }
});

describe("valueValid", () => {
  const tests: { name: string; type: FlagType; value: string; want: boolean }[] =
    [
      { name: "int ok", type: "int", value: "3", want: true },
      { name: "int fraction", type: "int", value: "3.2", want: false },
      { name: "int blank", type: "int", value: " ", want: false },
      { name: "float ok", type: "float", value: "3.2", want: true },
      { name: "float NaN", type: "float", value: "abc", want: false },
      { name: "float blank", type: "float", value: "", want: false },
      { name: "json ok", type: "json", value: "[1,2]", want: true },
      { name: "json broken", type: "json", value: "{oops", want: false },
      { name: "string ok", type: "string", value: "x", want: true },
      { name: "string blank", type: "string", value: "  ", want: false },
      { name: "boolean blank still ok", type: "boolean", value: "", want: true },
    ];

  for (const tt of tests) {
    it(tt.name, () => {
      expect(valueValid(tt.type, tt.value)).toBe(tt.want);
    });
  }
});
