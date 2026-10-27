import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";

import { FAILED, IDENTITIES, LOADING } from "../../../.storybook/fixtures";
import { FlagDetailPage } from "./detail";

// Sections are local state, so a story opens one by clicking its nav button.
const openSection =
  (label: RegExp): Story["play"] =>
  async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: label }),
    );
  };

const meta = {
  title: "Pages/Flags/FlagDetailPage",
  component: FlagDetailPage,
  tags: ["autodocs"],
  parameters: {
    identity: IDENTITIES.member,
    route: { path: "/flags/:id", url: "/flags/f-checkout" },
  },
} satisfies Meta<typeof FlagDetailPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Targeting: Story = {};
export const Variations: Story = { play: openSection(/^Variations/) };
export const Metadata: Story = { play: openSection(/^Metadata/) };
export const Settings: Story = { play: openSection(/^Settings/) };
export const History: Story = { play: openSection(/^History/) };
export const Evaluate: Story = { play: openSection(/^Evaluate/) };
export const EvaluateResult: Story = {
  play: async (ctx) => {
    await openSection(/^Evaluate/)!(ctx);
    await userEvent.click(
      await within(ctx.canvasElement).findByRole("button", { name: /run evaluation/i }),
    );
  },
};
export const CodeSample: Story = { play: openSection(/^Code sample/) };

// Viewers get read-only cards instead of editors, and no Revert buttons.
export const ViewerTargeting: Story = {
  parameters: { identity: IDENTITIES.viewer },
};
export const ViewerSettings: Story = {
  parameters: { identity: IDENTITIES.viewer },
  play: openSection(/^Settings/),
};
export const ViewerHistory: Story = {
  parameters: { identity: IDENTITIES.viewer },
  play: openSection(/^History/),
};

export const Loading: Story = {
  parameters: { data: { "/flags/f-checkout": LOADING } },
};
export const NotFound: Story = {
  parameters: { data: { "/flags/f-checkout": FAILED } },
};
