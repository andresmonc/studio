import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { ConfirmDeleteDialog } from "./confirm-delete-dialog";

// No autodocs: every story is an open modal, which would stack on a docs page.
const meta = {
  title: "App/ConfirmDeleteDialog",
  component: ConfirmDeleteDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    onConfirm: fn(),
    title: "Delete flag?",
    description:
      "This permanently deletes the flag and its history. It cannot be undone.",
    name: "new-checkout",
    confirmLabel: "Delete flag",
  },
} satisfies Meta<typeof ConfirmDeleteDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
export const Pending: Story = { args: { pending: true } };
