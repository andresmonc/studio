import type { Meta, StoryObj } from "@storybook/react-vite";

import { Checkbox } from "./checkbox";
import { Input } from "./input";
import { Label } from "./label";

const meta = {
  title: "UI/Label",
  component: Label,
  tags: ["autodocs"],
  argTypes: {
    children: { control: "text" },
  },
  args: { children: "Label text" },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithInput: Story = {
  render: (args) => (
    <div className="grid w-full max-w-sm items-center gap-2">
      <Label {...args} htmlFor="name">
        Name
      </Label>
      <Input id="name" placeholder="Your name" />
    </div>
  ),
};

export const WithCheckbox: Story = {
  render: () => (
    <Label className="gap-2">
      <Checkbox id="terms" />
      Accept terms and conditions
    </Label>
  ),
};
