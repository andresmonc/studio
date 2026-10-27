import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";

import { FLAGSETS } from "../../../.storybook/fixtures";
import { RESERVED_META_KEYS } from "@/components/flags/flag-form";
import { EnrichmentEditor } from "./enrichment-editor";

const meta = {
  title: "Pages/Flagsets/EnrichmentEditor",
  component: EnrichmentEditor,
  tags: ["autodocs"],
  args: {
    onChange: fn(),
    initial: {
      ...FLAGSETS[0].evaluationContextEnrichment,
      features: { beta: ["checkout"] },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EnrichmentEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithAttributes: Story = {};
export const Empty: Story = { args: { initial: null } };
export const ReadOnly: Story = { args: { readOnly: true } };
// Flag detail Metadata tab: no chrome, split int/float, no json, and the
// reserved keys (owner, description, tags) dropped because other UI edits them.
const flagMetadata = {
  initial: { owner: "ada@acme.dev", jira: "CHK-142", rolloutWave: 2, ratio: 0.25 },
  types: ["string", "float", "int", "boolean"],
  reservedKeys: RESERVED_META_KEYS,
  hideChrome: true,
} satisfies Story["args"];

export const FlagMetadata: Story = { args: flagMetadata };

// A value that doesn't parse for its type is flagged inline.
export const InvalidValue: Story = {
  play: async ({ canvasElement }) => {
    const input = await within(canvasElement).findByDisplayValue("2");
    await userEvent.clear(input);
    await userEvent.type(input, "two");
  },
};

// Typing a key that other UI owns is flagged inline.
export const ReservedKey: Story = {
  args: flagMetadata,
  play: async ({ canvasElement }) => {
    const input = await within(canvasElement).findByDisplayValue("jira");
    await userEvent.clear(input);
    await userEvent.type(input, "owner");
  },
};
