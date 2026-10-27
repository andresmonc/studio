import type { Meta, StoryObj } from "@storybook/react-vite";

import { IDENTITIES } from "../../../.storybook/fixtures";
import { OnboardingChoicePage } from "./choice";

const meta = {
  title: "Pages/Onboarding/ChoicePage",
  component: OnboardingChoicePage,
  tags: ["autodocs"],
  parameters: { identity: IDENTITIES.member },
} satisfies Meta<typeof OnboardingChoicePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
