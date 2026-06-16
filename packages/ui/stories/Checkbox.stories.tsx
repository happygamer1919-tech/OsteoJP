import type { Meta, StoryObj } from "@storybook/react-vite";

import { Checkbox } from "../src/components/Checkbox";

/** Checkbox (SPEC-foundation §4.3): 20px box, indeterminate support, right label. */
const meta = {
  title: "Components/Checkbox",
  component: Checkbox,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: { label: "Enviar lembrete por SMS" },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unchecked: Story = {};
export const Checked: Story = { args: { defaultChecked: true } };
export const Indeterminate: Story = {
  args: { indeterminate: true, label: "Selecionar todos" },
};
export const Disabled: Story = { args: { disabled: true } };
export const DisabledChecked: Story = {
  args: { disabled: true, defaultChecked: true },
};
export const WithoutLabel: Story = {
  args: { label: undefined, "aria-label": "Selecionar linha" },
};

/** Every state together. */
export const AllStates: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Checkbox label="Por marcar" />
      <Checkbox label="Confirmado" defaultChecked />
      <Checkbox label="Parcial" indeterminate />
      <Checkbox label="Indisponível" disabled />
      <Checkbox label="Indisponível (marcado)" disabled defaultChecked />
    </div>
  ),
};
