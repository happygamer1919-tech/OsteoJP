import type { Meta, StoryObj } from "@storybook/react-vite";
import { Search, X } from "lucide-react";

import { Field } from "../src/components/Field";
import { Input } from "../src/components/Input";
import { Textarea } from "../src/components/Textarea";

/**
 * Field + Input + Textarea (SPEC-foundation §4.2). Field owns the label, helper
 * and error; the control passed as `children` inherits id + aria wiring via
 * context. Stories pass the control through `children` so the default render
 * (`<Field {...args} />`) drives every case.
 */
const meta = {
  title: "Components/Field",
  component: Field,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 360 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

const clearButton = (
  <button
    type="button"
    aria-label="Limpar"
    className="inline-flex items-center justify-center rounded-full text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2-500 focus-visible:ring-offset-2"
  >
    <X size={16} strokeWidth={1.75} aria-hidden="true" />
  </button>
);

/** Default: label + control, no helper or error. */
export const Default: Story = {
  args: {
    label: "Nome",
    children: <Input placeholder="Nome do paciente" />,
  },
};

/** Keyboard focus: accent-2-500 border plus the global focus ring. */
export const Focus: Story = {
  args: {
    label: "Nome",
    // eslint-disable-next-line jsx-a11y/no-autofocus -- demonstrates the focus state
    children: <Input autoFocus placeholder="Nome do paciente" />,
  },
};

/** With helper text below the control. */
export const WithHelper: Story = {
  args: {
    label: "Email",
    helperText: "Usado para enviar a confirmação da marcação.",
    children: <Input type="email" placeholder="nome@exemplo.pt" />,
  },
};

/** Invalid: error replaces helper, role=alert, error border, CircleAlert icon. */
export const WithError: Story = {
  args: {
    label: "Email",
    helperText: "Usado para enviar a confirmação da marcação.",
    error: "Introduza um email válido.",
    children: <Input type="email" defaultValue="nome@" />,
  },
};

/** Required: appends * and sets aria-required on the control. */
export const Required: Story = {
  args: {
    label: "Nome",
    required: true,
    children: <Input placeholder="Nome do paciente" />,
  },
};

/** Disabled control. */
export const Disabled: Story = {
  args: {
    label: "Nome",
    children: <Input disabled defaultValue="Indisponível" />,
  },
};

/** Leading icon (Search) and a trailing clear button. */
export const WithIconAndTrailing: Story = {
  args: {
    label: "Pesquisar",
    children: (
      <Input
        leadingIcon={Search}
        defaultValue="Maria"
        placeholder="Pesquisar pacientes"
        trailing={clearButton}
      />
    ),
  },
};

/** Textarea: 96px min-height, vertical resize, shares the Input skin. */
export const WithTextarea: Story = {
  args: {
    label: "Notas",
    helperText: "Visível apenas para a equipa clínica.",
    children: <Textarea rows={4} placeholder="Observações da consulta" />,
  },
};

/** Textarea in an invalid Field. */
export const TextareaError: Story = {
  args: {
    label: "Notas",
    error: "As notas não podem ficar vazias.",
    children: <Textarea rows={4} />,
  },
};
