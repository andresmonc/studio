import { useTranslate } from "@refinedev/core";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

// CopyButton copies `value` to the clipboard, toasts the outcome, and swaps
// its icon to a checkmark for a moment so the click is visibly acknowledged.
export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  /** Accessible name and tooltip, e.g. "Copy API key". */
  label: string;
  className?: string;
}) {
  const t = useTranslate();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onCopy = async () => {
    if (!(await copyToClipboard(value))) {
      toast.error(t("common.copyError"));
      return;
    }
    toast.success(t("common.copied"));
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-7 text-muted-foreground", className)}
          onClick={onCopy}
          aria-label={label}
        >
          {copied ? (
            <CheckIcon className="size-3.5 text-success" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? t("common.copied") : label}</TooltipContent>
    </Tooltip>
  );
}
