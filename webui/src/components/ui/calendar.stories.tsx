import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import type { DateRange } from "react-day-picker";

import { Calendar } from "./calendar";

const meta = {
  title: "UI/Calendar",
  component: Calendar,
  tags: ["autodocs"],
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

function SingleCalendarExample() {
  const [date, setDate] = React.useState<Date | undefined>(new Date());

  return (
    <Calendar
      mode="single"
      selected={date}
      onSelect={setDate}
      className="rounded-md border w-fit"
    />
  );
}

function RangeCalendarExample() {
  const [range, setRange] = React.useState<DateRange | undefined>(() => {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 5);
    return { from, to };
  });

  return (
    <Calendar
      mode="range"
      selected={range}
      onSelect={setRange}
      numberOfMonths={2}
      className="rounded-md border w-fit"
    />
  );
}

export const Default: Story = {
  render: () => <SingleCalendarExample />,
};

export const Range: Story = {
  render: () => <RangeCalendarExample />,
};
