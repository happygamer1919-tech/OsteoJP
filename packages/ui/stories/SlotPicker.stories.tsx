import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { SlotPicker, type SlotOption } from "../src/components/SlotPicker";

/** SlotPicker (SPEC-staff-screens §2): wrapping grid of time chips. */
const meta: Meta<typeof SlotPicker> = {
  title: "Composites/SlotPicker",
  component: SlotPicker,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 360 }}><Story /></div>],
} satisfies Meta<typeof SlotPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

const slots: SlotOption[] = [
  "09:00", "09:15", "09:30", "09:45",
  "10:00", "10:15", "10:30",
  "14:00", "14:15", "14:30", "14:45", "15:00",
].map((t) => ({ value: t, label: t }));

export const Default: Story = {
  args: { slots, value: null, onChange: () => {}, "aria-label": "Horários disponíveis" },
  render: (args) => {
    const [value, setValue] = useState<string | null>(null);
    return <SlotPicker {...args} value={value} onChange={setValue} />;
  },
};

export const Preselected: Story = {
  args: { slots, value: "10:15", onChange: () => {}, "aria-label": "Horários disponíveis" },
  render: (args) => {
    const [value, setValue] = useState<string | null>("10:15");
    return <SlotPicker {...args} value={value} onChange={setValue} />;
  },
};

export const Sparse: Story = {
  args: {
    slots: [{ value: "11:00", label: "11:00" }, { value: "16:30", label: "16:30" }],
    value: null,
    onChange: () => {},
    "aria-label": "Horários disponíveis",
  },
  render: (args) => {
    const [value, setValue] = useState<string | null>(null);
    return <SlotPicker {...args} value={value} onChange={setValue} />;
  },
};
