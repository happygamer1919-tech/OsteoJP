import "server-only";
import { and, asc, eq, gt, lt, ne } from "drizzle-orm";
import { appointments, availabilityTemplates, patients } from "@osteojp/db";
import { lisbonMidnightUtc, addDays } from "@/lib/scheduling/time";
import type { DbTx } from "@osteojp/db";
import { coverageViolations, type CoverageRow } from "@/lib/scheduling/schedule-coverage";
import {
  invertedRows,
  projectedRows,
  type SchedulePlan,
} from "@/lib/scheduling/schedule-window";
import { AdminError } from "./errors";

/**
 * SCHED-04 / SCHED-05 - the write half both layer-2 entry modes share.
 *
 * The alternating pattern and the day-by-day grid differ only in which dates
 * they produce. Reading the therapist's current rows, checking what the result
 * would be BEFORE writing anything, applying the carve, the deactivations and
 * the inserts, and reporting the appointments the window runs over are the same
 * operations in both, and they held identical copies until this file existed.
 * That duplication is what let SCHED-05's inversion sit in one of them.
 */

/** An appointment the window runs over. Reported, NEVER cancelled. */
export type AffectedAppointment = {
  id: string;
  patientName: string;
  startsAt: string; // ISO UTC
  endsAt: string;
};

export type ScheduleWindowResult = {
  /** How many dated rows were written. */
  created: number;
  /** How many existing weekly rows were bounded to make room. */
  carved: number;
  /** How many dated rows were superseded (is_active = false) on an explicit
   *  replace. Zero on every path that did not ask for one. */
  superseded: number;
  /** Appointments inside the window. ADVISORY (PL-11): the save succeeded. */
  affected: AffectedAppointment[];
};

/** Every active row for one therapist, in the shape the planners read. */
export async function readActiveRows(tx: DbTx, userId: string): Promise<CoverageRow[]> {
  const rows = await tx
    .select({
      id: availabilityTemplates.id,
      locationId: availabilityTemplates.locationId,
      weekday: availabilityTemplates.weekday,
      startTime: availabilityTemplates.startTime,
      endTime: availabilityTemplates.endTime,
      validFrom: availabilityTemplates.validFrom,
      validUntil: availabilityTemplates.validUntil,
    })
    .from(availabilityTemplates)
    .where(
      and(eq(availabilityTemplates.isActive, true), eq(availabilityTemplates.userId, userId)),
    );
  return rows.map((r) => ({
    id: r.id,
    locationId: r.locationId,
    weekday: r.weekday,
    startTime: r.startTime.slice(0, 5),
    endTime: r.endTime.slice(0, 5),
    validFrom: r.validFrom,
    validUntil: r.validUntil,
  }));
}

/**
 * THE GATE. Refuse the whole plan rather than write a schedule that says the
 * therapist is at two clinics at once. Called while nothing has been written.
 *
 * TWO CHECKS, AND THE SECOND IS NOT REDUNDANT (1.3). The coverage invariant
 * cannot see an inverted range: validityIntersects is false for one against
 * everything, so a set containing an inverted row passes the invariant by having
 * that row silently excluded. SCHED-05 is exactly that hole, so the inversion
 * check is separate and runs on the same projected rows.
 */
export function assertPlanWritable(existing: readonly CoverageRow[], plan: SchedulePlan): void {
  const projected = projectedRows(existing, plan);

  const inverted = invertedRows(projected);
  if (inverted.length > 0) {
    // Not a user error and not reachable through the UI: it means a planner
    // produced a backwards bound. Loud, with the row that did it.
    const first = inverted[0]!;
    throw new AdminError(
      "invalid",
      `refusing to write an inverted validity range (${first.validFrom} > ${first.validUntil})`,
    );
  }

  const violations = coverageViolations(projected);
  if (violations.length > 0) {
    const first = violations[0]!;
    throw new AdminError("invalid", `schedule would double-cover ${first.date} (${first.kind})`);
  }
}

/** Apply a checked plan: carve, resume, supersede, insert. In that order. */
export async function writeSchedulePlan(
  tx: DbTx,
  tenantId: string,
  userId: string,
  plan: SchedulePlan,
): Promise<void> {
  for (const carve of plan.carved) {
    await tx
      .update(availabilityTemplates)
      .set({ validUntil: carve.validUntil })
      .where(eq(availabilityTemplates.id, carve.id));
    if (carve.resume) {
      await tx.insert(availabilityTemplates).values({
        tenantId,
        userId,
        locationId: carve.resume.locationId,
        weekday: carve.resume.weekday,
        startTime: carve.resume.startTime,
        endTime: carve.resume.endTime,
        validFrom: carve.resume.validFrom,
        validUntil: carve.resume.validUntil,
      });
    }
  }

  // SUPERSEDED, NOT DELETED AND NOT REWRITTEN. is_active = false is how this
  // codebase retires a row everywhere else, the read paths already filter on it,
  // and it leaves the superseded schedule readable in the table afterwards.
  // Rewriting the bounds instead is what SCHED-05 was.
  for (const superseded of plan.deactivate) {
    await tx
      .update(availabilityTemplates)
      .set({ isActive: false })
      .where(eq(availabilityTemplates.id, superseded.id));
    // ITS TAIL GOES BACK. A row that reached past the window was still serving
    // dates after it; retiring it without this would delete the therapist's
    // schedule from the window's end onwards, and an empty agenda is exactly
    // what "no schedule" looks like, so nothing would report it.
    if (superseded.resume) {
      await tx.insert(availabilityTemplates).values({
        tenantId,
        userId,
        locationId: superseded.resume.locationId,
        weekday: superseded.resume.weekday,
        startTime: superseded.resume.startTime,
        endTime: superseded.resume.endTime,
        validFrom: superseded.resume.validFrom,
        validUntil: superseded.resume.validUntil,
      });
    }
  }

  for (const row of plan.created) {
    await tx.insert(availabilityTemplates).values({
      tenantId,
      userId,
      locationId: row.locationId,
      weekday: row.weekday,
      startTime: row.startTime,
      endTime: row.endTime,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
    });
  }
}

/**
 * The appointments already booked inside the window.
 *
 * ADVISORY, NEVER DESTRUCTIVE. PL-11 makes availability advisory and Q-W5-4
 * forbids silently destroying scheduling data, so these are REPORTED for a human
 * to move. Refusing the save instead would leave reception unable to record that
 * the therapist is at the other clinic that week, which is true whether or not
 * the system likes it.
 */
export async function affectedAppointments(
  tx: DbTx,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<AffectedAppointment[]> {
  const rangeStart = lisbonMidnightUtc(startDate);
  const rangeEnd = lisbonMidnightUtc(addDays(endDate, 1));
  const rows = await tx
    .select({
      id: appointments.id,
      patientName: patients.fullName,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
    })
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .where(
      and(
        eq(appointments.practitionerId, userId),
        ne(appointments.status, "cancelled"),
        lt(appointments.startsAt, rangeEnd),
        gt(appointments.endsAt, rangeStart),
      ),
    )
    .orderBy(asc(appointments.startsAt));
  return rows.map((a) => ({
    id: a.id,
    patientName: a.patientName,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
  }));
}
