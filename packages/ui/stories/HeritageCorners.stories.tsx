import type { Meta, StoryObj } from "@storybook/react-vite";

import { BrandLockup } from "../src/brand/BrandLockup";
import { Button } from "../src/components/Button";
import { Field } from "../src/components/Field";
import { HeritageCorners } from "../src/components/HeritageCorners";
import { Input } from "../src/components/Input";

/**
 * HeritageCorners (SPEC-foundation §7): a decorative perimeter frame for auth
 * screens and full-bleed empty states. The motif lives in the four corners
 * (optionally joined by edge strips on auth), recolored to 200-level brand tints
 * via a CSS mask, while the content sits in a protected inner region the frame
 * never enters. Decorative only: aria-hidden, pointer-events:none, never
 * focusable, never animated. `corners-plus-edges` is auth-only.
 */
const meta = {
  title: "Components/HeritageCorners",
  component: HeritageCorners,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof HeritageCorners>;

export default meta;
type Story = StoryObj<typeof meta>;

// A sample auth card that sits in the protected inner region, with a focusable
// control so the reviewer can confirm its focus ring clears the frame.
function AuthCard() {
  return (
    <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-sm">
      <div className="mb-6 flex justify-center">
        <BrandLockup variant="lockup" />
      </div>
      <div className="flex flex-col gap-4">
        <Field label="Email">
          <Input type="email" placeholder="nome@osteojp.pt" />
        </Field>
        <Field label="Palavra-passe">
          <Input type="password" />
        </Field>
        <Button variant="primary" className="mt-2 w-full">
          Iniciar sessão
        </Button>
      </div>
    </div>
  );
}

// Host frame: the relative full-bleed surface + the framed inner region. Width
// is driven by the `width` arg so the three-width story reads cleanly.
function Framed({
  width,
  ...props
}: { width: number } & React.ComponentProps<typeof HeritageCorners>) {
  return (
    <div
      className="relative mx-auto flex items-center justify-center bg-bg"
      style={{ width, minHeight: 640 }}
    >
      <HeritageCorners {...props} />
      <div className="relative z-10 flex w-full justify-center px-8 sm:px-16">
        <AuthCard />
      </div>
    </div>
  );
}

export const CornersOnlyTeal: Story = {
  args: { variant: "corners-only", tone: "teal" },
  render: (args) => <Framed width={960} {...args} />,
};

export const CornersOnlyMagenta: Story = {
  args: { variant: "corners-only", tone: "magenta" },
  render: (args) => <Framed width={960} {...args} />,
};

export const CornersPlusEdgesTeal: Story = {
  args: { variant: "corners-plus-edges", tone: "teal" },
  render: (args) => <Framed width={960} {...args} />,
};

export const CornersPlusEdgesMagenta: Story = {
  args: { variant: "corners-plus-edges", tone: "magenta" },
  render: (args) => <Framed width={960} {...args} />,
};

/**
 * Three widths (narrow mobile card, tablet, full desktop auth surface). Under
 * 640px the corner clusters shrink and the edge strips are suppressed, so the
 * frame never crowds a narrow card. The focused control's ring always clears the
 * frame (protected inner region, §7.5).
 */
export const ThreeWidths: Story = {
  args: { variant: "corners-plus-edges", tone: "magenta" },
  render: (args) => (
    <div className="flex flex-col items-center gap-8 bg-neutral-100 py-8">
      {[
        { label: "narrow mobile (480px)", width: 480 },
        { label: "tablet (768px)", width: 768 },
        { label: "desktop auth surface (1024px)", width: 1024 },
      ].map(({ label, width }) => (
        <div key={width} className="flex flex-col items-center gap-2">
          <span className="text-xs font-medium text-text-secondary">{label}</span>
          <Framed width={width} {...args} />
        </div>
      ))}
    </div>
  ),
};
