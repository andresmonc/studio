import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Calculator,
  Calendar,
  CreditCard,
  Settings,
  Smile,
  User,
} from "lucide-react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "./command";

const meta = {
  title: "UI/Command",
  component: Command,
  tags: ["autodocs"],
} satisfies Meta<typeof Command>;

export default meta;
type Story = StoryObj<typeof meta>;

const CommandItems = () => (
  <CommandList>
    <CommandEmpty>No results found.</CommandEmpty>
    <CommandGroup heading="Suggestions">
      <CommandItem>
        <Calendar />
        <span>Calendar</span>
      </CommandItem>
      <CommandItem>
        <Smile />
        <span>Search Emoji</span>
      </CommandItem>
      <CommandItem disabled>
        <Calculator />
        <span>Calculator</span>
      </CommandItem>
    </CommandGroup>
    <CommandSeparator />
    <CommandGroup heading="Settings">
      <CommandItem>
        <User />
        <span>Profile</span>
        <CommandShortcut>⌘P</CommandShortcut>
      </CommandItem>
      <CommandItem>
        <CreditCard />
        <span>Billing</span>
        <CommandShortcut>⌘B</CommandShortcut>
      </CommandItem>
      <CommandItem>
        <Settings />
        <span>Settings</span>
        <CommandShortcut>⌘S</CommandShortcut>
      </CommandItem>
    </CommandGroup>
  </CommandList>
);

export const Default: Story = {
  render: () => (
    <Command className="border-border w-[420px] rounded-lg border shadow-md">
      <CommandInput placeholder="Type a command or search..." />
      <CommandItems />
    </Command>
  ),
};

export const AsDialog: Story = {
  render: () => (
    <CommandDialog open>
      <CommandInput placeholder="Type a command or search..." />
      <CommandItems />
    </CommandDialog>
  ),
};
