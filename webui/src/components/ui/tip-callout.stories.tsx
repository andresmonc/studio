import type { Meta, StoryObj } from "@storybook/react-vite";

import { TipCallout } from "./tip-callout";

const meta = {
  title: "UI/TipCallout",
  component: TipCallout,
  tags: ["autodocs"],
} satisfies Meta<typeof TipCallout>;

export default meta;
type Story = StoryObj<typeof TipCallout>;

export const Default: Story = {
  render: () => (
    <TipCallout title="Targeting tip" className="max-w-md">
      Rules are evaluated top to bottom. The first matching rule wins, so place
      your most specific conditions first.
    </TipCallout>
  ),
};

export const PercentageRollout: Story = {
  render: () => (
    <TipCallout title="Percentage rollouts" className="max-w-md">
      A user always lands in the same bucket for a given flag, so a 10% rollout
      stays stable as you increase it to 50% — no one flips back and forth.
    </TipCallout>
  ),
};
