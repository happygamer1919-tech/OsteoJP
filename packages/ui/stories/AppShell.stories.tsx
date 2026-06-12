import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Calendar,
  ChevronDown,
  FileText,
  HelpCircle,
  Home,
  Receipt,
  Settings,
  User,
  Users,
} from "lucide-react";

import {
  PortalShell,
  StaffAppShell,
  type AppShellNavItem,
} from "../src/components/AppShell";

/** AppShell (SPEC-foundation §4.11): staff top-bar + portal tab-bar layouts. */
const meta = {
  title: "Components/AppShell",
  component: StaffAppShell,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof StaffAppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

const staffNav: AppShellNavItem[] = [
  { href: "/dashboard", label: "Painel", icon: Home, active: true },
  { href: "/agenda", label: "Agenda", icon: Calendar },
  { href: "/patients", label: "Pacientes", icon: Users },
  { href: "/clinical", label: "Registos", icon: FileText },
  { href: "/admin", label: "Administração", icon: Settings },
];

const userMenu = (
  <button
    type="button"
    className="inline-flex items-center gap-1 rounded-md p-1 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2-500 focus-visible:ring-offset-2"
  >
    <span className="inline-flex size-8 items-center justify-center rounded-full bg-surface-muted text-text-secondary">
      <User size={20} strokeWidth={1.75} aria-hidden="true" />
    </span>
    <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" className="text-text-muted" />
  </button>
);

const help = (
  <button
    type="button"
    aria-label="Ajuda"
    className="inline-flex size-9 items-center justify-center rounded-md text-text-secondary hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2-500 focus-visible:ring-offset-2"
  >
    <HelpCircle size={20} strokeWidth={1.75} aria-hidden="true" />
  </button>
);

/** Staff: top bar with icon+label nav; resize below 768px for the hamburger drawer. */
export const Staff: Story = {
  args: { brandHomeHref: "/dashboard", nav: staffNav, children: null },
  render: () => (
    <StaffAppShell brandHomeHref="/dashboard" nav={staffNav} userMenu={userMenu} help={help}>
      <h1 className="text-2xl text-text-primary">Painel</h1>
      <p className="mt-2 text-sm text-text-secondary">
        Conteúdo da página. Largura máxima 1280px, centrado.
      </p>
    </StaffAppShell>
  ),
};

const portalTabs: AppShellNavItem[] = [
  { href: "/portal", label: "Início", icon: Home, active: true },
  { href: "/portal/booking", label: "Marcar", icon: Calendar },
  { href: "/portal/documents", label: "Documentos", icon: FileText },
  { href: "/portal/invoices", label: "Faturas", icon: Receipt },
  { href: "/portal/account", label: "Conta", icon: User },
];

/** Portal: 56px top bar + bottom tab bar (44px targets); tabs move to the top on desktop. */
export const Portal: StoryObj<typeof PortalShell> = {
  args: { title: "Início", tabs: portalTabs, children: null },
  render: () => (
    <PortalShell title="Início" tabs={portalTabs}>
      <h2 className="text-xl text-text-primary">Olá, Maria</h2>
      <p className="mt-2 text-sm text-text-secondary">
        Conteúdo do portal. Centrado a 640px no desktop.
      </p>
    </PortalShell>
  ),
};
