import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { FLAGSETS } from "../../../.storybook/fixtures";
import { i18nProvider } from "@/providers/i18n";
import { AuditFilters } from "./audit-filters";
import { ALL } from "./vocabulary";

const meta = {
  title: "Pages/AuditLog/AuditFilters",
  component: AuditFilters,
  tags: ["autodocs"],
  args: {
    search: "",
    scope: ALL,
    actor: ALL,
    flagset: ALL,
    range: ALL,
    setParam: fn(),
    actors: ["ada@acme.dev", "grace@acme.dev"],
    flagsets: FLAGSETS,
    dirty: false,
    clearFilters: fn(),
    t: i18nProvider.translate,
  },
} satisfies Meta<typeof AuditFilters>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
// Any active filter shows the Clear button.
export const Filtered: Story = {
  args: {
    search: "checkout",
    scope: "flags",
    actor: "ada@acme.dev",
    flagset: "fs-web",
    range: "7d",
    dirty: true,
  },
};
