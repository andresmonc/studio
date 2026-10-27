import type { Meta, StoryObj } from "@storybook/react-vite";

import { IDENTITIES, LOADING } from "../../../.storybook/fixtures";
import { CompanyDetailsCard } from "./details";

const meta = {
  title: "Pages/Company/DetailsCard",
  component: CompanyDetailsCard,
  tags: ["autodocs"],
  args: { companyId: "acme" },
  parameters: { identity: IDENTITIES.companyAdmin },
} satisfies Meta<typeof CompanyDetailsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};
export const Loading: Story = {
  parameters: { data: { "/companies/acme": LOADING } },
};
