import type { ComponentProps } from "react";
import goffLogo from "@/assets/gofeatureflag.svg";
import { cn } from "@/lib/utils";

// Percent stops keep the stripe count constant at any size; -45deg draws "/" lines.
const stripes =
  "repeating-linear-gradient(-45deg, #111 0 3%, #4a4a4a 3% 3.5%)";

type GoffLogoProps = ComponentProps<"div"> & { withText?: boolean };

export function GoffLogo({
  className,
  style,
  withText,
  ...props
}: GoffLogoProps) {
  const badge = (
    <div
      className={cn(
        "grid aspect-square shrink-0 place-items-center overflow-hidden rounded-full",
        className,
      )}
      style={{ background: stripes, ...style }}
      {...props}
    >
      {/* With the text visible, the image is decorative so the name isn't read twice. */}
      <img
        src={goffLogo}
        alt={withText ? "" : "GO Feature Flag"}
        className="h-auto w-[81%]"
      />
    </div>
  );
  if (!withText) return badge;
  return (
    <div className="flex items-center gap-3">
      {badge}
      <span className="text-base font-semibold tracking-tighter text-foreground md:text-2xl">
        GO Feature Flag
      </span>
    </div>
  );
}

GoffLogo.displayName = "GoffLogo";
