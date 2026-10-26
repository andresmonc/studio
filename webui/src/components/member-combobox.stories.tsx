import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import type { CompanyMember } from "@/types/api";

import { MemberCombobox } from "./member-combobox";

const member = (name: string, email: string): CompanyMember => ({
  id: email,
  companyId: "acme",
  userId: email,
  email,
  name,
  role: "member",
});

const MEMBERS = [
  member("Ada Lovelace", "ada@acme.dev"),
  member("Grace Hopper", "grace@acme.dev"),
  member("Linus Torvalds", "linus@acme.dev"),
];

function StatefulMemberCombobox({
  members,
  initial = "",
}: {
  members: CompanyMember[];
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <MemberCombobox
      members={members}
      value={value}
      onChange={setValue}
      placeholder="Select a member…"
      searchPlaceholder="Search members…"
      emptyText="No member found."
      className="w-72"
    />
  );
}

const meta = {
  title: "App/MemberCombobox",
  component: StatefulMemberCombobox,
  tags: ["autodocs"],
  args: { members: MEMBERS },
} satisfies Meta<typeof StatefulMemberCombobox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Selected: Story = { args: { initial: "grace@acme.dev" } };
export const NoMembers: Story = { args: { members: [] } };
