import type { Meta, StoryObj } from "@storybook/react-vite";

import { KpiCard } from "../src/components/KpiCard";

/** KpiCard (SPEC-foundation §4.4): dashboard summary tile with a loading state. */
const meta = {
  title: "Components/KpiCard",
  component: KpiCard,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof KpiCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: "Consultas hoje", value: "24" },
};

export const WithComparison: Story = {
  args: { label: "Consultas hoje", value: "24", comparison: "+3 vs. ontem" },
};

export const Loading: Story = {
  args: { label: "Receita do mês", value: "—", loading: true },
};

/** A 4-up row, as a dashboard would lay them out. */
export const Grid: Story = {
  args: { label: "—", value: "—" },
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 16,
      }}
    >
      <KpiCard label="Consultas hoje" value="24" comparison="+3 vs. ontem" />
      <KpiCard label="Por confirmar" value="5" />
      <KpiCard label="Faltas (semana)" value="2" comparison="-1 vs. semana anterior" />
      <KpiCard label="Receita do mês" value="—" loading />
    </div>
  ),
};
