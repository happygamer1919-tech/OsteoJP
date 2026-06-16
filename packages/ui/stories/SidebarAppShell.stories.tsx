import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Calendar,
  CalendarClock,
  ClipboardCheck,
  FileText,
  Home,
  Settings,
  Users,
} from "lucide-react";

import { GlassKpiCard } from "../src/components/GlassKpiCard";
import { HeritageFrame } from "../src/components/HeritageFrame";
import { SidebarAppShell } from "../src/components/SidebarAppShell";
import { UserAreaCluster } from "../src/components/UserAreaCluster";

/**
 * SidebarAppShell (SPEC-v2-foundation §7): the 280px floating glass sidebar that
 * replaces the staff top bar. Seven nav items, the user-area cluster top-right,
 * and the HeritageFrame behind the content area.
 */
const meta = {
  title: "V2/SidebarAppShell",
  component: SidebarAppShell,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SidebarAppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

// The seven nav items in spec order (§7.2), Início active.
const NAV = [
  { href: "/dashboard", label: "Início", icon: Home, active: true },
  { href: "/agenda", label: "Agenda", icon: Calendar },
  { href: "/patients", label: "Pacientes", icon: Users },
  { href: "/clinical", label: "Fichas Clínicas", icon: FileText },
  { href: "/marcacoes", label: "Marcações", icon: CalendarClock },
  { href: "/clinical/review", label: "Revisão", icon: ClipboardCheck },
  { href: "/admin", label: "Administração", icon: Settings },
];

const cluster = (
  <UserAreaCluster name="Ana Morais" roleLabel="Administradora" initials="AM" />
);

const sampleContent = (
  <div className="flex flex-col gap-8">
    <h1 className="text-v2-greeting text-v2-text-primary">Bom dia, Ana</h1>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <GlassKpiCard accent="green" icon={<Users size={20} />} label="Pacientes ativos" value="128" />
      <GlassKpiCard accent="blue" icon={<Calendar size={20} />} label="Marcações hoje" value="9" />
      <GlassKpiCard accent="lavender" icon={<FileText size={20} />} label="Novas fichas" value="6" />
      <GlassKpiCard accent="gold" icon={<CalendarClock size={20} />} label="Receita (mês)" value="—" error="Sem dados" />
    </div>
  </div>
);

/** Neutral tenant (no heritage) — the product default for every tenant. */
export const Default: Story = {
  args: {
    brandHomeHref: "/dashboard",
    nav: NAV,
    userArea: cluster,
    children: sampleContent,
  },
};

/** OsteoJP tenant: the HeritageFrame runs behind the content area (restrained). */
export const WithHeritage: Story = {
  args: {
    brandHomeHref: "/dashboard",
    nav: NAV,
    userArea: cluster,
    heritageFrame: <HeritageFrame enabled density="restrained" pathname="/dashboard" />,
    children: sampleContent,
  },
};
