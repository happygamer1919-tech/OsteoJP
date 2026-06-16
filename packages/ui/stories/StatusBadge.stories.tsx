import type { Meta, StoryObj } from "@storybook/react-vite";

import { StatusBadge } from "../src/components/StatusBadge";

/**
 * StatusBadge (SPEC-v2-foundation §9 / SPEC-v2-dashboard §4.1): compact
 * appointment-row status badge — Confirmada green, Pendente orange, Cancelada
 * neutral.
 */
const meta = {
  title: "V2/StatusBadge",
  component: StatusBadge,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-v2-bg p-12 font-sans">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllTones: Story = {
  args: { tone: "confirmed", children: "Confirmada" },
  render: () => (
    <div className="flex flex-wrap gap-3">
      <StatusBadge tone="confirmed">Confirmada</StatusBadge>
      <StatusBadge tone="pending">Pendente</StatusBadge>
      <StatusBadge tone="cancelled">Cancelada</StatusBadge>
    </div>
  ),
};
