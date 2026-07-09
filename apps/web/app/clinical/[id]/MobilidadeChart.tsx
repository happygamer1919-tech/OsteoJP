"use client";
import { useId, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Button } from "@osteojp/ui";
import { s } from "@/lib/i18n";

/**
 * Mobilidade Activa / Passiva widget (SPEC-ficha-medica.md sec 5.10; AMENDMENTS
 * ruling E).
 *
 * Renders THREE labeled circles (Cervical, Dorsal, Lombar), each carrying
 * reference spokes (full vertical + full horizontal + two upper diagonals) and
 * UNLIMITED markers of two types: Mobilidade Activa (teal dot) and Mobilidade
 * Passiva (magenta star). Markers store 0-1 normalized coords.
 *
 * Ruling-E interaction: a min-44px marker-type toggle selects the type; an
 * "Inserir marcador" action ARMS placement (sticky — place as many as you wish);
 * a click/tap or keyboard (arrow cursor + Enter/Space) then places on any
 * circle. A single record-wide "Limpar marcadores" clears all three circles.
 * `readOnly` finalized records show markers only — no toggle, no arm, no clear,
 * no placement.
 *
 * Persistence keeps the shipped per-circle keying (`mobilidade.{cervical,dorsal,
 * lombar}` arrays of `{marker_type,x,y}`) so already-stored marker data is never
 * reshaped (migration-free). BodyChart.tsx is a separate component, not touched.
 */

export type MobilidadeMarkerType = "activa" | "passiva";
export type MobilidadeMarker = { marker_type: MobilidadeMarkerType; x: number; y: number };
export type MobilidadeRegion = "cervical" | "dorsal" | "lombar";
export type MobilidadeValue = Partial<Record<MobilidadeRegion, MobilidadeMarker[]>>;

const REGIONS: { key: MobilidadeRegion; labelKey: "clinical.mobilidadeCervical" | "clinical.mobilidadeDorsal" | "clinical.mobilidadeLombar" }[] = [
  { key: "cervical", labelKey: "clinical.mobilidadeCervical" },
  { key: "dorsal", labelKey: "clinical.mobilidadeDorsal" },
  { key: "lombar", labelKey: "clinical.mobilidadeLombar" },
];

const MARKER_TYPES: { value: MobilidadeMarkerType; labelKey: "clinical.mobilidadeActiva" | "clinical.mobilidadePassiva" }[] = [
  { value: "activa", labelKey: "clinical.mobilidadeActiva" },
  { value: "passiva", labelKey: "clinical.mobilidadePassiva" },
];

function asMarkers(v: unknown): MobilidadeMarker[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (m): m is MobilidadeMarker =>
      typeof m === "object" &&
      m !== null &&
      (m as MobilidadeMarker).marker_type != null &&
      typeof (m as MobilidadeMarker).x === "number" &&
      typeof (m as MobilidadeMarker).y === "number",
  );
}

/** Reference spokes drawn inside every circle (ruling E): full vertical, full
 *  horizontal, and two upper diagonals to the 45° points on the circle edge. */
function ReferenceSpokes() {
  return (
    <svg
      viewBox="0 0 100 100"
      className="pointer-events-none absolute inset-0 h-full w-full text-v2-border"
      aria-hidden="true"
    >
      {/* full vertical (top + bottom) */}
      <line x1="50" y1="0" x2="50" y2="100" stroke="currentColor" strokeWidth="1" />
      {/* full horizontal */}
      <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="1" />
      {/* two upper diagonals (centre to the upper-left / upper-right circle edge) */}
      <line x1="50" y1="50" x2="14.6" y2="14.6" stroke="currentColor" strokeWidth="1" />
      <line x1="50" y1="50" x2="85.4" y2="14.6" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

/** A single labeled circle with reference spokes and its markers. Placement is
 *  gated on `armed` (the record-level "Inserir marcador" arm step). */
function RegionCircle({
  label,
  markers,
  markerType,
  readOnly,
  armed,
  onChange,
}: {
  label: string;
  markers: MobilidadeMarker[];
  markerType: MobilidadeMarkerType;
  readOnly: boolean;
  armed: boolean;
  onChange: (next: MobilidadeMarker[]) => void;
}) {
  const [cursor, setCursor] = useState({ x: 0.5, y: 0.5 });
  const [focused, setFocused] = useState(false);
  const hintId = useId();
  const canInteract = !readOnly;
  const canPlace = canInteract && armed;

  function place(e: MouseEvent<HTMLDivElement>) {
    if (!canPlace) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    onChange([...markers, { marker_type: markerType, x, y }]);
  }

  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (!canInteract) return;
    const STEP = 0.05;
    switch (e.key) {
      case "ArrowLeft":  e.preventDefault(); setCursor((c) => ({ ...c, x: Math.max(0, c.x - STEP) })); break;
      case "ArrowRight": e.preventDefault(); setCursor((c) => ({ ...c, x: Math.min(1, c.x + STEP) })); break;
      case "ArrowUp":    e.preventDefault(); setCursor((c) => ({ ...c, y: Math.max(0, c.y - STEP) })); break;
      case "ArrowDown":  e.preventDefault(); setCursor((c) => ({ ...c, y: Math.min(1, c.y + STEP) })); break;
      case "Enter":
      case " ":
        if (!armed) return;
        e.preventDefault();
        onChange([...markers, { marker_type: markerType, x: cursor.x, y: cursor.y }]);
        break;
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      <div
        role={canInteract ? "application" : undefined}
        tabIndex={canInteract ? 0 : undefined}
        aria-label={label}
        aria-describedby={canInteract ? hintId : undefined}
        onClick={canPlace ? place : undefined}
        onKeyDown={canInteract ? handleKey : undefined}
        onFocus={canInteract ? () => setFocused(true) : undefined}
        onBlur={canInteract ? () => setFocused(false) : undefined}
        className={`relative h-40 w-40 shrink-0 rounded-full border border-v2-border bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${canPlace ? "cursor-crosshair" : ""}`}
      >
        {canInteract && (
          <p id={hintId} className="sr-only">{s["clinical.mobilidadeHint"]}</p>
        )}

        <ReferenceSpokes />

        {/* Keyboard cursor indicator — visible only while the circle has focus */}
        {canInteract && focused && (
          <span
            aria-hidden="true"
            className="absolute -ml-1.5 -mt-1.5 h-3 w-3 rounded-full border-2 border-brand-teal bg-transparent"
            style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }}
          />
        )}

        {markers.map((m, i) =>
          m.marker_type === "passiva" ? (
            // Passiva = star
            <span
              key={i}
              aria-hidden="true"
              title={s["clinical.mobilidadePassiva"]}
              data-marker="passiva"
              className="absolute -ml-2 -mt-2 flex h-4 w-4 items-center justify-center text-brand-magenta"
              style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01z" />
              </svg>
            </span>
          ) : (
            // Activa = dot
            <span
              key={i}
              aria-hidden="true"
              title={s["clinical.mobilidadeActiva"]}
              data-marker="activa"
              className="absolute -ml-1.5 -mt-1.5 h-3 w-3 rounded-full border border-surface bg-brand-teal"
              style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
            />
          ),
        )}
      </div>

      <p className="text-xs text-text-secondary">
        {s["clinical.mobilidadeMarkerCount"]}: {markers.length}
      </p>
    </div>
  );
}

export function MobilidadeChart({
  value,
  onChange,
  readOnly,
}: {
  value: MobilidadeValue;
  onChange: (next: MobilidadeValue) => void;
  readOnly: boolean;
}) {
  const [markerType, setMarkerType] = useState<MobilidadeMarkerType>("activa");
  const [armed, setArmed] = useState(false);

  const setRegion = (region: MobilidadeRegion, markers: MobilidadeMarker[]) =>
    onChange({ ...value, [region]: markers });
  // Record-wide clear (ruling E): drop markers on all three circles at once.
  const clearAll = () => onChange({});
  const totalMarkers = REGIONS.reduce((n, r) => n + asMarkers(value[r.key]).length, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-text-primary">{s["clinical.mobilidadeHeader"]}</h3>
        {!readOnly && (
          <p className="text-xs text-text-secondary">{s["clinical.mobilidadeHelper"]}</p>
        )}
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Marker-type toggle — min-44px, aria-pressed reflects selection. */}
          <div
            role="group"
            aria-label={s["clinical.mobilidadeMarkerType"]}
            className="inline-flex flex-wrap gap-2"
          >
            {MARKER_TYPES.map((t) => (
              <Button
                key={t.value}
                type="button"
                size="lg"
                variant={markerType === t.value ? "primary" : "secondary"}
                aria-pressed={markerType === t.value}
                onClick={() => setMarkerType(t.value)}
              >
                {s[t.labelKey]}
              </Button>
            ))}
          </div>

          {/* Inserir marcador — arms sticky placement (toggle). */}
          <Button
            type="button"
            size="lg"
            variant={armed ? "primary" : "secondary"}
            aria-pressed={armed}
            onClick={() => setArmed((a) => !a)}
          >
            {s["clinical.mobilidadeInsert"]}
          </Button>

          {/* Record-wide Limpar marcadores — clears all three circles. */}
          <Button
            type="button"
            size="lg"
            variant="ghost"
            disabled={totalMarkers === 0}
            onClick={clearAll}
          >
            {s["clinical.mobilidadeClear"]}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-6">
        {REGIONS.map((r) => (
          <RegionCircle
            key={r.key}
            label={s[r.labelKey]}
            markers={asMarkers(value[r.key])}
            markerType={markerType}
            readOnly={readOnly}
            armed={armed}
            onChange={(markers) => setRegion(r.key, markers)}
          />
        ))}
      </div>
    </div>
  );
}
