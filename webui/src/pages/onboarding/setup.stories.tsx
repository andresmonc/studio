import type { Meta, StoryObj } from "@storybook/react-vite";

import { IDENTITIES } from "../../../.storybook/fixtures";
import { OnboardingSetupPage } from "./setup";

const meta = {
  title: "Pages/Onboarding/SetupPage",
  component: OnboardingSetupPage,
  tags: ["autodocs"],
  parameters: { identity: IDENTITIES.superAdmin },
} satisfies Meta<typeof OnboardingSetupPage>;

export default meta;
type Story = StoryObj<typeof meta>;

// The company form, before setup runs (setup itself calls the API directly).
export const Default: Story = {};
