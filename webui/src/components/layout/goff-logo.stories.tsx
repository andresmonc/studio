import type { Meta, StoryObj } from "@storybook/react-vite";

import { GoffLogo } from "./goff-logo";

const meta = {
  title: "Layout/GoffLogo",
  component: GoffLogo,
  tags: ["autodocs"],
  args: { className: "size-48" },
} satisfies Meta<typeof GoffLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithText: Story = {
  args: { className: "size-12", withText: true },
};

export const WithoutCircle: Story = {
  args: { withCircle: false },
  // The snippet generator drops `={false}` props by default, which hides the opt-out
  // since withCircle defaults to true.
  parameters: { jsx: { useBooleanShorthandSyntax: false } },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      {["size-8", "size-16", "size-32", "size-64"].map((size) => (
        <GoffLogo key={size} className={size} />
      ))}
    </div>
  ),
};
