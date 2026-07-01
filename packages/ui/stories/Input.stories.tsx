import type { Meta, StoryObj } from "@storybook/react-vite";
import { Search, X } from "lucide-react";

import { Input } from "../src/components/Input";

/**
 * Input (SPEC-foundation §4.2): 40px text control with the shared control
 * skin. Pair with Field for label + aria wiring; use standalone for search
 * bars, inline controls, or any case where no visible label is needed.
 */
const meta: Meta<typeof Input> = {
  title: "Components/Input",
  component: Input,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 360 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

const clearButton = (
  <button
    type="button"
    aria-label="Limpar"
    className="inline-flex items-center justify-center rounded-full text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
  >
    <X size={16} strokeWidth={1.75} aria-hidden="true" />
  </button>
);

/** Default: bare text input with placeholder. */
export const Default: Story = {
  args: { placeholder: "Nome do paciente" },
};

/** Filled with a value. */
export const WithValue: Story = {
  args: { defaultValue: "Maria da Silva" },
};

/** Leading Search icon; left-aligns a 16px decorative icon inside the padding. */
export const WithLeadingIcon: Story = {
  args: { leadingIcon: Search, placeholder: "Pesquisar pacientes" },
};

/** Trailing slot: a compact control in the right gutter (≤20px). */
export const WithTrailing: Story = {
  args: {
    defaultValue: "Maria",
    placeholder: "Pesquisar",
    trailing: clearButton,
  },
};

/** Leading icon + trailing clear — the patient-search pattern. */
export const SearchWithClear: Story = {
  args: {
    leadingIcon: Search,
    defaultValue: "Silva",
    placeholder: "Pesquisar pacientes",
    trailing: clearButton,
  },
};

/** Invalid: error border + aria-invalid for AT. Use inside Field for error text. */
export const Invalid: Story = {
  args: { defaultValue: "nome@", type: "email", invalid: true },
};

/** Disabled: muted background, pointer-events none. */
export const Disabled: Story = {
  args: { defaultValue: "Indisponível", disabled: true },
};

/** type="number" — for durations, quantities, amounts. */
export const Number: Story = {
  args: { type: "number", defaultValue: "60", min: 1 },
};

/** type="date" — native date picker; lang="pt-PT" on the consumer sets dd/mm/aaaa. */
export const Date: Story = {
  args: { type: "date", defaultValue: "2026-06-19" },
};

/** type="time" — 24 h native time picker. */
export const Time: Story = {
  args: { type: "time", defaultValue: "09:30" },
};

/** type="email" */
export const Email: Story = {
  args: { type: "email", placeholder: "nome@exemplo.pt" },
};

/** type="password" */
export const Password: Story = {
  args: { type: "password", placeholder: "Palavra-passe" },
};

/** All visual states side-by-side. */
export const AllStates: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Input placeholder="Normal" />
      {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
      <Input autoFocus defaultValue="Com foco" />
      <Input defaultValue="Preenchido" />
      <Input invalid defaultValue="Inválido" />
      <Input disabled defaultValue="Inativo" />
    </div>
  ),
};
