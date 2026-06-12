import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { TimeField } from "../src/components/TimeField";

/** TimeField (SPEC-staff-screens §2): "HH:mm" on a minute step. */
const meta = {
  title: "Composites/TimeField",
  component: TimeField,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof TimeField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { value: "", onChange: () => {}, hourLabel: "Horas", minuteLabel: "Minutos" },
  render: (args) => {
    const [value, setValue] = useState("");
    return (
      <div className="flex flex-col gap-2">
        <TimeField {...args} value={value} onChange={setValue} />
        <span className="text-sm text-text-secondary">value: {value || "—"}</span>
      </div>
    );
  },
};

export const Bounded: Story = {
  args: { value: "09:00", onChange: () => {}, step: 15, min: "08:00", max: "20:00", hourLabel: "Horas", minuteLabel: "Minutos" },
  render: (args) => {
    const [value, setValue] = useState("09:00");
    return <TimeField {...args} value={value} onChange={setValue} />;
  },
};

export const HalfHourStep: Story = {
  args: { value: "10:30", onChange: () => {}, step: 30, hourLabel: "Horas", minuteLabel: "Minutos" },
  render: (args) => {
    const [value, setValue] = useState("10:30");
    return <TimeField {...args} value={value} onChange={setValue} />;
  },
};
