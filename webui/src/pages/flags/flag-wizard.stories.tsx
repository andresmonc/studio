import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, screen, userEvent } from "storybook/test";

import { FLAGSETS } from "../../../.storybook/fixtures";
import { FlagWizard } from "./flag-wizard";

const meta = {
  title: "Pages/Flags/FlagWizard",
  component: FlagWizard,
  tags: ["autodocs"],
  args: {
    teamId: "t-core",
    onCreated: fn(),
    tagSuggestions: ["checkout", "experiment", "mobile"],
  },
} satisfies Meta<typeof FlagWizard>;

export default meta;
type Story = StoryObj<typeof meta>;

// Just the "New flag" trigger, as it sits in the flags list header.
export const Closed: Story = {};
export const Basics: Story = { args: { autoOpen: true } };

// Fills the basics and continues to the targeting step.
export const Rules: Story = {
  args: { autoOpen: true },
  play: async () => {
    // The flagset select comes before the tag input, also a combobox.
    await userEvent.click((await screen.findAllByRole("combobox"))[0]);
    await userEvent.click(
      await screen.findByRole("option", { name: FLAGSETS[0].name }),
    );
    await userEvent.type(
      screen.getByPlaceholderText("checkout-progress-banner"),
      "checkout-redesign",
    );
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
  },
};
