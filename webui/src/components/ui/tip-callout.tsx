import { LightbulbIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

// TipCallout renders a muted, lightbulb-marked hint box. Shared by the flag
// creation wizard sidebar and the flag detail Targeting tab.
export function TipCallout({
  title,
  children,
  className,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-muted/30 p-4", className)}>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <LightbulbIcon className="h-5 w-5 text-warning" />
        {title}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {children}
      </p>
    </div>
  );
}
