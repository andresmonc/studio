"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { useTheme } from "@/components/refine-ui/theme/theme-provider";
import { toggleVariants } from "@/components/ui/toggle";
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

// Lives inside the user dropdown menu, so the toggle row is built from radio
// menu items styled as a toggle group: a real toggle group there is invalid
// (radios in a menu) and the menu's arrow keys skip it.
export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const t = useTranslate();

  return (
    <DropdownMenuPrimitive.RadioGroup
      value={theme}
      onValueChange={(v) => setTheme(v as Theme)}
      aria-label={t("theme.label", "Theme")}
      className={cn("flex w-full rounded-md shadow-xs", className)}
    >
      {OPTIONS.map(({ value, Icon, key, fallback }) => {
        // `selected` is computed here rather than via `data-[state=checked]:`
        // because TooltipTrigger asChild and RadioItem render onto the same node
        // and both set `data-state`; Tooltip's value wins.
        const selected = theme === value;
        return (
          <Tooltip key={value}>
            <TooltipTrigger asChild>
              <DropdownMenuPrimitive.RadioItem
                value={value}
                aria-label={t(key, fallback)}
                // Keep the menu open, like the toggle group did.
                onSelect={(e) => e.preventDefault()}
                className={cn(
                  toggleVariants({ variant: "outline", size: "sm" }),
                  "min-w-0 flex-1 rounded-none border-l-0 shadow-none first:rounded-l-md first:border-l last:rounded-r-md focus:z-10 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                  {
                    "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground data-[highlighted]:bg-primary data-[highlighted]:text-primary-foreground":
                      selected,
                  },
                )}
              >
                <Icon className={cn("h-4", "w-4")} />
              </DropdownMenuPrimitive.RadioItem>
            </TooltipTrigger>
            <TooltipContent>{t(key, fallback)}</TooltipContent>
          </Tooltip>
        );
      })}
    </DropdownMenuPrimitive.RadioGroup>
  );
}

ThemeSwitcher.displayName = "ThemeSwitcher";
