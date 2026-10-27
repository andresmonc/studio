import type { Meta, StoryObj } from "@storybook/react-vite";

import { AUDIT_ENTRIES } from "../../../.storybook/fixtures";
import { ActorAvatar } from "./actor-avatar";

const meta = {
  title: "Pages/AuditLog/ActorAvatar",
  component: ActorAvatar,
  tags: ["autodocs"],
  args: { e: AUDIT_ENTRIES[0] },
} satisfies Meta<typeof ActorAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const User: Story = {};
export const OtherUser: Story = { args: { e: AUDIT_ENTRIES[2] } };
// Events with no actor (background jobs) render a neutral "SY".
export const System: Story = { args: { e: AUDIT_ENTRIES[7] } };
