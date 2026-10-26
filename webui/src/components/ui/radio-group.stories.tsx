import type { Meta, StoryObj } from "@storybook/react-vite";

import { Label } from "./label";
import { RadioGroup, RadioGroupItem } from "./radio-group";

const meta = {
  title: "UI/RadioGroup",
  component: RadioGroup,
  tags: ["autodocs"],
  argTypes: {
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <RadioGroup {...args} defaultValue="comfortable">
      <Label className="gap-2">
        <RadioGroupItem value="default" id="r1" />
        Default
      </Label>
      <Label className="gap-2">
        <RadioGroupItem value="comfortable" id="r2" />
        Comfortable
      </Label>
      <Label className="gap-2">
        <RadioGroupItem value="compact" id="r3" />
        Compact
      </Label>
    </RadioGroup>
  ),
};

export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => (
    <RadioGroup {...args} defaultValue="one">
      <Label className="gap-2">
        <RadioGroupItem value="one" id="d1" />
        Option one
      </Label>
      <Label className="gap-2">
        <RadioGroupItem value="two" id="d2" />
        Option two
      </Label>
    </RadioGroup>
  ),
};
