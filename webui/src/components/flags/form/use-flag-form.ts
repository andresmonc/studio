// useFlagForm: the inline-editing hook backing the detail editor and wizard.
// Owns form state, reconciles outcomes when variations change, and reports
// validity + dirtiness. Extracted from flag-form.tsx.

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  diffVariations,
  outcomeValid,
  reconcileOutcome,
  valueValid,
} from "./flag-form-helpers";
import { buildFlagPayload, hydrateForm } from "./flag-form-hydration";
import type {
  FlagFormState,
  Outcome,
  Rule,
  UseFlagForm,
  Variation,
} from "./flag-form-types";
import type { FlagPayload } from "@/types/api";

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
    () => JSON.stringify(buildFlagPayload(hydrateForm(payload))),
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
    setState((s) => ({
      ...s,
      rules:
        typeof action === "function"
          ? (action as (p: Rule[]) => Rule[])(s.rules)
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
  const rulesOk = state.rules.every(
    (r) =>
      r.name.trim() !== "" &&
      r.query.rules.length > 0 &&
      outcomeValid(r.outcome, variationNames),
  );
  const defaultOk = outcomeValid(state.defaultOutcome, variationNames);
  const valid =
    variationsOk && rulesOk && defaultOk && state.customMetaValid;

  const buildPayload = () => buildFlagPayload(state);
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
