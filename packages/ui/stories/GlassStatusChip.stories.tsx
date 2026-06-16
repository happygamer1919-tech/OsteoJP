import type { Meta, StoryObj } from "@storybook/react-vite";

import { GlassStatusChip } from "../src/components/GlassStatusChip";

/**
 * GlassStatusChip (SPEC-v2-foundation §9): glass restyle of the v1 StatusChip,
 * for record/review status. Five tones, optional dot, AA-dark labels.
 */
const meta = {
  title: "V2/GlassStatusChip",
  component: GlassStatusChip,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-v2-bg p-12 font-sans">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GlassStatusChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllTones: Story = {
  args: { children: "Estado" },
  render: () => (
    <div className="flex flex-wrap gap-3">
      <GlassStatusChip tone="success" dot>Assinada</GlassStatusChip>
      <GlassStatusChip tone="neutral" dot>Rascunho</GlassStatusChip>
      <GlassStatusChip tone="warning" dot>Bloqueada</GlassStatusChip>
      <GlassStatusChip tone="info" dot>Em revisão</GlassStatusChip>
      <GlassStatusChip tone="error" dot>Rejeitada</GlassStatusChip>
    </div>
  ),
};

export const WithoutDot: Story = {
  args: { tone: "success", children: "Assinada" },
};
