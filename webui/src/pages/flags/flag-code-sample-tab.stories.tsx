import type { Meta, StoryObj } from "@storybook/react-vite";

import { FAILED, FLAG } from "../../../.storybook/fixtures";
import { FlagCodeSampleTab } from "./flag-code-sample-tab";

const meta = {
  title: "Pages/Flags/FlagCodeSampleTab",
  component: FlagCodeSampleTab,
  tags: ["autodocs"],
  args: { flag: FLAG, canReadKeys: true },
} satisfies Meta<typeof FlagCodeSampleTab>;

export default meta;
type Story = StoryObj<typeof meta>;

// The sample embeds the flagset's first API key.
export const Editor: Story = {};
// The snippet evaluates the flag's own type.
export const StringFlag: Story = {
  args: {
    flag: {
      ...FLAG,
      name: "checkout-layout",
      payload: {
        variations: { compact: "compact", full: "full" },
        defaultRule: { variation: "full" },
      },
    },
  },
};
// Viewers can't list keys (403), so the sample keeps the key placeholder.
export const Viewer: Story = { args: { canReadKeys: false } };
export const NoKeys: Story = { parameters: { data: { "/api-keys": [] } } };
export const KeysFetchFailed: Story = {
  parameters: { data: { "/api-keys": FAILED } },
};
