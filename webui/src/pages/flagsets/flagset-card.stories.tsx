import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";

import { FLAGSETS } from "../../../.storybook/fixtures";
import { FlagsetCard } from "./flagset-card";

const meta = {
  title: "Pages/Flagsets/FlagsetCard",
  component: FlagsetCard,
  tags: ["autodocs"],
  args: { fs: FLAGSETS[0], editable: true, onDelete: fn() },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FlagsetCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Editor: Story = {};
// Viewers get no actions menu.
export const Viewer: Story = { args: { editable: false } };
export const NoFlags: Story = { args: { fs: FLAGSETS[2] } };
export const MenuOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: "Actions" }),
    );
  },
};
