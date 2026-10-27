import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";

import { IDENTITIES } from "../../../.storybook/fixtures";
import { CompanyCreatePage } from "./create";

const meta = {
  title: "Pages/Companies/CompanyCreatePage",
  component: CompanyCreatePage,
  tags: ["autodocs"],
  parameters: {
    identity: IDENTITIES.superAdmin,
    route: { path: "/companies/create", url: "/companies/create" },
  },
} satisfies Meta<typeof CompanyCreatePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
// Submitting the empty form shows the field errors.
export const Invalid: Story = {
  play: async ({ canvasElement }) => {
    const form = canvasElement.querySelector("form")!;
    await userEvent.click(within(form).getAllByRole("button").at(-1)!);
  },
};
