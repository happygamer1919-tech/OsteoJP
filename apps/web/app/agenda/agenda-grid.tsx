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
import { paletteColorByKey, therapistColor } from "@/lib/scheduling/therapist-color";
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

import { HoverPopover } from "./appointment-hover-card";
import { EstadoMarker } from "./estado-marker";

const SLOT_HEIGHT = 48; // px per 30-min slot at the BASE (unexpanded) height
const DAY_START_MIN = DAY_START_HOUR * 60;
const DAY_END_MIN = DAY_END_HOUR * 60;
const GUTTER = 64;

/** One appointment name line, and the group's own vertical padding. */
const NAME_LINE_PX = 20;
const GROUP_PAD_PX = 4;

/* ==================================================================== */
/* STAFF-03 - THE HOUR ROW GROWS TO FIT WHAT STARTS INSIDE IT.          */
/* ==================================================================== */
/*
 * REPORTED FROM RECEPTION: several appointments in one hour crop, crowd the
 * hover target, and an off-hour start sits mid-row. The old layout capped each
 * start-group to its hour band and SCROLLED the overflow (PL-01) - nothing was
 * hidden, but a receptionist had to scroll inside a 96px cell to read a name.
 *
 * WHAT CHANGED, AND WHAT DELIBERATELY DID NOT.
 *
 * The scale was LINEAR - `((min - start) / 30) * 48` - so every hour was exactly
 * 96px whatever it held. It is now CUMULATIVE over per-hour heights: an hour is
 * its base height, or taller when a day needs the room.
 *
 * THE 30-MINUTE SLOT GRID UNDERNEATH IS UNTOUCHED. `daySlots()` still yields a
 * slot every 30 minutes, each is still its own focusable <button> with its own
 * aria-label and click, and a slot inside a blocked span is still DISABLED
 * rather than merely covered. Collapsing to hour granularity would look like a
 * tidy follow-up and would SILENTLY HALVE THE BOOKABLE START TIMES;
 * agenda-grid.test.tsx pins the :30 slot as clickable precisely so that cannot
 * happen quietly. A half-hour slot is now half of its (possibly taller) hour.
 *
 * HOUR HEIGHTS ARE UNIFORM ACROSS EVERY DAY COLUMN, which is the detail that
 * makes this work at all. They are computed from the BUSIEST day in view, so
 * Monday and Tuesday share one vertical scale and a row still reads straight
 * across. Per-column heights would misalign the week and make the gutter lie.
 */

/** Every hour the grid renders, as minutes-from-midnight. */
function dayHours(): number[] {
  const out: number[] = [];
  for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h += 1) out.push(h * 60);
  return out;
}

/**
 * The rendered height of each hour, in grid order.
 *
 * The base is two 30-minute slots. An hour grows only when a single day's
 * start-groups within it need more room than that - and it grows to the WORST
 * day in view, so all columns share one scale.
 *
 * Pure and exported so the arithmetic is unit-testable without a DOM.
 */
export function hourHeights(startCountsByDay: number[][]): number[] {
  const base = SLOT_HEIGHT * 2;
  return dayHours().map((_, hourIndex) => {
    let needed = base;
    for (const day of startCountsByDay) {
      const lines = day[hourIndex] ?? 0;
      // Groups within one hour sit at their own start offsets, so the room an
      // hour needs is the total of its lines plus one padding per hour - not per
      // group, which would over-grow an hour holding several small groups.
      if (lines > 0) needed = Math.max(needed, lines * NAME_LINE_PX + GROUP_PAD_PX * 2);
    }
    return needed;
  });
}

/** Cumulative top offset of each hour, plus the total day height at the end. */
export function hourTops(heights: number[]): number[] {
  const tops = [0];
  for (const h of heights) tops.push(tops[tops.length - 1]! + h);
  return tops;
}

/**
 * Minutes from midnight -> px, on a possibly non-uniform hour scale.
 *
 * Within an hour the mapping stays PROPORTIONAL, so a :30 start sits exactly
 * halfway down its hour however tall that hour is, and an off-hour start like
 * :25 still lands where the clock says. That is what keeps the vertical
 * position encoding time rather than merely ordering.
 *
 * Exported for the same reason `groupBandPx` was: the placement arithmetic is
 * the part most worth pinning, and a DOM is not needed to pin it.
 */
export function makeMinToPx(heights: number[]): (min: number) => number {
  const tops = hourTops(heights);
  return (min: number) => {
    const clamped = Math.max(DAY_START_MIN, Math.min(min, DAY_END_MIN));
    const hourIndex = Math.floor((clamped - DAY_START_MIN) / 60);
    const idx = Math.min(hourIndex, heights.length - 1);
    const within = clamped - (DAY_START_MIN + idx * 60);
    return tops[idx]! + (within / 60) * heights[idx]!;
  };
}

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

/**
 * PL-01 - the max height a same-start group may occupy, bounded to the nearer of
 * (a) the next hour gridline and (b) the next start-group, so a cluster never
 * grows down past its hour ("as marcacoes descem para a hora seguinte").
 *
 * STAFF-03 CHANGED WHAT THIS BOUND MEANS WITHOUT CHANGING THE RULE. It used to
 * cap against a FIXED 96px hour and the overflow scrolled inside the band. The
 * hour now GROWS to fit what starts in it, so the same bound resolves to a band
 * that already holds the names - the scroll is the fallback it always was,
 * rather than the everyday experience reception reported.
 *
 * It takes the mapper rather than closing over a module-level one, because the
 * scale is now per-render (it depends on what the visible days hold). Pure +
 * exported so the bound stays unit-testable.
 */
export function groupBandPx(
  startMin: number,
  nextGroupStartMin: number | null,
  dayBottomPx: number,
  minToPx: (min: number) => number,
): number {
  const thisTop = minToPx(startMin);
  const nextHourTop = minToPx((Math.floor(startMin / 60) + 1) * 60);
  const nextGroupTop = nextGroupStartMin != null ? minToPx(nextGroupStartMin) : dayBottomPx;
  // Never below half a slot, so a lone group in a tight band stays legible.
  return Math.max(SLOT_HEIGHT / 2, Math.min(nextHourTop, nextGroupTop) - thisTop);
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
  const today = todayInLisbon();

  // Current-time line position (refreshed each minute). Rendered only on today.
  const [nowMin, setNowMin] = useState(() => lisbonMinutesFromMidnight(new Date()));
  useEffect(() => {
    const id = window.setInterval(() => setNowMin(lisbonMinutesFromMidnight(new Date())), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const byDate = new Map<string, AgendaAppointment[]>();
  for (const a of appointments) {
    const d = lisbonParts(new Date(a.startsAt)).date;
    const list = byDate.get(d);
    if (list) list.push(a);
    else byDate.set(d, [a]);
  }

  // STAFF-03: the vertical scale, derived from what is actually in view.
  //
  // ONE COUNT PER (DAY, HOUR) - how many appointment LINES start in that hour on
  // that day. `hourHeights` then takes the worst day per hour, so every column
  // shares one scale and a row still reads straight across the week.
  const startCountsByDay = dates.map((d) => {
    const perHour = dayHours().map(() => 0);
    for (const a of byDate.get(d) ?? []) {
      const min = lisbonMinutesFromMidnight(new Date(a.startsAt));
      const idx = Math.floor((min - DAY_START_MIN) / 60);
      if (idx >= 0 && idx < perHour.length) perHour[idx] = (perHour[idx] ?? 0) + 1;
    }
    return perHour;
  });
  const heights = hourHeights(startCountsByDay);
  const minToPx = makeMinToPx(heights);
  const tops = hourTops(heights);
  const totalHeight = tops[tops.length - 1]!;

  const nowTop = minToPx(nowMin);
  const nowVisible = nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN;

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
              // STAFF-03: the gutter uses the SAME mapper as the columns, or the
              // hour labels drift off their rules the moment an hour expands -
              // which would make the clock lie rather than merely look untidy.
              style={{ top: minToPx(m), height: minToPx(m + 30) - minToPx(m) }}
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
                // W13-B: hour rules ONLY. The faint :30 rule was removed on the
                // owner's request; the grid reads as clean one-hour rows.
                //
                // THE 30-MINUTE SLOT UNDERNEATH IS UNCHANGED AND MUST STAY THAT
                // WAY. `slots` is still a 30-minute grid, each slot is still a
                // focusable <button> with its own onClick and aria-label, and a
                // slot inside a blocked span is still DISABLED rather than
                // merely covered — an overlay alone would let a keyboard user
                // tab in and press Enter, which was the real "bookable over
                // blocked time" hole (CB QA item 3). Only the border class went.
                //
                // Collapsing this to an hour-granularity grid would look like a
                // tidy follow-up and would silently halve the bookable start
                // times. agenda-grid.test.tsx pins the :30 slot as clickable.
                const rule =
                  m % 60 === 0
                    ? i === 0
                      ? ""
                      : "border-t border-v2-border"
                    : "";
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
                    // STAFF-03: positioned by the mapper, so a 30-minute slot is
                    // half of its (possibly taller) hour. Still one focusable
                    // button per 30 minutes - the grid was NOT collapsed to hour
                    // granularity, which would have halved the bookable starts.
                    style={{ top: minToPx(m), height: minToPx(m + 30) - minToPx(m) }}
                  />
                );
              })}

              {/* W9-04: blocked-time bands (SPEC-v2-agenda 2.1: muted,
                  non-interactive). Drawn above the slot layer so the hatch
                  reads, below the appointment names (z-10) so a booking made
                  before the block was entered stays visible and fixable. */}
              {dayBlocks.map((p) => (
                <BlockedBand key={p.id} placement={p} minToPx={minToPx} />
              ))}

              {/* W11-00 v3: appointment names as a Fisiozero-style vertical list.
                  Each start slot is a full-width column; same-slot appointments
                  stack one name per line (never side by side). */}
              {groupByStart(dayAppts).map(([startsAt, group], gi, groups) => {
                const startMin = lisbonMinutesFromMidnight(new Date(startsAt));
                const nextStartMin =
                  gi + 1 < groups.length
                    ? lisbonMinutesFromMidnight(new Date(groups[gi + 1]![0]))
                    : null;
                // PL-01: cap the group to its hour band so a large same-hour
                // cluster stays inside its hour; overflow scrolls within.
                return (
                  <div
                    key={startsAt}
                    data-testid="agenda-start-group"
                    data-start-min={startMin}
                    className="absolute inset-x-0 z-10 flex flex-col overflow-y-auto"
                    style={{
                      top: minToPx(startMin),
                      maxHeight: groupBandPx(startMin, nextStartMin, totalHeight, minToPx),
                    }}
                  >
                    {group.map((a) => (
                      <AppointmentName key={a.id} appt={a} onClick={() => onSelectAppointment(a)} />
                    ))}
                  </div>
                );
              })}

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
function BlockedBand({
  placement,
  minToPx,
}: {
  placement: BlockPlacement;
  // STAFF-03: the mapper is PASSED, not closed over. A blocked band that kept
  // the old linear scale would drift off the slots it is meant to cover the
  // moment an hour expanded - and the band is the visual half of a fact whose
  // enforcement half is the disabled slot underneath it. They must agree.
  minToPx: (min: number) => number;
}) {
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
 * PL-10 (owner 2026-07-30): the agenda name-line shows only the patient's FIRST
 * and LAST name, never the middle names - "Abilio Jose de Carvalho Fernandes"
 * renders "Abilio Fernandes". Saves horizontal space on the one-line face. A name
 * of two or fewer words is returned unchanged. The FULL name is still shown by the
 * hover popup (appointment-hover-card), which remains the carrier of every detail.
 */
export function shortPatientName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(" ");
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/**
 * W11-00 v3 (owner ruling, Fisiozero model): one appointment = one line of the
 * patient name, coloured in the assigned therapist hue (`therapistColor().
 * text`, the SAME source of truth as the pre-v3 spine/dot). The name WRAPS
 * before it truncates (`break-words`, never `truncate`). PL-10 (2026-07-30)
 * shortened the visible line to first + last name (`shortPatientName`) and made it
 * smaller + non-bold to save space; the W10-05 hover popup is UNCHANGED and
 * remains the sole carrier of every detail (incl. the full name); the line stays
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
  // W12-40-T2: prefer the practitioner's assigned colour (staff_locations), fall
  // back to the deterministic FNV colour when unset. Same rule everywhere.
  const tColor = paletteColorByKey(appt.colorKey) ?? therapistColor(appt.practitionerId);

  return (
    // W12-33: the shared unified hover popup (mini-dashboard). Rendered through a
    // PORTAL (HoverPopover) so it escapes the grid's `.glass-card` overflow +
    // backdrop-filter clip and the z-10 start-slot stacking context that used to
    // paint it UNDER neighbouring name lines. Shown on hover OR keyboard focus;
    // non-interactive; the SAME panel renders on the Marcacoes row.
    <HoverPopover appt={appt} containerTestId="agenda-card-hover" className="block w-full">
      <button
        type="button"
        onClick={onClick}
        // LE-pg8-e2e-needs-run-scoped-patient. THE ROW'S OWN IDENTITY, IN THE DOM.
        //
        // Every other handle on this card describes its SHAPE, not WHICH ROW IT
        // IS: `agenda-card-patient` is on every card, the patient name is shared
        // vocabulary on a seeded database, and the time is positional rather than
        // rendered inside the card at all. So a cross-surface test could assert
        // "a card for Maria Silva at 09:00 is on this day" and be satisfied by
        // SOMEBODY ELSE'S ROW - which is exactly what happened twice on PG8, and
        // both times it passed.
        //
        // The appointment id is the only value that cannot be produced by a
        // neighbour. It is not secret (this card already renders the patient's
        // name to the same viewer, and RLS decides what reaches the page at all),
        // and it is inert - nothing reads it back, so no behaviour depends on it.
        //
        // ACC-vacuous-guard-sweep criterion F, in one attribute: a guard proves a
        // test RAN; only run-scoped identity proves it tested the right SUBJECT.
        data-appointment-id={appt.id}
        className={`flex w-full items-start gap-1 rounded-v2 px-2 py-0.5 text-left text-xs font-normal leading-tight ${tColor.text} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1`}
      >
        <EstadoMarker estado={estado} className="mt-0.5" />
        <span
          data-testid="agenda-card-patient"
          className={`block min-w-0 break-words ${struck ? "line-through" : ""}`}
        >
          {shortPatientName(appt.patientName)}
        </span>
      </button>
    </HoverPopover>
  );
}
