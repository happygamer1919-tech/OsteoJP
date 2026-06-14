import { heritageMotif } from "./heritage-svg";

/**
 * HeritageBand — SPEC-foundation §7.7 (EmptyState motif band upgrade).
 *
 * The heavier replacement for the HeritageDivider's 10px strip when it leads an
 * EmptyState column. A space-12 (48px) tall band carrying the azulejo motif at a
 * legible space-6 (24px) tile height (~2.4× the divider), with space-3 (12px) of
 * breathing room above and below (12 + 24 + 12 = 48). Width unchanged at the
 * 320px max, centered, `repeat-x` tiling.
 *
 * A NEW file by design (§7.7): HeritageDivider's default divider rendering is
 * left untouched for its other hosts (auth, section dividers). Like
 * HeritageCorners, the band recolors the existing asset to `accent-2-200` via a
 * CSS mask (the §7.4 tint rule) rather than baking the asset hex. Decorative:
 * `aria-hidden`, never focusable, never animated.
 *
 * Stays off patient-facing portal screens until JP sign-off (QUESTIONS.md Q6).
 *
 * @example
 * // Rendered by EmptyState when `heritage` is set; rarely used directly.
 * <HeritageBand />
 */
export interface HeritageBandProps {
  className?: string;
}

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

export function HeritageBand({ className }: HeritageBandProps) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        "mx-auto flex h-12 w-full max-w-80 items-center justify-center",
        className,
      )}
    >
      <div
        className="h-6 w-full bg-accent-2-200"
        style={{
          maskImage: `url("${heritageMotif.azulejo}")`,
          WebkitMaskImage: `url("${heritageMotif.azulejo}")`,
          maskRepeat: "repeat-x",
          WebkitMaskRepeat: "repeat-x",
          maskPosition: "center",
          WebkitMaskPosition: "center",
          maskSize: "auto 100%",
          WebkitMaskSize: "auto 100%",
        }}
      />
    </div>
  );
}
