"use client";

import { useEffect, useState } from "react";

import { locale, s } from "@/lib/i18n";
import {
  isSlotBlocked,
  placeBlocksOnDate,
  type BlockPlacement,
  type BlockSpan,
} from "@/lib/scheduling/blocked-time-core";
import { deriveEstado, estadoStrikesName } from "@/lib/scheduling/estado";
import { therapistColor } from "@/lib/scheduling/therapist-color";
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  daySlots,
  formatDayHeader,
  lisbonMinutesFromMidnight,
  lisbonParts,
  slotLabel,
  todayInLisbon,
  viewDates,
  type AgendaView,
} from "@/lib/scheduling/time";
import type { AgendaAppointment } from "@/lib/scheduling/types";

import { AppointmentHoverPanel } from "./appointment-hover-card";
import { EstadoMarker } from "./estado-marker";

const SLOT_HEIGHT = 48; // px per 30-min slot
const DAY_START_MIN = DAY_START_HOUR * 60;
const DAY_END_MIN = DAY_END_HOUR * 60;
const GUTTER = 64;

/** Minutes from the grid's first row -> px. Shared by names and blocked bands. */
const minToPx = (min: number) => ((min - DAY_START_MIN) / 30) * SLOT_HEIGHT;

/**
 * W11-00 v3 (owner ruling, Fisiozero list model): appointments are NOT cards.
 * Each is one line - the patient full name in the therapist colour - and
 * appointments that share a START SLOT stack VERTICALLY (never side by side).
 * Group by start time, order the names within a slot alphabetically (pt); the
 * groups are positioned by start time so the vertical position still encodes
 * time. No horizontal overlap-splitting.
 */
function groupByStart(appts: AgendaAppointment[]): [string, AgendaAppointment[]][] {
  const groups = new Map<string, AgendaAppointment[]>();
  for (const a of appts) {
    const list = groups.get(a.startsAt);
    if (list) list.push(a);
    else groups.set(a.startsAt, [a]);
  }
  return [...groups.entries()]
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([startsAt, list]): [string, AgendaAppointment[]] => [
      startsAt,
      [...list].sort((a, b) => a.patientName.localeCompare(b.patientName, "pt")),
    ]);
}

export function AgendaGrid({
  view,
  anchor,
  appointments,
  blocks = [],
  onSelectAppointment,
  onSelectSlot,
}: {
  view: AgendaView;
  anchor: string;
  appointments: AgendaAppointment[];
  /** W9-04: time_off spans for the visible range. Non-empty ONLY when the agenda
   *  is scoped to one therapist (page.tsx), since the grid has no therapist axis
   *  and a full-width band would otherwise claim the whole clinic is blocked. */
  blocks?: BlockSpan[];
  onSelectAppointment: (appt: AgendaAppointment) => void;
  onSelectSlot: (date: string, time: string) => void;
}) {
  const dates = viewDates(view, anchor);
  const slots = daySlots();
  const totalHeight = slots.length * SLOT_HEIGHT;
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
              // W12-02: the strong hour rule sits on the TOP edge of the
              // on-the-hour slot, so it coincides with the hour label (also drawn
              // at the slot top) and an on-the-hour appointment. Drawing it on the
              // bottom edge (border-b) put the bold "09:00" line one 30-min slot
              // BELOW - on the 09:30 gridline. i===0 (08:00) omits it: the
              // header/body divider already delimits the first hour.
              className={`absolute inset-x-0 ${m % 60 === 0 && i !== 0 ? "border-t border-v2-border" : ""}`}
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
          const isToday = d === today;
          // W9-04: this day's blocked spans, clipped to the visible window.
          const dayBlocks = placeBlocksOnDate(blocks, d, DAY_END_MIN);
          return (
            <div key={d} className="relative border-r border-v2-border last:border-r-0" style={{ height: totalHeight }}>
              {/* Grid lines + clickable empty slots. A slot inside a blocked
                  span is DISABLED, not merely covered: an overlay alone would
                  still let a keyboard user tab to it and press Enter, which is
                  exactly the "bookable over blocked time" hole (CB QA item 3). */}
              {slots.map((m, i) => {
                const blocked = isSlotBlocked(m, dayBlocks);
                // W12-02: gridline on the TOP edge so the STRONG hour rule
                // coincides with the hour label + an on-the-hour appointment (all
                // at the slot top), not one 30-min slot below on the :30 line.
                // Faint rule for the :30 slots; i===0 (08:00) omits it (the
                // header/body divider is the first hour rule). Placement math
                // (minToPx/daySlots/SLOT_HEIGHT) is UNCHANGED - only the edge.
                const rule =
                  m % 60 === 0
                    ? i === 0
                      ? ""
                      : "border-t border-v2-border"
                    : "border-t border-surface-muted";
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={blocked}
                    aria-label={
                      blocked
                        ? `${formatDayHeader(d, locale)} ${slotLabel(m)} - ${s["agenda.blockedTime"]}`
                        : `${formatDayHeader(d, locale)} ${slotLabel(m)}`
                    }
                    onClick={blocked ? undefined : () => onSelectSlot(d, slotLabel(m))}
                    className={`absolute inset-x-0 transition duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring ${
                      blocked
                        ? "cursor-not-allowed"
                        : "motion-safe:active:scale-[0.97] hover:bg-v2-green-50"
                    } ${rule}`}
                    style={{ top: i * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                  />
                );
              })}

              {/* W9-04: blocked-time bands (SPEC-v2-agenda 2.1: muted,
                  non-interactive). Drawn above the slot layer so the hatch
                  reads, below the appointment names (z-10) so a booking made
                  before the block was entered stays visible and fixable. */}
              {dayBlocks.map((p) => (
                <BlockedBand key={p.id} placement={p} />
              ))}

              {/* W11-00 v3: appointment names as a Fisiozero-style vertical list.
                  Each start slot is a full-width column; same-slot appointments
                  stack one name per line (never side by side). */}
              {groupByStart(dayAppts).map(([startsAt, group]) => (
                <div
                  key={startsAt}
                  className="absolute inset-x-0 z-10 flex flex-col"
                  style={{ top: minToPx(lisbonMinutesFromMidnight(new Date(startsAt))) }}
                >
                  {group.map((a) => (
                    <AppointmentName key={a.id} appt={a} onClick={() => onSelectAppointment(a)} />
                  ))}
                </div>
              ))}

              {/* Current-time line (on-palette burgundy, not an error red - §10). */}
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
  );
}

/**
 * W9-04 - a muted, non-interactive blocked-time band (SPEC-v2-agenda 2.1,
 * closing Q-V2W2-1, which deferred this until a data model existed; `time_off`
 * has existed since migration 0006).
 *
 * pointer-events-none so it never intercepts a click: the slot buttons beneath
 * are already `disabled`, which is what actually makes the span non-bookable for
 * mouse AND keyboard. The band is the visual half of the same fact.
 *
 * The label is text, never colour alone (the standing colour-not-only rule), and
 * is hidden on very short bands where it would not fit - the disabled slots
 * still carry the state in their aria-label, so the information is never
 * colour-only for a screen reader either.
 */
function BlockedBand({ placement }: { placement: BlockPlacement }) {
  const top = minToPx(placement.startMin);
  const height = minToPx(placement.endMin) - top;
  const showLabel = height >= SLOT_HEIGHT;

  return (
    <div
      data-testid="agenda-blocked-band"
      className="pointer-events-none absolute inset-x-0 z-10 overflow-hidden rounded-v2 border border-v2-border bg-surface-muted/80 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(0,0,0,0.05)_6px,rgba(0,0,0,0.05)_12px)]"
      style={{ top, height }}
    >
      {showLabel && (
        <span className="block truncate px-2 py-1 text-xs font-medium text-v2-text-secondary">
          {s["agenda.blockedTime"]}
        </span>
      )}
    </div>
  );
}

/**
 * W11-00 v3 (owner ruling, Fisiozero model): one appointment = one line of the
 * patient full name, coloured in the assigned therapist hue (`therapistColor().
 * text`, the SAME source of truth as the pre-v3 spine/dot). The name WRAPS
 * before it truncates (`break-words`, never `truncate`). The W10-05 hover popup
 * is UNCHANGED and remains the sole carrier of every detail; the line stays
 * click-to-open.
 *
 * W12-11 R10 (Q-W12-01 ruling): a small leading estado glyph precedes the name
 * (EstadoMarker; a controlled amendment to the name-only face — the estado is in
 * the aria-label, not visible text, so the visible face stays exactly the name).
 * The strikethrough now belongs to Falta ONLY (name crossed with a line);
 * Cancelada is a distinct red glyph and is never struck.
 */
function AppointmentName({ appt, onClick }: { appt: AgendaAppointment; onClick: () => void }) {
  const estado = deriveEstado(appt.status, appt.confirmationState);
  const struck = estadoStrikesName(estado);
  const tColor = therapistColor(appt.practitionerId);

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-start gap-1 rounded-v2 px-2 py-0.5 text-left text-sm font-semibold leading-tight ${tColor.text} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1`}
      >
        <EstadoMarker estado={estado} className="mt-0.5" />
        <span
          data-testid="agenda-card-patient"
          className={`block min-w-0 break-words ${struck ? "line-through" : ""}`}
        >
          {appt.patientName}
        </span>
      </button>
      {/* W10-05: the shared unified hover popup (mini-dashboard) - UNCHANGED.
          Sibling of the button so it escapes any clipping; shown on hover OR
          keyboard focus (group-focus-within). Non-interactive; the SAME
          AppointmentHoverPanel renders on the Marcacoes row. */}
      <div
        role="tooltip"
        data-testid="agenda-card-hover"
        className="pointer-events-none absolute left-1 top-full z-50 mt-1 hidden rounded-v2 border border-v2-border bg-v2-surface p-2 shadow-v2-float group-hover:block group-focus-within:block"
      >
        <AppointmentHoverPanel appt={appt} />
      </div>
    </div>
  );
}
