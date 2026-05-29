"use client";
import { useState, type MouseEvent } from "react";
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

  function place(e: MouseEvent<HTMLDivElement>) {
    if (readOnly || !markerType) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    onChange([...markers, { marker_type: markerType, x, y, view }]);
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
      <p className="text-xs text-neutral-500">{s["clinical.bodychartHint"]}</p>

      <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            onClick={() => setView(v.value)}
            className={`rounded border px-2 py-1 text-xs ${view === v.value ? "bg-neutral-900 text-white" : ""}`}
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
        onClick={place}
        className={`relative h-80 w-56 rounded border bg-neutral-50 ${readOnly ? "" : "cursor-crosshair"}`}
      >
        {inView.map(({ m, i }) => (
          <span
            key={i}
            title={labelFor(m.marker_type)}
            className="absolute -ml-1.5 -mt-1.5 h-3 w-3 rounded-full border border-white bg-magenta-600"
            style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, backgroundColor: "#8E2C7A" }}
          />
        ))}
      </div>

      <ul className="space-y-1 text-sm">
        {markers.length === 0 && (
          <li className="text-xs text-neutral-500">{s["clinical.bodychartEmpty"]}</li>
        )}
        {markers.map((m, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">[{m.view}]</span>
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
