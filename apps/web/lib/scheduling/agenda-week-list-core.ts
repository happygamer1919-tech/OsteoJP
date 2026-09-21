// AGMOB-01 - what a phone shows when the agenda is on "Semana".
//
// THE PROBLEM THIS SOLVES, IN ONE LINE. A therapist reported that the weekly
// view is not available on a phone. It was not: `agenda-view.tsx` carried a
// client-side `matchMedia("(max-width: 1023px)")` override that forced the DAY
// view below `lg`, so the Dia/Semana toggle was hidden and pressing nothing
// could reach the week. The server was already fetching the week the whole
// time (`page.tsx` defaults `view` to "week" and `rangeForView` widens the
// range accordingly), so the phone paid for a week's data and was shown a day.
//
// WHY A LIST AND NOT THE GRID. The grid is ONE CSS Grid whose track template is
// `64px repeat(dates.length, minmax(0, 1fr))` (agenda-grid.tsx). At a 390px
// viewport the content box is 342px, so six day columns are 46px wide, and
// after the column border and the name button's `px-2` a patient name gets
// 11px - one to two characters per line, with `break-words` stacking the rest.
// The arithmetic is in the PR. Rendering the grid narrower is not a week view,
// it is an unreadable one, so below the breakpoint the same data is projected
// into a vertical list of days instead.
//
// WHY THE DECISION LIVES HERE AND NOT IN THE COMPONENT. No CI job on this
// repository runs WebKit or Firefox - `.github/workflows/e2e.yml` passes
// `--project=chromium` alone - and the clinic is on iPhones. So the only
// assertion about this feature that is worth anything is an assertion about a
// VALUE, in a test that actually runs. Everything decidable is decided here,
// with no React, no DOM and no `Date.now()`; the component is a projection.
//
// WHAT IT DELIBERATELY DOES NOT DECIDE:
//   - WHICH BLOCKS EXIST. W9-04 says a blocked band is only true when the
//     agenda is scoped to exactly one therapist, and `page.tsx` enforces that
//     by not fetching blocks at all otherwise. A second copy of the rule here
//     would be free to drift from the query that decides it.
//   - GAPS / free time. Deliberately absent in phase 1. The agenda client holds
//     the CLINIC's hours but not `schedule_templates`, so it cannot know
//     whether the therapist works at a given hour; a "free" row would be a
//     clinical-availability claim the screen cannot back. Q-AGMOB-3 carries it.

import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  lisbonMinutesFromMidnight,
  lisbonParts,
  viewDates,
  type AgendaView,
} from "./time";
import { placeBlocksOnDate, type BlockSpan } from "./blocked-time-core";
import { deriveEstado, type Estado } from "./estado";
import type { AgendaAppointment, AppointmentStatusValue } from "./types";

/** The clinic's daily closure, in the shape `agenda-view` already holds it. */
export type ClosureWindow = {
  startMin: number;
  endMin: number;
  locationName: string;
};

export type WeekListRow =
  | {
      kind: "appointment";
      id: string;
      /** Minutes from Lisbon midnight. The renderer formats; it never re-derives. */
      startMin: number;
      endMin: number;
      /** NULL MEANS WITHHELD and nothing else - see AgendaAppointment.patientName. */
      patientName: string | null;
      practitionerId: string;
      practitionerName: string;
      colorKey: string | null;
      status: AppointmentStatusValue;
      /**
       * The five-estado glyph language (W12-11 R10), DERIVED HERE rather than
       * in the renderer. `status` and `confirmationState` are orthogonal axes
       * and `deriveEstado` is the one place that folds them; a component that
       * folded them a second time would be free to disagree with the grid about
       * whether a row is Confirmada.
       */
      estado: Estado;
      locationName: string;
      serviceName: string | null;
    }
  | {
      kind: "block";
      id: string;
      startMin: number;
      endMin: number;
      reason: string;
      note: string | null;
      /** The absence began on an earlier day / runs into a later one. */
      clippedStart: boolean;
      clippedEnd: boolean;
    }
  | {
      kind: "closure";
      startMin: number;
      endMin: number;
      locationName: string;
    };

export type WeekListDay = {
  /** Lisbon calendar date, "yyyy-mm-dd". */
  date: string;
  /** Chronological. Ties keep appointment-before-block-before-closure. */
  rows: WeekListRow[];
  /**
   * The number the day HEADING shows, and it counts appointments ONLY.
   *
   * A heading reading "4" over two appointments, one absence and the midday
   * closure would be true of `rows.length` and false of everything a therapist
   * means by it. The grid's own W4-17 chip counts appointments too, so this
   * keeps the two surfaces saying the same thing.
   */
  appointmentCount: number;
};

export type BuildWeekListInput = {
  view: AgendaView;
  /** Lisbon calendar date the view is anchored on. */
  anchor: string;
  appointments: readonly AgendaAppointment[];
  blocks?: readonly BlockSpan[];
  closure?: ClosureWindow | null;
  /**
   * The visible window, as the GRID is drawn with it. Blocks are clipped to it
   * so the list and the grid can never disagree about how far an absence runs.
   * Defaults to the same 08:00-20:00 fallback `agenda-grid` uses when a caller
   * has no clinic in scope.
   */
  dayWindow?: { startMin: number; endMin: number };
};

/** Sort key within a day: earlier first, then a stable kind order on a tie. */
const KIND_ORDER: Record<WeekListRow["kind"], number> = {
  appointment: 0,
  block: 1,
  closure: 2,
};

export function buildWeekListDays(input: BuildWeekListInput): WeekListDay[] {
  const { view, anchor, appointments, blocks = [], closure = null } = input;
  const win = input.dayWindow ?? {
    startMin: DAY_START_HOUR * 60,
    endMin: DAY_END_HOUR * 60,
  };

  const dates = viewDates(view, anchor);

  // Bucket appointments by their LISBON calendar day, in one pass. The grid
  // decides visibility the same way (`lisbonParts(...).date`), so an
  // appointment cannot be on the list under one date and in the grid under
  // another - and a 00:30 Lisbon start that is 23:30Z the previous day lands
  // where the clinic reads it, not where UTC does.
  const byDate = new Map<string, WeekListRow[]>();
  for (const d of dates) byDate.set(d, []);

  for (const a of appointments) {
    const start = new Date(a.startsAt);
    const date = lisbonParts(start).date;
    const bucket = byDate.get(date);
    if (!bucket) continue; // outside the six days in view
    bucket.push({
      kind: "appointment",
      id: a.id,
      startMin: lisbonMinutesFromMidnight(start),
      endMin: lisbonMinutesFromMidnight(new Date(a.endsAt)),
      patientName: a.patientName,
      practitionerId: a.practitionerId,
      practitionerName: a.practitionerName,
      colorKey: a.colorKey,
      status: a.status,
      estado: deriveEstado(a.status, a.confirmationState),
      locationName: a.locationName,
      serviceName: a.serviceName,
    });
  }

  for (const date of dates) {
    const bucket = byDate.get(date)!;
    // placeBlocksOnDate already does the multi-day clipping, the window clip
    // and the zero-length drop; reimplementing any of it here would be a second
    // opinion about what a block is.
    for (const p of placeBlocksOnDate(blocks, date, win.endMin)) {
      bucket.push({
        kind: "block",
        id: p.id,
        startMin: p.startMin,
        endMin: p.endMin,
        reason: p.reason,
        note: p.note,
        clippedStart: p.clippedStart,
        clippedEnd: p.clippedEnd,
      });
    }
    if (closure) {
      bucket.push({
        kind: "closure",
        startMin: closure.startMin,
        endMin: closure.endMin,
        locationName: closure.locationName,
      });
    }
  }

  return dates.map((date) => {
    const rows = byDate.get(date)!;
    rows.sort(
      (a, b) => a.startMin - b.startMin || KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
    );
    return {
      date,
      rows,
      appointmentCount: rows.filter((r) => r.kind === "appointment").length,
    };
  });
}
