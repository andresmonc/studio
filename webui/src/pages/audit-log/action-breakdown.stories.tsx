import type { Meta, StoryObj } from "@storybook/react-vite";

import { AUDIT_ENTRIES } from "../../../.storybook/fixtures";
import { i18nProvider } from "@/providers/i18n";
import { ActionBreakdown } from "./action-breakdown";

const meta = {
  title: "Pages/AuditLog/ActionBreakdown",
  component: ActionBreakdown,
  tags: ["autodocs"],
  args: { entries: AUDIT_ENTRIES, t: i18nProvider.translate },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ActionBreakdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};
export const Empty: Story = { args: { entries: [] } };
