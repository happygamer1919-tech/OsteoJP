"use client";

import { Repeat, User } from "lucide-react";
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
import type { AgendaAppointment } from "@/lib/scheduling/types";

const SLOT_HEIGHT = 48; // px per 30-min slot
const DAY_START_MIN = DAY_START_HOUR * 60;
const GUTTER = 64;

type StringKey = keyof typeof s;

/**
 * Service category → v2 accent (SPEC-v2-agenda §2.1). Cards are tinted by SERVICE
 * category, not status. The five categories below are the complete color-coded
 * set; any service outside the list falls back to a neutral glass tint and the
 * "Outros serviços" legend entry (flagged to Ivan in the PR ASSUMPTION block).
 */
type ServiceAccent = "green" | "lavender" | "gold" | "blue" | "burgundy";

// Legend order follows the SPEC §2.1 table.
const ACCENT_ORDER: ServiceAccent[] = [
  "green",
  "lavender",
  "gold",
  "blue",
  "burgundy",
];

// Card tint: 100 fill + 200 hairline, with v2-text-primary labels (≥11:1 on
// every 100 tint) so AA never depends on the accent (§2.1 / §3.4).
const SERVICE_TINT: Record<ServiceAccent, string> = {
  green: "bg-v2-green-100 border-v2-green-200",
  lavender: "bg-v2-lavender-100 border-v2-lavender-200",
  gold: "bg-v2-gold-100 border-v2-gold-200",
  blue: "bg-v2-blue-100 border-v2-blue-200",
  burgundy: "bg-v2-burgundy-100 border-v2-burgundy-200",
};

// Legend swatch echoes the card tint (100 fill, 300 edge). The adjacent text
// label carries the name, so color is never the sole information channel.
const SWATCH_TINT: Record<ServiceAccent, string> = {
  green: "bg-v2-green-100 border-v2-green-300",
  lavender: "bg-v2-lavender-100 border-v2-lavender-300",
  gold: "bg-v2-gold-100 border-v2-gold-300",
  blue: "bg-v2-blue-100 border-v2-blue-300",
  burgundy: "bg-v2-burgundy-100 border-v2-burgundy-300",
};

const ACCENT_LABEL: Record<ServiceAccent, StringKey> = {
  green: "agenda.serviceMassagemTerapeutica",
  lavender: "agenda.serviceMassagemRelaxamento",
  gold: "agenda.serviceDrenagemLinfatica",
  blue: "agenda.serviceMassagemDesportiva",
  burgundy: "agenda.serviceOsteopatia",
};

/** Match a service name (accent- and case-insensitive) to its color category. */
function serviceAccent(name: string | null): ServiceAccent | null {
  if (!name) return null;
  const n = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (n.startsWith("osteopat")) return "burgundy";
  if (n.includes("drenagem linfatica")) return "gold";
  if (n.includes("massagem desportiva")) return "blue";
  if (n.includes("massagem relaxamento") || n.includes("massagem de relaxamento"))
    return "lavender";
  if (n.includes("massagem terapeutica")) return "green";
  return null;
}

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

  // Legend: only the categories present in the current view (§2.2). Cancelled
  // cards render muted, not service-tinted, so they never drive the legend.
  const presentAccents = new Set<ServiceAccent>();
  let hasOther = false;
  for (const a of appointments) {
    if (a.status === "cancelled") continue;
    const accent = serviceAccent(a.serviceName);
    if (accent) presentAccents.add(accent);
    else if (a.serviceName) hasOther = true;
  }
  const legendAccents = ACCENT_ORDER.filter((a) => presentAccents.has(a));
  const showLegend = legendAccents.length > 0 || hasOther;

  const gridCols = { gridTemplateColumns: `${GUTTER}px repeat(${dates.length}, minmax(0, 1fr))` };

  return (
    <>
      <div className="glass-card overflow-hidden">
        {/* Column headers */}
        <div className="grid border-b border-v2-border bg-v2-surface" style={gridCols}>
          <div className="border-r border-v2-border" />
          {dates.map((d) => (
            <div
              key={d}
              className={`border-r border-v2-border px-2 py-2 text-center text-sm font-medium last:border-r-0 ${
                d === today ? "text-v2-green-700" : "text-v2-text-primary"
              }`}
            >
              {formatDayHeader(d, locale)}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="grid" style={gridCols}>
          {/* Time gutter */}
          <div className="relative border-r border-v2-border" style={{ height: totalHeight }}>
            {slots.map((m, i) => (
              <div
                key={m}
                className={`absolute inset-x-0 ${m % 60 === 0 ? "border-b border-v2-border" : ""}`}
                style={{ top: i * SLOT_HEIGHT, height: SLOT_HEIGHT }}
              >
                {m % 60 === 0 && (
                  // The first hour label (i === 0) sits at the gutter top rather
                  // than centered on its line (-top-2), so it is not clipped above
                  // the grid body (W4-07: clipped 08:00 label).
                  <span
                    className={`absolute right-2 bg-v2-surface px-0.5 text-xs text-v2-text-secondary ${
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
              <div key={d} className="relative border-r border-v2-border last:border-r-0" style={{ height: totalHeight }}>
                {/* Grid lines + clickable empty slots */}
                {slots.map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    aria-label={`${formatDayHeader(d, locale)} ${slotLabel(m)}`}
                    onClick={() => onSelectSlot(d, slotLabel(m))}
                    className={`absolute inset-x-0 transition-colors duration-fast ease-standard hover:bg-v2-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring ${
                      m % 60 === 0 ? "border-b border-v2-border" : "border-b border-v2-border/40"
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

                {/* Current-time line (on-palette burgundy, not an error red — §10). */}
                {isToday && nowVisible && (
                  <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: nowTop }} aria-hidden="true">
                    <span className="-ml-1 size-2 rounded-full bg-v2-burgundy-600" />
                    <span className="h-0.5 flex-1 bg-v2-burgundy-600" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Service-color legend (§2.2): one swatch + label per category in view. */}
      {showLegend && (
        <div
          role="group"
          aria-label={s["agenda.legend"]}
          className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-1"
        >
          {legendAccents.map((accent) => (
            <span key={accent} className="inline-flex items-center gap-2 text-sm text-v2-text-primary">
              <span aria-hidden="true" className={`size-3 rounded-sm border ${SWATCH_TINT[accent]}`} />
              {s[ACCENT_LABEL[accent]]}
            </span>
          ))}
          {hasOther && (
            <span className="inline-flex items-center gap-2 text-sm text-v2-text-primary">
              <span aria-hidden="true" className="size-3 rounded-sm border border-v2-border bg-v2-surface" />
              {s["agenda.serviceOther"]}
            </span>
          )}
        </div>
      )}
    </>
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

  const accent = cancelled ? null : serviceAccent(appt.serviceName);
  const tint = cancelled
    ? "bg-surface-muted border-v2-border"
    : accent
      ? SERVICE_TINT[accent]
      : "bg-v2-surface border-v2-border";

  return (
    <button
      type="button"
      onClick={onClick}
      // §2.1 tinted-glass card by service category. rounded-lg (12px) keeps small
      // blocks legible — the v2 radius scale only defines 24/28px for large
      // containers (foundation §4.2 keeps the brand radius scale for the rest).
      className={`hover-lift absolute overflow-hidden rounded-lg border p-2 text-left text-v2-text-primary shadow-v2-float hover:z-10 ${tint} ${
        conflicting ? "ring-2 ring-warning" : ""
      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1`}
      style={{
        top,
        height,
        left: `calc(${place.col * widthPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
      }}
    >
      {conflicting && (
        <span className="block text-xs font-semibold uppercase text-warning-700">{s["agenda.conflict"]}</span>
      )}
      <span className="block truncate text-xs text-v2-text-primary">
        {formatTimeOfDay(new Date(appt.startsAt))}-{formatTimeOfDay(new Date(appt.endsAt))}
      </span>
      <span className={`flex items-center gap-1 truncate text-sm font-medium ${cancelled ? "text-v2-text-secondary line-through" : "text-v2-text-primary"}`}>
        <User size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-v2-text-secondary" />
        {(appt.recurrenceRule || appt.recurrenceParentId) && (
          <Repeat size={14} strokeWidth={1.75} aria-label={s["appointment.recurring"]} className="shrink-0 text-v2-text-secondary" />
        )}
        <span className="truncate">{appt.patientName}</span>
      </span>
      {showService && <span className="block truncate text-xs text-v2-text-primary">{appt.serviceName}</span>}
    </button>
  );
}
