import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus, Pencil, ChevronRight, X } from "lucide-react";

import {
  Button,
  type ButtonVariant,
  type ButtonSize,
} from "../src/components/Button";

/**
 * Foundation Button (SPEC-foundation §4.1). Distinct from the Storybook
 * scaffold's `Example/Button` demo, which is unrelated boilerplate.
 */
const meta = {
  title: "Components/Button",
  component: Button,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "inline-radio",
      options: ["primary", "secondary", "ghost", "destructive"],
    },
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
    loading: { control: "boolean" },
    disabled: { control: "boolean" },
    children: { control: "text" },
  },
  args: {
    variant: "primary",
    size: "md",
    loading: false,
    disabled: false,
    children: "Gravar",
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS: ButtonVariant[] = [
  "primary",
  "secondary",
  "ghost",
  "destructive",
];
const SIZES: ButtonSize[] = ["sm", "md", "lg"];

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: 16,
  alignItems: "center",
  flexWrap: "wrap",
};
const colStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};
const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans, system-ui)",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--color-text-secondary)",
  width: 96,
};

/** Controls playground — flip variant/size/loading/disabled live. */
export const Playground: Story = {};

/** Every variant at the default size. */
export const Variants: Story = {
  render: () => (
    <div style={rowStyle}>
      {VARIANTS.map((variant) => (
        <Button key={variant} variant={variant}>
          {variant}
        </Button>
      ))}
    </div>
  ),
};

/** Every size (primary). sm 32px · md 40px · lg 48px. */
export const Sizes: Story = {
  render: () => (
    <div style={rowStyle}>
      {SIZES.map((size) => (
        <Button key={size} size={size}>
          {size.toUpperCase()}
        </Button>
      ))}
    </div>
  ),
};

/** Leading icon, trailing icon, and both (icons are 20px / stroke 1.75). */
export const WithIcons: Story = {
  render: () => (
    <div style={rowStyle}>
      <Button iconLeft={Plus}>Adicionar</Button>
      <Button variant="secondary" iconRight={ChevronRight}>
        Seguinte
      </Button>
      <Button variant="ghost" iconLeft={Pencil} iconRight={ChevronRight}>
        Editar
      </Button>
    </div>
  ),
};

/** Icon-only (square, requires aria-label) across variants and sizes. */
export const IconOnly: Story = {
  render: () => (
    <div style={colStyle}>
      <div style={rowStyle}>
        {VARIANTS.map((variant) => (
          <Button
            key={variant}
            variant={variant}
            iconLeft={Pencil}
            aria-label={`Editar (${variant})`}
          />
        ))}
      </div>
      <div style={rowStyle}>
        {SIZES.map((size) => (
          <Button
            key={size}
            size={size}
            iconLeft={X}
            aria-label={`Fechar (${size})`}
          />
        ))}
      </div>
    </div>
  ),
};

/** Loading: spinner, aria-busy, interaction blocked, width preserved — both
 * with a leading icon (inline swap) and without (centered overlay). */
export const Loading: Story = {
  render: () => (
    <div style={rowStyle}>
      {VARIANTS.map((variant) => (
        <Button key={variant} variant={variant} loading>
          Gravar
        </Button>
      ))}
      <Button iconLeft={Plus} loading>
        Adicionar
      </Button>
      <Button iconLeft={Pencil} loading aria-label="A processar" />
    </div>
  ),
};

/** Disabled across every variant. */
export const Disabled: Story = {
  render: () => (
    <div style={rowStyle}>
      {VARIANTS.map((variant) => (
        <Button key={variant} variant={variant} disabled>
          {variant}
        </Button>
      ))}
    </div>
  ),
};

/**
 * Full matrix: every variant × every size, plus the disabled and loading
 * states. Hover, focus-visible and active are interactive pseudo-states —
 * hover or keyboard-focus a button above to see them.
 */
export const Matrix: Story = {
  render: () => (
    <div style={{ ...colStyle, gap: 24 }}>
      {VARIANTS.map((variant) => (
        <div key={variant} style={colStyle}>
          <div style={rowStyle}>
            <span style={labelStyle}>{variant}</span>
            {SIZES.map((size) => (
              <Button key={size} variant={variant} size={size}>
                Gravar
              </Button>
            ))}
            <Button variant={variant} disabled>
              Desativado
            </Button>
            <Button variant={variant} loading>
              Gravar
            </Button>
          </div>
        </div>
      ))}
    </div>
  ),
};
