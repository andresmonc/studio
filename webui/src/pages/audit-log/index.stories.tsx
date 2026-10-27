import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  AUDIT_ENTRIES,
  IDENTITIES,
  LOADING,
  paginated,
} from "../../../.storybook/fixtures";
import { AuditLogPage } from "./index";

const AUDIT = "/audit?teamId=t-core&page=1&pageSize=50";

const meta = {
  title: "Pages/AuditLog/AuditLogPage",
  component: AuditLogPage,
  tags: ["autodocs"],
  parameters: {
    identity: IDENTITIES.member,
    route: { path: "/audit-log", url: "/audit-log" },
  },
} satisfies Meta<typeof AuditLogPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};
// Scope, actor and search filter the loaded events client-side.
export const Filtered: Story = {
  parameters: {
    route: { path: "/audit-log", url: "/audit-log?scope=flags&actor=ada%40acme.dev" },
  },
};
// More events on the server than loaded: "Load earlier events" shows.
export const MoreToLoad: Story = {
  parameters: {
    data: { [AUDIT]: { ...paginated(AUDIT_ENTRIES), total: 120, totalPages: 3 } },
  },
};
export const Empty: Story = { parameters: { data: { [AUDIT]: paginated([]) } } };
export const Loading: Story = { parameters: { data: { [AUDIT]: LOADING } } };
export const NoTeam: Story = {
  parameters: { identity: IDENTITIES.companyAdmin },
};
