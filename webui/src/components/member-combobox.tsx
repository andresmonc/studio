import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { CompanyMember } from "@/types/api";

type MemberComboboxProps = {
  members: CompanyMember[];
  value: string;
  onChange: (email: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  className?: string;
};

export function MemberCombobox({
  members,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  className,
}: MemberComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = members.find((m) => m.email === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "justify-between font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          {selected ? `${selected.name} (${selected.email})` : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {members.map((u) => (
                <CommandItem
                  key={u.userId}
                  value={`${u.name} ${u.email}`}
                  onSelect={() => {
                    onChange(u.email);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === u.email ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{u.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {u.email}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

MemberCombobox.displayName = "MemberCombobox";
