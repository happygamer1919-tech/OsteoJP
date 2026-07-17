// W9-04 - blocked-time band geometry + the non-bookable rule (CB QA item 3).
//
// Time a therapist has blocked (`time_off`, migration 0006) was excluded from
// booking availability by W5-12 but never DRAWN on the agenda, so it was
// invisible and looked bookable. This module is the pure decision layer: it maps
// a block interval onto the day grid and decides which 30-min slots it covers,
// so both the band geometry and the non-bookable rule are unit-testable without
// a DB or a renderer.
//
// SCOPE (owner question filed 2026-07-17, inbox W9-04-SCOPE-blocked-band-
// therapist-axis): `time_off` is PER THERAPIST but the agenda grid has DAY
// columns and no therapist axis (W9-01 (f)). A full-width band is therefore only
// TRUE when the agenda is scoped to exactly one therapist. The caller enforces
// that; this module just does the geometry.
//
// Blocks are stored as UTC instants and rendered on a Lisbon day, so every
// conversion goes through ./time - never raw UTC arithmetic, or a block would
// shift by the offset across a DST boundary.

import { DAY_START_HOUR, SLOT_MINUTES, lisbonMinutesFromMidnight, lisbonParts } from "./time";

/** A `time_off` row, narrowed to what the grid needs. */
export type BlockSpan = {
  id: string;
  /** UTC instant, ISO 8601. */
  startsAt: string;
  /** UTC instant, ISO 8601. */
  endsAt: string;
  reason: string;
};

/** A block's placement on ONE Lisbon day, in minutes from that day's midnight. */
export type BlockPlacement = {
  id: string;
  reason: string;
  /** Minutes from Lisbon midnight, clipped to the start of the visible day. */
  startMin: number;
  /** Minutes from Lisbon midnight, clipped to the end of the visible day. */
  endMin: number;
  /** True when the block began before this day (a multi-day absence). */
  clippedStart: boolean;
  /** True when the block continues past this day. */
  clippedEnd: boolean;
};

const DAY_START_MIN = DAY_START_HOUR * 60;

/**
 * Lisbon minutes-from-midnight for `instant` AS SEEN ON `date`.
 *
 * A multi-day absence starts before `date` and/or ends after it, so the raw
 * clock reading is meaningless on its own: 09:00 on the previous day would read
 * as 540 and wrongly place a band mid-morning. Compare calendar dates first and
 * return a saturating sentinel, so the caller's clamp does the right thing.
 */
function minutesOnDate(instant: string, date: string): number {
  const d = new Date(instant);
  const onDate = lisbonParts(d).date;
  if (onDate < date) return Number.NEGATIVE_INFINITY; // began on an earlier day
  if (onDate > date) return Number.POSITIVE_INFINITY; // runs into a later day
  return lisbonMinutesFromMidnight(d);
}

/**
 * Place the blocks that touch `date` onto that day's visible grid.
 *
 * `dayEndMin` is the grid's exclusive end (the caller passes the same value the
 * grid is drawn with, so band and grid can never disagree). Blocks that fall
 * entirely outside the visible window are dropped. A zero-length or inverted
 * span is dropped too: the DB guarantees starts_at < ends_at
 * (`time_off_starts_before_ends`), but clipping to the window can legitimately
 * collapse a span to nothing.
 */
export function placeBlocksOnDate(
  blocks: readonly BlockSpan[],
  date: string,
  dayEndMin: number,
): BlockPlacement[] {
  const placements: BlockPlacement[] = [];
  for (const b of blocks) {
    const rawStart = minutesOnDate(b.startsAt, date);
    const rawEnd = minutesOnDate(b.endsAt, date);
    // Entirely before this day's window, or entirely after it.
    if (rawEnd <= DAY_START_MIN || rawStart >= dayEndMin) continue;

    const startMin = Math.max(rawStart, DAY_START_MIN);
    const endMin = Math.min(rawEnd, dayEndMin);
    if (endMin <= startMin) continue;

    placements.push({
      id: b.id,
      reason: b.reason,
      startMin,
      endMin,
      clippedStart: rawStart < DAY_START_MIN,
      clippedEnd: rawEnd > dayEndMin,
    });
  }
  return placements.sort((a, b) => a.startMin - b.startMin);
}

/**
 * Is the 30-min slot beginning at `slotMin` covered by any block?
 *
 * ANY overlap counts, not just full containment: a block from 10:15 to 10:45
 * makes the 10:00 slot unbookable, because booking into it would run into the
 * absence. This is the non-bookable rule - the caller disables the slot's
 * button, so a blocked slot is unreachable by mouse AND keyboard.
 */
export function isSlotBlocked(slotMin: number, placements: readonly BlockPlacement[]): boolean {
  const slotEnd = slotMin + SLOT_MINUTES;
  return placements.some((p) => p.startMin < slotEnd && p.endMin > slotMin);
}
