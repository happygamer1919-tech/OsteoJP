import { heritageV2Motif } from "../assets/heritage/v2/heritage-v2-svg";

/**
 * HeritageFrame — SPEC-v2-foundation §6 (OsteoJP tenant theme only).
 *
 * A persistent, low-opacity decorative edge frame that sits BEHIND the content
 * area: Moldavian embroidery down the left edge (burgundy #A44B58, 20%) and
 * Portuguese azulejo down the right edge (blue #5B8FD9, 18%). Both motifs are
 * the heritage-v2 assets, tiled vertically so the corners and edges read as one
 * continuous frame.
 *
 * Contract (§6.3 / §6.4), all binding:
 * - Renders nothing unless the active tenant theme has heritage enabled
 *   (`enabled`, default false — the neutral tenant default). A tenant opts in.
 * - `aria-hidden` and `pointer-events: none`: never focusable, never announced,
 *   never an interaction target.
 * - Sits behind content (the host content area owns the stacking context; the
 *   frame is z-0 and content is a higher sibling). It never crowds right-aligned
 *   items and never reduces text contrast below AA — it lives at the extreme
 *   edges, behind padded content, capped at 20% / 18%.
 * - `density`: `calm` (auth + empty states) renders the fuller edge band;
 *   `restrained` (data screens — dashboard, agenda, patients, fichas list,
 *   review, admin) renders a thinner band so dense grids never read as busy.
 * - Forbidden on the clinical record editor (`/clinical/new`, `/clinical/<id>`).
 *   Defense in depth: pass the current `pathname` and the frame refuses to
 *   render there even if mounted by mistake.
 * - Wraps the content area only, never the sidebar panel (the AppShell places it
 *   inside the content region).
 *
 * @example
 * <div className="relative isolate">
 *   <HeritageFrame enabled={tenant.heritage} density="restrained" pathname={pathname} />
 *   <main className="relative z-10">{children}</main>
 * </div>
 */
export type HeritageFrameDensity = "calm" | "restrained";

export interface HeritageFrameProps {
  /** Tenant heritage flag. Default false: a neutral tenant renders nothing. */
  enabled?: boolean;
  /** `calm` for auth/empty (fuller band); `restrained` for data screens. */
  density?: HeritageFrameDensity;
  /** Current route. The frame refuses to render on the clinical editor (§6.2). */
  pathname?: string;
  className?: string;
}

// §6.2 hard-forbidden surface: the clinical record editor. The editor lives at
// `/clinical/new` and `/clinical/<id>`; the list (`/clinical`) and the review
// queue (`/clinical/review`) are allowed. Exported so the guard is testable.
const CLINICAL_EDITOR_ROUTE = /^\/clinical\/(?!review(?:\/|$))[^/]+/;

export function isHeritageForbiddenRoute(pathname: string | undefined): boolean {
  return pathname != null && CLINICAL_EDITOR_ROUTE.test(pathname);
}

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

// Edge band widths: calm renders a 48px band (the asset's native column width),
// restrained a 24px band so data screens stay quiet (§6.3.4).
const BAND_WIDTH: Record<HeritageFrameDensity, string> = {
  calm: "w-12",
  restrained: "w-6",
};

const bandStyle = (image: string, opacity: number): React.CSSProperties => ({
  backgroundImage: `url("${image}")`,
  backgroundRepeat: "repeat-y",
  // 100% wide fills the band; auto height keeps the motif's aspect so it tiles
  // vertically with no seam.
  backgroundSize: "100% auto",
  opacity,
});

export function HeritageFrame({
  enabled = false,
  density = "restrained",
  pathname,
  className,
}: HeritageFrameProps) {
  // Neutral tenant, or the forbidden clinical-editor surface: render nothing.
  if (!enabled || isHeritageForbiddenRoute(pathname)) return null;

  const width = BAND_WIDTH[density];

  return (
    <div
      aria-hidden="true"
      className={cx(
        "pointer-events-none absolute inset-0 z-0 overflow-hidden",
        className,
      )}
    >
      {/* Left edge: Moldavian embroidery, burgundy, 20% (§6.1). */}
      <div
        className={cx("absolute inset-y-0 left-0", width)}
        style={bandStyle(heritageV2Motif.embroideryLeft, 0.2)}
      />
      {/* Right edge: Portuguese azulejo, blue, 18% (§6.1). */}
      <div
        className={cx("absolute inset-y-0 right-0", width)}
        style={bandStyle(heritageV2Motif.azulejoRight, 0.18)}
      />
    </div>
  );
}
