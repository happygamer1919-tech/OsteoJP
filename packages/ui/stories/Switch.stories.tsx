import type { Meta, StoryObj } from "@storybook/react-vite";

import { Switch } from "../src/components/Switch";

/** Switch (SPEC-foundation §4.3): role=switch toggle with an animated thumb. */
const meta = {
  title: "Components/Switch",
  component: Switch,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: { "aria-label": "Lembretes por SMS" },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {};
export const On: Story = { args: { defaultChecked: true } };
export const DisabledOff: Story = { args: { disabled: true } };
export const DisabledOn: Story = { args: { disabled: true, defaultChecked: true } };

/** Paired with screen-owned status text (the Ligado/Desligado pattern). */
export const WithStatusText: Story = {
  render: () => {
    const labelId = "switch-reminders-label";
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
        <Switch aria-labelledby={labelId} defaultChecked />
        <span id={labelId} className="text-sm text-text-primary">
          Lembretes ativados
        </span>
      </div>
    );
  },
};
