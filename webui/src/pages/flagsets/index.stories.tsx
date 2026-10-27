import type { Meta, StoryObj } from "@storybook/react-vite";

import { IDENTITIES, LOADING } from "../../../.storybook/fixtures";
import { FlagsetsPage } from "./index";

const meta = {
  title: "Pages/Flagsets/FlagsetsPage",
  component: FlagsetsPage,
  tags: ["autodocs"],
  parameters: {
    identity: IDENTITIES.member,
    route: { path: "/flagsets", url: "/flagsets" },
  },
} satisfies Meta<typeof FlagsetsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

// Editors create flagsets; only team admins get the delete menu.
export const Editor: Story = {};
export const Admin: Story = { parameters: { identity: IDENTITIES.teamAdmin } };
export const Viewer: Story = { parameters: { identity: IDENTITIES.viewer } };
export const Empty: Story = {
  parameters: { data: { "/teams/t-core/flagsets": [] } },
};
export const Loading: Story = {
  parameters: { data: { "/teams/t-core/flagsets": LOADING } },
};
export const NoTeam: Story = {
  parameters: { identity: IDENTITIES.companyAdmin },
};
