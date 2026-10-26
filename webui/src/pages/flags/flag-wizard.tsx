import { useState } from "react";
import { useCustom, useCustomMutation, useTranslate } from "@refinedev/core";
import { toast } from "sonner";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  RocketIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  RulesEditor,
  buildFlagPayload,
  diffVariations,
  newOutcome,
  outcomeValid,
  reconcileOutcome,
  valueValid,
  variationsForType,
  type Outcome,
  type Rule,
  type Variation,
} from "@/components/flags/flag-form";
import {
  BasicsStep,
  ReviewStep,
  Stepper,
  WizSidekick,
} from "./flag-wizard-steps";
import { API_URL } from "@/providers/constants";
import { useInvalidateRecentlyEditedFlags } from "@/hooks/use-recently-edited-flags";
import { errMessage } from "@/lib/errors";
import type { Flag, Flagset, FlagType } from "@/types/api";

// FlagWizard is the 3-step create flow (Basics → Rules → Review) shown in a
// dialog. Editing happens inline on the flag detail page (see detail.tsx), not
// here — the shared editing logic/UI lives in components/flags/flag-form.tsx.
export function FlagWizard({
  teamId,
  onCreated,
  tagSuggestions = [],
}: {
  teamId: string;
  onCreated: () => void;
  tagSuggestions?: string[];
}) {
  const t = useTranslate();
  const [open, setOpen] = useState(false);

  const { query: flagsetsQuery } = useCustom<Flagset[]>({
    url: `${API_URL}/teams/${teamId}/flagsets`,
    method: "get",
    queryOptions: { queryKey: ["team-flagsets", teamId], enabled: open },
  });
  const flagsets = Array.isArray(flagsetsQuery.data?.data)
    ? flagsetsQuery.data!.data
    : [];

  const { mutate } = useCustomMutation();
  const invalidateRecentlyEdited = useInvalidateRecentlyEditedFlags();
  const [submitting, setSubmitting] = useState(false);

  // ── wizard state ──
  const [step, setStep] = useState(1);
  const [flagsetId, setFlagsetId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [type, setType] = useState<FlagType>("boolean");
  const [variations, setVariations] = useState<Variation[]>(
    variationsForType("boolean"),
  );
  const [enableOnSave, setEnableOnSave] = useState(true);
  const [rules, setRules] = useState<Rule[]>([]);
  const [defaultOutcome, setDefaultOutcome] = useState<Outcome>(newOutcome());
  const [comment, setComment] = useState("");

  const variationNames = variations.map((v) => v.name);

  const reset = () => {
    setStep(1);
    setName("");
    setDescription("");
    setTags([]);
    setType("boolean");
    setVariations(variationsForType("boolean"));
    setEnableOnSave(true);
    setRules([]);
    setDefaultOutcome(newOutcome());
    setComment("");
    setFlagsetId(flagsets[0]?.id ?? "");
  };

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o) requestAnimationFrame(reset);
  };

  const onTypeChange = (ty: FlagType) => {
    setType(ty);
    setVariations(variationsForType(ty));
    setDefaultOutcome(newOutcome());
    setRules((rs) => rs.map((r) => ({ ...r, outcome: newOutcome() })));
  };

  // Renaming/removing a variation must migrate (or drop) its weight in every
  // outcome so percentages stay keyed to live variation names — otherwise the
  // sum inflates (the "200%" bug).
  const onVariationsChange: React.Dispatch<React.SetStateAction<Variation[]>> = (
    action,
  ) => {
    const next =
      typeof action === "function"
        ? (action as (p: Variation[]) => Variation[])(variations)
        : action;
    const { renames, removed, nextNames } = diffVariations(variations, next);
    setVariations(next);
    if (renames.size > 0 || removed.size > 0) {
      setDefaultOutcome(reconcileOutcome(defaultOutcome, renames, removed, nextNames));
      setRules((rs) =>
        rs.map((r) => ({
          ...r,
          outcome: reconcileOutcome(r.outcome, renames, removed, nextNames),
        })),
      );
    }
  };

  // ── validation ──
  const basicsValid =
    !!flagsetId &&
    name.trim() !== "" &&
    variations.length >= 2 &&
    new Set(variationNames).size === variations.length &&
    variations.every((v) => v.name.trim() !== "" && valueValid(type, v.value));
  const defaultValid = outcomeValid(defaultOutcome, variationNames);
  const ruleOutcomesValid = rules.every(
    (r) =>
      r.name.trim() !== "" &&
      r.query.rules.length > 0 &&
      outcomeValid(r.outcome, variationNames),
  );
  const rulesValid = ruleOutcomesValid && defaultValid;

  const canNext = step === 1 ? basicsValid : step === 2 ? rulesValid : true;

  const variationsOk =
    variations.length >= 2 &&
    new Set(variationNames).size === variations.length &&
    variations.every((v) => v.name.trim() !== "" && valueValid(type, v.value));
  const checks: { label: string; ok: boolean }[] =
    step === 1
      ? [
          { label: t("flag.wizard.checkFlagset"), ok: !!flagsetId },
          { label: t("flag.wizard.checkKey"), ok: name.trim() !== "" },
          { label: t("flag.wizard.checkVariations"), ok: variationsOk },
        ]
      : step === 2
        ? [
            { label: t("flag.wizard.checkRules"), ok: ruleOutcomesValid },
            { label: t("flag.wizard.checkDefault"), ok: defaultValid },
          ]
        : [{ label: t("flag.wizard.checkReady"), ok: basicsValid && rulesValid }];

  const buildPayload = (): Record<string, unknown> =>
    buildFlagPayload({
      type,
      variations,
      rules,
      defaultOutcome,
      // New flags default to tracking enabled, matching GO Feature Flag's default.
      trackEvents: true,
      metadata: {
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(tags.length ? { tags } : {}),
      },
      customMetadata: {},
      customMetaValid: true,
    });

  const onSubmit = () => {
    setSubmitting(true);
    mutate(
      {
        url: `${API_URL}/flagsets/${flagsetId}/flags`,
        method: "post",
        values: { name: name.trim(), comment: comment.trim(), payload: buildPayload() },
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: (resp) => {
          const created = resp?.data as Flag | undefined;
          const finish = () => {
            toast.success(t("flag.wizard.created"));
            setSubmitting(false);
            setOpen(false);
            onCreated();
            invalidateRecentlyEdited();
          };
          if (!enableOnSave && created?.id) {
            mutate(
              {
                url: `${API_URL}/flags/${created.id}/disable`,
                method: "post",
                values: { disabled: true },
                successNotification: false,
                errorNotification: false,
              },
              { onSuccess: finish, onError: finish },
            );
          } else {
            finish();
          }
        },
        onError: (err) => {
          setSubmitting(false);
          toast.error(t("flag.wizard.createError"), { description: errMessage(err) });
        },
      },
    );
  };

  const flagset = flagsets.find((f) => f.id === flagsetId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="ml-auto">
          <PlusIcon className="h-4 w-4" />
          {t("flag.wizard.cta")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[1100px] gap-0 p-0 sm:max-w-[1100px]">
        {/* header */}
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <PlusIcon className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-semibold">{t("flag.wizard.title")}</div>
            <div className="text-xs text-muted-foreground">
              {flagset ? flagset.name : t("flag.wizard.subtitle")}
            </div>
          </div>
        </div>

        <Stepper step={step} t={t} />

        <div className="grid max-h-[72vh] grid-cols-1 gap-6 overflow-y-auto px-6 py-6 md:grid-cols-[1fr_340px]">
          <div className="min-w-0">
            {step === 1 && (
              <BasicsStep
                t={t}
                flagsets={flagsets}
                flagsetId={flagsetId}
                setFlagsetId={setFlagsetId}
                name={name}
                setName={setName}
                description={description}
                setDescription={setDescription}
                type={type}
                onTypeChange={onTypeChange}
                variations={variations}
                setVariations={onVariationsChange}
                tags={tags}
                setTags={setTags}
                tagSuggestions={tagSuggestions}
                enableOnSave={enableOnSave}
                setEnableOnSave={setEnableOnSave}
              />
            )}
            {step === 2 && (
              <RulesEditor
                t={t}
                variationNames={variationNames}
                rules={rules}
                setRules={setRules}
                defaultOutcome={defaultOutcome}
                setDefaultOutcome={setDefaultOutcome}
                isCreate
              />
            )}
            {step === 3 && (
              <ReviewStep
                t={t}
                payload={buildPayload()}
                name={name}
                comment={comment}
                setComment={setComment}
              />
            )}
          </div>
          <WizSidekick step={step} checks={checks} t={t} />
        </div>

        {/* footer */}
        <div className="flex items-center gap-2 border-t bg-muted/30 px-5 py-3">
          <span className="text-xs text-muted-foreground">
            {t("flag.wizard.stepOf", { step, total: 3 })}
          </span>
          <div className="ml-auto flex gap-2">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                <ChevronLeftIcon className="h-4 w-4" />
                {t("flag.wizard.back")}
              </Button>
            )}
            {step < 3 ? (
              <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
                {t("flag.wizard.continue")}
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
            ) : (
              <Button disabled={submitting || !basicsValid || !rulesValid} onClick={onSubmit}>
                <RocketIcon className="h-4 w-4" />
                {t("flag.wizard.create")}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

FlagWizard.displayName = "FlagWizard";
