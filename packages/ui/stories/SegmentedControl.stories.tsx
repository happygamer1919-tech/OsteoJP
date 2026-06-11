import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { SegmentedControl } from "../src/components/SegmentedControl";

/** SegmentedControl (SPEC-foundation §4.8): mutually-exclusive input modes. */
const meta = {
  title: "Components/SegmentedControl",
  component: SegmentedControl,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof SegmentedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

const items = [
  { value: "search", label: "Procurar paciente" },
  { value: "new", label: "Novo paciente" },
];

export const Default: Story = {
  args: { items, value: "search", onValueChange: () => {}, "aria-label": "Modo" },
  render: (args) => {
    const [value, setValue] = useState("search");
    return <SegmentedControl {...args} value={value} onValueChange={setValue} />;
  },
};

export const Three: Story = {
  args: {
    items: [
      { value: "day", label: "Dia" },
      { value: "week", label: "Semana" },
      { value: "month", label: "Mês" },
    ],
    value: "week",
    onValueChange: () => {},
    "aria-label": "Vista da agenda",
  },
  render: (args) => {
    const [value, setValue] = useState("week");
    return <SegmentedControl {...args} value={value} onValueChange={setValue} />;
  },
};
