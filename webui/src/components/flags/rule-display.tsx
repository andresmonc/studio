import type { ReactNode } from "react";
import { GripVerticalIcon } from "lucide-react";
import { formatQuery, type RuleGroupType } from "react-querybuilder";
import { parseJsonLogic } from "react-querybuilder/parseJsonLogic";
import { cn } from "@/lib/utils";
import { CodeChip } from "@/components/ui/code-chip";

// humanizeQuery renders a stored targeting query as readable text. The flag
// wizard stores queries as JSON-logic strings, so we parse and re-format them to
// natural language. If a query isn't valid JSON-logic (e.g. a hand-authored
// nikunjy/rules expression), we show it verbatim.
export function humanizeQuery(query: string | undefined | null): string {
  if (!query) return "";
  try {
    const logic = JSON.parse(query);
    const rg = parseJsonLogic(logic) as RuleGroupType;
    const text = formatQuery(rg, "natural_language");
    // "1 is 1" is react-querybuilder's rendering of an empty group — not useful.
    if (text && text.trim() && text !== "1 is 1") return text;
  } catch {
    // not JSON-logic — fall through and show the raw query
  }
  return query;
}

// RuleDisplay is a read-only targeting-rule chip: "RULE n · IF <query> THEN
// serve <outcome>". The outcome (a VariationPill or DistributionBar) is passed
// as children so callers control how the THEN branch is rendered.
export function RuleDisplay({
  index,
  name,
  query,
  children,
  className,
}: {
  index: number;
  name?: string;
  query?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border bg-card p-3",
        className,
      )}
    >
      <GripVerticalIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-2xs text-muted-foreground">
            RULE {index + 1}
          </span>
          {name && <span className="text-xs font-medium">{name}</span>}
        </div>
        <div className="mt-1.5 text-xs">
          <span className="mr-1.5 text-muted-foreground">IF</span>
          <CodeChip className="break-all text-foreground">
            {humanizeQuery(query)}
          </CodeChip>
        </div>
        {children && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>THEN serve</span>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

RuleDisplay.displayName = "RuleDisplay";
