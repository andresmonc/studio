// OutcomeEditor renders the outcome UI for all three modes (single dropdown,
// percentage sliders + distribution bar, progressive two-step rollout with a
// curve preview). Extracted from flag-form.tsx.

import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { TipCallout } from "@/components/ui/tip-callout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DistributionBar } from "./distribution-bar";
import { RolloutCurve } from "./rollout-curve";
import { variationColor } from "./variation-colors";
import { Field } from "./flag-form-fields";
import { clampPercentage, outcomeSum } from "./flag-form-helpers";
import type { Outcome, ProgState, Tr } from "./flag-form-types";

export function OutcomeEditor({
  t,
  variationNames,
  outcome,
  onChange,
  disabled = false,
  isCreate = false,
}: {
  t: Tr;
  variationNames: string[];
  outcome: Outcome;
  onChange: (o: Outcome) => void;
  disabled?: boolean;
  isCreate?: boolean;
}) {
  const set = (p: Partial<Outcome>) => onChange({ ...outcome, ...p });
  const setProg = (p: Partial<ProgState>) =>
    onChange({ ...outcome, prog: { ...outcome.prog, ...p } });
  const sum = outcomeSum(outcome, variationNames);
  const varOptions = (
    <>
      {variationNames.map((n) => (
        <SelectItem key={n} value={n}>
          {n}
        </SelectItem>
      ))}
    </>
  );
  return (
    <div>
      <Segmented
        className="w-full capitalize"
        value={outcome.mode}
        onChange={(mode) => set({ mode })}
        options={[
          { value: "single", label: t("flag.wizard.single") },
          { value: "percentage", label: t("flag.wizard.percentage") },
          { value: "progressive", label: t("flag.wizard.progressive") },
        ]}
      />
      <div className="mt-3">
        {outcome.mode === "single" && (
          <Select value={outcome.single} onValueChange={(v) => set({ single: v })}>
            <SelectTrigger className="font-mono text-xs">
              <SelectValue placeholder={t("flag.wizard.selectVariation")} />
            </SelectTrigger>
            <SelectContent>{varOptions}</SelectContent>
          </Select>
        )}
        {outcome.mode === "percentage" && (
          <div
            className={cn(
              isCreate
                ? "flex flex-col gap-3"
                : "grid gap-4 lg:grid-cols-[1fr_minmax(0,15rem)]",
            )}
          >
            <div className="flex flex-col gap-3">
              <DistributionBar
                variations={variationNames}
                percentages={outcome.percentages}
                size="lg"
              />
              {variationNames.map((n, i) => (
                <div key={n} className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-[2px]"
                    style={{ background: variationColor(n, i) }}
                  />
                  <span className="w-28 truncate font-mono text-xs">{n}</span>
                  <Slider
                    aria-label={n}
                    className="flex-1"
                    min={0}
                    max={100}
                    step={1}
                    value={[outcome.percentages[n] ?? 0]}
                    onValueChange={([v]) =>
                      set({
                        percentages: {
                          ...outcome.percentages,
                          [n]: clampPercentage(v, n, outcome, variationNames),
                        },
                      })
                    }
                  />
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    aria-label={`${n} percentage`}
                    className="h-8 w-20 text-xs"
                    value={outcome.percentages[n] ?? ""}
                    onChange={(e) =>
                      set({
                        percentages: {
                          ...outcome.percentages,
                          [n]: clampPercentage(
                            Number(e.target.value),
                            n,
                            outcome,
                            variationNames,
                          ),
                        },
                      })
                    }
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              ))}
              <p
                className={cn(
                  "text-2xs",
                  Math.abs(sum - 100) < 0.001
                    ? "text-muted-foreground"
                    : "text-destructive",
                )}
              >
                {t("flag.wizard.percentSum", { sum })}
              </p>
            </div>
            {!isCreate && (
              <TipCallout
                title={t("flag.wizard.tipsTitle")}
                className="lg:self-start"
              >
                {t("flag.wizard.percentTips")}
              </TipCallout>
            )}
          </div>
        )}
        {outcome.mode === "progressive" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-stretch gap-2">
              <div className="flex flex-1 flex-col gap-3 rounded-md border border-border bg-muted/30 p-3">
                <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("flag.wizard.initialStep")}
                </span>
                <Field label={t("flag.wizard.variation")}>
                  <Select
                    value={outcome.prog.initialVariation}
                    onValueChange={(v) => setProg({ initialVariation: v })}
                  >
                    <SelectTrigger
                      className="font-mono text-xs"
                      aria-invalid={
                        !variationNames.includes(outcome.prog.initialVariation)
                      }
                    >
                      <SelectValue
                        placeholder={t("flag.wizard.selectVariation")}
                      />
                    </SelectTrigger>
                    <SelectContent>{varOptions}</SelectContent>
                  </Select>
                </Field>
                <Field label={t("flag.wizard.date")}>
                  <Input
                    type="datetime-local"
                    className="h-8 text-xs"
                    value={outcome.prog.startDate}
                    onChange={(e) => setProg({ startDate: e.target.value })}
                  />
                </Field>
              </div>
              <div className="flex items-center">
                <ArrowRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
              <div className="flex flex-1 flex-col gap-3 rounded-md border border-border bg-muted/30 p-3">
                <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("flag.wizard.endStep")}
                </span>
                <Field label={t("flag.wizard.variation")}>
                  <Select
                    value={outcome.prog.endVariation}
                    onValueChange={(v) => setProg({ endVariation: v })}
                  >
                    <SelectTrigger
                      className="font-mono text-xs"
                      aria-invalid={
                        !variationNames.includes(outcome.prog.endVariation)
                      }
                    >
                      <SelectValue
                        placeholder={t("flag.wizard.selectVariation")}
                      />
                    </SelectTrigger>
                    <SelectContent>{varOptions}</SelectContent>
                  </Select>
                </Field>
                <Field label={t("flag.wizard.date")}>
                  <Input
                    type="datetime-local"
                    className="h-8 text-xs"
                    value={outcome.prog.endDate}
                    onChange={(e) => setProg({ endDate: e.target.value })}
                  />
                </Field>
              </div>
            </div>
            <Field label={t("flag.wizard.rolloutPercent")}>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-mono">
                    {t("flag.detail.progressiveRange", {
                      from: outcome.prog.initialPct,
                      to: outcome.prog.endPct,
                    })}
                  </span>
                </div>
                <Slider
                  min={0}
                  max={100}
                  value={[outcome.prog.initialPct, outcome.prog.endPct]}
                  onValueChange={([from, to]) =>
                    setProg({ initialPct: from, endPct: to })
                  }
                />
              </div>
            </Field>
            <RolloutCurve
              initialVariation={outcome.prog.initialVariation}
              endVariation={outcome.prog.endVariation}
              initialPct={outcome.prog.initialPct}
              endPct={outcome.prog.endPct}
              startDate={outcome.prog.startDate}
              endDate={outcome.prog.endDate}
              variationNames={variationNames}
              disabled={disabled}
            />
          </div>
        )}
      </div>
    </div>
  );
}
