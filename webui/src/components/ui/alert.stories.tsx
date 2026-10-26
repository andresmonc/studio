import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlertCircleIcon, CheckCircle2Icon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "./alert";

const meta = {
  title: "UI/Alert",
  component: Alert,
  tags: ["autodocs"],
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Alert className="w-96">
      <CheckCircle2Icon />
      <AlertTitle>Flag saved</AlertTitle>
      <AlertDescription>
        Your changes have been published to the development environment.
      </AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive" className="w-96">
      <AlertCircleIcon />
      <AlertTitle>Unable to save flag</AlertTitle>
      <AlertDescription>
        The targeting rule references an unknown segment. Fix it and try again.
      </AlertDescription>
    </Alert>
  ),
};

export const TitleOnly: Story = {
  render: () => (
    <Alert className="w-96">
      <AlertCircleIcon />
      <AlertTitle>This environment is read-only.</AlertTitle>
    </Alert>
  ),
};
