import { describe, expect, it } from "vitest";
import { EMPTY_QUERY, coerce, newOutcome, newQuery, ruleIssues, valueValid, type RuleIssue } from "./flag-form-helpers";
import type { Rule } from "./flag-form-types";
import type { FlagType } from "@/types/api";

describe("coerce", () => {
  const tests: { name: string; type: FlagType; value: string; want: unknown }[] =
    [
      { name: "boolean true", type: "boolean", value: "true", want: true },
      { name: "boolean other", type: "boolean", value: "yes", want: false },
      { name: "int truncates", type: "int", value: "42.9", want: 42 },
      { name: "float", type: "float", value: "1.5", want: 1.5 },
      { name: "json object", type: "json", value: '{"a":1}', want: { a: 1 } },
      { name: "json blank is null, not a throw", type: "json", value: "", want: null },
      { name: "json invalid is null, not a throw", type: "json", value: "{", want: null },
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

describe("ruleIssues", () => {
  const base: Rule = {
    id: 1,
    name: "beta",
    query: { combinator: "and", rules: [{ field: "country", operator: "=", value: "FR" }] },
    outcome: newOutcome("on"),
  };
  const tests: { name: string; rule: Partial<Rule>; want: RuleIssue[] }[] = [
    { name: "complete rule", rule: {}, want: [] },
    { name: "blank name", rule: { name: " " }, want: ["name"] },
    { name: "no condition", rule: { query: { ...EMPTY_QUERY } }, want: ["condition"] },
    { name: "unknown variation", rule: { outcome: newOutcome("gone") }, want: ["outcome"] },
    { name: "new rule's blank condition", rule: { query: newQuery() }, want: ["value"] },
    {
      name: "unset value in a nested group",
      rule: {
        query: {
          combinator: "and",
          rules: [
            { field: "country", operator: "=", value: "FR" },
            { combinator: "or", rules: [{ field: "plan", operator: "in", value: undefined }] },
          ],
        },
      },
      want: ["value"],
    },
    ...["", " ", 0, false].map((value) => ({
      name: `explicit literal ${JSON.stringify(value)}`,
      rule: { query: { combinator: "and", rules: [{ field: "email", operator: "=", value }] } },
      want: [],
    })),
    ...[
      { operator: "in", value: "", want: ["value"] },
      { operator: "notIn", value: [], want: ["value"] },
      { operator: "in", value: "a,b", want: [] },
      { operator: "notIn", value: ["a"], want: [] },
    ].map((tt) => ({
      name: `${tt.operator} with ${JSON.stringify(tt.value)}`,
      rule: { query: { combinator: "and", rules: [{ field: "plan", operator: tt.operator, value: tt.value }] } },
      want: tt.want as RuleIssue[],
    })),
    {
      name: "is null needs no value",
      rule: { query: { combinator: "and", rules: [{ field: "email", operator: "null", value: "" }] } },
      want: [],
    },
    {
      name: "everything missing, in display order",
      rule: { name: "", query: { ...EMPTY_QUERY }, outcome: newOutcome("gone") },
      want: ["name", "condition", "outcome"],
    },
  ];

  for (const tt of tests) {
    it(tt.name, () => {
      expect(ruleIssues({ ...base, ...tt.rule }, ["on", "off"])).toEqual(tt.want);
    });
  }

  const ranges = [
    { name: "untouched", value: undefined, valid: false },
    { name: "missing upper", value: "10,", valid: false },
    { name: "missing lower", value: ",20", valid: false },
    { name: "both empty", value: ",", valid: false },
    { name: "whitespace bound", value: "10,  ", valid: false },
    { name: "extra bound", value: "10,20,30", valid: false },
    { name: "empty position before extra bound", value: "10, ,20", valid: false },
    { name: "empty array", value: [], valid: false },
    { name: "partial array", value: [10], valid: false },
    { name: "unset array bound", value: [undefined, 20], valid: false },
    { name: "blank array bound", value: [" ", 20], valid: false },
    { name: "NaN array bound", value: [NaN, 20], valid: false },
    { name: "zero", value: "0,20", valid: true },
    { name: "negative and decimal", value: "-1.5,2.5", valid: true },
    { name: "reversed numeric", value: "20,10", valid: true },
    { name: "text", value: "a,z", valid: true },
    { name: "escaped comma", value: "a\\,b,z", valid: true },
    { name: "numeric array", value: [0, 20], valid: true },
    { name: "text array", value: ["a,b", "z"], valid: true },
  ];
  for (const operator of ["between", "notBetween"]) {
    for (const tt of ranges) {
      it(`${operator}: ${tt.name}`, () => {
        expect(ruleIssues({
          ...base,
          query: { combinator: "and", rules: [{ field: "age", operator, value: tt.value }] },
        }, ["on", "off"])).toEqual(tt.valid ? [] : ["range"]);
      });
    }
  }

  it("reports nested incomplete ranges once alongside other missing values", () => {
    expect(ruleIssues({
      ...base,
      query: {
        combinator: "and",
        rules: [
          { field: "age", operator: "between", value: "10," },
          { combinator: "or", rules: [
            { field: "age", operator: "notBetween", value: ",20" },
            { field: "email", operator: "=", value: undefined },
          ] },
        ],
      },
    }, ["on", "off"])).toEqual(["range", "value"]);
  });
});
