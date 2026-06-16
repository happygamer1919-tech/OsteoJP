import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Skeleton,
  SkeletonTable,
  SkeletonText,
} from "../src/components/Skeleton";

/** Skeleton (SPEC-foundation §4.10): loading placeholders that mirror layout. */
const meta = {
  title: "Components/Skeleton",
  component: Skeleton,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Block: Story = { args: { variant: "block", className: "h-24 w-full" } };
export const TextLine: Story = { args: { variant: "text", className: "w-48" } };
export const Circle: Story = { args: { variant: "circle", className: "size-12" } };

export const Text: Story = {
  render: () => (
    <div className="max-w-md">
      <SkeletonText lines={4} />
    </div>
  ),
};

export const TableSkeleton: Story = {
  render: () => (
    <div className="max-w-2xl">
      <SkeletonTable rows={5} cols={4} />
    </div>
  ),
};

/** Mirrors a real card: avatar circle + two text lines. */
export const CardComposition: Story = {
  render: () => (
    <div className="flex max-w-sm items-center gap-4 rounded-lg border border-border bg-surface p-6">
      <Skeleton variant="circle" className="size-12 shrink-0" />
      <div className="flex-1">
        <SkeletonText lines={2} />
      </div>
    </div>
  ),
};
