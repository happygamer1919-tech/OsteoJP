import type { Meta, StoryObj } from "@storybook/react-vite";

import { ErrorState } from "../src/components/ErrorState";

/** ErrorState (SPEC-foundation §4.10): plain-language cause + retry; no raw codes. */
const meta = {
  title: "Components/ErrorState",
  component: ErrorState,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof ErrorState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Não foi possível carregar os registos",
    description: "Verifique a ligação e tente novamente.",
    retryLabel: "Tentar novamente",
    onRetry: () => {},
  },
};

export const WithCode: Story = {
  args: {
    title: "Não foi possível carregar os registos",
    description: "Verifique a ligação e tente novamente.",
    code: "Referência: REF-500",
    retryLabel: "Tentar novamente",
    onRetry: () => {},
  },
};

export const NoRetry: Story = {
  args: {
    title: "Sem permissões",
    description: "Não tem permissão para ver estes registos.",
  },
};
