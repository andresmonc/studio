import type { Meta, StoryObj } from "@storybook/react-vite";

import { Label } from "./label";
import { Textarea } from "./textarea";

const meta = {
  title: "UI/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  argTypes: {
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
    rows: { control: "number" },
  },
  args: { placeholder: "Type your message here..." },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
  args: { disabled: true, value: "Cannot edit this content" },
};

export const Invalid: Story = {
  args: { "aria-invalid": true, defaultValue: "This field has an error" },
};

export const WithLabel: Story = {
  render: (args) => (
    <div className="grid w-full max-w-sm gap-2">
      <Label htmlFor="message">Your message</Label>
      <Textarea {...args} id="message" placeholder="Type your message here..." />
    </div>
  ),
};
