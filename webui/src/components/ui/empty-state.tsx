import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// EmptyState is the centred muted message shown for loading, empty and
// not-found states. `card` stands alone on a page; `inline` sits inside a card
// or editor as a dashed placeholder.
export function EmptyState({
  children,
  variant = "card",
  className,
}: {
  children: ReactNode;
  variant?: "card" | "inline";
  className?: string;
}) {
  if (variant === "inline") {
    return (
      <div
        className={cn(
          "rounded-md border border-dashed bg-muted/30 p-6 text-center text-xs text-muted-foreground",
          className,
        )}
      >
        {children}
      </div>
    );
  }
  return (
    <Card className={className}>
      <CardContent className="py-10 text-center text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}
