import type { Meta, StoryObj } from "@storybook/react-vite";

import { Slider } from "./slider";

const meta = {
  title: "UI/Slider",
  component: Slider,
  tags: ["autodocs"],
  argTypes: {
    min: { control: "number" },
    max: { control: "number" },
    step: { control: "number" },
    disabled: { control: "boolean" },
  },
  args: { min: 0, max: 100, step: 1 },
  render: (args) => (
    <div className="w-64">
      <Slider {...args} />
    </div>
  ),
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { defaultValue: [50] } };

export const Range: Story = { args: { defaultValue: [25, 75] } };

export const Stepped: Story = { args: { defaultValue: [40], step: 10 } };

export const Disabled: Story = { args: { defaultValue: [50], disabled: true } };
