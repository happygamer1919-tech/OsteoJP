import "server-only";
import { and, asc, eq, gt, lt, ne } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { appointments, availabilityTemplates, patients } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { lisbonMidnightUtc, addDays } from "@/lib/scheduling/time";
import {
  planAlternatingWeeks,
  projectedRows,
  type AlternatingWeeksPlan,
} from "@/lib/scheduling/alternating-weeks";
import { coverageViolations, type CoverageRow } from "@/lib/scheduling/schedule-coverage";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";
import { assertTargetInScheduleScope, resolveScheduleScope } from "./schedule-scope";

/**
 * ITEM 5 - apply an alternating-week pattern to one therapist's schedule.
 *
 * LAYER 2 IS THE SAME TABLE AS LAYER 1, carrying `valid_from` / `valid_until`.
 * No migration: those columns already exist and every consumer already honours
 * them (day-availability-core.ts via isWithinValidity; the portal booking guard
 * in SQL at apps/api/lib/appointments/store.ts). The weekly setup REMAINS layer
 * 1 and the default - the pattern is a window carved into it, never a
 * replacement.
 *
 * THE INVARIANT IS ENFORCED HERE, BEFORE ANY WRITE, AND THAT PLACEMENT IS THE
 * DESIGN. The owner ratified a write-time invariant over read-time precedence
 * precisely so no consumer has to disambiguate anything: four consumers, two of
 * them SQL, would have meant four copies of a precedence rule and the drift that
 * produced migration 0059. Checking the PROJECTED rows means a violation is
 * refused while the transaction has written nothing, rather than discovered
 * halfway through an insert loop.
 */

/** An appointment the pattern runs over. Reported, NEVER cancelled. */
export type AffectedAppointment = {
  id: string;
  patientName: string;
  startsAt: string; // ISO UTC
  endsAt: string;
};

export type ApplyAlternatingResult = {
  /** How many template rows the pattern created. */
  created: number;
  /** How many existing weekly rows were bounded to make room. */
  carved: number;
  /** Appointments inside the window. ADVISORY (PL-11): the save succeeded. */
  affected: AffectedAppointment[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** R-SCHED-1: the horizon is three months. A little slack for month lengths. */
const MAX_HORIZON_DAYS = 100;

function validate(plan: AlternatingWeeksPlan): void {
  if (!DATE_RE.test(plan.startDate) || !DATE_RE.test(plan.endDate)) {
    throw new AdminError("invalid", "dates must be yyyy-mm-dd");
  }
  if (plan.endDate < plan.startDate) {
    throw new AdminError("invalid", "endDate must be on or after startDate");
  }
  if (plan.endDate > addDays(plan.startDate, MAX_HORIZON_DAYS)) {
    throw new AdminError("invalid", "the scheduling horizon is three months");
  }
  if (plan.weekdays.length === 0) throw new AdminError("invalid", "pick at least one weekday");
  if (plan.weekdays.some((d) => d < 0 || d > 6)) {
    throw new AdminError("invalid", "weekday must be 0-6");
  }
  if (plan.endTime <= plan.startTime) {
    throw new AdminError("invalid", "end must be after start");
  }
  if (plan.locationAId === plan.locationBId) {
    // Not a technical constraint - the same clinic both weeks is just a weekly
    // schedule, and expressing it as a pattern would write 65 rows to say what
    // one row already says.
    throw new AdminError("invalid", "the two weeks must be at different clinics");
  }
}

export async function applyAlternatingWeeks(
  actor: RequestContext,
  userId: string,
  plan: AlternatingWeeksPlan,
): Promise<ApplyAlternatingResult> {
  assertCan(actor.role, "schedule:manage");
  validate(plan);
  const scope = await resolveScheduleScope(actor);

  return runScoped(actor, async (tx) => {
    await assertTargetInScheduleScope(tx, userId, scope);

    const existingRows = await tx
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
        and(
          eq(availabilityTemplates.isActive, true),
          eq(availabilityTemplates.userId, userId),
        ),
      );

    const existing: CoverageRow[] = existingRows.map((r) => ({
      id: r.id,
      locationId: r.locationId,
      weekday: r.weekday,
      startTime: r.startTime.slice(0, 5),
      endTime: r.endTime.slice(0, 5),
      validFrom: r.validFrom,
      validUntil: r.validUntil,
    }));

    const write = planAlternatingWeeks(plan, existing);

    // THE GATE. Refuse the whole plan rather than write a schedule that says the
    // therapist is at two clinics at once. Nothing has been written yet.
    const violations = coverageViolations(projectedRows(existing, write));
    if (violations.length > 0) {
      const first = violations[0]!;
      throw new AdminError(
        "invalid",
        `schedule would double-cover ${first.date} (${first.kind})`,
      );
    }

    for (const carve of write.carved) {
      await tx
        .update(availabilityTemplates)
        .set({ validUntil: carve.validUntil })
        .where(eq(availabilityTemplates.id, carve.id));
      if (carve.resume) {
        await tx.insert(availabilityTemplates).values({
          tenantId: actor.tenantId,
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

    for (const row of write.created) {
      await tx.insert(availabilityTemplates).values({
        tenantId: actor.tenantId,
        userId,
        locationId: row.locationId,
        weekday: row.weekday,
        startTime: row.startTime,
        endTime: row.endTime,
        validFrom: row.validFrom,
        validUntil: row.validUntil,
      });
    }

    // ADVISORY, NEVER DESTRUCTIVE. PL-11 makes availability advisory and Q-W5-4
    // forbids silently destroying scheduling data, so appointments already
    // booked inside the window are REPORTED for a human to move. Refusing the
    // save instead would leave reception unable to record that JP is at CB that
    // week, which is true whether or not the system likes it.
    const rangeStart = lisbonMidnightUtc(plan.startDate);
    const rangeEnd = lisbonMidnightUtc(addDays(plan.endDate, 1));
    const affectedRows = await tx
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

    await writeAudit(tx, actor, {
      action: "availability_template.alternating_weeks",
      entityType: "availability_template",
      entityId: userId,
    });

    return {
      created: write.created.length,
      carved: write.carved.length,
      affected: affectedRows.map((a) => ({
        id: a.id,
        patientName: a.patientName,
        startsAt: a.startsAt.toISOString(),
        endsAt: a.endsAt.toISOString(),
      })),
    };
  });
}
