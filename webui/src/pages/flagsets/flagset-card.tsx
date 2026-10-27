import { useNavigate } from "react-router";
import { useTranslate } from "@refinedev/core";
import { KeyRoundIcon, MoreVerticalIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Flagset } from "@/types/api";

// Deterministic decorative activity bars (not real evaluation data).
function bars(seed: number): number[] {
  return Array.from({ length: 18 }, (_, i) => 4 + ((i * 9 + seed) % 22));
}

type Props = {
  fs: Flagset;
  editable: boolean;
  onDelete: (fs: Flagset) => void;
};

export function FlagsetCard({ fs, editable, onDelete }: Props) {
  const t = useTranslate();

  const created = fs.createdAt ? new Date(fs.createdAt).toLocaleDateString() : "";
  const navigate = useNavigate();

  return (
    <Card
      className="flex cursor-pointer flex-col gap-3.5 p-4 transition-colors hover:bg-muted/40"
      onClick={() => navigate(`/flagsets/${fs.id}`)}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-primary" />
        <span className="truncate font-semibold tracking-tight">{fs.name}</span>
      </div>

      {/* Decorative activity bars */}
      <div className="flex h-6 items-end gap-[3px]" aria-hidden="true">
        {bars(fs.flagCount + fs.name.length).map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-primary"
            style={{ height: h, opacity: 0.3 + (h / 30) * 0.6 }}
          />
        ))}
      </div>

      {/* Stats */}
      <div className="flex items-baseline gap-5">
        <Stat value={String(fs.flagCount)} label={t("flagset.flags")} />
        <Stat value={String(fs.enabledFlagCount)} label={t("flagset.enabled")} />
        <Stat value="—" label={t("flagset.evals")} />
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-dashed pt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <KeyRoundIcon className="h-3.5 w-3.5" />
          {fs.apiKeyCount}
        </span>
        {created && <span>· {t("flagset.createdLabel")} {created}</span>}
        {editable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto size-7"
                aria-label={t("common.actions")}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVerticalIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(fs);
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2Icon className="h-4 w-4" />
                {t("common.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </Card>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className={cn("text-lg", "font-semibold", "tabular-nums", "tracking-tight")}>
        {value}
      </div>
      <div className="text-2xs text-muted-foreground">{label}</div>
    </div>
  );
}

FlagsetCard.displayName = "FlagsetCard";
