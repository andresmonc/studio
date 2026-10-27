import type { Meta, StoryObj } from "@storybook/react-vite";

import { CodeChip } from "./code-chip";
import { CopyButton } from "./copy-button";

const meta = {
  title: "UI/CopyButton",
  component: CopyButton,
  tags: ["autodocs"],
} satisfies Meta<typeof CopyButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { value: "checkout-redesign", label: "Copy flag key" },
};

export const NextToValue: Story = {
  args: { value: "goff_live_3f2a91c4", label: "Copy API key" },
  render: (args) => (
    <div className="flex items-center gap-1.5">
      <CodeChip>{args.value}</CodeChip>
      <CopyButton {...args} />
    </div>
  ),
};
