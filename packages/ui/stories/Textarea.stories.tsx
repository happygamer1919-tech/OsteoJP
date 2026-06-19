import type { Meta, StoryObj } from "@storybook/react-vite";

import { Textarea } from "../src/components/Textarea";

/**
 * Textarea (SPEC-foundation §4.2): multi-line control sharing the Input
 * skin. Min-height 96px, vertical resize only. Pair with Field for label +
 * aria wiring; use standalone for inline note areas.
 */
const meta = {
  title: "Components/Textarea",
  component: Textarea,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 480 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: empty with placeholder. */
export const Default: Story = {
  args: { placeholder: "Observações da consulta" },
};

/** With pre-filled content. */
export const WithValue: Story = {
  args: {
    defaultValue:
      "Paciente refere dor lombar persistente há 3 semanas. Sem irradiação para os membros inferiores.",
    rows: 4,
  },
};

/** rows=2 — compact inline note areas. */
export const Compact: Story = {
  args: { rows: 2, placeholder: "Nota breve" },
};

/** rows=8 — narrative fields, review editor. */
export const Tall: Story = {
  args: { rows: 8, placeholder: "Narrativa clínica completa" },
};

/** Invalid: error border + aria-invalid. Use inside Field for error text. */
export const Invalid: Story = {
  args: {
    invalid: true,
    rows: 4,
    defaultValue: "",
    placeholder: "Campo obrigatório",
  },
};

/** Disabled: muted background, pointer-events none. */
export const Disabled: Story = {
  args: {
    disabled: true,
    rows: 3,
    defaultValue: "Registo bloqueado — apenas leitura.",
  },
};

/** All visual states. */
export const AllStates: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Textarea rows={2} placeholder="Normal" />
      {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
      <Textarea rows={2} autoFocus defaultValue="Com foco" />
      <Textarea rows={2} defaultValue="Preenchido" />
      <Textarea rows={2} invalid defaultValue="Inválido" />
      <Textarea rows={2} disabled defaultValue="Inativo" />
    </div>
  ),
};
