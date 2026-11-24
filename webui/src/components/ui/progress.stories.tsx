import type { Meta, StoryObj } from "@storybook/react-vite";

import { Progress } from "./progress";

const meta = {
  title: "UI/Progress",
  component: Progress,
  tags: ["autodocs"],
  args: {
    value: 60,
    className: "w-80",
    "aria-label": "Upload progress",
  },
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Steps: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <Progress value={0} aria-label="Step progress" />
      <Progress value={25} aria-label="Step progress" />
      <Progress value={50} aria-label="Step progress" />
      <Progress value={75} aria-label="Step progress" />
      <Progress value={100} aria-label="Step progress" />
    </div>
  ),
};
