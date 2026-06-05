// Server-side cancellation / reschedule cutoff for patient self-service.
//
// Pure, no DB, no clock-of-its-own beyond the `now` the caller passes in. This
// is the SINGLE source of truth for "is it too late to cancel/reschedule": the
// route enforces it server-side from the appointment's stored startsAt and the
// server clock, so a manipulated client (disabled button, forged request, wrong
// local time) can never get inside the window. The patient never supplies the
// cutoff or the appointment time — both come from the DB row.

/** Hours before an appointment within which a patient can no longer self-cancel
 *  or self-reschedule. Business rule: 24h. */
export const CANCELLATION_CUTOFF_HOURS = 24;

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * True when `now` is inside the cutoff window before `startsAt` (i.e. less than
 * CANCELLATION_CUTOFF_HOURS away), OR the appointment has already started/passed.
 * In either case a patient self-cancel/reschedule must be REJECTED.
 *
 * Half-open at the boundary: exactly 24h out is still allowed (not inside).
 */
export function isWithinCancellationCutoff(
  startsAt: Date,
  now: Date,
  cutoffHours: number = CANCELLATION_CUTOFF_HOURS,
): boolean {
  const msUntilStart = startsAt.getTime() - now.getTime();
  return msUntilStart < cutoffHours * MS_PER_HOUR;
}

/** Inverse helper for readability at call sites. */
export function canSelfModify(
  startsAt: Date,
  now: Date,
  cutoffHours: number = CANCELLATION_CUTOFF_HOURS,
): boolean {
  return !isWithinCancellationCutoff(startsAt, now, cutoffHours);
}
