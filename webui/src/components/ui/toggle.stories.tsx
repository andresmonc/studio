import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bold } from "lucide-react";

import { Toggle } from "./toggle";

const meta = {
  title: "UI/Toggle",
  component: Toggle,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["default", "outline"] },
    size: { control: "select", options: ["default", "sm", "lg"] },
    disabled: { control: "boolean" },
  },
  args: { children: "Toggle" },
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Outline: Story = { args: { variant: "outline" } };

export const WithIcon: Story = {
  args: {
    "aria-label": "Toggle bold",
    children: <Bold />,
  },
};

export const Disabled: Story = { args: { disabled: true } };
