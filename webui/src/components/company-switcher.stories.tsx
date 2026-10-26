import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";

import { IDENTITIES } from "../../.storybook/fixtures";
import { CompanySwitcher } from "./company-switcher";

const meta = {
  title: "App/CompanySwitcher",
  component: CompanySwitcher,
  tags: ["autodocs"],
  parameters: { identity: IDENTITIES.superAdmin },
  // The menu is end-aligned (it sits in the header's right corner).
  decorators: [
    (Story) => (
      <div className="flex w-96 justify-end">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CompanySwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SuperAdmin: Story = {};
export const SuperAdminMenuOpen: Story = {
  play: async ({ canvasElement }) => {
    const trigger = await within(canvasElement).findByRole("button");
    await userEvent.click(trigger);
  },
};

// Only super admins can switch companies: renders nothing for anyone else.
export const CompanyAdmin: Story = {
  parameters: { identity: IDENTITIES.companyAdmin },
};
