import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { DEFAULT_TESTING_CONTEXT, EvaluatePanel } from "./evaluate-panel";

// "Evaluate" hits the canned `custom` response in .storybook/preview.tsx.
const meta = {
  title: "Flags/EvaluatePanel",
  component: EvaluatePanel,
  tags: ["autodocs"],
  args: {
    flagId: "new-checkout",
    isDirty: false,
    saving: false,
    saveAndThen: fn((cb: () => void) => cb()),
    defaultContext: DEFAULT_TESTING_CONTEXT,
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EvaluatePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Clean: Story = {};
// Running asks to save first, since evaluation only sees the saved flag.
export const UnsavedChanges: Story = { args: { isDirty: true } };
export const Saving: Story = { args: { saving: true } };
