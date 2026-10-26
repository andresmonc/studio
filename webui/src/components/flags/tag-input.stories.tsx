import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { TagInput, type TagInputProps } from "./tag-input";

const SUGGESTIONS = ["checkout", "experiment", "frontend", "ops", "payments"];

// TagInput is controlled; keep the value in local state so the story is interactive.
function StatefulTagInput(props: TagInputProps) {
  const [value, setValue] = useState(props.value);
  return <TagInput {...props} value={value} onChange={setValue} />;
}

const meta = {
  title: "Flags/TagInput",
  component: TagInput,
  tags: ["autodocs"],
  render: (args) => <StatefulTagInput {...args} />,
  args: {
    value: [],
    onChange: () => {},
    suggestions: SUGGESTIONS,
    placeholder: "Add a tag…",
    "aria-label": "Tags",
  },
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TagInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Filled: Story = { args: { value: ["checkout", "experiment"] } };
export const ReadOnly: Story = {
  args: { value: ["checkout", "experiment"], readOnly: true },
};
export const AtMaxTags: Story = {
  args: { value: ["checkout", "experiment", "ops"], maxTags: 3 },
};
