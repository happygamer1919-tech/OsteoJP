import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus, Users } from "lucide-react";

import { Button } from "../src/components/Button";
import { EmptyState } from "../src/components/EmptyState";
import { HeritageBand } from "../src/components/HeritageBand";
import { HeritageDivider } from "../src/components/HeritageDivider";

/**
 * HeritageBand (SPEC-foundation §7.7): the upgraded EmptyState motif band. A
 * space-12 (48px) tall band carrying the azulejo motif at a legible space-6
 * (24px) tile height, recolored to `accent-2-200`. Replaces the 10px
 * HeritageDivider strip when it leads an EmptyState column. Decorative only.
 */
const meta = {
  title: "Components/HeritageBand",
  component: HeritageBand,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof HeritageBand>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="mx-auto max-w-md">
      <HeritageBand />
    </div>
  ),
};

/** The band leading a real EmptyState (the W4-03/W4-04/W4-05 zero-state shape). */
export const InEmptyState: Story = {
  render: () => (
    <div className="mx-auto max-w-md">
      <EmptyState
        heritage
        icon={Users}
        title="Sem pacientes registados"
        description="Crie o primeiro paciente para começar."
        action={
          <Button variant="primary" iconLeft={Plus}>
            Novo Paciente
          </Button>
        }
      />
    </div>
  ),
};

/**
 * Size delta: the upgraded band (48px, 24px motif) above the legacy 10px
 * divider, so the ~2.4× motif-scale increase reads at a glance.
 */
export const SizeDelta: Story = {
  render: () => (
    <div className="mx-auto flex max-w-md flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-text-secondary">
          Upgraded band — space-12 / space-6 motif (§7.7)
        </span>
        <HeritageBand />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-text-secondary">
          Legacy divider — 10px strip (§4.12)
        </span>
        <HeritageDivider variant="azulejo" />
      </div>
    </div>
  ),
};
