import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./button";
import { PageBreadcrumb, PageHeader } from "./page-header";

const meta = {
  title: "UI/PageHeader",
  component: PageHeader,
  tags: ["autodocs"],
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    breadcrumb: [{ label: "Flags" }],
    title: "Flags",
    description: "12 flags across 3 flagsets",
    children: <Button>New flag</Button>,
  },
  render: (args) => (
    <div className="flex flex-col gap-4">
      <PageHeader {...args} />
    </div>
  ),
};

export const TitleOnly: Story = {
  args: { title: "Profile" },
};

export const BreadcrumbOnly: Story = {
  args: { title: "" },
  render: () => (
    <PageBreadcrumb
      items={[
        { label: "Flags", to: "/flags" },
        { label: "checkout-redesign", className: "font-mono" },
      ]}
    />
  ),
};
