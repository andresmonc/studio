import type { Meta, StoryObj } from "@storybook/react-vite";

import { DistributionBar } from "./distribution-bar";
import { RuleDisplay } from "./rule-display";
import { VariationPill } from "./variation-pill";

const meta = {
  title: "Flags/RuleDisplay",
  component: RuleDisplay,
  tags: ["autodocs"],
  args: {
    index: 0,
    name: "Beta users",
    query: JSON.stringify({
      and: [
        { "==": [{ var: "targetingKey" }, "beta-user"] },
        { in: [{ var: "country" }, ["FR", "DE"]] },
      ],
    }),
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RuleDisplay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const JsonLogicQuery: Story = {};
// Queries that aren't JSON-logic (hand-written nikunjy/rules) are shown verbatim.
export const RawQuery: Story = {
  args: { query: 'email ew "@example.com"' },
};
export const EmptyQuery: Story = { args: { name: undefined, query: "" } };

export const ServeVariation: Story = {
  args: {
    children: <VariationPill name="enabled" index={0} />,
  },
};
export const ServeSplit: Story = {
  args: {
    children: (
      <DistributionBar
        className="w-48"
        variations={["enabled", "disabled"]}
        percentages={{ enabled: 20, disabled: 80 }}
      />
    ),
  },
};
