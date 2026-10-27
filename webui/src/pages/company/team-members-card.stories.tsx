import type { Meta, StoryObj } from "@storybook/react-vite";

import { LOADING } from "../../../.storybook/fixtures";
import { TeamMembersCard } from "./team-members-card";

const meta = {
  title: "Pages/Company/TeamMembersCard",
  component: TeamMembersCard,
  tags: ["autodocs"],
  args: { teamId: "t-core", editable: true },
} satisfies Meta<typeof TeamMembersCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// Admins change roles, add company members and remove team members.
export const Editable: Story = {};
export const ReadOnly: Story = { args: { editable: false } };
export const Empty: Story = {
  parameters: { data: { "/teams/t-core/members": [] } },
};
export const Loading: Story = {
  parameters: { data: { "/teams/t-core/members": LOADING } },
};
