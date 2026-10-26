import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFlagForm } from "./use-flag-form";
import { EMPTY_QUERY } from "./flag-form-helpers";
import type { Rule, Variation } from "./flag-form-types";
import type { FlagPayload } from "@/types/api";

const payload: FlagPayload = {
  variations: { on: true, off: false },
  defaultRule: { percentage: { on: 30, off: 70 } },
  targeting: [
    {
      name: "beta",
      query: JSON.stringify({ "==": [{ var: "email" }, "a@b.co"] }),
      variation: "on",
    },
  ],
};

const renderForm = (p: FlagPayload = payload) =>
  renderHook(() => useFlagForm(p));

describe("useFlagForm setVariations", () => {
  const tests: {
    name: string;
    update: (prev: Variation[]) => Variation[];
    useUpdater: boolean;
    wantNames: string[];
    wantDefaultPct: Record<string, number>;
    wantRuleSingle: string;
  }[] = [
    {
      name: "updater fn that only edits a value leaves outcomes untouched",
      update: (prev) => prev.map((v) => ({ ...v })),
      useUpdater: true,
      wantNames: ["on", "off"],
      wantDefaultPct: { on: 30, off: 70 },
      wantRuleSingle: "on",
    },
    {
      name: "rename migrates default weights and rule refs",
      update: (prev) =>
        prev.map((v) => (v.name === "on" ? { ...v, name: "enabled" } : v)),
      useUpdater: false,
      wantNames: ["enabled", "off"],
      wantDefaultPct: { enabled: 30, off: 70 },
      wantRuleSingle: "enabled",
    },
    {
      name: "removal drops weights and clears rule refs",
      update: (prev) => prev.filter((v) => v.name !== "on"),
      useUpdater: true,
      wantNames: ["off"],
      wantDefaultPct: { off: 70 },
      wantRuleSingle: "",
    },
  ];

  for (const tt of tests) {
    it(tt.name, () => {
      const { result } = renderForm();
      act(() =>
        result.current.setVariations(
          tt.useUpdater ? tt.update : tt.update(result.current.variations),
        ),
      );
      expect(result.current.variationNames).toEqual(tt.wantNames);
      expect(result.current.defaultOutcome.percentages).toEqual(
        tt.wantDefaultPct,
      );
      expect(result.current.rules[0].outcome.single).toBe(tt.wantRuleSingle);
    });
  }

  it("rejects duplicate or blank variation names", () => {
    const { result } = renderForm();
    act(() =>
      result.current.setVariations((prev) => [
        ...prev,
        { id: 999, name: "off", value: "false" },
      ]),
    );
    expect(result.current.valid).toBe(false);
  });
});

describe("useFlagForm setRules", () => {
  const extraRule = (base: Rule): Rule => ({ ...base, id: 42, name: "gamma" });

  const tests: {
    name: string;
    apply: (set: ReturnType<typeof useFlagForm>["setRules"], rules: Rule[]) => void;
    wantNames: string[];
    wantValid: boolean;
  }[] = [
    {
      name: "updater fn appends a rule",
      apply: (set) => set((prev) => [...prev, extraRule(prev[0])]),
      wantNames: ["beta", "gamma"],
      wantValid: true,
    },
    {
      name: "plain value replaces the rules",
      apply: (set) => set([]),
      wantNames: [],
      wantValid: true,
    },
    {
      name: "a rule with an empty query is invalid",
      apply: (set, rules) => set([{ ...rules[0], query: { ...EMPTY_QUERY } }]),
      wantNames: ["beta"],
      wantValid: false,
    },
    {
      name: "a rule with a blank name is invalid",
      apply: (set, rules) => set([{ ...rules[0], name: "  " }]),
      wantNames: ["  "],
      wantValid: false,
    },
  ];

  for (const tt of tests) {
    it(tt.name, () => {
      const { result } = renderForm();
      act(() => tt.apply(result.current.setRules, result.current.rules));
      expect(result.current.rules.map((r) => r.name)).toEqual(tt.wantNames);
      expect(result.current.valid).toBe(tt.wantValid);
      expect(result.current.isDirty).toBe(true);
    });
  }
});

describe("useFlagForm metadata accessors", () => {
  const tests: {
    name: string;
    metadata: Record<string, unknown>;
    wantDescription: string;
    wantOwner: string;
    wantTags: string[];
  }[] = [
    {
      name: "string values pass through",
      metadata: { description: "d", owner: "o", tags: ["a", "b"] },
      wantDescription: "d",
      wantOwner: "o",
      wantTags: ["a", "b"],
    },
    {
      name: "non-string values and non-array tags coerce to empty",
      metadata: { description: 5, owner: false, tags: "legacy" },
      wantDescription: "",
      wantOwner: "",
      wantTags: [],
    },
    {
      name: "non-string tag entries are filtered out",
      metadata: { tags: ["a", 1, null, "b"] },
      wantDescription: "",
      wantOwner: "",
      wantTags: ["a", "b"],
    },
  ];

  for (const tt of tests) {
    it(tt.name, () => {
      const { result } = renderForm({ ...payload, metadata: tt.metadata });
      expect(result.current.description).toBe(tt.wantDescription);
      expect(result.current.owner).toBe(tt.wantOwner);
      expect(result.current.tags).toEqual(tt.wantTags);
    });
  }

  it("setTags stores the tags and marks the form dirty", () => {
    const { result } = renderForm();
    act(() => result.current.setTags(["x", "y"]));
    expect(result.current.tags).toEqual(["x", "y"]);
    expect(result.current.isDirty).toBe(true);
    expect(
      (result.current.buildPayload() as { metadata?: { tags?: string[] } })
        .metadata?.tags,
    ).toEqual(["x", "y"]);
  });
});
