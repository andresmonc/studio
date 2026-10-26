import { describe, expect, it } from "vitest";
import { auditKey, categoryOf, scopeOf, VERB } from "./vocabulary";

describe("auditKey", () => {
  const tests = [
    { name: "joins target type and action", e: { targetType: "flagset", action: "create" }, want: "flagset.create" },
    { name: "reads a disable toggle", e: { targetType: "flag", action: "update", before: { disabled: false }, after: { disabled: true } }, want: "flag.disable" },
    { name: "reads an enable toggle", e: { targetType: "flag", action: "update", before: { disabled: true }, after: { disabled: false } }, want: "flag.enable" },
    { name: "keeps a payload update as update", e: { targetType: "flag", action: "update", after: { disabled: false, payload: {} } }, want: "flag.update" },
    { name: "only flags toggle", e: { targetType: "team", action: "update", after: { disabled: true } }, want: "team.update" },
  ];
  for (const tt of tests) {
    it(tt.name, () => expect(auditKey(tt.e)).toBe(tt.want));
  }

  it("has a verb for every key the server can emit", () => {
    const keys = [
      "flag.create", "flag.update", "flag.delete", "flag.rollback", "flag.enable", "flag.disable",
      "flagset.create", "flagset.update", "flagset.delete",
      "team.create", "team.update", "team.delete",
      "company.create", "company.update", "company.delete",
      "api_key.create", "api_key.delete",
      "team_member.create", "team_member.update", "team_member.delete",
      "company_member.create", "company_member.update", "company_member.delete",
    ];
    expect(keys.filter((k) => !VERB[k])).toEqual([]);
  });
});

describe("scopeOf", () => {
  const tests = [
    { targetType: "flag", want: "flags" },
    { targetType: "flagset", want: "flagsets" },
    { targetType: "api_key", want: "keys" },
    { targetType: "team", want: "teams" },
    { targetType: "team_member", want: "teams" },
    { targetType: "company", want: "other" },
    { targetType: "company_member", want: "other" },
  ];
  for (const tt of tests) {
    it(`${tt.targetType} -> ${tt.want}`, () => expect(scopeOf(tt.targetType)).toBe(tt.want));
  }
});

describe("categoryOf", () => {
  const tests = [
    { key: "api_key.create", want: "key" },
    { key: "team_member.create", want: "member" },
    { key: "company_member.delete", want: "member" },
    { key: "flag.create", want: "created" },
    { key: "flag.update", want: "updated" },
    { key: "flag.delete", want: "deleted" },
    { key: "flag.disable", want: "disabled" },
    { key: "flag.enable", want: "enabled" },
    { key: "flag.rollback", want: "reverted" },
    { key: "something.weird", want: "other" },
  ];
  for (const tt of tests) {
    it(`${tt.key} -> ${tt.want}`, () => expect(categoryOf(tt.key)).toBe(tt.want));
  }
});
