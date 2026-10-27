import { useMemo, useRef, useState } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

// Soft caps mirroring the server-side bounds in ValidateFlagTags (≤50 tags,
// ≤50 runes/tag). Enforced here as a UX hint so the user is stopped inline
// instead of only discovering the limit via a save-time validation error; the
// server stays the authoritative guard.
const MAX_TAGS = 50;
const MAX_TAG_LENGTH = 50;

// Rune (code-point) length, matching the server's utf8.RuneCountInString so a
// multi-byte tag counts the same on both sides.
const runeLength = (s: string) => [...s].length;

// TagInput is a free-text, multi-value tag editor: type a tag and press Enter (or
// comma) to add it, click × (or Backspace on an empty field) to remove one. An
// autocomplete dropdown surfaces `suggestions` (the team's existing tags) that
// aren't already selected, plus a "Create" affordance for brand-new tags.
// Values are trimmed and de-duplicated (case-preserving). Tags live under
// metadata.tags — see RESERVED_META_KEYS / useFlagForm.setTags.
//
// The dropdown is built on the same cmdk `Command` primitives as the flags-list
// TagFilter, so the two tag UIs search and read consistently. We keep
// `shouldFilter={false}` because our `filtered`/`canCreate` logic (dedup against
// selected tags, the Create affordance, the caps) stays authoritative; cmdk only
// supplies the roving highlight and Enter-selects-the-highlighted-item.
export type TagInputProps = {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  readOnly?: boolean;
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
  maxTags?: number;
  maxTagLength?: number;
};

export function TagInput({
  value,
  onChange,
  suggestions = [],
  readOnly = false,
  placeholder,
  id,
  "aria-label": ariaLabel,
  maxTags = MAX_TAGS,
  maxTagLength = MAX_TAG_LENGTH,
}: TagInputProps) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const atCapacity = value.length >= maxTags;

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    if (value.includes(tag)) {
      setDraft("");
      return;
    }
    // At the cap or over the length limit: keep the draft so the user doesn't
    // lose their typing, and let the hint below explain why nothing was added.
    if (value.length >= maxTags) return;
    if (runeLength(tag) > maxTagLength) return;
    onChange([...value, tag]);
    setDraft("");
  };
  const removeTag = (tag: string) => onChange(value.filter((t) => t !== tag));

  const draftTrim = draft.trim();
  const draftTooLong = runeLength(draftTrim) > maxTagLength;

  const q = draftTrim.toLowerCase();
  const filtered = useMemo(
    () =>
      suggestions
        .filter((s) => !value.includes(s))
        .filter((s) => (q ? s.toLowerCase().includes(q) : true))
        .slice(0, 8),
    [suggestions, value, q],
  );

  // A "Create" row appears when the draft isn't already a tag or an exact
  // suggestion, and it's within the caps (no point offering an add that's blocked).
  const canCreate =
    draftTrim !== "" &&
    !draftTooLong &&
    !atCapacity &&
    !value.includes(draftTrim) &&
    !filtered.some((s) => s.toLowerCase() === q);
  const itemCount = filtered.length + (canCreate ? 1 : 0);
  // At capacity nothing can be added, so suppress the dropdown and show the hint.
  const showDropdown = open && !readOnly && !atCapacity && itemCount > 0;

  const hint = atCapacity
    ? `Maximum ${maxTags} tags reached`
    : draftTooLong
      ? `Tags can be at most ${maxTagLength} characters`
      : null;

  // Enter and Arrow navigation are handled by cmdk on the Command root. We only
  // intercept comma (always adds the raw typed text, never the highlighted
  // suggestion) and Backspace-on-empty (removes the last tag).
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ",") {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      removeTag(value[value.length - 1]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <CommandPrimitive shouldFilter={false} className="relative">
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-xs",
          "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
          readOnly && "cursor-default opacity-70",
        )}
        onClick={() => !readOnly && inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 font-normal">
            {tag}
            {!readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${tag}`}
                className="ml-0.5 size-4 rounded-sm text-muted-foreground hover:bg-transparent hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(tag);
                }}
              >
                <X className="size-3" />
              </Button>
            )}
          </Badge>
        ))}
        {!readOnly && !atCapacity && (
          <CommandPrimitive.Input
            ref={inputRef}
            id={id}
            aria-label={ariaLabel}
            value={draft}
            aria-invalid={draftTooLong || undefined}
            placeholder={value.length === 0 ? placeholder : undefined}
            className="min-w-[8ch] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            onValueChange={(next) => {
              setDraft(next);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              // Delay so a mousedown on a dropdown item still registers.
              blurTimer.current = setTimeout(() => setOpen(false), 120);
            }}
            onKeyDown={onKeyDown}
          />
        )}
      </div>

      {!readOnly && hint && (
        <p className="mt-1 text-xs text-destructive" role="status">
          {hint}
        </p>
      )}

      {showDropdown && (
        <div
          className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md"
          onMouseDown={(e) => {
            // Keep the input focused through the click.
            e.preventDefault();
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          <CommandList className="max-h-56">
            <CommandGroup>
              {canCreate && (
                <CommandItem
                  value={draftTrim}
                  onSelect={() => {
                    addTag(draftTrim);
                    inputRef.current?.focus();
                  }}
                >
                  <span>
                    Create <span className="font-medium">"{draftTrim}"</span>
                  </span>
                </CommandItem>
              )}
              {filtered.map((s) => (
                <CommandItem
                  key={s}
                  value={s}
                  onSelect={() => {
                    addTag(s);
                    inputRef.current?.focus();
                  }}
                >
                  {s}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </div>
      )}
    </CommandPrimitive>
  );
}

TagInput.displayName = "TagInput";
