// AGENDA-MOBILE-WEEK - what the phone's Semana grid shows, decided without a DOM.
//
// THE RULING, PARAPHRASED. On a phone, Semana is the desktop week grid,
// compressed: day columns side by side, a time axis, a block per appointment
// showing its start time and the patient's first name, coloured by service, with
// its status icon; concurrent blocks split the column side by side. Dia is
// unchanged. Desktop (640px and up) keeps its own rules.
//
// WHY A SEPARATE CORE AND NOT A MODE OF agenda-grid.tsx. The desktop grid's face
// is pinned by an earlier owner ruling (W11-00 v3): one line per appointment, the
// name never truncated, same-start rows STACKED, never split side by side, and
// agenda-grid.test.tsx asserts exactly that. This ruling reverses both of those
// rules BELOW 640 ONLY. Putting the phone face inside the desktop grid would make
// every one of those assertions a question about which width it ran at; a second
// core makes the scoping structural - desktop code never sees a lane.
//
// WHY THE DECISIONS LIVE HERE. No CI job on this repository runs WebKit, and the
// clinic is on iPhones. A claim about a VALUE is the only claim a test here can
// make that is worth anything, so everything decidable is decided in this file,
// with no React, no DOM and no clock; agenda-week-compact.tsx renders the answer.
//
// DEFAULTS BUILT IN HERE, each logged for the owner rather than decided quietly:
//   Q-B6-1  a column splits into at most TWO lanes. Where three or more rows
//           run at the same moment, the row in the left lane is drawn and the
//           rest of that moment's rows sit behind one "+N" chip in the right
//           lane, which opens Dia for that day. Rows around it that never run
//           three at a time keep their lanes. At 390px a day column is ~59px
//           (~51px with Dom); four lanes would be ~14px each, which holds
//           neither a time, nor a name, nor a 24px tap target.
//   Q-B6-5  Sunday is a column only when a loaded row falls on it. Desktop is
//           unchanged (Mon-Sat, W3-08).
//   Q-B6-8  blocked time and the midday closure are drawn as visual-only bands.
//   Q-B6-9  a cancelled row occupies a lane like any other, and a Sunday that
//           holds only a cancelled row still shows Dom (what the desktop grid and
//           the phone list already do with cancelled rows).

import { placeBlocksOnDate, type BlockSpan } from "./blocked-time-core";
import { deriveEstado, estadoStrikesName, type Estado } from "./estado";
import { isPatientWithheld, patientLabel } from "./patient-label";
import { serviceColor } from "./service-color";
import {
  SLOT_MINUTES,
  addDays,
  lisbonMinutesFromMidnight,
  lisbonParts,
  slotLabel,
  viewDates,
} from "./time";
import type { AgendaAppointment } from "./types";

/** The ruling's window: 08:00 to 21:00. Widened, never clamped (see below). */
export const COMPACT_BASE_WINDOW = { startMin: 8 * 60, endMin: 21 * 60 } as const;
/** One row of the grid is 30 minutes. */
export const COMPACT_ROW_MINUTES = SLOT_MINUTES;
/** Q-B6-1: the most lanes one day column is ever split into. */
export const COMPACT_MAX_LANES = 2;
/**
 * A block is DRAWN at least one row tall, so a 10-minute visit still has a face
 * and a tap target. Lanes are computed on the DRAWN span, not the booked one:
 * otherwise a 10-minute visit and one starting 15 minutes later would share a
 * lane and paint over each other.
 */
export const COMPACT_MIN_DRAWN_MINUTES = 30;

const DAY_MINUTES = 24 * 60;

export type CompactAppointment = {
  id: string;
  startMin: number;
  /** Booked end, minutes from Lisbon midnight. */
  endMin: number;
  /** Drawn end: never less than one row after the start. */
  drawnEndMin: number;
  /** 0 = left (or the whole column when `lanes` is 1), 1 = right. */
  lane: 0 | 1;
  lanes: 1 | 2;
  /** "16:00": the face's first line. */
  timeLabel: string;
  /** The face's second line: the first name, or the withheld label whole. */
  firstName: string;
  /** The full label, for the accessible name. */
  patientLabel: string;
  withheld: boolean;
  practitionerId: string;
  practitionerName: string;
  serviceId: string | null;
  serviceName: string | null;
  colorKey: string;
  estado: Estado;
  /** Falta strikes the name (R10); nothing else does. */
  struck: boolean;
};

/** Q-B6-1: the right lane where three or more rows run at once. */
export type CompactMore = {
  key: string;
  startMin: number;
  drawnEndMin: number;
  /** How many appointments this chip stands for (none of them is drawn). */
  count: number;
  hiddenIds: string[];
};

export type CompactBand =
  | { kind: "block"; id: string; startMin: number; endMin: number; note: string | null }
  | { kind: "closure"; startMin: number; endMin: number; locationName: string };

export type CompactDay = {
  /** Lisbon calendar date, "yyyy-mm-dd". */
  date: string;
  appointments: CompactAppointment[];
  more: CompactMore[];
  bands: CompactBand[];
  /** Every appointment on the day, drawn or behind a chip. */
  appointmentCount: number;
};

export type CompactLegendEntry = { serviceId: string | null; serviceName: string | null; colorKey: string };

export type CompactWeek = {
  days: CompactDay[];
  /** The drawn window, whole hours, minutes from Lisbon midnight. */
  window: { startMin: number; endMin: number };
  /** The services present in the drawn days, each once, sorted by name. */
  legend: CompactLegendEntry[];
};

export type BuildCompactWeekInput = {
  anchor: string;
  appointments: readonly AgendaAppointment[];
  blocks?: readonly BlockSpan[];
  closure?: { startMin: number; endMin: number; locationName: string } | null;
  /**
   * Ids of shared resources (NESA). Used ONLY as a tie-break so a twin pair
   * (a person row and a machine row, same patient, same start) lays out
   * person-left, machine-right. Unknown ids simply sort by name.
   */
  sharedResourceIds?: ReadonlySet<string>;
};

/** Lisbon date and minutes of an appointment; an end past midnight is 24:00. */
function spanOf(a: Pick<AgendaAppointment, "startsAt" | "endsAt">): {
  date: string;
  startMin: number;
  endMin: number;
} {
  const start = new Date(a.startsAt);
  const end = new Date(a.endsAt);
  const date = lisbonParts(start).date;
  const startMin = lisbonMinutesFromMidnight(start);
  const endMin = lisbonParts(end).date === date ? lisbonMinutesFromMidnight(end) : DAY_MINUTES;
  return { date, startMin, endMin: Math.max(startMin, endMin) };
}

/**
 * Mon-Sat of the anchor's week, plus that week's Sunday when any loaded row
 * starts on it (Q-B6-5, Q-B6-9: any status counts, a cancelled row included).
 *
 * The Sunday is the one AFTER the Saturday, i.e. Monday + 6. On a Sunday
 * anchor `viewDates` gives the week that just ended, so that is also the
 * Sunday it is about.
 */
export function compactDates(
  anchor: string,
  appointments: readonly Pick<AgendaAppointment, "startsAt">[],
): string[] {
  const monToSat = viewDates("week", anchor);
  const sunday = addDays(monToSat[0]!, 6);
  const hasSunday = appointments.some((a) => lisbonParts(new Date(a.startsAt)).date === sunday);
  return hasSunday ? [...monToSat, sunday] : monToSat;
}

/**
 * The drawn window: 08:00-21:00 UNION every drawn appointment's span, rounded
 * OUTWARD to whole hours.
 *
 * AGENDA-NEVER-HIDES, which is the desktop's rule and holds here too: a window
 * that CLAMPED a 07:30 or a 21:30 booking would draw it on top of the first or
 * last row, where it cannot be told apart from the row's own bookings. Hours
 * change; bookings made under the old ones do not.
 */
export function compactWindow(
  spans: readonly { startMin: number; endMin: number }[],
): { startMin: number; endMin: number } {
  let startMin: number = COMPACT_BASE_WINDOW.startMin;
  let endMin: number = COMPACT_BASE_WINDOW.endMin;
  for (const sp of spans) {
    startMin = Math.min(startMin, sp.startMin);
    endMin = Math.max(endMin, Math.max(sp.endMin, sp.startMin + COMPACT_MIN_DRAWN_MINUTES));
  }
  return {
    startMin: Math.max(0, Math.floor(startMin / 60) * 60),
    endMin: Math.min(DAY_MINUTES, Math.ceil(endMin / 60) * 60),
  };
}

export type LaneItem = {
  id: string;
  startMin: number;
  endMin: number;
  /** True for a shared-resource (machine) row: it sorts after a person row. */
  machine: boolean;
  /** Tie-break after time and kind, so the layout never depends on input order. */
  label: string;
};

export type LaneLayout = {
  placed: { id: string; lane: 0 | 1; lanes: 1 | 2; drawnEndMin: number }[];
  more: CompactMore[];
};

/**
 * The moments, as half-open [startMin, endMin) spans, at which MORE than
 * `maxLanes` of `rows` run at once (their drawn spans). Pure.
 */
function crowdedSpans(
  rows: readonly { startMin: number; drawnEndMin: number }[],
  maxLanes: number,
): { startMin: number; endMin: number }[] {
  // An end sorts before a start at the same minute: 10:00-10:45 and
  // 10:45-11:30 are consecutive, not concurrent.
  const events = rows
    .flatMap((r) => [
      { at: r.startMin, delta: 1 },
      { at: r.drawnEndMin, delta: -1 },
    ])
    .sort((a, b) => a.at - b.at || a.delta - b.delta);
  const out: { startMin: number; endMin: number }[] = [];
  let running = 0;
  for (let k = 0; k < events.length; k++) {
    running += events[k]!.delta;
    const next = events[k + 1];
    if (running > maxLanes && next && next.at > events[k]!.at) {
      const last = out[out.length - 1];
      if (last && last.endMin === events[k]!.at) last.endMin = next.at;
      else out.push({ startMin: events[k]!.at, endMin: next.at });
    }
  }
  return out;
}

/**
 * Side-by-side lanes for ONE day column. Pure.
 *
 * 1. Sort by start, then the LONGER drawn span first, then person before
 *    machine, then label, then id.
 * 2. Sweep into clusters: a row joins the cluster while it starts before the
 *    cluster's latest drawn end.
 * 3. First-fit lanes inside a cluster: the lowest lane whose last drawn end is
 *    at or before this start. For intervals sorted by start this is optimal, so
 *    the lane count IS the cluster's peak concurrency.
 * 4. A cluster of one or two lanes is drawn as it is.
 * 5. Q-B6-1, THE CAP IS PER MOMENT, NOT PER CLUSTER. A cluster is transitive:
 *    09:00-09:45, 09:30-10:15, 10:00-10:45 ... is one cluster though no more
 *    than two of them ever run at once. So in a cluster that needs a third
 *    lane, a row is hidden only if it RUNS at a moment where more than
 *    `maxLanes` rows run and it is not the one in lane 0 then. Every other row
 *    keeps its lane. The hidden rows are grouped where their spans overlap, and
 *    each group is ONE "+N" chip in the right lane over that group's span.
 *
 *    Why nothing overlaps: a row in lane 1 that is still drawn never runs at a
 *    crowded moment, and a row in lane 2 or higher always does (it took that
 *    lane because lanes 0 and 1 were busy when it started). If a drawn lane-1
 *    row and a hidden row overlapped, whichever started second would have
 *    started at a crowded moment with the lane-1 row running, so the lane-1 row
 *    would be hidden. A chip's span is a union of overlapping hidden spans, so
 *    no drawn lane-1 row sits under a chip either.
 */
export function layoutLanes(items: readonly LaneItem[], maxLanes: number = COMPACT_MAX_LANES): LaneLayout {
  const drawn = items.map((it) => ({
    ...it,
    drawnEndMin: Math.max(it.endMin, it.startMin + COMPACT_MIN_DRAWN_MINUTES),
  }));
  drawn.sort(
    (a, b) =>
      a.startMin - b.startMin ||
      b.drawnEndMin - b.startMin - (a.drawnEndMin - a.startMin) ||
      Number(a.machine) - Number(b.machine) ||
      a.label.localeCompare(b.label, "pt") ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  const out: LaneLayout = { placed: [], more: [] };
  let i = 0;
  while (i < drawn.length) {
    // One cluster.
    const cluster = [drawn[i]!];
    let clusterEnd = drawn[i]!.drawnEndMin;
    i += 1;
    while (i < drawn.length && drawn[i]!.startMin < clusterEnd) {
      cluster.push(drawn[i]!);
      clusterEnd = Math.max(clusterEnd, drawn[i]!.drawnEndMin);
      i += 1;
    }

    const laneEnds: number[] = [];
    const laneOf: number[] = [];
    for (const it of cluster) {
      let lane = laneEnds.findIndex((end) => end <= it.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.drawnEndMin);
      } else {
        laneEnds[lane] = it.drawnEndMin;
      }
      laneOf.push(lane);
    }
    const lanes = laneEnds.length;

    if (lanes <= maxLanes) {
      cluster.forEach((it, k) =>
        out.placed.push({
          id: it.id,
          lane: laneOf[k] === 0 ? 0 : 1,
          lanes: lanes === 1 ? 1 : 2,
          drawnEndMin: it.drawnEndMin,
        }),
      );
      continue;
    }

    const crowded = crowdedSpans(cluster, maxLanes);
    const runsWhenCrowded = (it: (typeof cluster)[number]) =>
      crowded.some((c) => it.startMin < c.endMin && c.startMin < it.drawnEndMin);
    // The chip takes the LAST lane that is drawn; the lanes left of it stay.
    const chipLane = maxLanes - 1;
    const hidden: (typeof cluster)[number][] = [];
    cluster.forEach((it, k) => {
      if (laneOf[k]! >= chipLane && runsWhenCrowded(it)) {
        hidden.push(it);
      } else {
        out.placed.push({ id: it.id, lane: laneOf[k] === 0 ? 0 : 1, lanes: 2, drawnEndMin: it.drawnEndMin });
      }
    });
    // `cluster` is sorted by start, so `hidden` is too: one sweep groups them.
    let group: (typeof cluster)[number][] = [];
    let groupEnd = Number.NEGATIVE_INFINITY;
    const flush = () => {
      if (group.length === 0) return;
      out.more.push({
        key: `more-${group[0]!.id}`,
        startMin: group[0]!.startMin,
        drawnEndMin: groupEnd,
        count: group.length,
        hiddenIds: group.map((g) => g.id),
      });
      group = [];
      groupEnd = Number.NEGATIVE_INFINITY;
    };
    for (const it of hidden) {
      if (group.length > 0 && it.startMin >= groupEnd) flush();
      group.push(it);
      groupEnd = Math.max(groupEnd, it.drawnEndMin);
    }
    flush();
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Geometry: what a lane is in CSS, and what it measures in pixels.     */
/* ------------------------------------------------------------------ */

/** The time axis. "08:00" at 10px is about 28px, plus its right inset. */
export const COMPACT_AXIS_PX = 34;
/** The only gap between two lanes. The outer edges have none: the column's own
 *  1px border already separates one day's blocks from the next day's. */
export const COMPACT_LANE_GAP_PX = 1;
/** WCAG 2.5.8's minimum target, the bar Q-B6-1 is argued against. */
export const COMPACT_MIN_TARGET_PX = 24;

/** Left and width of a block in `lane` of `lanes`, as CSS, inside its column. */
export function compactLaneBox(lane: 0 | 1, lanes: 1 | 2): { left: string; width: string } {
  if (lanes === 1) return { left: "0px", width: "100%" };
  const half = `calc(50% - ${COMPACT_LANE_GAP_PX / 2}px)`;
  return lane === 0 ? { left: "0px", width: half } : { left: `calc(50% + ${COMPACT_LANE_GAP_PX / 2}px)`, width: half };
}

/**
 * The width in px of one of two lanes, for a grid `viewportPx` wide with
 * `columns` day columns. The same arithmetic the CSS does: the axis takes its
 * fixed width, the columns share the rest equally, a column's 1px right border
 * is outside the box its blocks are placed in, and `compactLaneBox` splits what
 * is left around one gap.
 *
 * So a two-lane block is at least 24px wide from 334px up with six columns and
 * from 384px up with seven (Dom shown). Below those widths it is narrower: the
 * arithmetic, not a choice, and it is logged under Q-B6-1.
 */
export function compactLaneWidthPx(viewportPx: number, columns: number): number {
  const column = (viewportPx - COMPACT_AXIS_PX) / columns;
  const inner = column - 1;
  return (inner - COMPACT_LANE_GAP_PX) / 2;
}

/* ------------------------------------------------------------------ */
/* The one-time scroll to now.                                          */
/* ------------------------------------------------------------------ */

export type AutoScrollInput = {
  /** The week on screen (its first date). */
  weekKey: string;
  /** The week this was last decided for, or null before the first decision. */
  decidedFor: string | null;
  /** Lisbon "now", or null until the client has read the clock. */
  now: { date: string; min: number } | null;
  /** The dates drawn. */
  dates: readonly string[];
  window: { startMin: number; endMin: number };
  /** Whether the compact tree is the one on screen (not `display: none`). */
  displayed: boolean;
};

/**
 * Whether to scroll the page to the now line. Pure.
 *
 * DECIDED ONCE PER WEEK SHOWN, at the FIRST moment the client knows the time,
 * and never again for that week. Scroll only if, at that moment, this tree is
 * on screen, the week holds today, and now is inside the drawn hours. A
 * decision not to scroll is still a decision: a phone opened at 07:50 does not
 * jump to 08:00 ten minutes later, wherever the reader has scrolled to by then.
 * Returning to a week after another one decides again, as a fresh arrival.
 */
export function autoScrollDecision(input: AutoScrollInput): { scroll: boolean; decidedFor: string | null } {
  const { weekKey, decidedFor, now, dates, window: win, displayed } = input;
  if (now === null) return { scroll: false, decidedFor };
  if (decidedFor === weekKey) return { scroll: false, decidedFor };
  const scroll =
    displayed && dates.includes(now.date) && now.min >= win.startMin && now.min <= win.endMin;
  return { scroll, decidedFor: weekKey };
}

/**
 * "Seg 21" from formatDayHeader's "Segunda 21" (or "Seg 21"): the weekday cut to
 * three letters so seven columns of ~51px each hold it on one line. The full
 * label stays in the header button's accessible name.
 */
export function compactDayLabel(fullLabel: string): string {
  const [weekday = "", ...rest] = fullLabel.trim().split(/\s+/);
  return [weekday.slice(0, 3), ...rest].join(" ");
}

/** The first whitespace-separated word of a name; the whole label if withheld. */
export function faceName(patientName: string | null): string {
  const label = patientLabel(patientName);
  if (isPatientWithheld(patientName)) return label;
  return label.trim().split(/\s+/)[0] ?? label;
}

export function buildCompactWeek(input: BuildCompactWeekInput): CompactWeek {
  const { anchor, appointments, blocks = [], closure = null } = input;
  const machines = input.sharedResourceIds ?? new Set<string>();
  const dates = compactDates(anchor, appointments);
  const dateSet = new Set(dates);

  const byDate = new Map<string, { a: AgendaAppointment; startMin: number; endMin: number }[]>();
  for (const d of dates) byDate.set(d, []);
  for (const a of appointments) {
    const sp = spanOf(a);
    if (!dateSet.has(sp.date)) continue;
    byDate.get(sp.date)!.push({ a, startMin: sp.startMin, endMin: sp.endMin });
  }

  const win = compactWindow(
    [...byDate.values()].flat().map(({ startMin, endMin }) => ({ startMin, endMin })),
  );

  const legend = new Map<string, CompactLegendEntry>();
  const days: CompactDay[] = dates.map((date) => {
    const rows = byDate.get(date)!;
    const layout = layoutLanes(
      rows.map(({ a, startMin, endMin }) => ({
        id: a.id,
        startMin,
        endMin,
        machine: machines.has(a.practitionerId),
        label: `${patientLabel(a.patientName)} ${a.practitionerName}`,
      })),
    );
    const rowById = new Map(rows.map((r) => [r.a.id, r]));
    const appointmentsOut: CompactAppointment[] = layout.placed.map((p) => {
      const { a, startMin, endMin } = rowById.get(p.id)!;
      const estado = deriveEstado(a.status, a.confirmationState);
      return {
        id: a.id,
        startMin,
        endMin,
        drawnEndMin: p.drawnEndMin,
        lane: p.lane,
        lanes: p.lanes,
        timeLabel: slotLabel(startMin),
        firstName: faceName(a.patientName),
        patientLabel: patientLabel(a.patientName),
        withheld: isPatientWithheld(a.patientName),
        practitionerId: a.practitionerId,
        practitionerName: a.practitionerName,
        serviceId: a.serviceId,
        serviceName: a.serviceName,
        colorKey: serviceColor(a.serviceId).key,
        estado,
        struck: estadoStrikesName(estado),
      };
    });
    for (const { a } of rows) {
      const k = a.serviceId ?? "";
      if (!legend.has(k)) {
        legend.set(k, {
          serviceId: a.serviceId,
          serviceName: a.serviceName,
          colorKey: serviceColor(a.serviceId).key,
        });
      }
    }

    const bands: CompactBand[] = placeBlocksOnDate(blocks, date, win.endMin).map((p) => ({
      kind: "block" as const,
      id: p.id,
      startMin: p.startMin,
      endMin: p.endMin,
      note: p.note,
    }));
    if (closure && closure.endMin > win.startMin && closure.startMin < win.endMin) {
      bands.push({
        kind: "closure",
        startMin: Math.max(closure.startMin, win.startMin),
        endMin: Math.min(closure.endMin, win.endMin),
        locationName: closure.locationName,
      });
    }

    return {
      date,
      appointments: appointmentsOut,
      more: layout.more,
      bands,
      appointmentCount: rows.length,
    };
  });

  return {
    days,
    window: win,
    legend: [...legend.values()].sort(
      (x, y) =>
        // A row with no service goes last, under its own neutral entry.
        Number(x.serviceId === null) - Number(y.serviceId === null) ||
        (x.serviceName ?? "").localeCompare(y.serviceName ?? "", "pt"),
    ),
  };
}
