import type { Meta, StoryObj } from "@storybook/react-vite";

import { StatusBadge } from "../src/components/StatusBadge";

/**
 * StatusBadge (SPEC-v2-foundation §9 / SPEC-v2-dashboard §4.1): compact
 * appointment-row status badge. Three appointment tones — Confirmada (green),
 * Pendente (warning amber), Cancelada (neutral grey). No dot: the fill colour
 * carries the semantic meaning.
 *
 * **Props**
 * - `tone` — `"confirmed" | "pending" | "cancelled"`. Required.
 * - `children` — The visible label. Use the i18n key for the appointment status.
 * - `className` — Optional additional classes for positioning overrides.
 *
 * **Variants**
 * - Confirmed: `bg-v2-green-100 / text-v2-green-800` (5.8 : 1, AA ✓)
 * - Pending: `bg-warning-bg / text-warning-700` (4.6 : 1, AA ✓)
 * - Cancelled: `bg-surface-muted / text-text-secondary` (5.0 : 1, AA ✓)
 *
 * **A11y**
 * - Inline `<span>` — conveys status through text, no role override needed.
 * - Do NOT rely on colour alone for AT users; ensure the label is
 *   descriptive (`"Confirmada"`, not `"●"`).
 * - When used inside a table row, the surrounding `<td>` / `<tr>` context
 *   provides the row association; no extra `aria-*` is required on the badge.
 *
 * **Usage**
 * ```tsx
 * <StatusBadge tone="confirmed">{t("appointment.confirmed")}</StatusBadge>
 * ```
 *
 * For record / review status (draft → locked → signed, AI review queue)
 * use `GlassStatusChip` instead — it has five tones and an optional dot.
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

/** Appointment confirmed — green fill, AA-dark label. */
export const Confirmed: Story = {
  args: { tone: "confirmed", children: "Confirmada" },
};

/** Appointment pending / awaiting confirmation — warning amber fill. */
export const Pending: Story = {
  args: { tone: "pending", children: "Pendente" },
};

/** Appointment cancelled — neutral muted fill; intentionally not red. */
export const Cancelled: Story = {
  args: { tone: "cancelled", children: "Cancelada" },
};

/** All three tones side-by-side — use to verify colour contrast on the v2 background. */
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

/**
 * Realistic appointment-row context: badge appears next to a patient name and
 * time slot, as rendered in the agenda list. Verify that the badge height does
 * not push the row's line height.
 */
export const InAppointmentRow: Story = {
  args: { tone: "confirmed", children: "Confirmada" },
  render: () => (
    <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-v2-border bg-v2-surface">
      {(
        [
          { time: "09:00", name: "Maria João Silva", tone: "confirmed", label: "Confirmada" },
          { time: "09:30", name: "António Manuel Costa", tone: "pending", label: "Pendente" },
          { time: "10:00", name: "Ana Luísa Ferreira", tone: "cancelled", label: "Cancelada" },
        ] as const
      ).map((row) => (
        <div
          key={row.time}
          className="flex items-center gap-4 px-4 py-3 text-sm text-v2-text-primary"
        >
          <span className="w-10 shrink-0 font-medium tabular-nums">{row.time}</span>
          <span className="min-w-0 flex-1 truncate">{row.name}</span>
          <StatusBadge tone={row.tone}>{row.label}</StatusBadge>
        </div>
      ))}
    </div>
  ),
};

/**
 * Long label — verify the pill stretches gracefully and does not clip text.
 * Not a real label used in production, but exercises the layout contract.
 */
export const LongLabel: Story = {
  args: { tone: "pending", children: "Aguarda confirmação do paciente" },
};
