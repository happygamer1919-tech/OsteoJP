import type { Meta, StoryObj } from "@storybook/react-vite";
import { Calendar, Clipboard, TrendingUp, Users } from "lucide-react";

import { GlassKpiCard } from "../src/components/GlassKpiCard";

/**
 * GlassKpiCard (SPEC-v2-foundation §9 / SPEC-v2-dashboard §2): 180px KPI tile
 * with an accent-tinted icon circle, value, caption, built-in loading skeleton,
 * and a compact inline error tone.
 */
const meta = {
  title: "V2/GlassKpiCard",
  component: GlassKpiCard,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-v2-bg p-12 font-sans">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GlassKpiCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    accent: "green",
    icon: <Users size={20} />,
    label: "Pacientes ativos",
    value: "128",
    caption: "+4 esta semana",
  },
};

export const Loading: Story = {
  args: {
    accent: "blue",
    icon: <Calendar size={20} />,
    label: "Marcações hoje",
    value: "—",
    loading: true,
  },
};

export const Error: Story = {
  args: {
    accent: "lavender",
    icon: <Clipboard size={20} />,
    label: "Novas fichas",
    value: "—",
    error: "Não foi possível carregar",
  },
};

/** The four dashboard KPIs as a row (SPEC-v2-dashboard §2). */
export const DashboardRow: Story = {
  args: { label: "—", value: "—" },
  render: () => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <GlassKpiCard
        accent="green"
        icon={<Users size={20} />}
        label="Pacientes ativos"
        value="128"
        caption="+4 esta semana"
      />
      <GlassKpiCard
        accent="blue"
        icon={<Calendar size={20} />}
        label="Marcações hoje"
        value="9"
        caption="Próxima: 14:30"
      />
      <GlassKpiCard
        accent="lavender"
        icon={<Clipboard size={20} />}
        label="Novas fichas"
        value="6"
        caption="Esta semana"
      />
      <GlassKpiCard
        accent="gold"
        icon={<TrendingUp size={20} />}
        label="Receita (mês)"
        value="—"
        error="Sem dados"
      />
    </div>
  ),
};
