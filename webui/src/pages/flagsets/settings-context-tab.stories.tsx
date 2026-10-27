import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { FLAGSETS } from "../../../.storybook/fixtures";
import { ContextTab } from "./settings-context-tab";

const meta = {
  title: "Pages/Flagsets/ContextTab",
  component: ContextTab,
  tags: ["autodocs"],
  args: { flagset: FLAGSETS[0], canWrite: true, onSaved: fn() },
} satisfies Meta<typeof ContextTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Editor: Story = {};
export const ReadOnly: Story = { args: { canWrite: false } };
export const NoEnrichment: Story = { args: { flagset: FLAGSETS[1] } };
