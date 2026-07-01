import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { DatePicker } from "../src/components/DatePicker";

/** DatePicker (SPEC-staff-screens §2): month-calendar popover, Monday-first. */
const meta: Meta<typeof DatePicker> = {
  title: "Composites/DatePicker",
  component: DatePicker,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 320 }}><Story /></div>],
} satisfies Meta<typeof DatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { value: null, onChange: () => {}, placeholder: "Escolher data", triggerLabel: "Escolher data" },
  render: (args) => {
    const [value, setValue] = useState<string | null>(null);
    return <DatePicker {...args} value={value} onChange={setValue} />;
  },
};

export const Preselected: Story = {
  args: { value: "2026-06-15", onChange: () => {}, triggerLabel: "Escolher data" },
  render: (args) => {
    const [value, setValue] = useState<string | null>("2026-06-15");
    return <DatePicker {...args} value={value} onChange={setValue} />;
  },
};

/** Min today, max +30 days: out-of-range days are muted and non-clickable. */
export const Bounded: Story = {
  args: { value: null, onChange: () => {}, placeholder: "Escolher data", triggerLabel: "Escolher data" },
  render: (args) => {
    const [value, setValue] = useState<string | null>(null);
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const max = new Date(today);
    max.setDate(max.getDate() + 30);
    return <DatePicker {...args} value={value} onChange={setValue} min={iso(today)} max={iso(max)} />;
  },
};
