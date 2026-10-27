import type { Meta, StoryObj } from "@storybook/react-vite";

import { EmptyState } from "./empty-state";

const meta = {
  title: "UI/EmptyState",
  component: EmptyState,
  tags: ["autodocs"],
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Card: Story = {
  args: { children: "No flagsets yet." },
};

export const Inline: Story = {
  args: { variant: "inline", children: "No targeting rules. Everyone gets the default." },
};
