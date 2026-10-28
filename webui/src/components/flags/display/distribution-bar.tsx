import { cn } from "@/lib/utils";
import { variationColor } from "./variation-colors";

// DistributionBar renders a stacked, color-coded bar of variation percentages —
// the visual atom used in flag lists, the default-rule card, and rule outcomes.
export function DistributionBar({
  variations,
  percentages,
  size = "default",
  className,
}: {
  // variation names in display order (drives color assignment)
  variations: string[];
  percentages: Record<string, number>;
  size?: "default" | "lg";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex overflow-hidden rounded-full border bg-muted",
        size === "lg" ? "h-3.5" : "h-2",
        className,
      )}
    >
      {variations.map((name, i) => {
        // Width is a share of the full 100% bar (not of the variation sum), so a
        // distribution below 100% leaves the muted background showing instead of
        // stretching the segments to fill. Orphaned keys never render — we only
        // map over the variations we display.
        const pct = percentages[name] || 0;
        if (pct <= 0) return null;
        return (
          <div
            key={name}
            // shrink-0 keeps each segment's width literal (a share of the full
            // bar), so the muted background stays visible below 100% instead of
            // flex shrinking the segments to fill.
            className="shrink-0"
            // Show the real weight, decimals included (the input accepts e.g.
            // 42.56), trimming trailing zeros so whole numbers stay clean.
            title={`${name} · ${Number(pct.toFixed(2))}%`}
            style={{ width: `${pct}%`, background: variationColor(name, i) }}
          />
        );
      })}
    </div>
  );
}

DistributionBar.displayName = "DistributionBar";
