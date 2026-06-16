import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Tabs } from "../src/components/Tabs";

/** Tabs (SPEC-foundation §4.8): in-screen section navigation. */
const meta = {
  title: "Components/Tabs",
  component: Tabs,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

const items = [
  { value: "summary", label: "Resumo" },
  { value: "records", label: "Registos clínicos" },
  { value: "documents", label: "Documentos" },
  { value: "invoices", label: "Faturas" },
];

export const Default: Story = {
  args: { items, value: "summary", onValueChange: () => {}, "aria-label": "Secções do paciente" },
  render: (args) => {
    const [value, setValue] = useState("summary");
    return (
      <div className="flex flex-col gap-4">
        <Tabs {...args} value={value} onValueChange={setValue} />
        <p className="text-sm text-text-secondary">
          Secção ativa: <strong className="text-text-primary">{value}</strong>{" "}
          (use as setas do teclado).
        </p>
      </div>
    );
  },
};
