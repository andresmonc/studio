import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";

import { IDENTITIES } from "../../.storybook/fixtures";
import { SidebarProvider } from "./ui/sidebar";
import { SidebarUserMenu } from "./sidebar-user-menu";

const openMenu: Story["play"] = async ({ canvasElement }) => {
  const trigger = await within(canvasElement).findByRole("button");
  await userEvent.click(trigger);
};

const meta = {
  title: "App/SidebarUserMenu",
  component: SidebarUserMenu,
  tags: ["autodocs"],
  parameters: { identity: IDENTITIES.member },
  decorators: [
    (Story, { parameters }) => (
      <SidebarProvider
        defaultOpen={!parameters.collapsed}
        className="min-h-0 items-end pt-96"
      >
        <div className={parameters.collapsed ? "w-12" : "w-64"}>
          <Story />
        </div>
      </SidebarProvider>
    ),
  ],
} satisfies Meta<typeof SidebarUserMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Member: Story = {};
export const MemberMenuOpen: Story = { play: openMenu };
// Company admins also get the company settings entry.
export const CompanyAdminMenuOpen: Story = {
  parameters: { identity: IDENTITIES.companyAdmin },
  play: openMenu,
};
// Super admins also get the "Manage companies" admin section.
export const SuperAdminMenuOpen: Story = {
  parameters: { identity: IDENTITIES.superAdmin },
  play: openMenu,
};
// Collapsed sidebar: avatar only.
export const Collapsed: Story = { parameters: { collapsed: true } };
// No identity yet: skeleton placeholder.
export const Loading: Story = { parameters: { identity: null } };
