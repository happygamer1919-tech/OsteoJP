// Pure availability / time-off evaluation for scheduling.
//
// No DB and no `server-only` here so these rules are unit-testable in isolation
// (mirrors overlap.ts). The tenant-scoped DB reads that feed these functions
// live in conflict.ts. Timezone handling goes through lib/scheduling/time, the
// single UTC<->Lisbon bridge.
//
// availability_templates (migration 0006) store working hours as Lisbon
// wall-clock (`time` columns) keyed by weekday 0=Sunday..6=Saturday (JS
// Date.getDay()), optionally bounded by a [valid_from, valid_until] date window.
// time_off blocks are absolute timestamptz, so they overlap in plain UTC.

import { lisbonMidnightUtc, lisbonParts } from "./time";
import { intervalsOverlap } from "./overlap";

/** One row of availability_templates (only the fields the rules need). */
export type AvailabilityTemplate = {
  weekday: number; // 0=Sun..6=Sat
  startTime: string; // "HH:MM" or "HH:MM:SS" Lisbon wall-clock
  endTime: string;
  validFrom: string | null; // "yyyy-mm-dd" inclusive, null = open-ended
  validUntil: string | null; // "yyyy-mm-dd" inclusive, null = open-ended
  isActive: boolean;
};

/** One row of time_off (absolute instants). */
export type AbsenceBlock = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  reason: string;
};

/* ------------------------------------------------------------------ */
/* Small pure helpers                                                  */
/* ------------------------------------------------------------------ */

/** "09:00" / "09:00:00" -> minutes since midnight. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Weekday (0=Sun..6=Sat) for a Lisbon calendar date "yyyy-mm-dd". */
export function lisbonWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Inclusive date-window test; null bounds are open-ended. Dates are "yyyy-mm-dd". */
export function isWithinValidity(
  dateStr: string,
  validFrom: string | null,
  validUntil: string | null,
): boolean {
  if (validFrom && dateStr < validFrom) return false;
  if (validUntil && dateStr > validUntil) return false;
  return true;
}

/**
 * True when [startMin, endMin) is fully covered by the union of `windows`
 * (each `[start, end]` minutes). Handles split shifts (e.g. morning + afternoon
 * with a lunch gap) by merging adjacent/overlapping windows first.
 */
export function isRangeCovered(
  startMin: number,
  endMin: number,
  windows: [number, number][],
): boolean {
  if (windows.length === 0) return false;
  const sorted = [...windows].sort((a, b) => a[0] - b[0]);
  let curStart = sorted[0][0];
  let curEnd = sorted[0][1];
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    if (s <= curEnd) {
      curEnd = Math.max(curEnd, e); // overlap/adjacent — extend
    } else {
      if (curStart <= startMin && curEnd >= endMin) return true;
      curStart = s;
      curEnd = e;
    }
  }
  return curStart <= startMin && curEnd >= endMin;
}

/* ------------------------------------------------------------------ */
/* Availability                                                        */
/* ------------------------------------------------------------------ */

export type AvailabilityResult = {
  /** The therapist has ≥1 active template for this location (any weekday). */
  configured: boolean;
  /** The candidate window is fully inside the matching working hours. */
  covered: boolean;
};

/**
 * Evaluate a candidate booking window against a therapist's availability
 * templates for one location. `templates` must already be scoped to
 * (therapist, location) by the caller; this function applies is_active,
 * weekday, validity, and coverage.
 *
 * A conflict should be flagged iff `configured && !covered`. When the therapist
 * has no active availability for the location (`configured === false`) the
 * window is left unenforced — availability is opt-in per (therapist, location),
 * so clinics that have not set hours are not spammed with warnings.
 */
export function evaluateAvailability(
  startsAt: Date,
  endsAt: Date,
  templates: AvailabilityTemplate[],
): AvailabilityResult {
  const configured = templates.some((t) => t.isActive);
  if (!configured) return { configured: false, covered: true };

  // Anchor on the booking's Lisbon calendar day; express the window as minutes
  // from that day's Lisbon midnight so it lines up with the `time` columns.
  const dateStr = lisbonParts(startsAt).date;
  const weekday = lisbonWeekday(dateStr);
  const midnight = lisbonMidnightUtc(dateStr).getTime();
  const startMin = (startsAt.getTime() - midnight) / 60_000;
  const endMin = (endsAt.getTime() - midnight) / 60_000;

  const windows = templates
    .filter(
      (t) =>
        t.isActive &&
        t.weekday === weekday &&
        isWithinValidity(dateStr, t.validFrom, t.validUntil),
    )
    .map((t): [number, number] => [
      timeToMinutes(t.startTime),
      timeToMinutes(t.endTime),
    ]);

  return { configured: true, covered: isRangeCovered(startMin, endMin, windows) };
}

/* ------------------------------------------------------------------ */
/* Time off                                                            */
/* ------------------------------------------------------------------ */

/** Absence blocks that overlap the candidate window (half-open overlap). */
export function absencesOverlapping(
  startsAt: Date,
  endsAt: Date,
  blocks: AbsenceBlock[],
): AbsenceBlock[] {
  return blocks.filter((b) =>
    intervalsOverlap(startsAt, endsAt, b.startsAt, b.endsAt),
  );
}
