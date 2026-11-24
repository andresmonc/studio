import { LightbulbIcon, XIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// TipCallout renders a muted, lightbulb-marked hint box. Shared by the flag
// creation wizard sidebar and the flag detail Targeting tab.
export function TipCallout({
  title,
  children,
  className,
  inline = false,
  onDismiss,
  dismissLabel,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  // Single line (wraps only when the text doesn't fit), for tips that sit
  // inside a card instead of beside it.
  inline?: boolean;
  // Shows a close button when set; dismissLabel is its accessible name.
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  const [closing, setClosing] = React.useState(false);
  // Fade out before calling onDismiss. With reduced motion no animation runs
  // (so animationend never fires): dismiss right away.
  const close = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) onDismiss?.();
    else setClosing(true);
  };
  const fade = closing && "animate-out fade-out fill-mode-forwards duration-500";
  const onAnimationEnd = closing ? onDismiss : undefined;
  const dismiss = onDismiss && (
    <Button
      variant="ghost"
      size="icon"
      className="ml-auto h-5 w-5 shrink-0 text-muted-foreground"
      onClick={close}
      aria-label={dismissLabel}
    >
      <XIcon className="h-3.5 w-3.5" />
    </Button>
  );
  if (inline) {
    return (
      <div
        className={cn(
          "flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground",
          fade,
          className,
        )}
        onAnimationEnd={onAnimationEnd}
      >
        <LightbulbIcon className="h-4 w-4 shrink-0 text-warning" />
        <p>
          <span className="font-semibold text-foreground">{title}:</span>{" "}
          {children}
        </p>
        {dismiss}
      </div>
    );
  }
  return (
    <div
      className={cn("rounded-lg border bg-muted/30 p-4", fade, className)}
      onAnimationEnd={onAnimationEnd}
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <LightbulbIcon className="h-5 w-5 text-warning" />
        {title}
        {dismiss}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {children}
      </p>
    </div>
  );
}
