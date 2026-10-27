import type { Meta, StoryObj } from "@storybook/react-vite";

import { i18nProvider } from "@/providers/i18n";
import { VerbChip } from "./verb-chip";

const meta = {
  title: "Pages/AuditLog/VerbChip",
  component: VerbChip,
  tags: ["autodocs"],
  args: { action: "flag.create", t: i18nProvider.translate },
} satisfies Meta<typeof VerbChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Created: Story = {};
export const Updated: Story = { args: { action: "flag.update" } };
export const Enabled: Story = { args: { action: "flag.enable" } };
export const Disabled: Story = { args: { action: "flag.disable" } };
export const Reverted: Story = { args: { action: "flag.rollback" } };
export const Deleted: Story = { args: { action: "flag.delete" } };
export const CreatedKey: Story = { args: { action: "api_key.create" } };
export const AddedMember: Story = { args: { action: "team_member.create" } };
// Unknown actions fall back to the last segment with a muted tone.
export const UnknownAction: Story = { args: { action: "webhook.retry" } };
