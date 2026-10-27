import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";

import { TagFilter } from "./tag-filter";

const TAGS = ["checkout", "experiment", "mobile", "q4-launch", "search"];

function StatefulTagFilter({
  allTags,
  initial = [],
}: {
  allTags: string[];
  initial?: string[];
}) {
  const [selected, setSelected] = useState(initial);
  return (
    <TagFilter
      allTags={allTags}
      selected={selected}
      onToggle={(tag) =>
        setSelected((s) =>
          s.includes(tag) ? s.filter((x) => x !== tag) : [...s, tag],
        )
      }
    />
  );
}

const open: Story["play"] = async ({ canvasElement }) => {
  await userEvent.click(await within(canvasElement).findByRole("combobox"));
};

const meta = {
  title: "Pages/Flags/TagFilter",
  component: StatefulTagFilter,
  tags: ["autodocs"],
  args: { allTags: TAGS },
} satisfies Meta<typeof StatefulTagFilter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithSelection: Story = { args: { initial: ["q4-launch", "mobile"] } };
// Selected tags sort to the top of the open list.
export const OpenWithSelection: Story = {
  args: { initial: ["q4-launch", "mobile"] },
  play: open,
};
export const OpenNoTags: Story = { args: { allTags: [] }, play: open };
