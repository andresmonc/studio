import type { Meta, StoryObj } from "@storybook/react-vite";

import { IDENTITIES } from "../../../.storybook/fixtures";
import { CompanyPage } from "./page";

const meta = {
  title: "Pages/Company/CompanyPage",
  component: CompanyPage,
  tags: ["autodocs"],
  parameters: {
    identity: IDENTITIES.companyAdmin,
    route: { path: "/company/*", url: "/company" },
  },
} satisfies Meta<typeof CompanyPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Details: Story = { args: { section: "details" } };
export const Members: Story = { args: { section: "members" } };
export const Teams: Story = { args: { section: "teams" } };
