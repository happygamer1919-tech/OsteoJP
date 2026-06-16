"use client";

import { Repeat } from "lucide-react";
import { useEffect, useState } from "react";

import { locale, s } from "@/lib/i18n";
import { intervalsOverlap } from "@/lib/scheduling/overlap";
import {
  DAY_START_HOUR,
  daySlots,
  formatDayHeader,
  formatTimeOfDay,
  lisbonMinutesFromMidnight,
  lisbonParts,
  slotLabel,
  todayInLisbon,
  viewDates,
  type AgendaView,
} from "@/lib/scheduling/time";
import type {
  AgendaAppointment,
  AppointmentStatusValue,
} from "@/lib/scheduling/types";

const SLOT_HEIGHT = 48; // px per 30-min slot
const DAY_START_MIN = DAY_START_HOUR * 60;
const GUTTER = 64;

/** Status → left-edge bar color (chip tone mapping, SPEC-foundation §4.5). */
const STATUS_BAR: Record<AppointmentStatusValue, string> = {
  scheduled: "border-l-warning",
  confirmed: "border-l-success",
  completed: "border-l-info",
  cancelled: "border-l-border-strong",
  no_show: "border-l-error",
};

function sameRoom(a: AgendaAppointment, b: AgendaAppointment): boolean {
  const ra = a.room?.trim().toLowerCase();
  const rb = b.room?.trim().toLowerCase();
  return !!ra && !!rb && ra === rb && a.locationId === b.locationId;
}

function conflictingIds(appts: AgendaAppointment[]): Set<string> {
  const flagged = new Set<string>();
  for (let i = 0; i < appts.length; i++) {
    for (let j = i + 1; j < appts.length; j++) {
      const a = appts[i]!;
      const b = appts[j]!;
      if (a.status === "cancelled" || b.status === "cancelled") continue;
      if (a.practitionerId !== b.practitionerId && !sameRoom(a, b)) continue;
      if (intervalsOverlap(new Date(a.startsAt), new Date(a.endsAt), new Date(b.startsAt), new Date(b.endsAt))) {
        flagged.add(a.id);
        flagged.add(b.id);
      }
    }
  }
  return flagged;
}

/** Greedy side-by-side layout: each block gets {col, cols} within its overlap cluster. */
function layoutOverlaps(appts: AgendaAppointment[]): Map<string, { col: number; cols: number }> {
  const out = new Map<string, { col: number; cols: number }>();
  const sorted = [...appts].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  let cluster: AgendaAppointment[] = [];
  let clusterEnd = "";

  const flush = () => {
    const colEnd: string[] = []; // last end per column
    const assigned = new Map<string, number>();
    for (const a of cluster) {
      let col = colEnd.findIndex((end) => end <= a.startsAt);
      if (col === -1) {
        col = colEnd.length;
        colEnd.push(a.endsAt);
      } else {
        colEnd[col] = a.endsAt;
      }
      assigned.set(a.id, col);
    }
    const cols = colEnd.length;
    for (const a of cluster) out.set(a.id, { col: assigned.get(a.id)!, cols });
    cluster = [];
    clusterEnd = "";
  };

  for (const a of sorted) {
    if (cluster.length > 0 && a.startsAt >= clusterEnd) flush();
    cluster.push(a);
    if (a.endsAt > clusterEnd) clusterEnd = a.endsAt;
  }
  flush();
  return out;
}

export function AgendaGrid({
  view,
  anchor,
  appointments,
  onSelectAppointment,
  onSelectSlot,
}: {
  view: AgendaView;
  anchor: string;
  appointments: AgendaAppointment[];
  onSelectAppointment: (appt: AgendaAppointment) => void;
  onSelectSlot: (date: string, time: string) => void;
}) {
  const dates = viewDates(view, anchor);
  const slots = daySlots();
  const totalHeight = slots.length * SLOT_HEIGHT;
  const conflicts = conflictingIds(appointments);
  const today = todayInLisbon();

  // Current-time line position (refreshed each minute). Rendered only on today.
  const [nowMin, setNowMin] = useState(() => lisbonMinutesFromMidnight(new Date()));
  useEffect(() => {
    const id = window.setInterval(() => setNowMin(lisbonMinutesFromMidnight(new Date())), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const nowTop = ((nowMin - DAY_START_MIN) / 30) * SLOT_HEIGHT;
  const nowVisible = nowMin >= DAY_START_MIN && nowTop <= totalHeight;

  const byDate = new Map<string, AgendaAppointment[]>();
  for (const a of appointments) {
    const d = lisbonParts(new Date(a.startsAt)).date;
    const list = byDate.get(d);
    if (list) list.push(a);
    else byDate.set(d, [a]);
  }

  const gridCols = { gridTemplateColumns: `${GUTTER}px repeat(${dates.length}, minmax(0, 1fr))` };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {/* Column headers (sticky) */}
      <div className="sticky top-0 z-10 grid border-b border-border bg-surface" style={gridCols}>
        <div className="border-r border-border" />
        {dates.map((d) => (
          <div
            key={d}
            className={`border-r border-border px-2 py-2 text-center text-sm font-medium last:border-r-0 ${
              d === today ? "text-accent-2-700" : "text-text-primary"
            }`}
          >
            {formatDayHeader(d, locale)}
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="grid" style={gridCols}>
        {/* Time gutter */}
        <div className="relative border-r border-border" style={{ height: totalHeight }}>
          {slots.map((m, i) => (
            <div
              key={m}
              className={`absolute inset-x-0 ${m % 60 === 0 ? "border-b border-border" : ""}`}
              style={{ top: i * SLOT_HEIGHT, height: SLOT_HEIGHT }}
            >
              {m % 60 === 0 && (
                // The first hour label (i === 0) sits at the gutter top rather
                // than centered on its line (-top-2), so it is not clipped above
                // the grid body (W4-07: clipped 08:00 label).
                <span
                  className={`absolute right-2 bg-surface px-0.5 text-xs text-text-secondary ${
                    i === 0 ? "top-0" : "-top-2"
                  }`}
                >
                  {slotLabel(m)}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {dates.map((d) => {
          const dayAppts = byDate.get(d) ?? [];
          const layout = layoutOverlaps(dayAppts);
          const isToday = d === today;
          return (
            <div key={d} className="relative border-r border-border last:border-r-0" style={{ height: totalHeight }}>
              {/* Grid lines + clickable empty slots */}
              {slots.map((m, i) => (
                <button
                  key={m}
                  type="button"
                  aria-label={`${formatDayHeader(d, locale)} ${slotLabel(m)}`}
                  onClick={() => onSelectSlot(d, slotLabel(m))}
                  className={`absolute inset-x-0 transition-colors duration-fast ease-standard hover:bg-accent-2-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring ${
                    m % 60 === 0 ? "border-b border-border" : "border-b border-surface-muted"
                  }`}
                  style={{ top: i * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                />
              ))}

              {/* Appointment blocks */}
              {dayAppts.map((a) => (
                <AppointmentBlock
                  key={a.id}
                  appt={a}
                  conflicting={conflicts.has(a.id)}
                  place={layout.get(a.id) ?? { col: 0, cols: 1 }}
                  totalHeight={totalHeight}
                  onClick={() => onSelectAppointment(a)}
                />
              ))}

              {/* Current-time line */}
              {isToday && nowVisible && (
                <div className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-error" style={{ top: nowTop }} aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AppointmentBlock({
  appt,
  conflicting,
  place,
  totalHeight,
  onClick,
}: {
  appt: AgendaAppointment;
  conflicting: boolean;
  place: { col: number; cols: number };
  totalHeight: number;
  onClick: () => void;
}) {
  const startMin = lisbonMinutesFromMidnight(new Date(appt.startsAt));
  const endMin = lisbonMinutesFromMidnight(new Date(appt.endsAt));
  const top = Math.max(0, ((startMin - DAY_START_MIN) / 30) * SLOT_HEIGHT);
  const rawHeight = ((endMin - startMin) / 30) * SLOT_HEIGHT;
  const height = Math.max(SLOT_HEIGHT - 4, Math.min(rawHeight, totalHeight - top) - 2);
  const showService = appt.serviceName && rawHeight >= 72; // drop service under 45min
  const cancelled = appt.status === "cancelled";
  const widthPct = 100 / place.cols;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute overflow-hidden rounded border border-l-4 border-border bg-surface p-2 text-left ${STATUS_BAR[appt.status]} ${
        conflicting ? "ring-2 ring-error" : ""
      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1`}
      style={{
        top,
        height,
        left: `calc(${place.col * widthPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
      }}
    >
      {conflicting && (
        <span className="block text-xs font-semibold uppercase text-error">{s["agenda.conflict"]}</span>
      )}
      <span className="block truncate text-xs text-text-secondary">
        {formatTimeOfDay(new Date(appt.startsAt))}-{formatTimeOfDay(new Date(appt.endsAt))}
      </span>
      <span className={`flex items-center gap-1 truncate text-sm font-medium ${cancelled ? "text-text-secondary line-through" : "text-text-primary"}`}>
        {(appt.recurrenceRule || appt.recurrenceParentId) && (
          <Repeat size={14} strokeWidth={1.75} aria-label={s["appointment.recurring"]} className="shrink-0 text-text-secondary" />
        )}
        <span className="truncate">{appt.patientName}</span>
      </span>
      {showService && <span className="block truncate text-xs text-text-secondary">{appt.serviceName}</span>}
    </button>
  );
}
