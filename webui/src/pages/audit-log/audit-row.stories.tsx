import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { AUDIT_ENTRIES } from "../../../.storybook/fixtures";
import { i18nProvider } from "@/providers/i18n";
import { AuditRow } from "./audit-row";

const meta = {
  title: "Pages/AuditLog/AuditRow",
  component: AuditRow,
  tags: ["autodocs"],
  args: {
    e: AUDIT_ENTRIES[0],
    target: "checkout-redesign",
    selected: false,
    onSelect: fn(),
    t: i18nProvider.translate,
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl rounded-md border">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AuditRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Selected: Story = { args: { selected: true } };
export const InFlagset: Story = { args: { flagsetName: "web-storefront" } };
export const SystemEvent: Story = {
  args: { e: AUDIT_ENTRIES[7], target: "legacy-banner", flagsetName: "mobile-app" },
};
