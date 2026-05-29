// Pure interval-overlap math for appointment conflict detection.
//
// An appointment occupies the half-open interval [startsAt, endsAt): the end
// instant is exclusive, so a 09:00–10:00 booking does NOT conflict with a
// 10:00–11:00 booking. This matches how a back-to-back schedule should behave.
//
// No DB, no timezone logic here — callers pass absolute instants (Date or
// epoch ms). Kept pure so conflict rules are unit-testable in isolation.

export type Interval = { start: Date; end: Date };

/** True when two half-open intervals share any instant. */
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** True when `candidate` overlaps any interval in `existing`. */
export function hasConflict(candidate: Interval, existing: Interval[]): boolean {
  return existing.some((e) =>
    intervalsOverlap(candidate.start, candidate.end, e.start, e.end),
  );
}

/** A start/end pair is valid only when end is strictly after start. */
export function isValidInterval(start: Date, end: Date): boolean {
  return (
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    end.getTime() > start.getTime()
  );
}
