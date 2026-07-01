import type { Meta, StoryObj } from "@storybook/react-vite";

import { GlassPanel } from "../src/components/GlassPanel";
import { ResumoChart } from "../src/components/ResumoChart";

/**
 * ResumoChart (SPEC-v2-foundation §9 / SPEC-v2-dashboard §4.2): minimal line
 * chart with a blue-to-green gradient stroke and a light grid. Renders a series
 * or an honest empty placeholder.
 */
const meta: Meta<typeof ResumoChart> = {
  title: "V2/ResumoChart",
  component: ResumoChart,
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
} satisfies Meta<typeof ResumoChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithData: Story = {
  args: {
    data: [4, 6, 5, 8, 7, 9, 6],
    labels: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
    ariaLabel: "Resumo semanal de marcações",
  },
  render: (args) => (
    <GlassPanel title="Resumo semanal">
      <ResumoChart {...args} />
    </GlassPanel>
  ),
};

export const Empty: Story = {
  args: { emptyLabel: "Sem dados suficientes" },
  render: (args) => (
    <GlassPanel title="Resumo semanal">
      <ResumoChart {...args} />
    </GlassPanel>
  ),
};

export const Loading: Story = {
  args: { loading: true },
  render: (args) => (
    <GlassPanel title="Resumo semanal">
      <ResumoChart {...args} />
    </GlassPanel>
  ),
};
