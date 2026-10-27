import type { Meta, StoryObj } from "@storybook/react-vite";

import { CodeChip } from "./code-chip";

const meta = {
  title: "UI/CodeChip",
  component: CodeChip,
  tags: ["autodocs"],
} satisfies Meta<typeof CodeChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: "checkout-redesign" },
};

export const Small: Story = {
  args: { size: "sm", children: "#3f2a91" },
};

export const InText: Story = {
  render: () => (
    <p className="text-sm">
      Type <CodeChip>checkout-redesign</CodeChip> to confirm.
    </p>
  ),
};
