import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  CalendarDays,
  CalendarPlus,
  FileText,
  Settings,
  UserPlus,
} from "lucide-react";

import { QuickActionTile } from "../src/components/QuickActionTile";

/**
 * QuickActionTile (SPEC-v2-foundation §9 / SPEC-v2-dashboard §3): 160x160 glass
 * tile, accent-tinted icon over a label, single tab stop, with the hover lift.
 */
const meta: Meta<typeof QuickActionTile> = {
  title: "V2/QuickActionTile",
  component: QuickActionTile,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-v2-bg p-12 font-sans">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof QuickActionTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    accent: "blue",
    icon: <CalendarPlus size={28} />,
    label: "Nova Marcação",
    href: "#",
  },
};

export const AsButton: Story = {
  args: {
    accent: "green",
    icon: <UserPlus size={28} />,
    label: "Novo Paciente",
    onClick: () => {},
  },
};

/** The five "Acessos rápidos" tiles (SPEC-v2-dashboard §3). */
export const AcessosRapidos: Story = {
  args: { icon: <CalendarPlus size={28} />, label: "—" },
  render: () => (
    <div className="flex flex-wrap gap-4">
      <QuickActionTile accent="blue" icon={<CalendarPlus size={28} />} label="Nova Marcação" href="#" />
      <QuickActionTile accent="green" icon={<UserPlus size={28} />} label="Novo Paciente" href="#" />
      <QuickActionTile accent="lavender" icon={<FileText size={28} />} label="Ficha Clínica" href="#" />
      <QuickActionTile accent="blue" icon={<CalendarDays size={28} />} label="Ver Agenda" href="#" />
      <QuickActionTile accent="gold" icon={<Settings size={28} />} label="Administração" href="#" />
    </div>
  ),
};
