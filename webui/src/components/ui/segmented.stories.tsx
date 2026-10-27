import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Segmented } from "./segmented";

const meta = {
  title: "UI/Segmented",
  component: Segmented,
  tags: ["autodocs"],
} satisfies Meta<typeof Segmented>;

export default meta;
type Story = StoryObj<typeof Segmented>;

const LANGUAGES = [
  { value: "go", label: "Go" },
  { value: "js", label: "JavaScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
];

function Controlled({ fullWidth, disabled }: { fullWidth?: boolean; disabled?: boolean }) {
  const [value, setValue] = useState("go");
  return (
    <Segmented
      className={fullWidth ? "w-96" : undefined}
      value={value}
      onChange={setValue}
      options={LANGUAGES}
      disabled={disabled}
    />
  );
}

export const Default: Story = { render: () => <Controlled /> };

export const FullWidth: Story = { render: () => <Controlled fullWidth /> };

export const Disabled: Story = { render: () => <Controlled disabled /> };
