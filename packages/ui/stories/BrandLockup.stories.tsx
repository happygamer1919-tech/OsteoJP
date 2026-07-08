import type { Meta, StoryObj } from "@storybook/react-vite";

import { BrandLockup, type BrandLockupSize } from "../src/brand/BrandLockup";

const meta = {
  title: "Brand/BrandLockup",
  component: BrandLockup,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "inline-radio",
      options: ["full", "lockup", "mark"],
    },
    size: {
      control: "inline-radio",
      options: ["sm", "md", "lg", "xl"],
    },
    title: { control: "text" },
  },
} satisfies Meta<typeof BrandLockup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Lockup: Story = {
  args: { variant: "lockup", size: "md" },
};

export const Full: Story = {
  args: { variant: "full", size: "lg" },
};

export const Mark: Story = {
  args: { variant: "mark", size: "md" },
};

const SIZES: BrandLockupSize[] = ["sm", "md", "lg", "xl"];
const VARIANTS = ["full", "lockup", "mark"] as const;

/**
 * Every variant at every size, in one view. Also exercises the clipPath-id
 * namespacing: all three variants share their source ids, so rendering them
 * together would corrupt the art if the ids were not namespaced per variant.
 */
export const AllVariantsAndSizes: Story = {
  args: { variant: "lockup", size: "md" },
  render: () => (
    <div style={{ display: "grid", gap: 32 }}>
      {VARIANTS.map((variant) => (
        <div key={variant} style={{ display: "grid", gap: 12 }}>
          <strong style={{ fontFamily: "system-ui", fontSize: 12 }}>{variant}</strong>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 24 }}>
            {SIZES.map((size) => (
              <div key={size} style={{ display: "grid", gap: 4, justifyItems: "center" }}>
                <BrandLockup variant={variant} size={size} />
                <span style={{ fontFamily: "system-ui", fontSize: 11, opacity: 0.6 }}>
                  {size}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
};
