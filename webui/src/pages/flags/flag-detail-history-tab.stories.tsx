import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { FLAG, LOADING } from "../../../.storybook/fixtures";
import { i18nProvider } from "@/providers/i18n";
import { HistoryTab } from "./flag-detail-history-tab";

const meta = {
  title: "Pages/Flags/HistoryTab",
  component: HistoryTab,
  tags: ["autodocs"],
  args: {
    t: i18nProvider.translate,
    flagId: FLAG.id,
    currentVersion: FLAG.currentVersion ?? undefined,
    canEdit: true,
    onReverted: fn(),
  },
} satisfies Meta<typeof HistoryTab>;

export default meta;
type Story = StoryObj<typeof meta>;

// Editors can revert to any version but the current one.
export const Editor: Story = {};
export const Viewer: Story = { args: { canEdit: false } };
export const Empty: Story = {
  parameters: {
    data: { "/versions": { data: [], total: 0, page: 1, pageSize: 50, totalPages: 0 } },
  },
};
export const Loading: Story = { parameters: { data: { "/versions": LOADING } } };
