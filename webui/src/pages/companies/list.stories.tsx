import type { Meta, StoryObj } from "@storybook/react-vite";

import { IDENTITIES, LOADING } from "../../../.storybook/fixtures";
import { CompanyListPage } from "./list";

const meta = {
  title: "Pages/Companies/CompanyListPage",
  component: CompanyListPage,
  tags: ["autodocs"],
  parameters: {
    identity: IDENTITIES.superAdmin,
    route: { path: "/companies", url: "/companies" },
  },
} satisfies Meta<typeof CompanyListPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};
export const Empty: Story = { parameters: { data: { "/companies": [] } } };
export const Loading: Story = { parameters: { data: { "/companies": LOADING } } };
