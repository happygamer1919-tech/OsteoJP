import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../src/components/Button";
import { ToastProvider, useToast } from "../src/components/Toast";

/** Toast (SPEC-foundation §4.9): transient notifications in one live region. */
const meta = {
  title: "Components/Toast",
  component: ToastProvider,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof ToastProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-3">
      <Button onClick={() => toast({ tone: "success", message: "Paciente gravado." })}>
        Sucesso
      </Button>
      <Button
        variant="secondary"
        onClick={() => toast({ tone: "info", message: "A sincronizar registos…" })}
      >
        Info
      </Button>
      <Button
        variant="destructive"
        onClick={() =>
          toast({
            tone: "error",
            message: "Não foi possível gravar.",
            action: { label: "Tentar novamente", onClick: () => {} },
          })
        }
      >
        Erro (com ação)
      </Button>
    </div>
  );
}

/**
 * Click to push toasts (bottom-right). They auto-dismiss after 5s; hover or
 * focus a toast to pause it. At most 3 stack — a 4th drops the oldest. Error
 * toasts announce assertively (role="alert").
 */
export const Playground: Story = {
  args: { children: null },
  render: () => (
    <ToastProvider>
      <Demo />
    </ToastProvider>
  ),
};
