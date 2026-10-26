// Presentational step components for the flag create wizard: the Stepper
// header, the Basics step, the validation sidekick, and the Review step.
// Extracted from flag-wizard.tsx; FlagWizard owns all state and passes it in.

import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { dump as yamlDump } from "js-yaml";
import { CheckIcon, CircleDashedIcon } from "lucide-react";
import { CodeBlock } from "@/components/ui/code-block";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TipCallout } from "@/components/ui/tip-callout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Field,
  Segmented,
  TagInput,
  TYPE_OPTIONS,
  VariationsEditor,
  type Tr,
  type Variation,
} from "@/components/flags/flag-form";
import { cn } from "@/lib/utils";
import type { Flagset, FlagType } from "@/types/api";

export function Stepper({ step, t }: { step: number; t: Tr }) {
  const steps = [
    { n: 1, name: t("flag.wizard.basics"), desc: t("flag.wizard.basicsDesc") },
    { n: 2, name: t("flag.wizard.rules"), desc: t("flag.wizard.rulesDesc") },
    { n: 3, name: t("flag.wizard.review"), desc: t("flag.wizard.reviewDesc") },
  ];
  return (
    <div className="flex items-center gap-2 border-b bg-muted/30 px-5 py-2.5">
      {steps.map((s, i) => {
        const state = step === s.n ? "current" : step > s.n ? "done" : "todo";
        return (
          <div key={s.n} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                state === "done" && "bg-green-600 text-white",
                state === "current" && "bg-primary text-primary-foreground",
                state === "todo" && "border bg-muted text-muted-foreground",
              )}
            >
              {state === "done" ? <CheckIcon className="h-3 w-3" /> : s.n}
            </span>
            <div className={cn("leading-tight", state === "todo" && "opacity-60")}>
              <div className="text-xs font-medium">{s.name}</div>
              <div className="text-[11px] text-muted-foreground">{s.desc}</div>
            </div>
            {i < steps.length - 1 && <span className="h-px flex-1 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

export function BasicsStep({
  t,
  flagsets,
  flagsetId,
  setFlagsetId,
  name,
  setName,
  description,
  setDescription,
  type,
  onTypeChange,
  variations,
  setVariations,
  tags,
  setTags,
  tagSuggestions,
  enableOnSave,
  setEnableOnSave,
}: {
  t: Tr;
  flagsets: Flagset[];
  flagsetId: string;
  setFlagsetId: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  type: FlagType;
  onTypeChange: (v: FlagType) => void;
  variations: Variation[];
  setVariations: Dispatch<SetStateAction<Variation[]>>;
  tags: string[];
  setTags: (next: string[]) => void;
  tagSuggestions: string[];
  enableOnSave: boolean;
  setEnableOnSave: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Field label={t("flag.wizard.flagset")}>
        <Select value={flagsetId} onValueChange={setFlagsetId}>
          <SelectTrigger>
            <SelectValue placeholder={t("flag.allFlagsets")} />
          </SelectTrigger>
          <SelectContent>
            {flagsets.map((fs) => (
              <SelectItem key={fs.id} value={fs.id}>
                {fs.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label={t("flag.wizard.key")} hint={t("flag.wizard.keyHint")}>
        <Input
          className="font-mono"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="checkout-progress-banner"
        />
      </Field>
      <Field label={t("flag.wizard.description")}>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label={t("flag.wizard.tagsLabel")} hint={t("flag.wizard.tagsHint")}>
        <TagInput
          value={tags}
          onChange={setTags}
          suggestions={tagSuggestions}
          placeholder={t("flag.tagsPlaceholder")}
        />
      </Field>
      <Field label={t("flag.wizard.type")}>
        <Segmented value={type} options={TYPE_OPTIONS} onChange={onTypeChange} />
      </Field>
      <Field label={t("flag.wizard.variations")} hint={t("flag.wizard.variationsHint")}>
        <VariationsEditor
          t={t}
          type={type}
          variations={variations}
          setVariations={setVariations}
        />
      </Field>
      <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
        <Switch checked={enableOnSave} onCheckedChange={setEnableOnSave} />
        <div className="text-xs">
          <b>{t("flag.wizard.enableOnSave")}</b>{" "}
          <span className="text-muted-foreground">
            {t("flag.wizard.enableOnSaveHint")}
          </span>
        </div>
      </div>
    </div>
  );
}

export function WizSidekick({
  step,
  checks,
  t,
}: {
  step: number;
  checks: { label: string; ok: boolean }[];
  t: Tr;
}) {
  const tip = t(`flag.wizard.tip${step}`);
  return (
    <aside className="flex flex-col gap-4 md:sticky md:top-0 md:self-start">
      <TipCallout title={t("flag.wizard.tipsTitle")}>{tip}</TipCallout>
      <div className="rounded-lg border p-4">
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("flag.wizard.validation")}
        </div>
        <ul className="flex flex-col gap-2.5">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2.5 text-[13px]">
              {c.ok ? (
                <CheckIcon className="h-4 w-4 shrink-0 text-green-600" />
              ) : (
                <CircleDashedIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className={c.ok ? "" : "text-muted-foreground"}>
                {c.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export function ReviewStep({
  t,
  payload,
  name,
  comment,
  setComment,
}: {
  t: Tr;
  payload: Record<string, unknown>;
  name: string;
  comment: string;
  setComment: (v: string) => void;
}) {
  const [format, setFormat] = useState<"yaml" | "json">("yaml");
  // Real GOFF format keys the flag config by its name, rather than the
  // `{ name, payload }` envelope the management API expects on the wire.
  const preview = useMemo(() => {
    // Mirror the submit path, which keys the flag by `name.trim()`, so the
    // preview never shows a key that differs from what gets created.
    const goff = { [name.trim() || "flag-name"]: payload };
    return format === "yaml"
      ? yamlDump(goff, { indent: 2, lineWidth: -1 })
      : JSON.stringify(goff, null, 2);
  }, [name, payload, format]);
  return (
    <div className="flex flex-col gap-4">
      <Field label={t("flag.wizard.flagPreview")}>
        <div className="flex flex-col gap-2">
          <Segmented
            value={format}
            onChange={setFormat}
            options={[
              { value: "yaml", label: t("flag.wizard.formatYaml") },
              { value: "json", label: t("flag.wizard.formatJson") },
            ]}
          />
          <div className="max-h-72 overflow-auto rounded-md border">
            <CodeBlock code={preview} language={format} rounded={false} />
          </div>
        </div>
      </Field>
      <Field label={t("flag.wizard.commit")}>
        <Input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="feat(flags): add new flag"
        />
      </Field>
    </div>
  );
}
