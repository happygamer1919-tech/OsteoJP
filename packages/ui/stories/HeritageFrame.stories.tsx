import type { Meta, StoryObj } from "@storybook/react-vite";

import { GlassCard } from "../src/components/GlassCard";
import { HeritageFrame } from "../src/components/HeritageFrame";

/**
 * HeritageFrame (SPEC-v2-foundation §6): the OsteoJP-theme decorative edge frame
 * — burgundy embroidery left, blue azulejo right — behind the content area.
 * Tenant-gated, aria-hidden, density-aware, and forbidden on the clinical editor.
 */
const meta = {
  title: "V2/HeritageFrame",
  component: HeritageFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof HeritageFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The host content area owns the stacking context; the frame sits behind it. */
const Stage = ({
  children,
  ...props
}: React.ComponentProps<typeof HeritageFrame> & { children?: React.ReactNode }) => (
  <div className="relative isolate min-h-dvh overflow-hidden bg-v2-bg p-12 font-sans">
    <HeritageFrame {...props} />
    <div className="relative z-10 mx-auto max-w-3xl">
      {children ?? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <GlassCard title="Pacientes ativos">
            <p className="text-3xl text-v2-text-primary">128</p>
          </GlassCard>
          <GlassCard title="Marcações hoje">
            <p className="text-3xl text-v2-text-primary">9</p>
          </GlassCard>
        </div>
      )}
    </div>
  </div>
);

/** Data screen: restrained density (thin edge), OsteoJP theme enabled. */
export const RestrainedDataScreen: Story = {
  args: { enabled: true, density: "restrained", pathname: "/dashboard" },
  render: (args) => <Stage {...args} />,
};

/** Auth / empty state: calm density (fuller band). */
export const CalmAuthScreen: Story = {
  args: { enabled: true, density: "calm", pathname: "/login" },
  render: (args) => (
    <Stage {...args}>
      <div className="mx-auto max-w-sm">
        <GlassCard title="Iniciar sessão">
          <p className="text-sm text-v2-text-secondary">
            Formulário de credenciais (exemplo).
          </p>
        </GlassCard>
      </div>
    </Stage>
  ),
};

/** Neutral tenant (heritage disabled): the frame renders nothing. */
export const NeutralTenant: Story = {
  args: { enabled: false, density: "restrained", pathname: "/dashboard" },
  render: (args) => <Stage {...args} />,
};

/** Forbidden surface: the clinical record editor renders no frame even if enabled. */
export const ForbiddenOnClinicalEditor: Story = {
  args: { enabled: true, density: "restrained", pathname: "/clinical/123" },
  render: (args) => <Stage {...args} />,
};
