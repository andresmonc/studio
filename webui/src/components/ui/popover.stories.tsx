import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

const meta = {
  title: "UI/Popover",
  component: Popover,
  tags: ["autodocs"],
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Open popover</Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h4 className="text-sm font-semibold">Dimensions</h4>
            <p className="text-muted-foreground text-sm">
              Set the dimensions for the layer.
            </p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm" htmlFor="width">
              Width
            </label>
            <input
              id="width"
              defaultValue="100%"
              className="border-input h-8 w-32 rounded-md border px-2 text-sm"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm" htmlFor="height">
              Height
            </label>
            <input
              id="height"
              defaultValue="25px"
              className="border-input h-8 w-32 rounded-md border px-2 text-sm"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

export const DefaultOpen: Story = {
  render: () => (
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline">Open popover</Button>
      </PopoverTrigger>
      <PopoverContent>
        Opens on load so the content is visible in the docs canvas.
      </PopoverContent>
    </Popover>
  ),
};
