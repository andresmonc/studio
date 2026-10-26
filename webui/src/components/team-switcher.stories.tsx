import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";

import { IDENTITIES } from "../../.storybook/fixtures";
import { TeamSwitcher } from "./team-switcher";

const openMenu: Story["play"] = async ({ canvasElement }) => {
  const trigger = await within(canvasElement).findByRole("button");
  await userEvent.click(trigger);
};

const meta = {
  title: "App/TeamSwitcher",
  component: TeamSwitcher,
  tags: ["autodocs"],
  parameters: { identity: IDENTITIES.member },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TeamSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

// Members pick among the teams they belong to.
export const Member: Story = {};
export const MemberMenuOpen: Story = { play: openMenu };

// Company admins pick among every team of the company (fetched).
export const CompanyAdminMenuOpen: Story = {
  parameters: { identity: IDENTITIES.companyAdmin },
  play: openMenu,
};

// Hidden when there is nothing to switch to: renders nothing.
export const SingleTeam: Story = {
  parameters: { identity: IDENTITIES.singleTeamMember },
};
