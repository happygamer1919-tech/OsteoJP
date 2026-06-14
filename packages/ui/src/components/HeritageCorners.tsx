import { heritageMotif } from "./heritage-svg";

/**
 * HeritageCorners — SPEC-foundation §7.
 *
 * A decorative perimeter frame: motif clusters anchored in the four corners,
 * optionally joined by tileable strips along the four edges. The content (an
 * auth card, a full-bleed empty-state column) sits centered in a protected
 * inner region the frame never enters.
 *
 * Built from the two existing tileable heritage assets (heritage-svg.ts), but
 * unlike HeritageDivider (which bakes the asset hex) this component drives color
 * from brand tokens via a CSS mask: the asset is the stencil, a `bg-*` token
 * fills it, so the §6 palette is obeyed structurally. Per §7.4 only 200-level
 * tints are used (corners `accent-2-200` / `accent-1-200`, edges `primary-200`),
 * and the frame never enters the content region, so the AA text-contrast budget
 * is untouched.
 *
 * Rendering contract (§7.1, §7.5): a single `aria-hidden`, `pointer-events:none`
 * layer positioned `absolute inset-0`, `z-0`, never focusable, never animated,
 * never a tab stop. The host places content as a sibling at a higher stacking
 * context (`z-10`) inside the protected inset.
 *
 * Allowed hosts ONLY (§7.6, the design reviewer blocks anything else): auth
 * screens (`corners-only` or `corners-plus-edges`) and full-bleed empty states
 * (`corners-only` only). `corners-plus-edges` outside an auth route is a
 * blocker. Never on any screen rendering patient/clinical data, tables, the
 * agenda grid, dashboards, invoicing, or the clinical record editor. Portal
 * usage stays OFF until JP sign-off (QUESTIONS.md Q6); staff `/login` may use it
 * now.
 *
 * @example
 * // Staff /login: card sits inside the framed inner region.
 * <div className="relative min-h-dvh">
 *   <HeritageCorners variant="corners-plus-edges" tone="magenta" />
 *   <div className="relative z-10 mx-auto flex min-h-dvh max-w-md items-center px-8">
 *     <LoginCard />
 *   </div>
 * </div>
 */
export type HeritageCornersVariant = "corners-only" | "corners-plus-edges";
export type HeritageCornersTone = "teal" | "magenta";

export interface HeritageCornersProps {
  /** `corners-only` (default) on auth + full-bleed empty states; `corners-plus-edges` on auth only. */
  variant?: HeritageCornersVariant;
  /** Corner-cluster tint: `teal` (`accent-2-200`, default) or `magenta` (`accent-1-200`). */
  tone?: HeritageCornersTone;
  className?: string;
}

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

// Shared mask plumbing — the asset is the alpha stencil; the `bg-*` token fills it.
const maskBase = (
  image: string,
  repeat: string,
  size: string,
): React.CSSProperties => ({
  maskImage: `url("${image}")`,
  WebkitMaskImage: `url("${image}")`,
  maskRepeat: repeat,
  WebkitMaskRepeat: repeat,
  maskPosition: "center",
  WebkitMaskPosition: "center",
  maskSize: size,
  WebkitMaskSize: size,
});

// Corner clusters: azulejo four-fold tile, contained in the cluster box and
// mirrored per corner so the rosette points inward (§7.3).
const cornerMask = maskBase(heritageMotif.azulejo, "no-repeat", "contain");

// Edge strips: moldovan lattice tiled along the band length (§7.3).
const edgeMaskX = maskBase(heritageMotif.moldovan, "repeat-x", "auto 100%");
const edgeMaskY = maskBase(heritageMotif.moldovan, "repeat-y", "100% auto");

// Per-corner inward mirroring of the rosette.
const cornerTransform: Record<string, string> = {
  tl: "none",
  tr: "scaleX(-1)",
  bl: "scaleY(-1)",
  br: "scale(-1, -1)",
};

export function HeritageCorners({
  variant = "corners-only",
  tone = "teal",
  className,
}: HeritageCornersProps) {
  const cornerTint = tone === "magenta" ? "bg-accent-1-200" : "bg-accent-2-200";
  // Edges only render for the auth-only `corners-plus-edges` variant, and are
  // suppressed under 640px so the frame never crowds a narrow auth card (§7.3).
  const withEdges = variant === "corners-plus-edges";

  return (
    <div
      aria-hidden="true"
      className={cx(
        "pointer-events-none absolute inset-0 z-0 overflow-hidden",
        className,
      )}
    >
      {/* Corner clusters: space-12 (48px) under 640px, space-16 (64px) at ≥640. */}
      <span
        className={cx(
          "absolute left-0 top-0 size-12 sm:size-16",
          cornerTint,
        )}
        style={{ ...cornerMask, transform: cornerTransform.tl }}
      />
      <span
        className={cx(
          "absolute right-0 top-0 size-12 sm:size-16",
          cornerTint,
        )}
        style={{ ...cornerMask, transform: cornerTransform.tr }}
      />
      <span
        className={cx(
          "absolute bottom-0 left-0 size-12 sm:size-16",
          cornerTint,
        )}
        style={{ ...cornerMask, transform: cornerTransform.bl }}
      />
      <span
        className={cx(
          "absolute bottom-0 right-0 size-12 sm:size-16",
          cornerTint,
        )}
        style={{ ...cornerMask, transform: cornerTransform.br }}
      />

      {withEdges && (
        <>
          {/* Edge strips: space-6 (24px) thick, running between the corner
              clusters (inset space-16 = 64px). Hidden under 640px. */}
          <span
            className="absolute left-16 right-16 top-0 hidden h-6 bg-primary-200 sm:block"
            style={edgeMaskX}
          />
          <span
            className="absolute bottom-0 left-16 right-16 hidden h-6 bg-primary-200 sm:block"
            style={edgeMaskX}
          />
          <span
            className="absolute bottom-16 left-0 top-16 hidden w-6 bg-primary-200 sm:block"
            style={edgeMaskY}
          />
          <span
            className="absolute bottom-16 right-0 top-16 hidden w-6 bg-primary-200 sm:block"
            style={edgeMaskY}
          />
        </>
      )}
    </div>
  );
}
