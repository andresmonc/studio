import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

const meta = {
  title: "UI/Table",
  component: Table,
  tags: ["autodocs"],
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

const flags = [
  { name: "new-checkout", env: "production", status: "Enabled" },
  { name: "dark-mode", env: "staging", status: "Disabled" },
  { name: "beta-banner", env: "development", status: "Enabled" },
];

export const Default: Story = {
  render: () => (
    <Table className="w-[480px]">
      <TableHeader>
        <TableRow>
          <TableHead>Flag</TableHead>
          <TableHead>Environment</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {flags.map((flag) => (
          <TableRow key={flag.name}>
            <TableCell className="font-medium">{flag.name}</TableCell>
            <TableCell>{flag.env}</TableCell>
            <TableCell className="text-right">{flag.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};

export const WithCaptionAndFooter: Story = {
  render: () => (
    <Table className="w-[480px]">
      <TableCaption>Flags evaluated in the last 24 hours.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Flag</TableHead>
          <TableHead className="text-right">Evaluations</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">new-checkout</TableCell>
          <TableCell className="text-right">12,430</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">dark-mode</TableCell>
          <TableCell className="text-right">8,102</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell className="text-right">20,532</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
};
