import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";

import { FLAGSETS } from "../../../.storybook/fixtures";
import { DangerTab } from "./settings-danger-tab";

const meta = {
  title: "Pages/Flagsets/SettingsDangerTab",
  component: DangerTab,
  tags: ["autodocs"],
  args: { flagset: FLAGSETS[0] },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DangerTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const ConfirmOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button"));
  },
};
