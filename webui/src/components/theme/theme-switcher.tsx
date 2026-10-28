"use client";

import { useTheme } from "@/components/theme/theme-provider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTranslate } from "@refinedev/core";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "dark" | "light" | "system";

const OPTIONS = [
  { value: "dark", Icon: Moon, key: "theme.dark", fallback: "Dark theme" },
  { value: "light", Icon: Sun, key: "theme.light", fallback: "Light theme" },
  {
    value: "system",
    Icon: Monitor,
    key: "theme.system",
    fallback: "Use system setting",
  },
] as const;

export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const t = useTranslate();

  return (
    <ToggleGroup
      type="single"
      value={theme}
      onValueChange={(v) => v && setTheme(v as Theme)}
      variant="outline"
      size="sm"
      className={cn("w-full", className)}
    >
      {OPTIONS.map(({ value, Icon, key, fallback }) => {
        // `selected` is computed here rather than via `data-[state=on]:` because
        // TooltipTrigger asChild and ToggleGroupItem render onto the same node and
        // both set `data-state` — Tooltip's value overwrites ToggleGroup's "on".
        const selected = theme === value;
        return (
          <Tooltip key={value}>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value={value}
                aria-label={t(key, fallback)}
                className={cn("flex-1", {
                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground":
                    selected,
                })}
              >
                <Icon className={cn("h-4", "w-4")} />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>{t(key, fallback)}</TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
}

ThemeSwitcher.displayName = "ThemeSwitcher";
