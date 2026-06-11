import { brandSvg, type BrandVariant } from "./brand-svg";

/**
 * OsteoJP brand logo.
 *
 * Renders one of the three vector lockups committed by PR #175
 * (packages/ui/src/assets/brand/) as inline SVG. Inline (rather than an
 * <img>/url import) is deliberate: it is bundler-agnostic — `.svg` imports
 * resolve to a URL string under Vite/Storybook but a StaticImageData object
 * under Next.js, and inlining sidesteps that divergence — it needs no SVG
 * loader or ambient module declaration, and it has no async image load, so
 * there is no layout shift.
 *
 * The fills are the three brand hexes baked into the source art
 * (#98B2C2 / #8B1863 / #45B9A7); this is a multi-colour logo, not a
 * currentColor icon, so it is not themeable by design.
 *
 * Accessibility: the wrapper carries role="img" + an "OsteoJP" accessible
 * name; the inner <svg> is aria-hidden (see brand-svg.ts).
 *
 * No fixed pixel dimensions live in the SVGs — `size` sets the rendered
 * height and width follows the viewBox aspect ratio.
 *
 * @example
 *   import { BrandLockup } from "@osteojp/ui";
 *
 *   // App header (mark + wordmark, no tagline):
 *   <BrandLockup variant="lockup" size="md" />
 *   // Mark only, for favicons / collapsed nav / square contexts:
 *   <BrandLockup variant="mark" size="sm" />
 *   // Full lockup with tagline, for auth screens / report headers:
 *   <BrandLockup variant="full" size="lg" />
 */

export type BrandLockupVariant = BrandVariant;
export type BrandLockupSize = "sm" | "md" | "lg";

/** Rendered height in px per size token. Width follows the viewBox aspect ratio. */
const SIZE_HEIGHT_PX: Record<BrandLockupSize, number> = {
  sm: 24,
  md: 32,
  lg: 48,
};

export interface BrandLockupProps {
  /** full = mark + wordmark + tagline; lockup = mark + wordmark; mark = mark only. */
  variant?: BrandLockupVariant;
  /** sm = 24px, md = 32px, lg = 48px rendered height. */
  size?: BrandLockupSize;
  /** Overrides the default "OsteoJP" accessible name (e.g. a localized brand line). */
  title?: string;
  className?: string;
}

export function BrandLockup({
  variant = "lockup",
  size = "md",
  title = "OsteoJP",
  className,
}: BrandLockupProps) {
  return (
    <span
      role="img"
      aria-label={title}
      className={className}
      style={{
        display: "inline-flex",
        height: SIZE_HEIGHT_PX[size],
        lineHeight: 0,
      }}
      dangerouslySetInnerHTML={{ __html: brandSvg[variant] }}
    />
  );
}
