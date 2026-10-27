import type { Meta, StoryObj } from "@storybook/react-vite";

import { AUDIT_ENTRIES } from "../../../.storybook/fixtures";
import { i18nProvider } from "@/providers/i18n";
import { EventDetail } from "./event-detail";

const meta = {
  title: "Pages/AuditLog/EventDetail",
  component: EventDetail,
  tags: ["autodocs"],
  args: {
    e: AUDIT_ENTRIES[0],
    target: "checkout-redesign",
    t: i18nProvider.translate,
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EventDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithDiff: Story = {};
// A rollback carries provenance metadata (restoredVersion) in the grid.
export const WithMetadata: Story = {
  args: { e: AUDIT_ENTRIES[6], target: "pricing-page-v3" },
};
export const NoDiff: Story = {
  args: {
    e: { ...AUDIT_ENTRIES[0], before: undefined, after: undefined },
  },
};
export const NothingSelected: Story = { args: { e: null, target: "" } };
