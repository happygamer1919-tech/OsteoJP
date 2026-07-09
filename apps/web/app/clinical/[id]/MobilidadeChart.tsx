"use client";
import { useId, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Button } from "@osteojp/ui";
import { s } from "@/lib/i18n";

/**
 * Mobilidade Activa / Passiva widget (SPEC-ficha-medica.md sec 5.10).
 *
 * Mirrors the BodyChart interaction model (BodyChart.tsx): markers stored at
 * 0-1 normalized coords, click + keyboard (arrow cursor / Enter-Space)
 * placement, `readOnly` gating for finalized records. It renders THREE
 * labeled circles (Cervical, Dorsal, Lombar) instead of a body figure, with
 * two marker types: Mobilidade Activa (dot) and Mobilidade Passiva (star). Each
 * circle takes UNLIMITED markers and has its own "Limpar marcadores" action.
 *
 * BodyChart.tsx is NOT touched. This is a sibling component routed by the
 * `mobilidade` x-widget (form-template.ts widgetOf).
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

/** A single labeled circle with its own markers, placement and Limpar action. */
function RegionCircle({
  label,
  markers,
  markerType,
  readOnly,
  onChange,
}: {
  label: string;
  markers: MobilidadeMarker[];
  markerType: MobilidadeMarkerType;
  readOnly: boolean;
  onChange: (next: MobilidadeMarker[]) => void;
}) {
  const [cursor, setCursor] = useState({ x: 0.5, y: 0.5 });
  const [focused, setFocused] = useState(false);
  const hintId = useId();
  const canInteract = !readOnly;

  function place(e: MouseEvent<HTMLDivElement>) {
    if (!canInteract) return;
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
        onClick={canInteract ? place : undefined}
        onKeyDown={canInteract ? handleKey : undefined}
        onFocus={canInteract ? () => setFocused(true) : undefined}
        onBlur={canInteract ? () => setFocused(false) : undefined}
        className={`relative h-40 w-40 shrink-0 rounded-full border border-v2-border bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${canInteract ? "cursor-crosshair" : ""}`}
      >
        <p id={hintId} className="sr-only">{s["clinical.mobilidadeHint"]}</p>

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

      {canInteract && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={markers.length === 0}
          onClick={() => onChange([])}
        >
          {s["clinical.mobilidadeClear"]}
        </Button>
      )}
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

  const setRegion = (region: MobilidadeRegion, markers: MobilidadeMarker[]) =>
    onChange({ ...value, [region]: markers });

  return (
    <div className="space-y-3">
      {!readOnly && (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs font-medium">{s["clinical.mobilidadeMarkerType"]}</span>
          <select
            value={markerType}
            onChange={(e) => setMarkerType(e.target.value as MobilidadeMarkerType)}
            className="rounded border px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            {MARKER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {s[t.labelKey]}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-wrap gap-6">
        {REGIONS.map((r) => (
          <RegionCircle
            key={r.key}
            label={s[r.labelKey]}
            markers={asMarkers(value[r.key])}
            markerType={markerType}
            readOnly={readOnly}
            onChange={(markers) => setRegion(r.key, markers)}
          />
        ))}
      </div>
    </div>
  );
}
