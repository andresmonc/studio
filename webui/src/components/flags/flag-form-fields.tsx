// Shared editor UI atoms used across the variation / outcome / rules editors:
// a labelled Field wrapper and the flag type options.
// Extracted from flag-form.tsx.

import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import type { FlagType } from "@/types/api";

export function Field({
  label,
  children,
  hint,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  /** Id of the single control inside, so the label names it. Omit when children is a composite. */
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs" htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
      {hint && <p className="text-2xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export const TYPE_OPTIONS = (
  ["boolean", "string", "int", "float", "json"] as FlagType[]
).map((v) => ({ value: v, label: v }));
