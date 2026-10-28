import type { Meta, StoryObj } from "@storybook/react-vite";

import { ProgressiveIndicator } from "./progressive-indicator";

const meta = {
  title: "Flags/ProgressiveIndicator",
  component: ProgressiveIndicator,
  tags: ["autodocs"],
  args: {
    variations: ["enabled", "disabled"],
    initialVariation: "disabled",
    endVariation: "enabled",
  },
} satisfies Meta<typeof ProgressiveIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const MissingEndVariation: Story = {
  args: { endVariation: undefined },
};
