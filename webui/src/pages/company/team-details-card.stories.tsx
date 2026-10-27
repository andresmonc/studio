import type { Meta, StoryObj } from "@storybook/react-vite";

import { LOADING } from "../../../.storybook/fixtures";
import { TeamDetailsCard } from "./team-details-card";

const meta = {
  title: "Pages/Company/TeamDetailsCard",
  component: TeamDetailsCard,
  tags: ["autodocs"],
  args: { teamId: "t-core", editable: true },
} satisfies Meta<typeof TeamDetailsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Editable: Story = {};
export const ReadOnly: Story = { args: { editable: false } };
export const Loading: Story = {
  parameters: { data: { "/teams/t-core": LOADING } },
};
