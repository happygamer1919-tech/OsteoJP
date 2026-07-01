import type { Meta, StoryObj } from "@storybook/react-vite";

import { GlassPanel } from "../src/components/GlassPanel";
import { StatusBadge } from "../src/components/StatusBadge";

/**
 * GlassPanel (SPEC-v2-foundation §9 / SPEC-v2-dashboard §4): grouped-content
 * glass container with header, body, and an optional footer link with chevron.
 */
const meta: Meta<typeof GlassPanel> = {
  title: "V2/GlassPanel",
  component: GlassPanel,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-v2-bg p-12 font-sans">
        <div className="mx-auto max-w-lg">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof GlassPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const Row = ({ time, name, service, tone, label }: {
  time: string; name: string; service: string;
  tone: "confirmed" | "pending"; label: string;
}) => (
  <div className="flex items-center justify-between gap-4 py-2">
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-v2-text-primary">{time}</span>
      <div className="flex flex-col">
        <span className="text-sm text-v2-text-primary">{name}</span>
        <span className="text-xs text-v2-text-secondary">{service}</span>
      </div>
    </div>
    <StatusBadge tone={tone}>{label}</StatusBadge>
  </div>
);

/** Próximas marcações panel (SPEC-v2-dashboard §4.1). */
export const UpcomingAppointments: Story = {
  args: { title: "Próximas marcações" },
  render: () => (
    <GlassPanel
      title="Próximas marcações"
      footerHref="#"
      footerLabel="Ver agenda completa"
    >
      <div className="divide-y divide-v2-border">
        <Row time="09:00" name="Maria Santos" service="Osteopatia" tone="confirmed" label="Confirmada" />
        <Row time="10:30" name="João Pereira" service="Fisioterapia" tone="pending" label="Pendente" />
        <Row time="14:00" name="Ana Costa" service="Massagens" tone="confirmed" label="Confirmada" />
      </div>
    </GlassPanel>
  ),
};

export const EmptyBody: Story = {
  args: { title: "Próximas marcações" },
  render: () => (
    <GlassPanel title="Próximas marcações" footerHref="#" footerLabel="Ver agenda completa">
      <p className="py-8 text-center text-sm text-v2-text-secondary">
        Sem marcações para hoje.
      </p>
    </GlassPanel>
  ),
};
