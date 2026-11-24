import { useMemo, useState } from "react";
import { useTranslate } from "@refinedev/core";
import { CheckIcon, ChevronsUpDown, TagsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// TagFilter is the GitHub-label-picker-style multi-select in the flags list
// filter bar: a Popover holding a searchable, checkable list of tags. Selecting a
// tag toggles it in the active AND-filter set. Selected tags sort to the top
// (like GitHub's "Selected labels" group). `allTags` is the full team tag
// registry from `GET /teams/:id/tags`; tag filtering is server-side (D3:B), so
// every option here resolves to real matches even for teams past the 1000-flag
// list cap (no dead-ends).
export function TagFilter({
  allTags,
  selected,
  onToggle,
}: {
  allTags: string[];
  selected: string[];
  onToggle: (tag: string) => void;
}) {
  const t = useTranslate();
  const [open, setOpen] = useState(false);

  const ordered = useMemo(() => {
    const sel = new Set(selected);
    return [...allTags].sort((a, b) => {
      const as = sel.has(a) ? 0 : 1;
      const bs = sel.has(b) ? 0 : 1;
      return as - bs || a.localeCompare(b);
    });
  }, [allTags, selected]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={t("flag.allTags")}
          className="h-9 w-[160px] justify-between text-sm font-normal"
        >
          <span className="flex items-center gap-1.5 truncate">
            <TagsIcon className="h-4 w-4 shrink-0 opacity-60" />
            {t("flag.allTags")}
            {selected.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-0.5 h-5 rounded-sm px-1 text-2xs"
              >
                {selected.length}
              </Badge>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[240px] p-0"
        align="start"
        aria-label={t("flag.allTags")}
      >
        {ordered.length === 0 ? (
          // No tags at all: show plain text, an empty listbox is invalid.
          <p className="py-6 text-center text-sm">{t("flag.noTags")}</p>
        ) : (
          <Command>
            <CommandInput placeholder={t("flag.filterTags")} />
            <CommandList>
              <CommandEmpty>{t("flag.noTags")}</CommandEmpty>
              <CommandGroup>
                {ordered.map((tag) => {
                  const checked = selected.includes(tag);
                  return (
                    <CommandItem
                      key={tag}
                      value={tag}
                      aria-checked={checked}
                      onSelect={() => onToggle(tag)}
                    >
                      {/* Drawn, not a <Checkbox>: a button nested in an option is
                          invalid; the option's aria-checked carries the state. */}
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input shadow-xs",
                          checked && "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        {checked && <CheckIcon className="size-3.5" />}
                      </span>
                      <span className="truncate">{tag}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

TagFilter.displayName = "TagFilter";
