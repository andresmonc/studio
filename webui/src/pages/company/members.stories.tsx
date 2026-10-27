import type { Meta, StoryObj } from "@storybook/react-vite";

import { IDENTITIES, LOADING } from "../../../.storybook/fixtures";
import { CompanyMembersCard } from "./members";

const meta = {
  title: "Pages/Company/MembersCard",
  component: CompanyMembersCard,
  tags: ["autodocs"],
  args: { companyId: "acme" },
  parameters: { identity: IDENTITIES.companyAdmin },
} satisfies Meta<typeof CompanyMembersCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};
export const Empty: Story = {
  parameters: { data: { "/companies/acme/members": [] } },
};
export const Loading: Story = {
  parameters: { data: { "/companies/acme/members": LOADING } },
};
