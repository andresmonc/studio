import type { Meta, StoryObj } from "@storybook/react-vite";

import { IDENTITIES } from "../../../.storybook/fixtures";
import { OnboardingJoinPage } from "./join";

const meta = {
  title: "Pages/Onboarding/JoinPage",
  component: OnboardingJoinPage,
  tags: ["autodocs"],
  parameters: { identity: IDENTITIES.member },
} satisfies Meta<typeof OnboardingJoinPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
