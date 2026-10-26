import type { Meta, StoryObj } from "@storybook/react-vite";

import { DistributionBar } from "./distribution-bar";

const meta = {
  title: "Flags/DistributionBar",
  component: DistributionBar,
  tags: ["autodocs"],
  args: {
    variations: ["enabled", "disabled"],
    percentages: { enabled: 50, disabled: 50 },
  },
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DistributionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EvenSplit: Story = {};
export const Canary: Story = {
  args: { percentages: { enabled: 10, disabled: 90 } },
};
export const ThreeWay: Story = {
  args: {
    variations: ["control", "treatment-1", "treatment-2"],
    percentages: { control: 50, "treatment-1": 25, "treatment-2": 25 },
  },
};
export const Large: Story = { args: { size: "lg" } };
