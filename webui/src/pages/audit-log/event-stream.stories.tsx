import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { AUDIT_ENTRIES, FLAGSETS } from "../../../.storybook/fixtures";
import { i18nProvider } from "@/providers/i18n";
import type { AuditEntry } from "@/types/api";
import { EventStream } from "./event-stream";

const NAMES = new Map<string, string>([
  ...FLAGSETS.map((fs) => [fs.id, fs.name] as const),
  ["f-checkout", "checkout-redesign"],
  ["f-search", "search-v2"],
  ["f-onboarding", "new-onboarding"],
  ["f-pricing", "pricing-page-v3"],
  ["f-legacy", "legacy-banner"],
]);

const meta = {
  title: "Pages/AuditLog/EventStream",
  component: EventStream,
  tags: ["autodocs"],
  args: {
    groups: [
      { label: "Today", items: AUDIT_ENTRIES.slice(0, 4) },
      { label: "Yesterday", items: AUDIT_ENTRIES.slice(4) },
    ],
    selectedId: AUDIT_ENTRIES[0].id,
    onSelect: fn(),
    // Same lookup as the page: key events read their label from the snapshot.
    resolveTarget: (e: AuditEntry) =>
      (e.targetType === "api_key" &&
        (e.after as { label?: string } | undefined)?.label) ||
      NAMES.get(e.targetId) ||
      e.targetId,
    nameById: NAMES,
    loading: false,
    isEmpty: false,
    canLoadMore: true,
    isFetching: false,
    onLoadMore: fn(),
    t: i18nProvider.translate,
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EventStream>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};
export const FetchingMore: Story = { args: { isFetching: true } };
export const Loading: Story = {
  args: { groups: [], loading: true, canLoadMore: false },
};
export const Empty: Story = {
  args: { groups: [], isEmpty: true, canLoadMore: false },
};
