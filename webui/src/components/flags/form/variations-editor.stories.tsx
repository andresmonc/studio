import { useTranslate } from "@refinedev/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import type { FlagType } from "@/types/api";

import { nextId, variationsForType } from "./flag-form-helpers";
import type { Variation } from "./flag-form-types";
import { VariationsEditor } from "./variations-editor";

function StatefulVariationsEditor({
  type,
  initial,
}: {
  type: FlagType;
  initial?: Variation[];
}) {
  const t = useTranslate();
  const [variations, setVariations] = useState(
    () => initial ?? variationsForType(type),
  );
  return (
    <VariationsEditor
      t={t}
      type={type}
      variations={variations}
      setVariations={setVariations}
    />
  );
}

const meta = {
  title: "Flags/VariationsEditor",
  component: StatefulVariationsEditor,
  tags: ["autodocs"],
  argTypes: {
    type: {
      control: "select",
      options: ["boolean", "string", "int", "float", "json"],
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatefulVariationsEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BooleanFlag: Story = { args: { type: "boolean" } };
export const StringFlag: Story = {
  args: {
    type: "string",
    initial: [
      { id: nextId(), name: "control", value: "blue" },
      { id: nextId(), name: "treatment", value: "green" },
    ],
  },
};
export const JsonFlag: Story = {
  args: {
    type: "json",
    initial: [
      { id: nextId(), name: "v1", value: '{"limit": 10}' },
      { id: nextId(), name: "v2", value: '{"limit": 50}' },
    ],
  },
};
export const InvalidValues: Story = {
  args: {
    type: "int",
    initial: [
      { id: nextId(), name: "low", value: "1.5" },
      { id: nextId(), name: "high", value: "" },
    ],
  },
};
