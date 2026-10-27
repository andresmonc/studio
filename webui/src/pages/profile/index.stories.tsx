import type { Meta, StoryObj } from "@storybook/react-vite";

import { IDENTITIES } from "../../../.storybook/fixtures";
import { ProfilePage } from "./index";

const meta = {
  title: "Pages/Profile/ProfilePage",
  component: ProfilePage,
  tags: ["autodocs"],
  parameters: { identity: IDENTITIES.member },
} satisfies Meta<typeof ProfilePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Member: Story = {};
export const SuperAdmin: Story = {
  parameters: { identity: IDENTITIES.superAdmin },
};
// No identity yet.
export const Loading: Story = { parameters: { identity: null } };
