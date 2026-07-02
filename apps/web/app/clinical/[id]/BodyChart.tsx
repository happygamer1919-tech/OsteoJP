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

export type Marker = { marker_type: string; x: number; y: number; view: string };

// Line-art figures need much more opacity than the old filled silhouettes did
// (0.18) to read at all — single constant so it's easy to tune later.
const FIGURE_OPACITY = 0.6;

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

  const canInteract = !readOnly && markerOptions.length > 0;

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
          {inView.map(({ m, i }) => (
            <span
              key={i}
              title={labelFor(m.marker_type)}
              className="absolute -ml-1.5 -mt-1.5 h-3 w-3 rounded-full border border-surface bg-brand-magenta"
              style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
            />
          ))}
        </div>

        {/* Sex toggle — stacked vertically beside the chart */}
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
      </div>

      <ul className="space-y-1 text-sm">
        {markers.length === 0 && (
          <li className="text-xs text-text-secondary">{s["clinical.bodychartEmpty"]}</li>
        )}
        {markers.map((m, i) => (
          <li key={i} className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-xs text-text-secondary">[{m.view}]</span>
            <span className="min-w-0 flex-1 break-words">{labelFor(m.marker_type)}</span>
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
        ))}
      </ul>
    </div>
  );
}
