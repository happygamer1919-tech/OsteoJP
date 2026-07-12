"use client";
import { useId, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Button } from "@osteojp/ui";
import { s } from "@/lib/i18n";

import {
  AnteriorFigure,
  LateralLeftFigure,
  LateralRightFigure,
  PosteriorFigure,
  type FigSex,
} from "./BodyFigure";

// W5-26 (SPEC-ficha-medica AMENDMENTS ruling H): `intensity` is an OPTIONAL,
// additive 0-10 EVA (Escala Visual Analógica) value carried ONLY by
// `pain_location` (Local da dor) markers. It is a plain jsonb key on the marker
// object — the record `data` write path preserves undeclared keys (recon: save
// path stores the object verbatim; validateRecordData checks required-field
// presence only), so no template change and no DB migration are needed.
export type Marker = {
  marker_type: string;
  x: number;
  y: number;
  view: string;
  intensity?: number;
};

// The frozen marker_type that carries an EVA scale. Only this type shows the
// selector and can store `intensity`; the other eight are unaffected.
const PAIN_LOCATION = "pain_location";
const EVA_MIN = 0;
const EVA_MAX = 10;

// Line-art figures need much more opacity than the old filled silhouettes did
// (0.18) to read at all — single constant so it's easy to tune later.
const FIGURE_OPACITY = 0.6;

// Since PR #413 both sexes render the same neutral figure (no male source art
// exists), making the toggle a visible no-op. Re-enable when distinct
// male/female figure assets land.
const HAS_SEX_VARIANTS = false;

const VIEWS: { value: string; labelKey: keyof typeof s }[] = [
  { value: "anterior", labelKey: "clinical.bodychartViewAnterior" },
  { value: "posterior", labelKey: "clinical.bodychartViewPosterior" },
  { value: "lateral_left", labelKey: "clinical.bodychartViewLateralLeft" },
  { value: "lateral_right", labelKey: "clinical.bodychartViewLateralRight" },
];

const FIGURE_COMPONENTS: Record<
  string,
  React.ComponentType<{ sex: FigSex; className?: string; style?: React.CSSProperties }>
> = {
  anterior: AnteriorFigure,
  posterior: PosteriorFigure,
  lateral_left: LateralLeftFigure,
  lateral_right: LateralRightFigure,
};

function deriveFigSex(sex: string | null | undefined): FigSex {
  return sex === "female" ? "female" : "male";
}

// W5-25 (SPEC-ficha-medica AMENDMENTS ruling G): each of the nine frozen
// `marker_type` values renders with a UNIQUE geometric shape AND a unique colour
// token. SHAPE carries the meaning (greyscale-legible; the chart must read for
// colour-vision-deficient users), colour reinforces. The colour tokens live in
// apps/web/app/globals.css and are documented in docs/design/UI-STYLE.md; filled
// shapes carry a thin `stroke-surface` halo so they separate from the figure
// line-art, stroked shapes (cross, ring) carry only their colour stroke.
type MarkerShape =
  | "square"
  | "cross"
  | "triangle"
  | "diamond"
  | "star"
  | "circle"
  | "ring"
  | "arrow_right"
  | "arrow_left";

const MARKER_STYLE: Record<string, { shape: MarkerShape; cls: string }> = {
  blockage_dysfunction: { shape: "square", cls: "fill-marker-blockage stroke-surface" },
  scar: { shape: "cross", cls: "stroke-marker-scar" },
  hypertonicity: { shape: "triangle", cls: "fill-marker-hypertonicity stroke-surface" },
  hypotonicity: { shape: "diamond", cls: "fill-marker-hypotonicity stroke-surface" },
  pain_radiation: { shape: "star", cls: "fill-marker-radiation stroke-surface" },
  pain_location: { shape: "circle", cls: "fill-marker-location stroke-surface" },
  paresthesia: { shape: "ring", cls: "stroke-marker-paresthesia" },
  rotation_right: { shape: "arrow_right", cls: "fill-marker-rotation-right stroke-surface" },
  rotation_left: { shape: "arrow_left", cls: "fill-marker-rotation-left stroke-surface" },
};

// Fallback for any value outside the frozen enum (should never happen — the enum
// is immutable in osteopathy-v3.json): render a neutral filled circle.
const FALLBACK_STYLE = { shape: "circle" as MarkerShape, cls: "fill-marker-location stroke-surface" };

const styleFor = (markerType: string) => MARKER_STYLE[markerType] ?? FALLBACK_STYLE;

function glyphShape(shape: MarkerShape) {
  switch (shape) {
    case "square":
      return <rect x="3.5" y="3.5" width="9" height="9" strokeWidth="0.75" />;
    case "cross":
      return <path d="M4 4 L12 12 M12 4 L4 12" fill="none" strokeWidth="2.6" strokeLinecap="round" />;
    case "triangle":
      return <path d="M8 2.5 L13.6 13 L2.4 13 Z" strokeWidth="0.75" strokeLinejoin="round" />;
    case "diamond":
      return <path d="M8 2 L14 8 L8 14 L2 8 Z" strokeWidth="0.75" strokeLinejoin="round" />;
    case "star":
      return (
        <path
          d="M8 1.5 L9.65 6.1 L14.5 6.2 L10.6 9.1 L12 13.8 L8 10.9 L4 13.8 L5.4 9.1 L1.5 6.2 L6.35 6.1 Z"
          strokeWidth="0.6"
          strokeLinejoin="round"
        />
      );
    case "circle":
      return <circle cx="8" cy="8" r="5.8" strokeWidth="0.75" />;
    case "ring":
      return <circle cx="8" cy="8" r="5" fill="none" strokeWidth="2.6" />;
    case "arrow_right":
      return <path d="M2 6 L8 6 L8 3.4 L14.2 8 L8 12.6 L8 10 L2 10 Z" strokeWidth="0.75" strokeLinejoin="round" />;
    case "arrow_left":
      return <path d="M14 6 L8 6 L8 3.4 L1.8 8 L8 12.6 L8 10 L14 10 Z" strokeWidth="0.75" strokeLinejoin="round" />;
  }
}

/** A single marker glyph. `cls` supplies the fill/stroke colour token(s); the
 *  shape is greyscale-legible on its own. `aria-hidden` — the accessible name is
 *  carried by the marker's `title` and the legend. */
function MarkerGlyph({ shape, cls, size = 16 }: { shape: MarkerShape; cls: string; size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" className={cls}>
      {glyphShape(shape)}
    </svg>
  );
}

export function BodyChart({
  markers,
  onChange,
  markerOptions,
  readOnly,
  sex,
}: {
  markers: Marker[];
  onChange: (next: Marker[]) => void;
  markerOptions: { value: string; label: string }[];
  readOnly: boolean;
  sex?: string | null;
}) {
  const [view, setView] = useState<string>("anterior");
  const [markerType, setMarkerType] = useState<string>(markerOptions[0]?.value ?? "");
  const [figSex, setFigSex] = useState<FigSex>(() => deriveFigSex(sex));
  const [cursor, setCursor] = useState({ x: 0.5, y: 0.5 });
  const [chartFocused, setChartFocused] = useState(false);
  const hintId = useId();

  const Figure = FIGURE_COMPONENTS[view] ?? AnteriorFigure;

  function place(e: MouseEvent<HTMLDivElement>) {
    if (readOnly || !markerType) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    onChange([...markers, { marker_type: markerType, x, y, view }]);
  }

  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (readOnly || !markerType) return;
    const STEP = 0.05;
    switch (e.key) {
      case "ArrowLeft":  e.preventDefault(); setCursor((c) => ({ ...c, x: Math.max(0, c.x - STEP) })); break;
      case "ArrowRight": e.preventDefault(); setCursor((c) => ({ ...c, x: Math.min(1, c.x + STEP) })); break;
      case "ArrowUp":    e.preventDefault(); setCursor((c) => ({ ...c, y: Math.max(0, c.y - STEP) })); break;
      case "ArrowDown":  e.preventDefault(); setCursor((c) => ({ ...c, y: Math.min(1, c.y + STEP) })); break;
      case "Enter":
      case " ":
        e.preventDefault();
        onChange([...markers, { marker_type: markerType, x: cursor.x, y: cursor.y, view }]);
        break;
    }
  }

  function remove(index: number) {
    onChange(markers.filter((_, i) => i !== index));
  }

  // W5-26: set/clear the EVA `intensity` on a single pain_location marker.
  // `null` removes the key entirely (optional — a valid scale-less marker).
  function setIntensity(index: number, value: number | null) {
    onChange(
      markers.map((m, i) => {
        if (i !== index) return m;
        if (value == null) {
          // Clear the optional key entirely — a scale-less marker stores no intensity.
          const rest = { ...m };
          delete rest.intensity;
          return rest;
        }
        return { ...m, intensity: value };
      }),
    );
  }

  const canInteract = !readOnly && markerOptions.length > 0;

  const labelFor = (value: string) =>
    markerOptions.find((o) => o.value === value)?.label ?? value;

  // W5-26: the display label appends the EVA value for pain_location markers that
  // carry one — "Local da dor - EVA 7/10". Other types (and scale-less Local da
  // dor markers) show the plain label. Used by the marker list AND the on-chart
  // tooltip so both surfaces show the intensity.
  const displayLabel = (m: Marker) =>
    m.marker_type === PAIN_LOCATION && typeof m.intensity === "number"
      ? `${labelFor(m.marker_type)} - EVA ${m.intensity}/10`
      : labelFor(m.marker_type);
  const inView = markers
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.view === view);

  return (
    <div className="space-y-2">
      <p id={hintId} className="text-xs text-text-secondary">{s["clinical.bodychartHint"]}</p>

      <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Button
            key={v.value}
            type="button"
            aria-pressed={view === v.value}
            onClick={() => setView(v.value)}
            variant={view === v.value ? "primary" : "secondary"}
            size="sm"
          >
            {s[v.labelKey]}
          </Button>
        ))}
      </div>

      {canInteract && (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs font-medium">{s["clinical.bodychartMarkerType"]}</span>
          <select
            value={markerType}
            onChange={(e) => setMarkerType(e.target.value)}
            className="rounded border px-2 py-1 text-sm"
          >
            {markerOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {!readOnly && markerOptions.length === 0 && (
        <p className="text-xs text-text-muted">{s["clinical.bodychartNoTypes"]}</p>
      )}

      <div className="flex items-start gap-3">
        <div
          data-testid="bodychart-canvas"
          role={canInteract ? "application" : undefined}
          tabIndex={canInteract ? 0 : undefined}
          aria-describedby={canInteract ? hintId : undefined}
          onClick={canInteract ? place : undefined}
          onKeyDown={canInteract ? handleKey : undefined}
          onFocus={canInteract ? () => setChartFocused(true) : undefined}
          onBlur={canInteract ? () => setChartFocused(false) : undefined}
          className={`relative h-80 w-56 shrink-0 rounded border bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${canInteract ? "cursor-crosshair" : ""}`}
        >
          {/* Body figure background layer */}
          <Figure
            sex={figSex}
            className="pointer-events-none absolute inset-0 h-full w-full text-text-secondary"
            style={{ opacity: FIGURE_OPACITY }}
          />

          {/* Keyboard cursor indicator — visible only while the chart has focus */}
          {canInteract && chartFocused && (
            <span
              aria-hidden="true"
              className="absolute -ml-1.5 -mt-1.5 h-3 w-3 rounded-full border-2 border-brand-teal bg-transparent"
              style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }}
            />
          )}
          {inView.map(({ m, i }) => {
            const style = styleFor(m.marker_type);
            return (
              <span
                key={i}
                title={displayLabel(m)}
                data-marker-type={m.marker_type}
                data-marker-shape={style.shape}
                className="absolute -ml-2 -mt-2 flex h-4 w-4 items-center justify-center"
                style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
              >
                <MarkerGlyph shape={style.shape} cls={style.cls} />
              </span>
            );
          })}
        </div>

        {/* Sex toggle — stacked vertically beside the chart */}
        {HAS_SEX_VARIANTS && (
          <div className="flex flex-col gap-1 pt-1">
            <Button
              type="button"
              onClick={() => setFigSex("male")}
              variant={figSex === "male" ? "primary" : "secondary"}
              size="sm"
              aria-pressed={figSex === "male"}
            >
              {s["clinical.bodychartFigureMale"]}
            </Button>
            <Button
              type="button"
              onClick={() => setFigSex("female")}
              variant={figSex === "female" ? "primary" : "secondary"}
              size="sm"
              aria-pressed={figSex === "female"}
            >
              {s["clinical.bodychartFigureFemale"]}
            </Button>
          </div>
        )}
      </div>

      {/* W5-25 ruling G: a compact, ALWAYS-VISIBLE legend mapping each shape +
          colour to its pt-PT type name (not a hover/disclosure). Reuses the
          template-derived marker labels so it stays in sync with the enum. */}
      {markerOptions.length > 0 && (
        <div data-testid="bodychart-legend" className="rounded border border-border bg-surface p-2">
          <p className="mb-1 text-xs font-medium text-text-secondary">
            {s["clinical.bodychartLegendTitle"]}
          </p>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
            {markerOptions.map((o) => {
              const style = styleFor(o.value);
              return (
                <li
                  key={o.value}
                  data-legend-type={o.value}
                  data-marker-shape={style.shape}
                  className="flex min-w-0 items-center gap-1.5 text-xs text-text-secondary"
                >
                  <MarkerGlyph shape={style.shape} cls={style.cls} size={14} />
                  <span className="min-w-0 break-words">{o.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ul className="space-y-1 text-sm">
        {markers.length === 0 && (
          <li className="text-xs text-text-secondary">{s["clinical.bodychartEmpty"]}</li>
        )}
        {markers.map((m, i) => {
          const isPain = m.marker_type === PAIN_LOCATION;
          return (
            <li key={i} className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="shrink-0 text-xs text-text-secondary">[{m.view}]</span>
              <span className="min-w-0 flex-1 break-words">{displayLabel(m)}</span>
              {/* W5-26 ruling H: only Local da dor carries a 0-10 EVA scale.
                  Draft = an editable selector (min 44px tall, tap-friendly);
                  the placed marker starts scale-less (optional) and the value
                  is set here. Signed/locked: no control — displayLabel already
                  shows the stored "EVA n/10" value. */}
              {isPain && !readOnly && (
                <label className="flex shrink-0 items-center gap-1 text-xs">
                  <span className="text-text-secondary">{s["clinical.bodychartEvaLabel"]}</span>
                  <select
                    aria-label={s["clinical.bodychartEvaSelectAria"]}
                    value={typeof m.intensity === "number" ? String(m.intensity) : ""}
                    onChange={(e) =>
                      setIntensity(i, e.target.value === "" ? null : Number(e.target.value))
                    }
                    className="min-h-11 rounded border px-2 text-sm"
                  >
                    <option value="">{s["clinical.bodychartEvaNone"]}</option>
                    {Array.from({ length: EVA_MAX - EVA_MIN + 1 }, (_, n) => EVA_MIN + n).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!readOnly && (
                <Button
                  type="button"
                  onClick={() => remove(i)}
                  variant="ghost"
                  size="sm"
                >
                  {s["clinical.bodychartRemove"]}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
