// RulesEditor renders the targeting rules (QueryBuilder + outcome) and the
// default rule. Shared by the wizard's step 2 and the detail Targeting tab.
// Extracted from flag-form.tsx.

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { QueryBuilder } from "react-querybuilder";
import { QueryBuilderShadcnUi } from "@/components/react-querybuilder-shadcn-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { OutcomeEditor } from "./outcome-editor";
import {
  EMPTY_QUERY,
  QB_FIELDS,
  QB_OPERATORS,
  newOutcome,
  nextId,
  nextRuleName,
} from "./flag-form-helpers";
import type { Outcome, Rule, Tr } from "./flag-form-types";
import { EmptyState } from "@/components/ui/empty-state";

// Shared keyword marker (IF / ELSE IF / OTHERWISE) so the chip styling stays in
// one place and the branch labels can't visually drift apart.
function KeywordChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-w-[3.25rem] justify-center rounded border bg-muted px-1.5 py-0.5 font-mono text-2xs font-semibold uppercase tracking-wide text-foreground">
      {children}
    </span>
  );
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
}: {
  t: Tr;
  variationNames: string[];
  rules: Rule[];
  setRules: Dispatch<SetStateAction<Rule[]>>;
  defaultOutcome: Outcome;
  setDefaultOutcome: (o: Outcome) => void;
  disabled?: boolean;
  isCreate?: boolean;
}) {
  const addRule = () =>
    setRules((rs) => [
      ...rs,
      {
        id: nextId(),
        name: nextRuleName(rs.map((r) => r.name)),
        query: { ...EMPTY_QUERY },
        outcome: newOutcome(variationNames[0] ?? ""),
      },
    ]);
  const patchRule = (id: number, p: Partial<Rule>) =>
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const removeRule = (id: number) =>
    setRules((rs) => rs.filter((r) => r.id !== id));

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
          {rules.length === 0 && (
            <EmptyState variant="inline" className="p-3">
              {t("flag.wizard.noRules")}
            </EmptyState>
          )}
          {rules.map((r, i) => (
            <div key={r.id} className="rounded-md border p-3">
              <div className="mb-2 flex items-center gap-2">
                <KeywordChip>
                  {i === 0 ? t("flag.wizard.if") : t("flag.wizard.elseIf")}
                </KeywordChip>
                <Input
                  className="h-8 w-48 text-xs"
                  value={r.name}
                  onChange={(e) => patchRule(r.id, { name: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-8 w-8"
                  onClick={() => removeRule(r.id)}
                  aria-label={t("common.remove")}
                >
                  <Trash2Icon className="h-4 w-4" />
                </Button>
              </div>
              <div className="queryBuilder-branches">
                <QueryBuilderShadcnUi>
                  <QueryBuilder
                    fields={QB_FIELDS}
                    operators={QB_OPERATORS}
                    query={r.query}
                    onQueryChange={(q) => patchRule(r.id, { query: q })}
                  />
                </QueryBuilderShadcnUi>
              </div>
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
          ))}
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
        <CardContent>
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
