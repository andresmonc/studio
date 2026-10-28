import { cn } from "@/lib/utils";
import { variationColor } from "./variation-colors";

// VariationPill is a compact, color-swatched chip naming a single variation and
// (optionally) its value. Used in targeting rules, default rule, and previews.
export function VariationPill({
  name,
  index,
  value,
  className,
}: {
  name: string;
  index: number;
  value?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-medium text-foreground",
        className,
      )}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-[2px]"
        style={{ background: variationColor(name, index) }}
      />
      <span>{name}</span>
      {value !== undefined && value !== "" && (
        <span className="text-muted-foreground">{value}</span>
      )}
    </span>
  );
}

VariationPill.displayName = "VariationPill";
