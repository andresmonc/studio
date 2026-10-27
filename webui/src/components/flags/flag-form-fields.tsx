// Shared editor UI atoms used across the variation / outcome / rules editors:
// a labelled Field wrapper, a Segmented control, and the flag type options.
// Extracted from flag-form.tsx.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { FlagType } from "@/types/api";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-2xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex w-full rounded-md border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded px-2.5 py-1 text-xs font-medium capitalize",
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const TYPE_OPTIONS = (
  ["boolean", "string", "int", "float", "json"] as FlagType[]
).map((v) => ({ value: v, label: v }));
