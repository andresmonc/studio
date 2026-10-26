import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  buildFlagPayload,
  buildOutcome,
  clampPercentage,
  cleanMetadata,
  diffVariations,
  hydrateForm,
  isoToLocalInput,
  localMidnight,
  QB_OPERATORS,
  newProg,
  nextRuleName,
  outcomeFromRule,
  outcomeSum,
  outcomeValid,
  reconcileOutcome,
  useFlagForm,
  valueError,
  variationsForType,
} from "./flag-form";
import type { FlagPayload } from "@/types/api";

const payload: FlagPayload = {
  variations: { on: true, off: false },
  metadata: { description: "desc", owner: "team-x", issue: "JIRA-1" },
  defaultRule: { percentage: { on: 30, off: 70 } },
  targeting: [
    {
      name: "beta",
      query: JSON.stringify({ "==": [{ var: "email" }, "a@b.co"] }),
      variation: "on",
    },
  ],
};

describe("hydrate/build round-trip", () => {
  it("rebuilds an equivalent payload", () => {
    const built = buildFlagPayload(hydrateForm(payload));
    expect(built.variations).toEqual({ on: true, off: false });
    expect(built.defaultRule).toEqual({ percentage: { on: 30, off: 70 } });
    expect(Array.isArray(built.targeting)).toBe(true);
  });

  it("defaults trackEvents to true when omitted and round-trips an explicit value", () => {
    expect(buildFlagPayload(hydrateForm(payload)).trackEvents).toBe(true);
    expect(
      buildFlagPayload(hydrateForm({ ...payload, trackEvents: false }))
        .trackEvents,
    ).toBe(false);
  });

  it("preserves metadata keys beyond description/owner", () => {
    const built = buildFlagPayload(hydrateForm(payload)) as {
      metadata?: Record<string, unknown>;
    };
    expect(built.metadata).toMatchObject({
      description: "desc",
      owner: "team-x",
      issue: "JIRA-1",
    });
  });
});

describe("nextRuleName", () => {
  const tests = [
    { name: "first rule", names: [], want: "Rule 1" },
    { name: "next after a run", names: ["Rule 1", "Rule 2"], want: "Rule 3" },
    { name: "reuses a freed slot instead of duplicating", names: ["Rule 2"], want: "Rule 1" },
    { name: "skips custom-named collisions", names: ["Rule 1", "beta users", "Rule 3"], want: "Rule 2" },
  ];
  for (const tt of tests) {
    it(tt.name, () => expect(nextRuleName(tt.names)).toBe(tt.want));
  }
});

describe("QB_OPERATORS", () => {
  it("drops the begins/ends-with operators GOFF's jsonlogic can't evaluate", () => {
    const names = QB_OPERATORS.map((o) => o.name);
    for (const op of ["beginsWith", "doesNotBeginWith", "endsWith", "doesNotEndWith"]) {
      expect(names).not.toContain(op);
    }
    expect(names).toEqual(expect.arrayContaining(["=", "contains", "in"]));
  });
});

describe("variationsForType", () => {
  it("defaults boolean flags to enabled=true / disabled=false", () => {
    const vars = variationsForType("boolean");
    expect(vars.map((v) => ({ name: v.name, value: v.value }))).toEqual([
      { name: "enabled", value: "true" },
      { name: "disabled", value: "false" },
    ]);
  });

  it("defaults non-boolean flags to control / treatment-1", () => {
    expect(
      variationsForType("string").map((v) => ({ name: v.name, value: v.value })),
    ).toEqual([
      { name: "control", value: "" },
      { name: "treatment-1", value: "" },
    ]);
  });
});

describe("valueError", () => {
  it("validates typed variation values", () => {
    expect(valueError("boolean", "")).toBeNull();
    expect(valueError("string", "")).toBe("flag.wizard.errValueRequired");
    // Empty value is rejected before the type-specific check for every type.
    expect(valueError("int", "")).toBe("flag.wizard.errValueRequired");
    expect(valueError("float", "")).toBe("flag.wizard.errValueRequired");
    expect(valueError("json", "")).toBe("flag.wizard.errValueRequired");
    expect(valueError("int", "1.5")).toBe("flag.wizard.errInt");
    expect(valueError("int", "3")).toBeNull();
    expect(valueError("float", "abc")).toBe("flag.wizard.errFloat");
    expect(valueError("float", "1.5")).toBeNull();
    expect(valueError("json", "{")).toBe("flag.wizard.errJson");
    expect(valueError("json", '{"a":1}')).toBeNull();
  });
});

describe("cleanMetadata", () => {
  it("trims strings and drops empty/undefined values", () => {
    expect(cleanMetadata({ a: "", b: " x ", c: 0, d: false, e: undefined })).toEqual(
      { b: "x", c: 0, d: false },
    );
  });

  it("keeps non-empty arrays but drops empty ones (tags)", () => {
    expect(cleanMetadata({ tags: ["a", "b"], empty: [] })).toEqual({
      tags: ["a", "b"],
    });
  });
});

describe("tags metadata", () => {
  const withTags = (tags: unknown): FlagPayload => ({
    variations: { on: true, off: false },
    metadata: { tags } as Record<string, unknown>,
    defaultRule: { variation: "on" },
  });

  it("hydrates metadata.tags into the reserved bucket as an array", () => {
    const form = hydrateForm(withTags(["beta", "prod"]));
    expect(form.metadata.tags).toEqual(["beta", "prod"]);
    // tags must NOT leak into the custom (EnrichmentEditor) bucket.
    expect(form.customMetadata).toEqual({});
  });

  it("round-trips tags through build", () => {
    const built = buildFlagPayload(hydrateForm(withTags(["beta", "prod"]))) as {
      metadata?: Record<string, unknown>;
    };
    expect(built.metadata?.tags).toEqual(["beta", "prod"]);
  });

  it("drops an empty tags array on build (never persists tags: [])", () => {
    const built = buildFlagPayload(hydrateForm(withTags([]))) as {
      metadata?: Record<string, unknown>;
    };
    expect(built.metadata?.tags).toBeUndefined();
  });

  // D4:A — guard against clobbering a pre-existing NON-array `metadata.tags`
  // (e.g. a scalar authored via the old metadata editor before this feature).
  // hydrateForm must preserve it untouched through a round-trip; the TagInput's
  // array coercion is display-only and must never rewrite the stored value.
  it("preserves a pre-existing non-array metadata.tags untouched", () => {
    const built = buildFlagPayload(hydrateForm(withTags("legacy-value"))) as {
      metadata?: Record<string, unknown>;
    };
    expect(built.metadata?.tags).toBe("legacy-value");
  });

  it("exposes form.tags as an empty array when the stored value is non-array", () => {
    const form = hydrateForm(withTags("legacy-value"));
    // Reserved bucket keeps the raw value; the useFlagForm `tags` accessor is
    // what coerces to [] for the TagInput (covered in the useFlagForm block).
    expect(form.metadata.tags).toBe("legacy-value");
  });
});

describe("percentage sum ignores orphaned variation keys (rename bug)", () => {
  it("outcomeSum only counts current variation names", () => {
    const outcome = {
      mode: "percentage" as const,
      single: "",
      percentages: { on: 60, off: 40, oldName: 100 },
      prog: newProg(),
    };
    // oldName (a renamed/removed variation) must not inflate the sum to 200.
    expect(outcomeSum(outcome, ["on", "off"])).toBe(100);
  });

  it("buildFlagPayload drops orphaned percentage keys", () => {
    const form = {
      type: "string" as const,
      variations: [
        { id: 1, name: "a", value: "x" },
        { id: 2, name: "b", value: "y" },
      ],
      rules: [],
      defaultOutcome: {
        mode: "percentage" as const,
        single: "",
        percentages: { a: 60, b: 40, oldName: 100 },
        prog: newProg(),
      },
      trackEvents: true,
      metadata: {},
      customMetadata: {},
      customMetaValid: true,
    };
    const payload = buildFlagPayload(form) as {
      defaultRule?: { percentage?: Record<string, number> };
    };
    expect(payload.defaultRule?.percentage).toEqual({ a: 60, b: 40 });
  });
});

describe("clampPercentage caps a variation at the remaining room", () => {
  const names = ["a", "b", "c"];
  const outcome = (percentages: Record<string, number>) => ({
    mode: "percentage" as const,
    single: "",
    percentages,
    prog: newProg(),
  });

  it("caps b at 80 when a is already 20", () => {
    const o = outcome({ a: 20, b: 0, c: 0 });
    // Dragging/typing b past its room snaps to the max possible.
    expect(clampPercentage(95, "b", o, names)).toBe(80);
    expect(clampPercentage(100, "b", o, names)).toBe(80);
  });

  it("excludes the variation's own current weight from the cap", () => {
    // b is already 50; with a=20 the room for b is 80 (its own weight doesn't
    // count against it), so 70 is allowed as-is but 95 still snaps to 80.
    const o = outcome({ a: 20, b: 50, c: 0 });
    expect(clampPercentage(70, "b", o, names)).toBe(70);
    expect(clampPercentage(95, "b", o, names)).toBe(80);
    expect(clampPercentage(30, "b", o, names)).toBe(30);
  });

  it("accounts for every other variation, not just the first", () => {
    const o = outcome({ a: 20, b: 30, c: 0 });
    // Room for c is 100 - 20 - 30 = 50.
    expect(clampPercentage(90, "c", o, names)).toBe(50);
  });

  it("allows the full 100 when the others are empty and floors at 0", () => {
    const o = outcome({ a: 0, b: 0, c: 0 });
    expect(clampPercentage(100, "a", o, names)).toBe(100);
    expect(clampPercentage(-5, "a", o, names)).toBe(0);
  });

  it("preserves decimal entries within the cap", () => {
    const o = outcome({ a: 33.3, b: 0, c: 0 });
    expect(clampPercentage(33.3, "b", o, names)).toBe(33.3);
  });

  it("never returns a negative weight when others already exceed 100", () => {
    // Legacy/unnormalized flags can load with others summing past 100; the cap
    // must floor at 0, not write a negative weight.
    const o = outcome({ a: 60, b: 60, c: 0 });
    expect(clampPercentage(10, "c", o, names)).toBe(0);
  });

  it("coerces non-numeric input to 0 instead of propagating NaN", () => {
    const o = outcome({ a: 20, b: 0, c: 0 });
    expect(clampPercentage(Number("1e"), "b", o, names)).toBe(0);
    expect(clampPercentage(NaN, "b", o, names)).toBe(0);
  });
});

describe("variation rename/remove reconciliation", () => {
  const pctOutcome = (percentages: Record<string, number>) => ({
    mode: "percentage" as const,
    single: "",
    percentages,
    prog: newProg(),
  });

  it("diffVariations detects renames and removals by id", () => {
    const prev = [
      { id: 1, name: "a", value: "" },
      { id: 2, name: "b", value: "" },
    ];
    const next = [{ id: 1, name: "x", value: "" }]; // renamed a→x, removed b
    const { renames, removed, nextNames } = diffVariations(prev, next);
    expect(renames.get("a")).toBe("x");
    expect(removed.has("b")).toBe(true);
    expect(nextNames).toEqual(["x"]);
  });

  it("migrates a renamed variation's weight (sum stays 100, no orphan)", () => {
    const o = pctOutcome({ a: 60, b: 40 });
    const reconciled = reconcileOutcome(
      o,
      new Map([["a", "x"]]),
      new Set(),
      ["x", "b"],
    );
    expect(reconciled.percentages).toEqual({ x: 60, b: 40 });
    expect(outcomeSum(reconciled, ["x", "b"])).toBe(100);
  });

  it("drops a removed variation's weight and clears refs", () => {
    const o = {
      mode: "single" as const,
      single: "b",
      percentages: { a: 60, b: 40 },
      prog: newProg(),
    };
    const reconciled = reconcileOutcome(o, new Map(), new Set(["b"]), ["a"]);
    expect(reconciled.percentages).toEqual({ a: 60 });
    expect(reconciled.single).toBe("");
  });
});

describe("progressive rollout keeps distinct initial/end variations", () => {
  it("buildOutcome emits each step's own variation (off → on)", () => {
    const outcome = {
      mode: "progressive" as const,
      single: "",
      percentages: {},
      prog: {
        initialVariation: "off",
        endVariation: "on",
        initialPct: 0,
        endPct: 100,
        startDate: "2024-01-01",
        endDate: "2024-02-01",
      },
    };
    const built = buildOutcome(outcome, ["on", "off"]) as {
      progressiveRollout: {
        initial: { variation: string; percentage: number; date: string };
        end: { variation: string; percentage: number; date: string };
      };
    };
    expect(built.progressiveRollout.initial.variation).toBe("off");
    expect(built.progressiveRollout.end.variation).toBe("on");
    expect(built.progressiveRollout.initial.variation).not.toBe(
      built.progressiveRollout.end.variation,
    );
    expect(built.progressiveRollout.initial.percentage).toBe(0);
    expect(built.progressiveRollout.end.percentage).toBe(100);
  });

  it("outcomeFromRule hydrates initial/end variations and round-trips the date instant", () => {
    const outcome = outcomeFromRule({
      progressiveRollout: {
        initial: { variation: "off", percentage: 0, date: "2024-01-01T00:00:00Z" },
        end: { variation: "on", percentage: 100, date: "2024-02-01T00:00:00Z" },
      },
    });
    expect(outcome.mode).toBe("progressive");
    expect(outcome.prog.initialVariation).toBe("off");
    expect(outcome.prog.endVariation).toBe("on");
    // The dates hydrate into local datetime-local strings (timezone-dependent),
    // so assert the round-tripped UTC instant rather than the local wall-clock.
    const built = buildOutcome(outcome, ["on", "off"]) as {
      progressiveRollout: {
        initial: { date: string };
        end: { date: string };
      };
    };
    expect(new Date(built.progressiveRollout.initial.date).toISOString()).toBe(
      "2024-01-01T00:00:00.000Z",
    );
    expect(new Date(built.progressiveRollout.end.date).toISOString()).toBe(
      "2024-02-01T00:00:00.000Z",
    );
  });

  it("reconcileOutcome migrates both variation refs on rename", () => {
    const o = {
      mode: "progressive" as const,
      single: "",
      percentages: {},
      prog: {
        initialVariation: "off",
        endVariation: "on",
        initialPct: 0,
        endPct: 100,
        startDate: "2024-01-01",
        endDate: "2024-02-01",
      },
    };
    const reconciled = reconcileOutcome(
      o,
      new Map([["on", "enabled"]]),
      new Set(),
      ["off", "enabled"],
    );
    expect(reconciled.prog.initialVariation).toBe("off");
    expect(reconciled.prog.endVariation).toBe("enabled");
  });

  it("reconcileOutcome clears a removed progressive variation ref", () => {
    const o = {
      mode: "progressive" as const,
      single: "",
      percentages: {},
      prog: {
        initialVariation: "off",
        endVariation: "on",
        initialPct: 0,
        endPct: 100,
        startDate: "2024-01-01",
        endDate: "2024-02-01",
      },
    };
    // "on" is removed → endVariation collapses to "", initial stays.
    const reconciled = reconcileOutcome(o, new Map(), new Set(["on"]), ["off"]);
    expect(reconciled.prog.initialVariation).toBe("off");
    expect(reconciled.prog.endVariation).toBe("");
  });

  it("outcomeValid requires both variations and both dates", () => {
    const names = ["on", "off"];
    const base = {
      mode: "progressive" as const,
      single: "",
      percentages: {},
      prog: {
        initialVariation: "off",
        endVariation: "on",
        initialPct: 0,
        endPct: 100,
        startDate: "2024-01-01T00:00",
        endDate: "2024-02-01T00:00",
      },
    };
    expect(outcomeValid(base, names)).toBe(true);
    expect(
      outcomeValid({ ...base, prog: { ...base.prog, endVariation: "" } }, names),
    ).toBe(false);
    expect(
      outcomeValid(
        { ...base, prog: { ...base.prog, initialVariation: "ghost" } },
        names,
      ),
    ).toBe(false);
    expect(
      outcomeValid({ ...base, prog: { ...base.prog, startDate: "" } }, names),
    ).toBe(false);
    expect(
      outcomeValid({ ...base, prog: { ...base.prog, endDate: "" } }, names),
    ).toBe(false);
    // End must be strictly after start (engine errors on an inverted/equal window).
    expect(
      outcomeValid(
        {
          ...base,
          prog: {
            ...base.prog,
            startDate: "2024-02-01T00:00",
            endDate: "2024-01-01T00:00",
          },
        },
        names,
      ),
    ).toBe(false);
    expect(
      outcomeValid(
        {
          ...base,
          prog: {
            ...base.prog,
            startDate: "2024-01-01T00:00",
            endDate: "2024-01-01T00:00",
          },
        },
        names,
      ),
    ).toBe(false);
  });

  it("isoToLocalInput formats a datetime-local string that inverts to the same minute", () => {
    const iso = "2024-03-05T07:09:00Z";
    const local = isoToLocalInput(iso);
    // Shape: YYYY-MM-DDTHH:mm with zero-padded two-digit components.
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    // Parsing the local string back (as local time) recovers the same instant.
    expect(new Date(local).getTime()).toBe(new Date(iso).getTime());
  });

  it("localMidnight formats the given date at 00:00 local time", () => {
    const local = localMidnight(new Date(2024, 2, 5, 13, 47)); // 5 Mar 2024, 13:47 local
    // Time is pinned to midnight regardless of the input's wall-clock time,
    // and the date components are zero-padded.
    expect(local).toBe("2024-03-05T00:00");
  });

  it("newProg defaults to 12:00 AM today/tomorrow and is a valid rollout window", () => {
    const prog = newProg();
    // Both fields are datetime-local strings pinned to midnight.
    expect(prog.startDate).toMatch(/^\d{4}-\d{2}-\d{2}T00:00$/);
    expect(prog.endDate).toMatch(/^\d{4}-\d{2}-\d{2}T00:00$/);
    // End defaults strictly after start (next calendar day), so outcomeValid's
    // start < end check passes out of the box. Compare instants rather than a
    // fixed 24h delta — DST transitions make midnight-to-midnight 23h or 25h.
    const startMs = new Date(prog.startDate).getTime();
    const endMs = new Date(prog.endDate).getTime();
    expect(endMs).toBeGreaterThan(startMs);
  });
});

describe("useFlagForm", () => {
  it("starts clean, becomes dirty on change, and validity tracks percentages", () => {
    const { result } = renderHook(() => useFlagForm(payload));
    expect(result.current.isDirty).toBe(false);
    expect(result.current.valid).toBe(true);

    act(() => result.current.setDescription("new desc"));
    expect(result.current.isDirty).toBe(true);

    act(() =>
      result.current.setDefaultOutcome({
        mode: "percentage",
        single: "",
        percentages: { on: 10, off: 10 }, // sums to 20, invalid
        prog: newProg(),
      }),
    );
    expect(result.current.valid).toBe(false);
  });

  it("setTrackEvents flips the flag, marks dirty, and survives buildPayload", () => {
    const { result } = renderHook(() => useFlagForm(payload));
    // Omitted in the payload → hydrated default is true.
    expect(result.current.trackEvents).toBe(true);
    expect(result.current.isDirty).toBe(false);

    act(() => result.current.setTrackEvents(false));
    expect(result.current.trackEvents).toBe(false);
    expect(result.current.isDirty).toBe(true);
    expect(
      (result.current.buildPayload() as { trackEvents?: boolean }).trackEvents,
    ).toBe(false);
  });

  it("reset() restores the hydrated state and clears dirty", () => {
    const { result } = renderHook(() => useFlagForm(payload));
    act(() => result.current.setOwner("someone-else"));
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.reset());
    expect(result.current.isDirty).toBe(false);
    expect(result.current.owner).toBe("team-x");
  });
});

describe("metadata typed properties", () => {
  const mdPayload: FlagPayload = {
    variations: { on: true, off: false },
    metadata: {
      owner: "team-x",
      description: "desc",
      maxRetries: 5,
      ratio: 0.5,
      beta: true,
      label: "blue",
    },
    defaultRule: { variation: "on" },
  };

  it("splits reserved keys from custom metadata on hydrate", () => {
    const form = hydrateForm(mdPayload);
    // reserved keys stay in metadata; custom keys move to customMetadata.
    expect(Object.keys(form.metadata).sort()).toEqual(["description", "owner"]);
    expect(form.customMetadata).toEqual({
      maxRetries: 5,
      ratio: 0.5,
      beta: true,
      label: "blue",
    });
  });

  it("merges custom metadata back into the payload on build", () => {
    const built = buildFlagPayload(hydrateForm(mdPayload)) as {
      metadata?: Record<string, unknown>;
    };
    expect(built.metadata).toMatchObject({
      owner: "team-x",
      description: "desc",
      maxRetries: 5,
      ratio: 0.5,
      beta: true,
      label: "blue",
    });
    expect(typeof built.metadata?.maxRetries).toBe("number");
    expect(built.metadata?.beta).toBe(true);
  });

  it("preserves a real false boolean (not dropped as empty)", () => {
    const form = hydrateForm({
      variations: { on: true, off: false },
      metadata: { flagged: false },
      defaultRule: { variation: "on" },
    });
    const built = buildFlagPayload(form) as { metadata?: Record<string, unknown> };
    expect(built.metadata?.flagged).toBe(false);
  });

  it("custom metadata edits drive dirty + validity through setCustomMetadata", () => {
    const { result } = renderHook(() => useFlagForm(mdPayload));
    expect(result.current.isDirty).toBe(false);
    expect(result.current.valid).toBe(true);

    // The editor reports an invalid row set (e.g. a bad-typed value).
    act(() => result.current.setCustomMetadata({ maxRetries: 5 }, false));
    expect(result.current.valid).toBe(false);

    // A new, valid attribute makes the form dirty but still valid.
    act(() =>
      result.current.setCustomMetadata(
        { maxRetries: 5, ratio: 0.5, beta: true, label: "blue", added: "x" },
        true,
      ),
    );
    expect(result.current.valid).toBe(true);
    expect(result.current.isDirty).toBe(true);
    expect(
      (result.current.buildPayload() as { metadata?: Record<string, unknown> })
        .metadata?.added,
    ).toBe("x");
  });
});
