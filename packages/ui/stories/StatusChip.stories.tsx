import type { Meta, StoryObj } from "@storybook/react-vite";

import { StatusChip } from "../src/components/StatusChip";

/** StatusChip (SPEC-foundation §4.5): five semantic tones, optional leading dot. */
const meta = {
  title: "Components/StatusChip",
  component: StatusChip,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: { children: "Estado", tone: "neutral" },
  argTypes: {
    tone: {
      control: "inline-radio",
      options: ["success", "warning", "error", "info", "neutral"],
    },
    dot: { control: "boolean" },
  },
} satisfies Meta<typeof StatusChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = { args: { dot: true } };

/** All five tones, without and with the leading dot. */
export const AllTones: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <StatusChip tone="success">Concluído</StatusChip>
        <StatusChip tone="warning">Pendente</StatusChip>
        <StatusChip tone="error">Falta</StatusChip>
        <StatusChip tone="info">Concluída</StatusChip>
        <StatusChip tone="neutral">Cancelado</StatusChip>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <StatusChip tone="success" dot>
          Concluído
        </StatusChip>
        <StatusChip tone="warning" dot>
          Pendente
        </StatusChip>
        <StatusChip tone="error" dot>
          Falta
        </StatusChip>
        <StatusChip tone="info" dot>
          Concluída
        </StatusChip>
        <StatusChip tone="neutral" dot>
          Cancelado
        </StatusChip>
      </div>
    </div>
  ),
};

/**
 * Canonical appointment mapping (per brand-voice.md): confirmed=success,
 * pending=warning, no-show=error, completed=info, cancelled=neutral.
 */
export const AppointmentStatuses: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <StatusChip tone="success" dot>
        Confirmada
      </StatusChip>
      <StatusChip tone="warning" dot>
        Por confirmar
      </StatusChip>
      <StatusChip tone="error" dot>
        Falta
      </StatusChip>
      <StatusChip tone="info" dot>
        Concluída
      </StatusChip>
      <StatusChip tone="neutral" dot>
        Cancelada
      </StatusChip>
    </div>
  ),
};
