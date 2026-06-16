import type { Meta, StoryObj } from "@storybook/react-vite";

import { Banner } from "../src/components/Banner";

/** Banner (SPEC-foundation §4.9): a standing, full-width notice. */
const meta = {
  title: "Components/Banner",
  component: Banner,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: { children: "Há registos clínicos por rever.", tone: "info" },
  argTypes: {
    tone: {
      control: "inline-radio",
      options: ["success", "warning", "error", "info"],
    },
    dismissible: { control: "boolean" },
  },
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = { args: { tone: "info" } };
export const Warning: Story = {
  args: { tone: "warning", children: "Há marcações por confirmar para hoje." },
};
export const Error: Story = {
  args: { tone: "error", children: "A faturação está temporariamente indisponível." },
};
export const Dismissible: Story = {
  args: { tone: "info", dismissible: true, onDismiss: () => {} },
};

export const WithAction: Story = {
  args: {
    tone: "warning",
    children: "Há registos clínicos por rever.",
    action: (
      <a href="#review" className="text-sm font-semibold text-accent-2-700 hover:underline">
        Rever
      </a>
    ),
  },
};

/**
 * Single-instance rule (enforced by screens, not the component): only one banner
 * shows per screen; further pending notices collapse into a count via `count`.
 * Never render two banners stacked.
 */
export const CollapsedCount: Story = {
  args: {
    tone: "warning",
    children: "Há registos clínicos por rever.",
    count: 4,
    action: (
      <a href="#review" className="text-sm font-semibold text-accent-2-700 hover:underline">
        Rever
      </a>
    ),
  },
};
