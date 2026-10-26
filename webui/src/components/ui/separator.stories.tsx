import type { Meta, StoryObj } from "@storybook/react-vite";

import { Separator } from "./separator";

const meta = {
  title: "UI/Separator",
  component: Separator,
  tags: ["autodocs"],
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-72">
      <div className="space-y-1">
        <h4 className="text-sm font-medium">Feature flags</h4>
        <p className="text-muted-foreground text-sm">
          Manage rollouts across environments.
        </p>
      </div>
      <Separator className="my-4" />
      <div className="text-sm">Targeting</div>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-5 items-center gap-4 text-sm">
      <span>Docs</span>
      <Separator orientation="vertical" />
      <span>API</span>
      <Separator orientation="vertical" />
      <span>Settings</span>
    </div>
  ),
};
