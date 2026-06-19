import type { Meta, StoryObj } from "@storybook/react-vite";

import { GlassStatusChip } from "../src/components/GlassStatusChip";

/**
 * GlassStatusChip (SPEC-v2-foundation §9): soft tinted pill with a hairline
 * glass border for record / review status. Five semantic tones; optional
 * leading 8 px dot for added visual weight.
 *
 * **Props**
 * - `tone` — `"success" | "warning" | "error" | "info" | "neutral"`.
 *   Defaults to `"neutral"`.
 * - `dot` — Render a leading 8 px coloured dot (`aria-hidden`). Default false.
 * - `children` — Visible label. Supply the i18n string for the domain status.
 * - `className` — Optional positioning overrides.
 *
 * **Domain mapping (record_status / ai_review_state)**
 * | Domain value     | Tone    | Label (PT)  |
 * |------------------|---------|-------------|
 * | `signed`         | success | Assinada    |
 * | `draft`          | neutral | Rascunho    |
 * | `locked`         | warning | Bloqueada   |
 * | `in_review`      | info    | Em revisão  |
 * | `rejected`       | error   | Rejeitada   |
 * | `pending_review` | neutral | Pendente    |
 * | `approved`       | success | Aprovada    |
 *
 * **A11y**
 * - The dot is `aria-hidden`; the text label alone conveys status to AT.
 * - Each tone clears AA on its own tint background (not just on white):
 *   success-800 on green-100 (5.8:1), info-700 on blue-100 (5.3:1),
 *   warning-700 on warning-bg (4.6:1), error on error-bg (≥4.5:1),
 *   text-secondary on surface-muted (5.0:1).
 * - Do not use colour as the only differentiator; labels are mandatory.
 *
 * **Usage**
 * ```tsx
 * <GlassStatusChip tone="success" dot>
 *   {t("record.signed")}
 * </GlassStatusChip>
 * ```
 *
 * For appointment-row status (Confirmada / Pendente / Cancelada) use
 * `StatusBadge` — it has three tones, no dot, and a filled (not glass) surface.
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

/** success — signed record or approved AI payload. */
export const Success: Story = {
  args: { tone: "success", dot: true, children: "Assinada" },
};

/** neutral — draft record or pending-review payload. Default tone. */
export const Neutral: Story = {
  args: { tone: "neutral", dot: true, children: "Rascunho" },
};

/** warning — locked (immutable) record; not a failure state. */
export const Warning: Story = {
  args: { tone: "warning", dot: true, children: "Bloqueada" },
};

/** info — record currently in the AI review queue. */
export const Info: Story = {
  args: { tone: "info", dot: true, children: "Em revisão" },
};

/** error — AI payload rejected by the reviewer. */
export const Error: Story = {
  args: { tone: "error", dot: true, children: "Rejeitada" },
};

/** All five tones with dot — verify contrast and dot sizing on v2 background. */
export const AllTonesWithDot: Story = {
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

/** All five tones without dot — label-only variant for compact contexts. */
export const AllTonesWithoutDot: Story = {
  args: { children: "Estado" },
  render: () => (
    <div className="flex flex-wrap gap-3">
      <GlassStatusChip tone="success">Assinada</GlassStatusChip>
      <GlassStatusChip tone="neutral">Rascunho</GlassStatusChip>
      <GlassStatusChip tone="warning">Bloqueada</GlassStatusChip>
      <GlassStatusChip tone="info">Em revisão</GlassStatusChip>
      <GlassStatusChip tone="error">Rejeitada</GlassStatusChip>
    </div>
  ),
};

/**
 * Dot vs no-dot per tone — verify pill width and leading padding are
 * consistent between the two variants across all tones.
 */
export const DotComparison: Story = {
  args: { children: "Estado" },
  render: () => (
    <div className="flex flex-col gap-4">
      {(
        [
          { tone: "success", label: "Assinada" },
          { tone: "neutral", label: "Rascunho" },
          { tone: "warning", label: "Bloqueada" },
          { tone: "info", label: "Em revisão" },
          { tone: "error", label: "Rejeitada" },
        ] as const
      ).map(({ tone, label }) => (
        <div key={tone} className="flex items-center gap-3">
          <GlassStatusChip tone={tone} dot>{label}</GlassStatusChip>
          <GlassStatusChip tone={tone}>{label}</GlassStatusChip>
        </div>
      ))}
    </div>
  ),
};

/**
 * Long label — verify the pill stretches without clipping. Reflects possible
 * verbose i18n strings in some locales.
 */
export const LongLabel: Story = {
  args: { tone: "info", dot: true, children: "Aguarda revisão do terapeuta responsável" },
};

/**
 * Default tone — `tone` prop omitted; falls back to `"neutral"`. Confirms the
 * default renders correctly without an explicit tone.
 */
export const DefaultTone: Story = {
  args: { children: "Sem estado" },
};
