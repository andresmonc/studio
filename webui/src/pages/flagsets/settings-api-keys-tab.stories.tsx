import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";

import { LOADING } from "../../../.storybook/fixtures";
import { ApiKeysTab } from "./settings-api-keys-tab";

const meta = {
  title: "Pages/Flagsets/ApiKeysTab",
  component: ApiKeysTab,
  tags: ["autodocs"],
  args: { flagsetId: "fs-web", canManage: true },
} satisfies Meta<typeof ApiKeysTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Admin: Story = {};
// Non-admins see the keys read-only, with a warning.
export const ReadOnly: Story = { args: { canManage: false } };
export const Empty: Story = { parameters: { data: { "/api-keys": [] } } };
export const Loading: Story = { parameters: { data: { "/api-keys": LOADING } } };
export const GenerateDialog: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: /generate key/i }),
    );
  },
};
