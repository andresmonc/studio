import type { Meta, StoryObj } from "@storybook/react-vite";

import { Label } from "./label";
import { Switch } from "./switch";

const meta = {
  title: "UI/Switch",
  component: Switch,
  tags: ["autodocs"],
  argTypes: {
    checked: { control: "boolean" },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Checked: Story = { args: { defaultChecked: true } };

export const Disabled: Story = { args: { disabled: true } };

export const DisabledChecked: Story = {
  args: { disabled: true, defaultChecked: true },
};

export const WithLabel: Story = {
  render: (args) => (
    <Label className="gap-2">
      <Switch {...args} id="airplane-mode" />
      Airplane mode
    </Label>
  ),
};
