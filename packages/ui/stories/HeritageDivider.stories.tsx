import type { Meta, StoryObj } from "@storybook/react-vite";

import { HeritageDivider } from "../src/components/HeritageDivider";

/**
 * HeritageDivider (SPEC-foundation §4.12): the decorative tileable motif band.
 * Allowed only on auth screens, EmptyState, loading screens, and settings-class
 * section dividers; never behind data; off patient-facing portal until JP
 * sign-off (Q6).
 */
const meta = {
  title: "Components/HeritageDivider",
  component: HeritageDivider,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof HeritageDivider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Moldovan: Story = { args: { variant: "moldovan" } };
export const Azulejo: Story = { args: { variant: "azulejo" } };

/** Tiling check: each variant at 3 widths — the motif repeats seamlessly. */
export const TilingWidths: Story = {
  args: { variant: "azulejo" },
  render: () => (
    <div className="flex flex-col gap-6">
      {(["moldovan", "azulejo"] as const).map((variant) => (
        <div key={variant} className="flex flex-col gap-2">
          <span className="text-xs font-medium text-text-secondary">{variant}</span>
          <div style={{ width: 160 }}>
            <HeritageDivider variant={variant} className="my-2" />
          </div>
          <div style={{ width: 240 }}>
            <HeritageDivider variant={variant} className="my-2" />
          </div>
          <div style={{ width: 320 }}>
            <HeritageDivider variant={variant} className="my-2" />
          </div>
        </div>
      ))}
    </div>
  ),
};

/** As an auth-screen / settings-section divider (an allowed host). */
export const AsSectionDivider: Story = {
  args: { variant: "azulejo" },
  render: () => (
    <div className="mx-auto max-w-sm text-center">
      <h2 className="text-2xl text-text-primary">OsteoJP</h2>
      <HeritageDivider variant="azulejo" />
      <p className="text-sm text-text-secondary">Inicie sessão para continuar.</p>
    </div>
  ),
};
