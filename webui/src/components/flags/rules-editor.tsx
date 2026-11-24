// RulesEditor renders the targeting rules (QueryBuilder + outcome) and the
// default rule. Shared by the wizard's step 2 and the detail Targeting tab.
// Extracted from flag-form.tsx.

import { useId, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { QueryBuilder, formatQuery, type RuleGroupType } from "react-querybuilder";
import { QueryBuilderShadcnUi } from "@/components/react-querybuilder-shadcn-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TipCallout } from "@/components/ui/tip-callout";
import { useDismissedTip } from "@/hooks/use-dismissed-tip";
import {
  AlertTriangleIcon,
  ChevronUpIcon,
  PlusIcon,
  RocketIcon,
  Trash2Icon,
} from "lucide-react";
import { OutcomeEditor } from "./outcome-editor";
import { VariationPill } from "./variation-pill";
import { DistributionBar } from "./distribution-bar";
import {
  QB_FIELDS,
  QB_OPERATORS,
  newOutcome,
  nextId,
  newQuery,
  nextRuleName,
  ruleIssues,
  type RuleIssue,
} from "./flag-form-helpers";
import type { Outcome, Rule, Tr } from "./flag-form-types";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

// Shared keyword marker (IF / ELSE IF / OTHERWISE) so the chip styling stays in
// one place and the branch labels can't visually drift apart.
function KeywordChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-w-[3.25rem] justify-center rounded border bg-muted px-1.5 py-0.5 font-mono text-2xs font-semibold uppercase tracking-wide text-foreground">
      {children}
    </span>
  );
}

const ISSUE_KEYS: Record<RuleIssue, string> = {
  name: "flag.wizard.ruleIssueName",
  condition: "flag.wizard.ruleIssueCondition",
  value: "flag.wizard.ruleIssueValue",
  range: "flag.wizard.ruleIssueRange",
  outcome: "flag.wizard.ruleIssueOutcome",
};

// Plain-language condition for the collapsed rule row. An empty group would
// format as "1 is 1", an unset value as 'undefined', and a half-filled range
// is dropped, so those show what is missing instead.
function conditionText(t: Tr, query: RuleGroupType, issues: RuleIssue[]): string {
  if (query.rules.length === 0) return t("flag.wizard.ruleNoCondition");
  const missing = issues.find((k) => k === "value" || k === "range");
  if (missing) return t(ISSUE_KEYS[missing]);
  return formatQuery(query, "natural_language");
}

function outcomeText(outcome: Outcome, names: string[]): string {
  if (outcome.mode === "percentage") {
    return names.map((name) => `${name}: ${outcome.percentages[name] ?? 0}%`).join(", ");
  }
  if (outcome.mode === "progressive") {
    return `${outcome.prog.initialVariation} → ${outcome.prog.endVariation}`;
  }
  return outcome.single;
}

// One-line version of what a rule serves, for the collapsed row.
function OutcomeSummary({ outcome, names }: { outcome: Outcome; names: string[] }) {
  const pill = (name: string) =>
    name && <VariationPill name={name} index={Math.max(0, names.indexOf(name))} />;
  if (outcome.mode === "percentage") {
    return (
      <DistributionBar
        variations={names}
        percentages={outcome.percentages}
        className="w-24 shrink-0"
      />
    );
  }
  if (outcome.mode === "progressive") {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <RocketIcon className="h-3.5 w-3.5" />
        {pill(outcome.prog.initialVariation)}→{pill(outcome.prog.endVariation)}
      </span>
    );
  }
  return <span className="shrink-0">{pill(outcome.single)}</span>;
}

export function RulesEditor({
  t,
  variationNames,
  rules,
  setRules,
  defaultOutcome,
  setDefaultOutcome,
  disabled = false,
  isCreate = false,
  showTips = false,
}: {
  t: Tr;
  variationNames: string[];
  rules: Rule[];
  setRules: Dispatch<SetStateAction<Rule[]>>;
  defaultOutcome: Outcome;
  setDefaultOutcome: (o: Outcome) => void;
  disabled?: boolean;
  isCreate?: boolean;
  // The wizard shows its own tips in a sidebar.
  showTips?: boolean;
}) {
  // react-querybuilder's control titles double as their accessible names.
  const qbTranslations = {
    fields: { title: t("flag.query.fields") },
    operators: { title: t("flag.query.operators") },
    value: { title: t("flag.query.value") },
    combinators: { title: t("flag.query.combinators") },
    addRule: { title: t("flag.query.addRule") },
    addGroup: { title: t("flag.query.addGroup") },
    removeRule: { title: t("flag.query.removeRule") },
    removeGroup: { title: t("flag.query.removeGroup") },
  };
  // Only one rule shows the full editor at a time; the others collapse to a
  // one-line summary so long rule lists stay scannable.
  const [openId, setOpenId] = useState<number | null>(null);
  // Opening and closing unmount the focused control, so focus moves to the
  // name input on open and back to the rule's row on close.
  const refocusId = useRef<number | null>(null);
  const toggleRule = (id: number, open: boolean) => {
    refocusId.current = id;
    setOpenId(open ? id : null);
  };
  const summaryId = useId();
  const [targetingTipHidden, hideTargetingTip] = useDismissedTip("targeting");
  const [defaultRuleTipHidden, hideDefaultRuleTip] = useDismissedTip("default-rule");
  const addRule = () => {
    const id = nextId();
    setRules((rs) => [
      ...rs,
      {
        id,
        name: nextRuleName(rs.map((r) => r.name)),
        query: newQuery(),
        outcome: newOutcome(variationNames[0]),
      },
    ]);
    refocusId.current = id;
    setOpenId(id);
  };
  const patchRule = (id: number, p: Partial<Rule>) =>
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const removeRule = (id: number) => {
    setRules((rs) => rs.filter((r) => r.id !== id));
    setOpenId((cur) => (cur === id ? null : cur));
  };

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">
              {t("flag.wizard.targeting")}
            </CardTitle>
            <span className="text-2xs text-muted-foreground">
              {t("flag.wizard.targetingHint")}
            </span>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={addRule}>
              <PlusIcon className="h-4 w-4" />
              {t("flag.wizard.addRule")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
          {showTips && !targetingTipHidden && (
            <TipCallout
              title={t("flag.detail.targetingTipsTitle")}
              inline
              onDismiss={hideTargetingTip}
              dismissLabel={t("common.hideTip")}
            >
              {t("flag.detail.targetingTips")}
            </TipCallout>
          )}
          {rules.length === 0 && (
            <EmptyState variant="inline" className="p-3">
              {t("flag.wizard.noRules")}
            </EmptyState>
          )}
          {rules.map((r, i) => {
            const label = r.name || String(i + 1);
            const keyword = (
              <KeywordChip>
                {i === 0 ? t("flag.wizard.if") : t("flag.wizard.elseIf")}
              </KeywordChip>
            );
            const controls = (
              <>
                <label className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    aria-label={t("flag.wizard.ruleSwitch", { name: label })}
                    checked={!r.disable}
                    onCheckedChange={(on) => patchRule(r.id, { disable: on ? undefined : true })}
                  />
                  {r.disable ? (
                    <Badge variant="secondary">{t("flag.wizard.ruleOff")}</Badge>
                  ) : (
                    t("flag.wizard.ruleOn")
                  )}
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => removeRule(r.id)}
                  aria-label={t("common.remove")}
                >
                  <Trash2Icon className="h-4 w-4" />
                </Button>
              </>
            );

            const open = r.id === openId;
            const issues = ruleIssues(r, variationNames);
            const invalid = issues.length > 0;
            const rangeIssue = issues.includes("range");
            const rangeIssueId = `${summaryId}-${r.id}-range`;
            const condition = conditionText(t, r.query, issues);
            return (
              <Collapsible
                key={r.id}
                open={open}
                onOpenChange={(o) => toggleRule(r.id, o)}
                className={cn(
                  "rounded-md border transition-colors motion-safe:duration-400",
                  open ? "border-primary ring-1 ring-primary" : "hover:bg-muted/50",
                  r.disable && "bg-muted/50",
                  !open && invalid && "border-destructive",
                )}
              >
                <div className="flex items-center gap-2 px-3 py-1.5">
                  {open ? (
                    <>
                      {keyword}
                      <Input
                        ref={(el) => {
                          if (el && refocusId.current === r.id) {
                            refocusId.current = null;
                            el.focus();
                          }
                        }}
                        aria-label={t("flag.wizard.ruleName", { index: i + 1 })}
                        className="h-8 min-w-0 max-w-md flex-1 text-xs"
                        value={r.name}
                        onChange={(e) => patchRule(r.id, { name: e.target.value })}
                      />
                    </>
                  ) : (
                    <CollapsibleTrigger asChild>
                      <button
                        ref={(el) => {
                          if (el && refocusId.current === r.id) {
                            refocusId.current = null;
                            el.focus();
                          }
                        }}
                        type="button"
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-2 text-left text-xs",
                          r.disable && "opacity-50",
                        )}
                        aria-label={t("flag.wizard.ruleEdit", { name: label })}
                        aria-describedby={`${summaryId}-${r.id}`}
                      >
                        <span id={`${summaryId}-${r.id}`} className="sr-only">
                          {condition}. {t("flag.wizard.then")} {outcomeText(r.outcome, variationNames)}
                        </span>
                        {keyword}
                        <span className="max-w-40 shrink-0 truncate font-medium">{r.name}</span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground" title={condition}>
                          {condition}
                        </span>
                        <OutcomeSummary outcome={r.outcome} names={variationNames} />
                      </button>
                    </CollapsibleTrigger>
                  )}
                  {controls}
                  {open && (
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        aria-label={t("flag.wizard.ruleDone")}
                      >
                        <ChevronUpIcon className="h-4 w-4" />
                      </Button>
                    </CollapsibleTrigger>
                  )}
                </div>
                {!open && invalid && (
                  // Visible (not tooltip-only) so it's clear the rule blocks Save
                  // and that clicking opens it to fix.
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-1.5 rounded-b-md border-t border-destructive/30 bg-destructive/5 px-3 py-1 text-left text-xs text-destructive"
                    >
                      <AlertTriangleIcon className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        {issues.map((k) => t(ISSUE_KEYS[k])).join(" · ")}
                      </span>
                      <Badge variant="destructive">{t("flag.wizard.ruleFix")}</Badge>
                    </button>
                  </CollapsibleTrigger>
                )}
                <CollapsibleContent
                  className={cn(
                    "overflow-hidden motion-safe:duration-400",
                    "motion-safe:data-[state=open]:animate-collapsible-down",
                    "motion-safe:data-[state=closed]:animate-collapsible-up",
                  )}
                >
                  <div className="px-3 pb-3 pt-1">
                    <div className={cn(r.disable && "opacity-50")}>
                      <div
                        className="queryBuilder-branches"
                        role="group"
                        aria-label={t("flag.wizard.ruleConditions", { name: label })}
                        aria-describedby={rangeIssue ? rangeIssueId : undefined}
                        // react-querybuilder renders an unnamed role="form" with no
                        // prop to name it; name it so each rule's landmark is distinct.
                        ref={(el) =>
                          el
                            ?.querySelector('[role="form"]')
                            ?.setAttribute("aria-label", t("flag.wizard.ruleConditions", { name: label }))
                        }
                      >
                        <QueryBuilderShadcnUi>
                          <QueryBuilder
                            fields={QB_FIELDS}
                            operators={QB_OPERATORS}
                            getDefaultValue={() => undefined}
                            translations={qbTranslations}
                            query={r.query}
                            onQueryChange={(q) => patchRule(r.id, { query: q })}
                          />
                        </QueryBuilderShadcnUi>
                      </div>
                      {rangeIssue && (
                        <p id={rangeIssueId} role="status" className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                          <AlertTriangleIcon className="h-3.5 w-3.5 shrink-0" />
                          {t(ISSUE_KEYS.range)}
                        </p>
                      )}
                      <div className="mt-3 border-t pt-3">
                        <div className="mb-2">
                          <KeywordChip>{t("flag.wizard.then")}</KeywordChip>
                        </div>
                        <OutcomeEditor
                          t={t}
                          variationNames={variationNames}
                          outcome={r.outcome}
                          onChange={(o) => patchRule(r.id, { outcome: o })}
                          disabled={disabled}
                          isCreate={isCreate}
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button size="sm" variant="secondary" onClick={() => toggleRule(r.id, false)}>
                        {t("flag.wizard.ruleDone")}
                      </Button>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeywordChip>{t("flag.wizard.otherwise")}</KeywordChip>
            <CardTitle className="text-sm">
              {t("flag.wizard.defaultRule")}
            </CardTitle>
            <Badge variant="secondary">{t("flag.wizard.fallbackBadge")}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {showTips && !defaultRuleTipHidden && (
            <TipCallout
              title={t("flag.detail.targetingTipsTitle")}
              inline
              onDismiss={hideDefaultRuleTip}
              dismissLabel={t("common.hideTip")}
            >
              {t("flag.detail.defaultRuleTips")}
            </TipCallout>
          )}
          <OutcomeEditor
            t={t}
            variationNames={variationNames}
            outcome={defaultOutcome}
            onChange={setDefaultOutcome}
            disabled={disabled}
            isCreate={isCreate}
          />
        </CardContent>
      </Card>
    </div>
  );
}
