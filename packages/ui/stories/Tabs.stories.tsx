import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Tabs } from "../src/components/Tabs";

/**
 * Tabs (SPEC-foundation §4.8): section navigation within a screen. Renders
 * only the `role="tablist"` — the screen is responsible for rendering the
 * active panel. Active tab gets a 2 px `accent-1-700` (logo purple) underline (W6-06 equity).
 *
 * **Props**
 * - `items` — `TabItem[]`: `{ value, label, "aria-controls"? }`. Each
 *   `aria-controls` should match the `id` of the corresponding
 *   `role="tabpanel"` element.
 * - `value` — The currently active tab value. Controlled.
 * - `onValueChange` — Called with the new value on click or keyboard move.
 * - `aria-label` or `aria-labelledby` — One is required for the tablist to
 *   be accessible.
 *
 * **A11y**
 * - `role="tablist"` on the container; `role="tab"` on each button.
 * - Roving `tabIndex`: only the active tab is in the tab order (`tabIndex=0`);
 *   all others are `tabIndex=-1`. Focus moves within the list via arrow keys.
 * - Keyboard: `←` / `→` (or `↑` / `↓`) move focus and activate; `Home`
 *   activates the first tab; `End` activates the last.
 * - Supply `aria-controls` on each item so AT can announce the associated
 *   panel. The panel must have `role="tabpanel"`, `id` matching the value,
 *   and `tabIndex=0` to be focusable.
 *
 * **Usage**
 * ```tsx
 * <Tabs
 *   aria-label={t("patient.sections")}
 *   value={tab}
 *   onValueChange={setTab}
 *   items={[
 *     { value: "summary",  label: t("patient.summary"),  "aria-controls": "tab-summary" },
 *     { value: "records",  label: t("patient.records"),  "aria-controls": "tab-records" },
 *   ]}
 * />
 * <div id="tab-summary" role="tabpanel" tabIndex={0} hidden={tab !== "summary"}>…</div>
 * <div id="tab-records" role="tabpanel" tabIndex={0} hidden={tab !== "records"}>…</div>
 * ```
 */
const meta = {
  title: "Components/Tabs",
  component: Tabs,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Four-tab patient profile — the primary usage in the staff platform. */
export const Default: Story = {
  args: {
    items: [
      { value: "summary", label: "Resumo" },
      { value: "records", label: "Registos clínicos" },
      { value: "documents", label: "Documentos" },
      { value: "invoices", label: "Faturas" },
    ],
    value: "summary",
    onValueChange: () => {},
    "aria-label": "Secções do paciente",
  },
  render: (args) => {
    const [value, setValue] = useState("summary");
    return (
      <div className="flex flex-col gap-4">
        <Tabs {...args} value={value} onValueChange={setValue} />
        <p className="text-sm text-text-secondary">
          Secção ativa: <strong className="text-text-primary">{value}</strong>{" "}
          — use ←/→ ou Home/End para navegar.
        </p>
      </div>
    );
  },
};

/** Two tabs — minimal usage, e.g. a modal with two views. */
export const TwoTabs: Story = {
  args: {
    items: [
      { value: "search", label: "Procurar paciente" },
      { value: "new", label: "Novo paciente" },
    ],
    value: "search",
    onValueChange: () => {},
    "aria-label": "Modo de agendamento",
  },
  render: (args) => {
    const [value, setValue] = useState("search");
    return <Tabs {...args} value={value} onValueChange={setValue} />;
  },
};

/**
 * Six tabs — verify the tablist scrolls or wraps gracefully in constrained
 * widths. Use browser devtools to narrow the viewport and check overflow.
 */
export const ManyTabs: Story = {
  args: {
    items: [
      { value: "overview", label: "Visão geral" },
      { value: "records", label: "Registos clínicos" },
      { value: "appointments", label: "Consultas" },
      { value: "documents", label: "Documentos" },
      { value: "invoices", label: "Faturas" },
      { value: "notes", label: "Notas internas" },
    ],
    value: "overview",
    onValueChange: () => {},
    "aria-label": "Secções do paciente",
  },
  render: (args) => {
    const [value, setValue] = useState("overview");
    return <Tabs {...args} value={value} onValueChange={setValue} />;
  },
};

/**
 * Long labels — verify tabs with verbose text do not break the underline or
 * push sibling tabs off-screen.
 */
export const LongLabels: Story = {
  args: {
    items: [
      { value: "clinical", label: "Registos clínicos e anamnese" },
      { value: "appointments", label: "Histórico de consultas" },
      { value: "invoices", label: "Faturação e recibos" },
    ],
    value: "clinical",
    onValueChange: () => {},
    "aria-label": "Secções detalhadas",
  },
  render: (args) => {
    const [value, setValue] = useState("clinical");
    return <Tabs {...args} value={value} onValueChange={setValue} />;
  },
};

/**
 * With panel association — full ARIA wiring: each tab has `aria-controls`
 * pointing to a `role="tabpanel"` element. Use a screen reader (VoiceOver,
 * NVDA) to verify the panel is announced when the tab is activated.
 */
export const WithPanelAssociation: Story = {
  args: {
    items: [],
    value: "summary",
    onValueChange: () => {},
    "aria-label": "Secções do paciente",
  },
  render: () => {
    const [value, setValue] = useState("summary");
    const items = [
      { value: "summary", label: "Resumo", "aria-controls": "panel-summary" },
      { value: "records", label: "Registos clínicos", "aria-controls": "panel-records" },
      { value: "documents", label: "Documentos", "aria-controls": "panel-documents" },
    ];
    return (
      <div className="flex flex-col gap-6">
        <Tabs
          items={items}
          value={value}
          onValueChange={setValue}
          aria-label="Secções do paciente"
        />
        <div
          id="panel-summary"
          role="tabpanel"
          tabIndex={0}
          hidden={value !== "summary"}
          aria-label="Resumo"
          className="rounded-lg border border-border p-4 text-sm text-text-secondary"
        >
          Painel Resumo — visão geral do paciente.
        </div>
        <div
          id="panel-records"
          role="tabpanel"
          tabIndex={0}
          hidden={value !== "records"}
          aria-label="Registos clínicos"
          className="rounded-lg border border-border p-4 text-sm text-text-secondary"
        >
          Painel Registos clínicos — lista de episódios e fichas.
        </div>
        <div
          id="panel-documents"
          role="tabpanel"
          tabIndex={0}
          hidden={value !== "documents"}
          aria-label="Documentos"
          className="rounded-lg border border-border p-4 text-sm text-text-secondary"
        >
          Painel Documentos — declarações e relatórios.
        </div>
      </div>
    );
  },
};

/**
 * Last tab active — verify the active underline and text colour render
 * correctly on the final item (regression guard for the `-mb-px` offset).
 */
export const LastTabActive: Story = {
  args: {
    items: [
      { value: "summary", label: "Resumo" },
      { value: "records", label: "Registos clínicos" },
      { value: "documents", label: "Documentos" },
      { value: "invoices", label: "Faturas" },
    ],
    value: "invoices",
    onValueChange: () => {},
    "aria-label": "Secções do paciente",
  },
  render: (args) => {
    const [value, setValue] = useState("invoices");
    return <Tabs {...args} value={value} onValueChange={setValue} />;
  },
};
