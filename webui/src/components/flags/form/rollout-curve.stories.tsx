import type { Meta, StoryObj } from "@storybook/react-vite";

import { isoToLocalInput } from "./flag-form-helpers";
import { RolloutCurve } from "./rollout-curve";

// Dates are relative to now so the live/scheduled/completed status stays correct.
const daysFromNow = (days: number) =>
  isoToLocalInput(new Date(Date.now() + days * 86_400_000).toISOString());

const meta = {
  title: "Flags/RolloutCurve",
  component: RolloutCurve,
  tags: ["autodocs"],
  args: {
    variationNames: ["enabled", "disabled"],
    initialVariation: "disabled",
    endVariation: "enabled",
    initialPct: 0,
    endPct: 100,
    startDate: daysFromNow(-2),
    endDate: daysFromNow(5),
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RolloutCurve>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {};
export const Scheduled: Story = {
  args: { startDate: daysFromNow(1), endDate: daysFromNow(8) },
};
export const Completed: Story = {
  args: { startDate: daysFromNow(-8), endDate: daysFromNow(-1) },
};
export const PartialRollout: Story = { args: { initialPct: 10, endPct: 50 } };
export const Empty: Story = { args: { startDate: "", endDate: "" } };
export const Disabled: Story = { args: { disabled: true } };
