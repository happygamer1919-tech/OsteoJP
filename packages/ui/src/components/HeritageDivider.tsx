import { heritageMotif, type HeritageVariant } from "./heritage-svg";

/**
 * HeritageDivider — SPEC-foundation §4.12.
 *
 * The only Wave 1 component allowed to render the heritage motif assets. A
 * 10px-tall, max-320px, centered horizontal band of the tileable motif repeated
 * via background-image, with space-8 vertical margin. Purely decorative:
 * aria-hidden, never focusable, never animated. The color is baked into the
 * asset (magenta for `moldovan`, teal for `azulejo`) — no recoloring in Wave 1.
 *
 * Allowed hosts ONLY (the design reviewer blocks anything else): auth screens,
 * EmptyState (via its `heritage` prop), loading screens, and as a section
 * divider on settings-class screens. Never behind data, never on agenda /
 * patient lists / clinical editor / invoicing / dashboards / tables / forms.
 * Patient-facing portal usage stays OFF until JP sign-off (QUESTIONS.md Q6);
 * staff surfaces may use it now.
 *
 * @example
 * // Auth screen / settings section divider (staff):
 * <HeritageDivider variant="azulejo" />
 */
export type HeritageDividerVariant = HeritageVariant;

export interface HeritageDividerProps {
  variant: HeritageDividerVariant;
  className?: string;
}

export function HeritageDivider({ variant, className }: HeritageDividerProps) {
  return (
    <div
      aria-hidden="true"
      className={["mx-auto my-8 h-2.5 w-full max-w-80", className]
        .filter(Boolean)
        .join(" ")}
      style={{
        backgroundImage: `url("${heritageMotif[variant]}")`,
        backgroundRepeat: "repeat-x",
        backgroundPosition: "center",
        backgroundSize: "auto 100%",
      }}
    />
  );
}
