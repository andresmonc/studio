import type { Meta, StoryObj } from "@storybook/react-vite";

import { VariationPill } from "./variation-pill";

const meta = {
  title: "Flags/VariationPill",
  component: VariationPill,
  tags: ["autodocs"],
  args: { name: "enabled", index: 0 },
} satisfies Meta<typeof VariationPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithValue: Story = { args: { value: "true" } };

export const ColorCycle: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: 8 }, (_, i) => (
        <VariationPill key={i} name={`variation-${i}`} index={i} />
      ))}
    </div>
  ),
};
