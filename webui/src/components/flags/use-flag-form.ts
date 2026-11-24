// useFlagForm: the inline-editing hook backing the detail editor and wizard.
// Owns form state, reconciles outcomes when variations change, and reports
// validity + dirtiness. Extracted from flag-form.tsx.

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  diffVariations,
  outcomeValid,
  ruleValid,
  reconcileOutcome,
  valueValid,
} from "./flag-form-helpers";
import { buildFlagPayload, hydrateForm } from "./flag-form-hydration";
import { reconcileSchedule, scheduleStepValid } from "./flag-form-schedule";
import type {
  FlagFormState,
  Outcome,
  Rule,
  ScheduleStep,
  UseFlagForm,
  Variation,
} from "./flag-form-types";
import type { FlagPayload } from "@/types/api";

// Fields buildFlagPayload writes; `disable` is here because the server rejects it in the payload.
const MANAGED_KEYS = new Set([
  "variations",
  "targeting",
  "defaultRule",
  "metadata",
  "trackEvents",
  "scheduledRollout",
  "disable",
]);

function withUnmanaged(
  payload: FlagPayload | undefined,
  built: Record<string, unknown>,
): Record<string, unknown> {
  const kept = Object.entries(payload ?? {}).filter(
    ([k]) => !MANAGED_KEYS.has(k),
  );
  return { ...built, ...Object.fromEntries(kept) };
}

export function useFlagForm(payload?: FlagPayload): UseFlagForm {
  // Re-hydrate only when the payload *content* changes (e.g. after a save
  // refetch), not on every query-result identity change — otherwise an
  // unrelated refetch (toggling enable/disable) would wipe in-progress edits.
  const payloadKey = useMemo(() => JSON.stringify(payload ?? {}), [payload]);
  const [state, setState] = useState<FlagFormState>(() => hydrateForm(payload));

  useEffect(() => {
    setState(hydrateForm(payload));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey]);

  const baseline = useMemo(
    () =>
      JSON.stringify(
        withUnmanaged(payload, buildFlagPayload(hydrateForm(payload))),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [payloadKey],
  );

  const setVariations: Dispatch<SetStateAction<Variation[]>> = (action) =>
    setState((s) => {
      const nextVars =
        typeof action === "function"
          ? (action as (p: Variation[]) => Variation[])(s.variations)
          : action;
      const { renames, removed, nextNames } = diffVariations(
        s.variations,
        nextVars,
      );
      if (renames.size === 0 && removed.size === 0) {
        return { ...s, variations: nextVars };
      }
      return {
        ...s,
        variations: nextVars,
        schedule: reconcileSchedule(s.schedule, s.rules, renames, removed, nextNames),
        defaultOutcome: reconcileOutcome(
          s.defaultOutcome,
          renames,
          removed,
          nextNames,
        ),
        rules: s.rules.map((r) => ({
          ...r,
          outcome: reconcileOutcome(r.outcome, renames, removed, nextNames),
        })),
      };
    });

  const setRules: Dispatch<SetStateAction<Rule[]>> = (action) =>
    setState((s) => {
      const rules =
        typeof action === "function"
          ? (action as (p: Rule[]) => Rule[])(s.rules)
          : action;
      const names = s.variations.map((v) => v.name);
      return {
        ...s,
        rules,
        schedule: reconcileSchedule(s.schedule, rules, new Map(), new Set(), names),
      };
    });

  const setSchedule: Dispatch<SetStateAction<ScheduleStep[]>> = (action) =>
    setState((s) => ({
      ...s,
      schedule:
        typeof action === "function"
          ? (action as (p: ScheduleStep[]) => ScheduleStep[])(s.schedule)
          : action,
    }));

  const setDefaultOutcome = (o: Outcome) =>
    setState((s) => ({ ...s, defaultOutcome: o }));

  const setTrackEvents = (v: boolean) =>
    setState((s) => ({ ...s, trackEvents: v }));

  const setDescription = (v: string) =>
    setState((s) => ({ ...s, metadata: { ...s.metadata, description: v } }));
  const setOwner = (v: string) =>
    setState((s) => ({ ...s, metadata: { ...s.metadata, owner: v } }));
  // Tags are a reserved metadata key edited via the dedicated TagInput; stored as
  // a string[] under metadata.tags.
  const setTags = (next: string[]) =>
    setState((s) => ({ ...s, metadata: { ...s.metadata, tags: next } }));

  // The Metadata editor owns its rows and reports the resolved object + validity.
  const setCustomMetadata = (obj: Record<string, unknown>, ok: boolean) =>
    setState((s) => ({ ...s, customMetadata: obj, customMetaValid: ok }));

  const variationNames = state.variations.map((v) => v.name);
  const variationsOk =
    state.variations.length >= 2 &&
    new Set(variationNames).size === state.variations.length &&
    state.variations.every(
      (v) => v.name.trim() !== "" && valueValid(state.type, v.value),
    );
  const rulesOk = state.rules.every((r) => ruleValid(r, variationNames));
  const defaultOk = outcomeValid(state.defaultOutcome, variationNames);
  const scheduleOk = state.schedule.every((s) =>
    scheduleStepValid(s, state, variationNames),
  );
  const valid =
    variationsOk && rulesOk && defaultOk && scheduleOk && state.customMetaValid;

  const buildPayload = () => withUnmanaged(payload, buildFlagPayload(state));
  const isDirty = JSON.stringify(buildPayload()) !== baseline;

  return {
    ...state,
    variationNames,
    description:
      typeof state.metadata.description === "string"
        ? state.metadata.description
        : "",
    owner:
      typeof state.metadata.owner === "string" ? state.metadata.owner : "",
    tags: Array.isArray(state.metadata.tags)
      ? (state.metadata.tags.filter((t) => typeof t === "string") as string[])
      : [],
    setVariations,
    setRules,
    setDefaultOutcome,
    setSchedule,
    setTrackEvents,
    setDescription,
    setOwner,
    setTags,
    setCustomMetadata,
    valid,
    isDirty,
    buildPayload,
    reset: () => setState(hydrateForm(payload)),
  };
}
