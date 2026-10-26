// ConfirmDeleteDialog: destructive confirmation that only enables the action
// once the user types the resource name exactly (case-sensitive).

import { useState, type ReactNode } from "react";
import { useTranslate } from "@refinedev/core";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  /** The value the user must type to enable the confirm button. */
  name: string;
  confirmLabel: ReactNode;
  onConfirm: () => void;
  pending?: boolean;
};

export function ConfirmDeleteDialog({ open, onOpenChange, ...props }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {/* Content unmounts on close, so the typed text resets on every reopen. */}
      <AlertDialogContent>
        <ConfirmBody {...props} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ConfirmBody({
  title,
  description,
  name,
  confirmLabel,
  onConfirm,
  pending,
}: Omit<Props, "open" | "onOpenChange">) {
  const t = useTranslate();
  const [typed, setTyped] = useState("");
  // Render the name as an inline code block inside the label. Split the
  // localized string around a private-use sentinel so the name slots in as JSX.
  const NAME_SLOT = "";
  const [labelBefore, labelAfter] = t("common.typeToConfirm", {
    name: NAME_SLOT,
  }).split(NAME_SLOT);

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <div className="grid gap-2 py-1">
        <p className="text-sm font-medium">
          {labelBefore}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {name}
          </code>
          {labelAfter}
        </p>
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={name}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>
          {t("common.cancel")}
        </AlertDialogCancel>
        <AlertDialogAction
          className={buttonVariants({ variant: "destructive" })}
          disabled={pending || typed !== name}
          onClick={onConfirm}
        >
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}
