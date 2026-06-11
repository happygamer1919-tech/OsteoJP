import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";

import { Button } from "../src/components/Button";
import { Dialog } from "../src/components/Dialog";

/** Dialog (SPEC-foundation §4.6): centered confirm/destructive dialog. */
const meta = {
  title: "Components/Dialog",
  component: Dialog,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Destructive confirm: focus trapped, Escape / backdrop / Cancel close it. */
export const Destructive: Story = {
  args: {
    open: false,
    onClose: () => {},
    title: "Eliminar paciente",
    message: "Esta ação é permanente e não pode ser anulada.",
    confirmLabel: "Eliminar",
    cancelLabel: "Cancelar",
    onConfirm: () => {},
  },
  render: (args) => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Eliminar paciente
        </Button>
        <Dialog
          {...args}
          open={open}
          icon={AlertTriangle}
          iconTone="error"
          confirmVariant="destructive"
          onClose={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
        />
      </>
    );
  },
};

/** Primary confirm with no icon. */
export const Confirm: Story = {
  args: {
    open: false,
    onClose: () => {},
    title: "Terminar sessão",
    message: "Quer terminar a sessão nesta clínica?",
    confirmLabel: "Terminar",
    cancelLabel: "Cancelar",
    onConfirm: () => {},
  },
  render: (args) => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Terminar sessão</Button>
        <Dialog
          {...args}
          open={open}
          onClose={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
        />
      </>
    );
  },
};
