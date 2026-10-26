import { useTranslate } from "@refinedev/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { isoToLocalInput, newOutcome } from "./flag-form-helpers";
import type { Outcome } from "./flag-form-types";
import { OutcomeEditor } from "./outcome-editor";

const VARIATIONS = ["enabled", "disabled"];

const daysFromNow = (days: number) =>
  isoToLocalInput(new Date(Date.now() + days * 86_400_000).toISOString());

function StatefulOutcomeEditor({
  initial,
  disabled,
}: {
  initial: Outcome;
  disabled?: boolean;
}) {
  const t = useTranslate();
  const [outcome, setOutcome] = useState(initial);
  return (
    <OutcomeEditor
      t={t}
      variationNames={VARIATIONS}
      outcome={outcome}
      onChange={setOutcome}
      disabled={disabled}
    />
  );
}

const meta = {
  title: "Flags/OutcomeEditor",
  component: StatefulOutcomeEditor,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatefulOutcomeEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = { args: { initial: newOutcome("enabled") } };
export const Percentage: Story = {
  args: {
    initial: {
      ...newOutcome(),
      mode: "percentage",
      percentages: { enabled: 20, disabled: 80 },
    },
  },
};
export const PercentageNotSummingTo100: Story = {
  args: {
    initial: {
      ...newOutcome(),
      mode: "percentage",
      percentages: { enabled: 60, disabled: 20 },
    },
  },
};
export const Progressive: Story = {
  args: {
    initial: {
      ...newOutcome(),
      mode: "progressive",
      prog: {
        initialVariation: "disabled",
        endVariation: "enabled",
        initialPct: 0,
        endPct: 100,
        startDate: daysFromNow(-1),
        endDate: daysFromNow(6),
      },
    },
  },
};
export const Disabled: Story = {
  args: { initial: newOutcome("enabled"), disabled: true },
};
