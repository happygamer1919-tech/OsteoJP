"use client";
import { useId, useState, type KeyboardEvent, type MouseEvent } from "react";
import { s } from "@/lib/i18n";

export type Marker = { marker_type: string; x: number; y: number; view: string };

const VIEWS: { value: string; labelKey: keyof typeof s }[] = [
  { value: "anterior", labelKey: "clinical.bodychartViewAnterior" },
  { value: "posterior", labelKey: "clinical.bodychartViewPosterior" },
  { value: "lateral_left", labelKey: "clinical.bodychartViewLateralLeft" },
  { value: "lateral_right", labelKey: "clinical.bodychartViewLateralRight" },
];

export function BodyChart({
  markers,
  onChange,
  markerOptions,
  readOnly,
}: {
  markers: Marker[];
  onChange: (next: Marker[]) => void;
  markerOptions: { value: string; label: string }[];
  readOnly: boolean;
}) {
  const [view, setView] = useState<string>("anterior");
  const [markerType, setMarkerType] = useState<string>(markerOptions[0]?.value ?? "");
  const [cursor, setCursor] = useState({ x: 0.5, y: 0.5 });
  const [chartFocused, setChartFocused] = useState(false);
  const hintId = useId();

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

  const labelFor = (value: string) =>
    markerOptions.find((o) => o.value === value)?.label ?? value;
  const inView = markers
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.view === view);

  return (
    <div className="space-y-2">
      <p id={hintId} className="text-xs text-text-secondary">{s["clinical.bodychartHint"]}</p>

      <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            aria-pressed={view === v.value}
            onClick={() => setView(v.value)}
            className={`rounded border px-2 py-1 text-xs ${view === v.value ? "bg-text-primary text-text-inverse" : ""}`}
          >
            {s[v.labelKey]}
          </button>
        ))}
      </div>

      {!readOnly && (
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

      <div
        role="application"
        tabIndex={readOnly ? undefined : 0}
        aria-describedby={hintId}
        onClick={place}
        onKeyDown={!readOnly ? handleKey : undefined}
        onFocus={() => setChartFocused(true)}
        onBlur={() => setChartFocused(false)}
        className={`relative h-80 w-56 rounded border bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${readOnly ? "" : "cursor-crosshair"}`}
      >
        {/* Keyboard cursor indicator — visible only while the chart has focus */}
        {!readOnly && chartFocused && (
          <span
            aria-hidden="true"
            className="absolute -ml-1.5 -mt-1.5 h-3 w-3 rounded-full border-2 border-brand-teal bg-transparent"
            style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }}
          />
        )}
        {inView.map(({ m, i }) => (
          <span
            key={i}
            title={labelFor(m.marker_type)}
            className="absolute -ml-1.5 -mt-1.5 h-3 w-3 rounded-full border border-surface bg-brand-magenta"
            style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
          />
        ))}
      </div>

      <ul className="space-y-1 text-sm">
        {markers.length === 0 && (
          <li className="text-xs text-text-secondary">{s["clinical.bodychartEmpty"]}</li>
        )}
        {markers.map((m, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="text-xs text-text-secondary">[{m.view}]</span>
            <span>{labelFor(m.marker_type)}</span>
            {!readOnly && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="rounded border px-1.5 py-0.5 text-xs"
              >
                {s["clinical.bodychartRemove"]}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
