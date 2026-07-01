import type { Meta, StoryObj } from "@storybook/react-vite";

import { Field } from "../src/components/Field";
import { Select } from "../src/components/Select";

/** Select (SPEC-foundation §4.3): styled native select, Input skin + chevron. */
const meta: Meta<typeof Select> = {
  title: "Components/Select",
  component: Select,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 360 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

const options = (
  <>
    <option value="" disabled>
      Escolher clínica
    </option>
    <option value="lav">Linda-a-Velha</option>
    <option value="cb">Castelo Branco</option>
    <option value="mn">Montemor-o-Novo</option>
  </>
);

export const Default: Story = {
  args: { defaultValue: "lav", children: options },
};

export const Placeholder: Story = {
  args: { defaultValue: "", children: options },
};

export const Disabled: Story = {
  args: { defaultValue: "lav", disabled: true, children: options },
};

export const Invalid: Story = {
  args: { defaultValue: "", invalid: true, children: options },
};

/** Inside a Field — label, required marker, and error wiring. */
export const InField: Story = {
  args: { defaultValue: "", children: options },
  render: (args) => (
    <Field label="Clínica" required error="Selecione uma clínica.">
      <Select {...args} />
    </Field>
  ),
};
