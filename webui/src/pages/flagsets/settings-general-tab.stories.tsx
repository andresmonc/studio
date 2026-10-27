import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { FLAGSETS } from "../../../.storybook/fixtures";
import { GeneralTab } from "./settings-general-tab";

const meta = {
  title: "Pages/Flagsets/GeneralTab",
  component: GeneralTab,
  tags: ["autodocs"],
  args: { flagset: FLAGSETS[0], canWrite: true, onSaved: fn() },
} satisfies Meta<typeof GeneralTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Editor: Story = {};
export const ReadOnly: Story = { args: { canWrite: false } };
