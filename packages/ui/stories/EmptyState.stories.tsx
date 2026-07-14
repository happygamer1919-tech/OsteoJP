import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus, Users } from "lucide-react";

import { Button } from "../src/components/Button";
import { EmptyState } from "../src/components/EmptyState";

/** EmptyState (SPEC-foundation §4.10): an invitation to act, never an apology. */
const meta = {
  title: "Components/EmptyState",
  component: EmptyState,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: Users,
    title: "Ainda não há pacientes",
    description: "Adicione o primeiro paciente para começar.",
  },
};

export const WithAction: Story = {
  args: {
    icon: Users,
    title: "Ainda não há pacientes",
    description: "Adicione o primeiro paciente para começar.",
    action: <Button iconLeft={Plus}>Adicionar paciente</Button>,
  },
};

/**
 * W7-03: the decorative azulejo motif band above the badge is gone platform-wide
 * (the "unwanted line"). An empty state is icon, title, subtitle, action — the
 * badge itself now carries the brand in accent-1 (logo purple).
 */
export const FirstRun: Story = {
  args: {
    icon: Users,
    title: "Ainda não há pacientes",
    description: "Adicione o primeiro paciente para começar.",
  },
};
