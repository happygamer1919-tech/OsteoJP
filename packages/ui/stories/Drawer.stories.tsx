import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Button } from "../src/components/Button";
import { Drawer } from "../src/components/Drawer";
import { Field } from "../src/components/Field";
import { Input } from "../src/components/Input";

/** Drawer (SPEC-foundation §4.6): right-side create/edit surface. */
const meta = {
  title: "Components/Drawer",
  component: Drawer,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof Drawer>;

export default meta;
type Story = StoryObj<typeof meta>;

const discard = {
  title: "Descartar alterações?",
  message: "As alterações não guardadas serão perdidas.",
  confirmLabel: "Descartar",
  cancelLabel: "Continuar a editar",
};

const baseArgs = {
  open: false,
  onClose: () => {},
  title: "Novo paciente",
  cancelLabel: "Cancelar",
  confirmLabel: "Gravar",
  onConfirm: () => {},
  closeLabel: "Fechar",
  children: null,
};

/** Open / close: Escape, X, Cancel, and backdrop click all close it. */
export const Default: Story = {
  args: baseArgs,
  render: (args) => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Novo paciente</Button>
        <Drawer
          {...args}
          open={open}
          onClose={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
        >
          <div className="flex flex-col gap-4">
            <Field label="Nome">
              <Input placeholder="Nome do paciente" />
            </Field>
            <Field label="Email">
              <Input type="email" placeholder="nome@exemplo.pt" />
            </Field>
          </div>
        </Drawer>
      </>
    );
  },
};

/**
 * Dirty-discard flow: with unsaved changes, a close attempt (Escape, X, Cancel,
 * backdrop) opens the discard confirm Dialog instead of closing immediately.
 */
export const DirtyDiscard: Story = {
  args: baseArgs,
  render: (args) => {
    const [open, setOpen] = useState(false);
    const [dirty, setDirty] = useState(true);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Editar paciente</Button>
        <Drawer
          {...args}
          title="Editar paciente"
          open={open}
          dirty={dirty}
          discard={discard}
          onClose={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
        >
          <div className="flex flex-col gap-4">
            <Field
              label="Nome"
              helperText="Edite o nome para manter o estado 'dirty'."
            >
              <Input defaultValue="Maria Silva" onChange={() => setDirty(true)} />
            </Field>
          </div>
        </Drawer>
      </>
    );
  },
};
