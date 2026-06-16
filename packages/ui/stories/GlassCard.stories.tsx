import type { Meta, StoryObj } from "@storybook/react-vite";

import { GlassCard } from "../src/components/GlassCard";

/**
 * GlassCard (SPEC-v2-foundation §9): generic floating glass container with
 * header/body/footer slots and an interactive single-tab-stop variant.
 * Rendered on the v2 background so the glass reads correctly.
 */
const meta = {
  title: "V2/GlassCard",
  component: GlassCard,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-v2-bg p-12 font-sans">
        <div className="mx-auto max-w-md">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof GlassCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Notas rápidas",
    children: <p className="text-sm text-v2-text-secondary">Sem notas.</p>,
  },
};

export const WithFooter: Story = {
  args: {
    title: "Resumo",
    children: <p className="text-sm text-v2-text-secondary">Conteúdo do cartão.</p>,
    footer: <span className="text-sm text-v2-blue-700">Ver detalhes</span>,
  },
};

/** Interactive link variant: whole card is one tab stop, with the hover lift. */
export const AsLink: Story = {
  args: {
    href: "#",
    children: (
      <div className="flex flex-col gap-1">
        <span className="text-lg text-v2-text-primary">Maria Santos</span>
        <span className="text-sm text-v2-text-secondary">Próxima consulta: 14:30</span>
      </div>
    ),
  },
};

/** Interactive button variant. */
export const AsButton: Story = {
  args: {
    interactive: true,
    children: <span className="text-v2-text-primary">Ação do cartão</span>,
  },
};
