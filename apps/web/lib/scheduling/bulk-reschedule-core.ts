// APPT-BULK-01 - "Alterar várias marcações", the pure half.
//
// The clinic manager had a patient with ten future visits who wanted another
// therapist, and could only change them one at a time. This module decides,
// for each visit she ticked, WHAT the change makes of it: its new start, end,
// therapist and clinic. It decides nothing about whether that is ALLOWED:
// every check (the therapist's hours, the clinic's hours, the closure, the
// conflicts, NESA, the clinic assignment, the double-confirmed constraint, RLS)
// is the single move's, run row by row by `bulkRescheduleAppointments` through
// the same code `rescheduleAppointment` runs. Pure and framework-free, so the
// arithmetic is a table test.

import { MAX_OCCURRENCES } from "./recurrence";
import { addDays, lisbonDateTimeToUtc, lisbonParts } from "./time";
import type { ConflictInfo } from "./types";

/**
 * The most visits one bulk change may touch: the reminder ceiling of ONE
 * action (`MAX_EVENTS_PER_BOOKING_ACTION` in ./reminders.ts is this same
 * number). The bulk change is one action and makes one reminder call, so a
 * larger selection would be refused by that ceiling AFTER the writes; it is
 * refused here, before any.
 */
export const BULK_MAX_ROWS = MAX_OCCURRENCES;

/** Roles offered the bulk change and allowed through its server gate. */
export const BULK_ROLES: ReadonlySet<string> = new Set(["owner", "admin", "reception"]);

/** The statuses a visit must hold to be changed in bulk: Agendada, Confirmada. */
export const BULK_STATUSES: ReadonlySet<string> = new Set(["scheduled", "confirmed"]);

/** Shift limits, in days. A year either way is far beyond any real use. */
export const BULK_MAX_SHIFT_DAYS = 365;

/** Duration limits, in minutes, the same order as the agenda's choices. */
export const BULK_MIN_DURATION = 5;
export const BULK_MAX_DURATION = 480;

/**
 * What she asks to change. Every field is optional; a field left out keeps
 * each row's own value. At least one must be set.
 *   practitionerId  the new Terapeuta, for every ticked row
 *   locationId      the new clinic, for every ticked row
 *   time            "HH:MM", the new hour; each row keeps its own date
 *   shiftDays       move every row by N days (negative moves earlier)
 *   durationMin     the new length of every row
 */
export type BulkChange = {
  practitionerId?: string | null;
  locationId?: string | null;
  time?: string | null;
  shiftDays?: number | null;
  durationMin?: number | null;
};

/**
 * One ticked row, as the client sends it.
 *   time           the preview's hour picker: this row's own new hour, which
 *                  wins over the change's `time`
 *   allowConflict  the explicit per-row tick that accepts one of the three
 *                  overridable conflicts (therapist booked, room, absence). It
 *                  reaches only what "Guardar mesmo assim" reaches on the
 *                  agenda: never working hours, clinic hours, the closure or
 *                  two confirmed visits at once.
 */
export type BulkRowRequest = {
  id: string;
  time?: string | null;
  allowConflict?: boolean;
  /**
   * The row's start as the client last saw it (ISO), REQUIRED on an apply. A
   * row whose start is no longer this is left alone with verdict `changed`:
   * a save retried after its answer was lost cannot shift the visits a
   * second time.
   */
  expectedStartsAt?: string | null;
};

export type BulkRequest = {
  patientId: string;
  rows: BulkRowRequest[];
  change: BulkChange;
  mode: "preview" | "apply";
};

/** The facts of one visit the plan reads, as stored. */
export type BulkSourceRow = {
  id: string;
  patientId: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  practitionerId: string;
  locationId: string;
};

/** One side of a row, before or after, as the client receives it. */
export type BulkSide = {
  startsAt: string;
  endsAt: string;
  practitionerId: string;
  locationId: string;
};

/**
 * What one row comes to.
 *   ok            preview: every check passed; apply: it was saved
 *   unchanged     the change leaves this row as it is; nothing is written
 *   not_eligible  not this patient's, not ahead, not Agendada or Confirmada,
 *                 or not found; nothing is written
 *   changed       the row moved or changed since the client read it;
 *                 nothing is written, preview again
 *   already_saved the row already holds what this change makes of the start
 *                 the client saw (a save retried after a lost answer, or the
 *                 same plan submitted twice); nothing is written again
 *   past          the change would put the visit in the past; nothing is
 *                 written
 *   overlap       (preview only) it would land on another visit of this
 *                 selection with the same therapist; the apply refuses it
 *   conflict      one of the three overridable conflicts; nothing is written
 *                 unless the row is ticked to override
 *   refused       any other refusal, with the move's own code and payload
 */
export type BulkVerdict =
  | { kind: "ok" }
  | { kind: "unchanged" }
  | { kind: "not_eligible" }
  | { kind: "changed" }
  | { kind: "already_saved" }
  | { kind: "past" }
  | { kind: "overlap"; with: { id: string; startsAt: string; endsAt: string } }
  | { kind: "conflict"; conflicts: ConflictInfo[] }
  | {
      kind: "refused";
      error: string;
      availabilityWindows?: { startTime: string; endTime: string }[];
      clinicClosure?: { locationName: string; from: string; to: string };
      clinicWindow?: {
        reason: "before_open" | "after_latest_start";
        locationName: string;
        opensAt: string;
        closesAt: string;
        latestStart: string;
      };
    };

export type BulkRowResult = {
  id: string;
  before: BulkSide | null;
  after: BulkSide | null;
  verdict: BulkVerdict;
  /** True only in apply mode, for a row that was saved. */
  applied: boolean;
};

export type BulkResult = {
  mode: "preview" | "apply";
  rows: BulkRowResult[];
  /** Rows saved (apply) or that would be saved (preview, verdict ok). */
  okCount: number;
  /** Rows that already held this change (a retried or doubled save). */
  alreadySavedCount: number;
  /** Rows left as they were for any other reason. */
  skippedCount: number;
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isHhmm(v: unknown): v is string {
  return typeof v === "string" && HHMM.test(v);
}

/**
 * Is this a change the action will plan? At least one field set, and every
 * set field in range. The ids are checked by the move itself (an unknown
 * therapist or clinic is refused there, exactly as on the agenda).
 */
export function validBulkChange(change: BulkChange | null | undefined): boolean {
  if (!change || typeof change !== "object") return false;
  const { practitionerId, locationId, time, shiftDays, durationMin } = change;
  const set = [practitionerId, locationId, time, shiftDays, durationMin].filter(
    (v) => v !== null && v !== undefined && v !== "",
  );
  if (set.length === 0) return false;
  if (practitionerId != null && (typeof practitionerId !== "string" || practitionerId === "")) return false;
  if (locationId != null && (typeof locationId !== "string" || locationId === "")) return false;
  if (time != null && time !== "" && !isHhmm(time)) return false;
  if (shiftDays != null) {
    if (!Number.isInteger(shiftDays) || Math.abs(shiftDays) > BULK_MAX_SHIFT_DAYS) return false;
  }
  if (durationMin != null) {
    if (!Number.isInteger(durationMin) || durationMin < BULK_MIN_DURATION || durationMin > BULK_MAX_DURATION) {
      return false;
    }
  }
  return true;
}

/**
 * Is the request itself well formed: a patient, 1 to BULK_MAX_ROWS distinct
 * row ids, a valid change, a known mode, and any per-row hour a real "HH:MM".
 */
export function validBulkRequest(req: BulkRequest | null | undefined): boolean {
  if (!req || typeof req !== "object") return false;
  if (typeof req.patientId !== "string" || req.patientId === "") return false;
  if (req.mode !== "preview" && req.mode !== "apply") return false;
  if (!Array.isArray(req.rows) || req.rows.length === 0 || req.rows.length > BULK_MAX_ROWS) return false;
  const ids = new Set<string>();
  for (const r of req.rows) {
    if (!r || typeof r.id !== "string" || r.id === "") return false;
    if (ids.has(r.id)) return false;
    ids.add(r.id);
    if (r.time != null && r.time !== "" && !isHhmm(r.time)) return false;
    if (r.allowConflict != null && typeof r.allowConflict !== "boolean") return false;
    if (r.expectedStartsAt != null && (typeof r.expectedStartsAt !== "string" || Number.isNaN(Date.parse(r.expectedStartsAt)))) {
      return false;
    }
    // An APPLY names the start it was planned from, on every row, so no
    // caller (an older tab during a deploy, a direct call) can save without
    // the protection against shifting the visits twice.
    if (req.mode === "apply" && !r.expectedStartsAt) return false;
  }
  return validBulkChange(req.change);
}

/**
 * May this row be changed in bulk at all: this patient's, Agendada or
 * Confirmada, and starting after `nowMs`. The server reads the row and asks
 * this; the client's own filter is only the affordance.
 */
export function bulkRowEligible(row: BulkSourceRow, patientId: string, nowMs: number): boolean {
  return row.patientId === patientId && BULK_STATUSES.has(row.status) && row.startsAt.getTime() > nowMs;
}

function hhmmOf(d: Date): string {
  const p = lisbonParts(d);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/**
 * The row after the change. The date is the row's own Lisbon date, moved by
 * `shiftDays`; the hour is the row's override, else the change's `time`, else
 * the row's own Lisbon hour (so a shift keeps the wall clock across a DST
 * change, as the series move does); the length is `durationMin`, else the
 * row's own.
 */
export function planBulkRow(
  row: Pick<BulkSourceRow, "startsAt" | "endsAt" | "practitionerId" | "locationId">,
  change: BulkChange,
  rowTime?: string | null,
): { startsAt: Date; endsAt: Date; practitionerId: string; locationId: string } {
  const date = addDays(lisbonParts(row.startsAt).date, change.shiftDays ?? 0);
  const time = (rowTime && isHhmm(rowTime) ? rowTime : null) ?? (isHhmm(change.time) ? change.time : null) ?? hhmmOf(row.startsAt);
  const ownMinutes = Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60_000);
  const minutes = change.durationMin ?? ownMinutes;
  const startsAt = lisbonDateTimeToUtc(date, time);
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + minutes * 60_000),
    practitionerId: change.practitionerId || row.practitionerId,
    locationId: change.locationId || row.locationId,
  };
}

/** Does the plan leave the row exactly as it was? Then nothing is written. */
export function bulkRowUnchanged(
  before: Pick<BulkSourceRow, "startsAt" | "endsAt" | "practitionerId" | "locationId">,
  after: { startsAt: Date; endsAt: Date; practitionerId: string; locationId: string },
): boolean {
  return (
    before.startsAt.getTime() === after.startsAt.getTime() &&
    before.endsAt.getTime() === after.endsAt.getTime() &&
    before.practitionerId === after.practitionerId &&
    before.locationId === after.locationId
  );
}

export function sideOf(s: { startsAt: Date; endsAt: Date; practitionerId: string; locationId: string }): BulkSide {
  return {
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    practitionerId: s.practitionerId,
    locationId: s.locationId,
  };
}

/**
 * The verdict a move's refusal maps to. An overridable conflict is a list
 * (the three kinds "Guardar mesmo assim" reaches); everything else keeps the
 * move's own code and payload, so the client reads it with the agenda's own
 * sentences (refusal-message.ts).
 */
export function verdictOfRefusal(r: {
  error: string;
  conflicts?: ConflictInfo[];
  availabilityWindows?: { startTime: string; endTime: string }[];
  clinicClosure?: { locationName: string; from: string; to: string };
  clinicWindow?: {
    reason: "before_open" | "after_latest_start";
    locationName: string;
    opensAt: string;
    closesAt: string;
    latestStart: string;
  };
  conflictOverridable?: false;
}): BulkVerdict {
  if (r.error === "conflict" && r.conflictOverridable !== false) {
    return { kind: "conflict", conflicts: r.conflicts ?? [] };
  }
  return {
    kind: "refused",
    error: r.error,
    ...(r.availabilityWindows ? { availabilityWindows: r.availabilityWindows } : {}),
    ...(r.clinicClosure ? { clinicClosure: r.clinicClosure } : {}),
    ...(r.clinicWindow ? { clinicWindow: r.clinicWindow } : {}),
  };
}

type Planned = { startsAt: Date; endsAt: Date; practitionerId: string };

/**
 * PREVIEW ONLY: does this planned row land on a row this preview already
 * passed, with the same therapist? The preview checks each row against the
 * database as it is, which does not yet hold the passed rows at their new
 * hours; this is what it would find once they are there. The apply needs no
 * such check: by then the passed rows are in the database.
 */
export function bulkSelfOverlap(
  plan: Planned,
  passed: readonly { id: string; plan: Planned }[],
): { id: string; startsAt: string; endsAt: string } | null {
  for (const p of passed) {
    if (p.plan.practitionerId !== plan.practitionerId) continue;
    if (p.plan.startsAt.getTime() < plan.endsAt.getTime() && plan.startsAt.getTime() < p.plan.endsAt.getTime()) {
      return { id: p.id, startsAt: p.plan.startsAt.toISOString(), endsAt: p.plan.endsAt.toISOString() };
    }
  }
  return null;
}

/**
 * Does the row ALREADY hold what this change makes of the start the client
 * saw? That is a save retried after its answer was lost, or the same plan
 * submitted twice: report it as saved, not as changed by someone else.
 *
 * The plan is rebuilt from `expectedStartsAt`. Its length, therapist and
 * clinic are the row's current ones: a change that set them made them equal
 * to the plan's, and a change that did not left them as they were.
 */
export function bulkAlreadySaved(
  row: Pick<BulkSourceRow, "startsAt" | "endsAt" | "practitionerId" | "locationId">,
  expectedStartsAt: string,
  change: BulkChange,
  rowTime?: string | null,
): boolean {
  const seenStart = new Date(expectedStartsAt);
  if (Number.isNaN(seenStart.getTime())) return false;
  const length = row.endsAt.getTime() - row.startsAt.getTime();
  const seen = {
    startsAt: seenStart,
    endsAt: new Date(seenStart.getTime() + length),
    practitionerId: row.practitionerId,
    locationId: row.locationId,
  };
  const plan = planBulkRow(seen, change, rowTime);
  if (bulkRowUnchanged(seen, plan)) return false;
  return bulkRowUnchanged(row, plan);
}
