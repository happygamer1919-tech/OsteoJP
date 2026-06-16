import type { Meta, StoryObj } from "@storybook/react-vite";

import { StatusChip } from "../src/components/StatusChip";
import { Table, TableCardRow, type TableColumn } from "../src/components/Table";

/** Table (SPEC-foundation §4.7): dense clinical list with built-in states. */
const meta = {
  title: "Components/Table",
  component: Table,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof Table>;

export default meta;

interface Patient {
  id: string;
  name: string;
  lastVisit: string;
  status: "confirmed" | "pending" | "noShow";
  balance: string;
}

const rows: Patient[] = [
  { id: "1", name: "Maria Silva", lastVisit: "02/06/2026", status: "confirmed", balance: "€0,00" },
  { id: "2", name: "João Pereira", lastVisit: "28/05/2026", status: "pending", balance: "€45,00" },
  { id: "3", name: "Ana Costa", lastVisit: "21/05/2026", status: "noShow", balance: "€80,00" },
];

const toneFor = { confirmed: "success", pending: "warning", noShow: "error" } as const;
const labelFor = { confirmed: "Confirmada", pending: "Por confirmar", noShow: "Falta" };

const columns: Array<TableColumn<Patient>> = [
  { key: "name", header: "Nome", sortable: true, cell: (r) => r.name },
  { key: "lastVisit", header: "Última consulta", sortable: true, cell: (r) => r.lastVisit },
  {
    key: "status",
    header: "Estado",
    align: "right",
    cell: (r) => (
      <StatusChip tone={toneFor[r.status]} dot>
        {labelFor[r.status]}
      </StatusChip>
    ),
  },
  { key: "balance", header: "Saldo", align: "right", cell: (r) => r.balance },
];

type Story = StoryObj<typeof Table<Patient>>;

export const Ready: Story = {
  args: { columns, data: rows, rowKey: (r) => r.id, caption: "Lista de pacientes" },
};

export const Sortable: Story = {
  args: {
    columns,
    data: rows,
    rowKey: (r) => r.id,
    caption: "Lista de pacientes",
    sort: { key: "name", direction: "asc" },
    onSortChange: () => {},
  },
};

export const InteractiveRows: Story = {
  args: {
    columns,
    data: rows,
    rowKey: (r) => r.id,
    caption: "Lista de pacientes",
    getRowHref: (r) => `#patient-${r.id}`,
    getRowLabel: (r) => `Abrir ${r.name}`,
  },
};

export const Loading: Story = {
  args: { columns, data: [], rowKey: (r) => r.id, caption: "Lista de pacientes", state: "loading" },
};

export const Empty: Story = {
  args: {
    columns,
    data: [],
    rowKey: (r) => r.id,
    caption: "Lista de pacientes",
    state: "empty",
    empty: <span className="text-sm text-text-secondary">Sem pacientes para mostrar.</span>,
  },
};

export const ErrorState: Story = {
  args: {
    columns,
    data: [],
    rowKey: (r) => r.id,
    caption: "Lista de pacientes",
    state: "error",
    error: <span className="text-sm text-text-secondary">Não foi possível carregar a lista.</span>,
  },
};

/** TableCardRow — the under-640px stacked replacement for a row. */
export const CardRows: Story = {
  args: { columns, data: [], rowKey: (r) => r.id, caption: "Lista de pacientes" },
  render: () => (
    <div className="flex max-w-sm flex-col gap-3">
      {rows.map((r) => (
        <TableCardRow
          key={r.id}
          href={`#patient-${r.id}`}
          aria-label={`Abrir ${r.name}`}
          items={[
            { label: "Nome", value: r.name },
            { label: "Última consulta", value: r.lastVisit },
            { label: "Saldo", value: r.balance },
          ]}
        />
      ))}
    </div>
  ),
};
