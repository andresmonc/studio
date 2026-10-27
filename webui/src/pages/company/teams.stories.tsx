import type { Meta, StoryObj } from "@storybook/react-vite";

import { IDENTITIES, LOADING } from "../../../.storybook/fixtures";
import { CompanyTeamsCard } from "./teams";

const meta = {
  title: "Pages/Company/TeamsCard",
  component: CompanyTeamsCard,
  tags: ["autodocs"],
  args: { companyId: "acme" },
  parameters: { identity: IDENTITIES.companyAdmin },
} satisfies Meta<typeof CompanyTeamsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};
export const Empty: Story = {
  parameters: { data: { "/companies/acme/teams": [] } },
};
export const Loading: Story = {
  parameters: { data: { "/companies/acme/teams": LOADING } },
};
