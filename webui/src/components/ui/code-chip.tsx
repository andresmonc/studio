import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const codeChipVariants = cva("rounded bg-muted font-mono", {
  variants: {
    size: {
      default: "px-1.5 py-0.5 text-xs",
      sm: "px-1.5 py-px text-2xs",
    },
  },
  defaultVariants: { size: "default" },
});

// CodeChip is an inline monospace token: flag keys, ids, API keys, queries.
export function CodeChip({
  className,
  size,
  ...props
}: React.ComponentProps<"code"> & VariantProps<typeof codeChipVariants>) {
  return <code className={cn(codeChipVariants({ size }), className)} {...props} />;
}
