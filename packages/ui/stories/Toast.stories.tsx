import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";

import { Button } from "../src/components/Button";
import { ToastProvider, useToast, type ToastOptions } from "../src/components/Toast";

/** Toast (SPEC-foundation §4.9): transient notifications in one live region. */
const meta = {
  title: "Components/Toast",
  component: ToastProvider,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof ToastProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Never auto-dismisses in the pinned-state stories below — a real toast
 * clears itself after `duration`, but these render at rest for browsing. */
const PINNED_DURATION = 24 * 60 * 60 * 1000;

/** Pushes a single toast on mount so the story renders it at rest, with no
 * click required. */
function AutoToast(options: ToastOptions) {
  const toast = useToast();
  useEffect(() => {
    toast({ duration: PINNED_DURATION, ...options });
  }, []);
  return null;
}

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

/** Success tone at rest — check icon, `role="status"`. */
export const Success: Story = {
  args: { children: null },
  render: () => (
    <ToastProvider>
      <AutoToast tone="success" message="Paciente gravado." />
    </ToastProvider>
  ),
};

/** Info tone at rest — info icon, `role="status"`. */
export const Info: Story = {
  args: { children: null },
  render: () => (
    <ToastProvider>
      <AutoToast tone="info" message="A sincronizar registos…" />
    </ToastProvider>
  ),
};

/** Error tone at rest with a ghost retry action — alert icon,
 * `role="alert"` so it announces assertively. */
export const ErrorWithRetry: Story = {
  args: { children: null },
  render: () => (
    <ToastProvider>
      <AutoToast
        tone="error"
        message="Não foi possível gravar."
        action={{ label: "Tentar novamente", onClick: () => {} }}
      />
    </ToastProvider>
  ),
};
