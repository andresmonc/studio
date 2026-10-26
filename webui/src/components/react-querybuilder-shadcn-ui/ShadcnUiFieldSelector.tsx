import { useMemo, useState } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import type { OptionList, VersatileSelectorProps } from "react-querybuilder";
import { isOptionGroupArray } from "react-querybuilder";
import { Button } from "@/components/ui/button";
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
import {
  getRememberedAttributes,
  rememberAttribute,
} from "@/lib/targeting-attributes";
import { cn } from "@/lib/utils";

type FieldOption = { name: string; label: string };

function flattenOptions(list: OptionList): FieldOption[] {
  const out: FieldOption[] = [];
  if (isOptionGroupArray(list)) {
    for (const group of list) {
      for (const o of group.options) {
        out.push({ name: o.name ?? "", label: String(o.label ?? o.name ?? "") });
      }
    }
  } else if (Array.isArray(list)) {
    for (const o of list) {
      out.push({ name: o.name ?? "", label: String(o.label ?? o.name ?? "") });
    }
  }
  return out;
}

export type ShadcnUiFieldSelectorProps = VersatileSelectorProps &
  ComponentPropsWithoutRef<typeof Button>;

// ShadcnUiFieldSelector is a creatable combobox for the targeting-rule field:
// pick a known attribute (targetingKey, email, …) OR type a custom attribute
// name. Evaluation contexts can carry arbitrary attributes, so users need to
// target keys we don't predefine. A typed value is stored as the rule's field
// and serialized as the jsonlogic `var`.
export const ShadcnUiFieldSelector = ({
  handleOnChange,
  options,
  value,
  title,
  disabled,
  // Strip RQB-internal props so they don't leak onto the DOM button.
  testID: _testID,
  rule: _rule,
  rules: _rules,
  level: _level,
  path: _path,
  context: _context,
  validation: _validation,
  operator: _operator,
  field: _field,
  fieldData: _fieldData,
  multiple: _multiple,
  listsAsArrays: _listsAsArrays,
  schema: _schema,
  ...extraProps
}: ShadcnUiFieldSelectorProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Attributes the user has typed before (localStorage). Refreshed on open so
  // attributes added in other rules this session show up without a reload.
  const [remembered, setRemembered] = useState<string[]>(() =>
    getRememberedAttributes(),
  );

  const fields = useMemo(() => {
    const base = flattenOptions(options);
    const known = new Set(base.map((f) => f.name));
    const extra = remembered
      .filter((a) => !known.has(a))
      .map((a) => ({ name: a, label: a }));
    return [...base, ...extra];
  }, [options, remembered]);
  const current = fields.find((f) => f.name === value);
  const triggerLabel =
    current?.label ?? (value ? String(value) : title || "Select attribute");

  const q = search.trim();
  const ql = q.toLowerCase();
  const filtered = q
    ? fields.filter(
        (f) =>
          f.label.toLowerCase().includes(ql) ||
          f.name.toLowerCase().includes(ql),
      )
    : fields;
  const exists = fields.some(
    (f) => f.name === q || f.label.toLowerCase() === ql,
  );
  const showCreate = q.length > 0 && !exists;

  const choose = (name: string) => {
    rememberAttribute(name);
    handleOnChange(name);
    setOpen(false);
    setSearch("");
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setRemembered(getRememberedAttributes());
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-[180px] justify-between font-normal"
          {...extraProps}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or type an attribute…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {filtered.length === 0 && !showCreate && (
              <CommandEmpty>No attribute found.</CommandEmpty>
            )}
            <CommandGroup>
              {filtered.map((f) => (
                <CommandItem
                  key={f.name}
                  value={f.name}
                  onSelect={() => choose(f.name)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === f.name ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {f.label}
                </CommandItem>
              ))}
              {showCreate && (
                <CommandItem value={`__create__:${q}`} onSelect={() => choose(q)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Use “{q}”
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

ShadcnUiFieldSelector.displayName = "ShadcnUiFieldSelector";
