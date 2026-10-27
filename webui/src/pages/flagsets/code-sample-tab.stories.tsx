import type { Meta, StoryObj } from "@storybook/react-vite";

import { FAILED } from "../../../.storybook/fixtures";
import { CodeSampleTab } from "./code-sample-tab";

const meta = {
  title: "Pages/Flagsets/CodeSampleTab",
  component: CodeSampleTab,
  tags: ["autodocs"],
  args: { flagsetId: "fs-web", canReadKeys: true },
} satisfies Meta<typeof CodeSampleTab>;

export default meta;
type Story = StoryObj<typeof meta>;

// The sample embeds the flagset's first API key.
export const Editor: Story = {};
// Viewers can't list keys (403), so the sample keeps the key placeholder.
export const Viewer: Story = { args: { canReadKeys: false } };
export const NoKeys: Story = { parameters: { data: { "/api-keys": [] } } };
export const KeysFetchFailed: Story = {
  parameters: { data: { "/api-keys": FAILED } },
};
