import type { Meta, StoryObj } from "@storybook/react-vite";

import { IDENTITIES, LOADING } from "../../../.storybook/fixtures";
import { TeamDetailPage } from "./team-detail";

const meta = {
  title: "Pages/Company/TeamDetailPage",
  component: TeamDetailPage,
  tags: ["autodocs"],
  parameters: {
    identity: IDENTITIES.companyAdmin,
    route: { path: "/company/teams/:teamId", url: "/company/teams/t-core" },
  },
} satisfies Meta<typeof TeamDetailPage>;

export default meta;
type Story = StoryObj<typeof meta>;

// Company admins edit the team and get the Company › Teams breadcrumb.
export const CompanyAdmin: Story = {};
// Team admins edit the team but have no company crumbs.
export const TeamAdmin: Story = { parameters: { identity: IDENTITIES.teamAdmin } };
// Other team members see it read-only.
export const Member: Story = { parameters: { identity: IDENTITIES.member } };
export const Loading: Story = {
  parameters: {
    data: { "/teams/t-core": LOADING, "/teams/t-core/members": LOADING },
  },
};
