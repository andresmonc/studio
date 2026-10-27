import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { FLAGSETS } from "../../../.storybook/fixtures";
import { SettingsTab } from "./settings-testing-context-tab";

const meta = {
  title: "Pages/Flagsets/TestingContextTab",
  component: SettingsTab,
  tags: ["autodocs"],
  args: { flagset: FLAGSETS[0], canWrite: true, onSaved: fn() },
} satisfies Meta<typeof SettingsTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Editor: Story = {};
export const ReadOnly: Story = { args: { canWrite: false } };
// Unset: seeded from the shared default context.
export const Default: Story = { args: { flagset: FLAGSETS[1] } };
