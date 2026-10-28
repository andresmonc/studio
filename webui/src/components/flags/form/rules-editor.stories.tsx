import { useTranslate } from "@refinedev/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { EMPTY_QUERY, newOutcome, nextId } from "./flag-form-helpers";
import type { Rule } from "./flag-form-types";
import { RulesEditor } from "./rules-editor";

const VARIATIONS = ["enabled", "disabled"];

function StatefulRulesEditor({
  initial,
  disabled,
}: {
  initial: Rule[];
  disabled?: boolean;
}) {
  const t = useTranslate();
  const [rules, setRules] = useState(initial);
  const [defaultOutcome, setDefaultOutcome] = useState(() =>
    newOutcome("disabled"),
  );
  return (
    <RulesEditor
      t={t}
      variationNames={VARIATIONS}
      rules={rules}
      setRules={setRules}
      defaultOutcome={defaultOutcome}
      setDefaultOutcome={setDefaultOutcome}
      disabled={disabled}
    />
  );
}

const TWO_RULES: Rule[] = [
  {
    id: nextId(),
    name: "Beta users",
    query: {
      combinator: "and",
      rules: [{ field: "targetingKey", operator: "=", value: "beta-user" }],
    },
    outcome: newOutcome("enabled"),
  },
  {
    id: nextId(),
    name: "Europe canary",
    query: {
      combinator: "and",
      rules: [{ field: "country", operator: "in", value: "FR,DE" }],
    },
    outcome: {
      ...newOutcome(),
      mode: "percentage",
      percentages: { enabled: 10, disabled: 90 },
    },
  },
];

const meta = {
  title: "Flags/RulesEditor",
  component: StatefulRulesEditor,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatefulRulesEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoRules: Story = { args: { initial: [] } };
export const TwoRules: Story = { args: { initial: TWO_RULES } };
export const EmptyRule: Story = {
  args: {
    initial: [
      {
        id: nextId(),
        name: "Rule 1",
        query: EMPTY_QUERY,
        outcome: newOutcome(),
      },
    ],
  },
};
export const Disabled: Story = { args: { initial: TWO_RULES, disabled: true } };
