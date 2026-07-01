import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";

/** Card (SPEC-foundation §4.4): calm surface container with header/footer slots. */
const meta: Meta<typeof Card> = {
  title: "Components/Card",
  component: Card,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 420 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

const body = (
  <p className="text-sm text-text-secondary">
    Conteúdo do cartão. As bordas finas separam as superfícies; sem sombra em
    repouso.
  </p>
);

export const Default: Story = { args: { children: body } };

export const WithHeader: Story = {
  args: { title: "Resumo do paciente", children: body },
};

export const WithHeaderAction: Story = {
  args: {
    title: "Documentos",
    headerAction: (
      <Button variant="ghost" size="sm">
        Ver todos
      </Button>
    ),
    children: body,
  },
};

export const WithFooter: Story = {
  args: {
    title: "Marcação",
    children: body,
    footer: (
      <div className="flex justify-end gap-3">
        <Button variant="ghost" size="sm">
          Cancelar
        </Button>
        <Button size="sm">Confirmar</Button>
      </div>
    ),
  },
};

/** Whole-card link (one tab stop): hover tint + focus ring. */
export const InteractiveLink: Story = {
  args: {
    href: "#patient-123",
    children: (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-text-primary">Maria Silva</span>
        <span className="text-sm text-text-secondary">Última consulta: 02/06</span>
      </div>
    ),
  },
};
