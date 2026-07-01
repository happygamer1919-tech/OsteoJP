import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState } from "react";

import { Combobox, type ComboboxOption } from "../src/components/Combobox";

/** Combobox (SPEC-staff-screens §2): generic searchable single-select. */
const meta: Meta<typeof Combobox> = {
  title: "Composites/Combobox",
  component: Combobox,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 360 }}><Story /></div>],
} satisfies Meta<typeof Combobox>;

export default meta;
type Story = StoryObj<typeof meta>;

const patients: ComboboxOption[] = [
  { value: "1", label: "Maria Silva", description: "NIF 234 567 890" },
  { value: "2", label: "João Pereira", description: "912 345 678" },
  { value: "3", label: "Ana Costa", description: "NIF 501 234 567" },
  { value: "4", label: "Rui Mendes", description: "934 111 222" },
];

export const Default: Story = {
  args: { options: patients, value: null, onChange: () => {}, emptyLabel: "Sem resultados", placeholder: "Procurar paciente" },
  render: (args) => {
    const [value, setValue] = useState<string | null>(null);
    return <Combobox {...args} value={value} onChange={setValue} />;
  },
};

export const WithCreateAction: Story = {
  args: { options: patients, value: null, onChange: () => {}, emptyLabel: "Sem resultados", placeholder: "Procurar paciente" },
  render: (args) => {
    const [value, setValue] = useState<string | null>(null);
    return (
      <Combobox
        {...args}
        value={value}
        onChange={setValue}
        actionLabel="Criar novo paciente"
        onAction={() => {}}
      />
    );
  },
};

export const Async: Story = {
  args: { options: patients, value: null, onChange: () => {}, emptyLabel: "Sem resultados", placeholder: "Procurar paciente" },
  render: (args) => {
    const [value, setValue] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const filtered = useMemo(
      () => patients.filter((p) => p.label.toLowerCase().includes(query.toLowerCase())),
      [query],
    );
    return (
      <Combobox
        {...args}
        options={filtered}
        value={value}
        onChange={setValue}
        query={query}
        onQueryChange={(q) => {
          setQuery(q);
          setLoading(true);
          setTimeout(() => setLoading(false), 400);
        }}
        loading={loading}
        actionLabel="Criar novo paciente"
        onAction={() => {}}
      />
    );
  },
};
