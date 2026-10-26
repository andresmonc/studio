import { RocketIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { VariationPill } from "./variation-pill";

// ProgressiveIndicator is the compact list-cell treatment for a default rule that
// is a progressive rollout: a rocket icon plus the initial→end variation pills.
// It mirrors the flag detail page's progressive outcome so list and detail stay
// consistent, and honestly signals a time-based ramp (which a static distribution
// bar cannot represent). The from/to percentages ride in the tooltip to stay
// compact in the narrow column.
export function ProgressiveIndicator({
  variations,
  initialVariation,
  endVariation,
  title,
  className,
}: {
  // variation names in display order (drives pill color assignment)
  variations: string[];
  initialVariation?: string;
  endVariation?: string;
  title?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex flex-wrap items-center gap-1.5 text-xs", className)}
      title={title}
    >
      <RocketIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {initialVariation && (
        <VariationPill
          name={initialVariation}
          index={Math.max(0, variations.indexOf(initialVariation))}
        />
      )}
      <span className="text-muted-foreground">→</span>
      {endVariation && (
        <VariationPill
          name={endVariation}
          index={Math.max(0, variations.indexOf(endVariation))}
        />
      )}
    </span>
  );
}

ProgressiveIndicator.displayName = "ProgressiveIndicator";
