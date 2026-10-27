import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";

import { IDENTITIES } from "../../../.storybook/fixtures";
import { OnboardingCreateCompanyPage } from "./create-company";

const meta = {
  title: "Pages/Onboarding/CreateCompanyPage",
  component: OnboardingCreateCompanyPage,
  tags: ["autodocs"],
  parameters: { identity: IDENTITIES.member },
} satisfies Meta<typeof OnboardingCreateCompanyPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
// Submitting without a name shows the field error.
export const Invalid: Story = {
  play: async ({ canvasElement }) => {
    const form = canvasElement.querySelector("form")!;
    await userEvent.click(within(form).getAllByRole("button").at(-1)!);
  },
};
