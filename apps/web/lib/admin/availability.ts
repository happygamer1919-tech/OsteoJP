import "server-only";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { availabilityTemplates, locations, staffLocations, users, type DbTx } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { validityIntersects, type CoverageRow } from "@/lib/scheduling/schedule-coverage";
import { isSingleDayRow } from "@/lib/scheduling/schedule-window";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";
import { timesOverlap } from "./availability-core";
import { assertTargetInScheduleScope, resolveScheduleScope, type ScheduleScope } from "./schedule-scope";

export type AvailabilityTemplateView = {
  id: string;
  userId: string;
  userName: string;
  locationId: string;
  locationName: string;
  weekday: number;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  /** SCHED-13. Carried so a consumer can tell a schedule IN FORCE from one that
   *  is dated. The weekly editor was structurally blind to this: the view did
   *  not have the columns, so it could not have filtered on them. */
  validFrom: string | null;
  validUntil: string | null;
};

export type AvailabilityTemplateInput = {
  userId: string;
  locationId: string;
  weekday: number;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
};

/** Normalize a DB `time` value ("HH:MM:SS") to "HH:MM" for display/forms. */
function hm(t: string): string {
  return t.slice(0, 5);
}

export async function listAvailabilityTemplates(
  actor: RequestContext,
): Promise<AvailabilityTemplateView[]> {
  assertCan(actor.role, "schedule:read");
  const scope = await resolveScheduleScope(actor);
  return runScoped(actor, async (tx) => {
    const conds = [eq(availabilityTemplates.isActive, true)];
    // PL-09 Phase 5: reception/admin see only their own location's therapists'
    // schedules; owner and unassigned staff are unrestricted.
    if (scope.kind === "locations") {
      conds.push(
        inArray(
          availabilityTemplates.userId,
          tx
            .select({ id: staffLocations.userId })
            .from(staffLocations)
            .where(inArray(staffLocations.locationId, scope.locationIds)),
        ),
      );
    }
    // ITEM 3: a therapist reads their OWN schedule only. Without this the
    // Horarios surface would list the whole clinic's working hours to them the
    // moment they were granted schedule:read.
    if (scope.kind === "self") {
      conds.push(eq(availabilityTemplates.userId, scope.userId));
    }
    const rows = await tx
      .select({
        id: availabilityTemplates.id,
        userId: availabilityTemplates.userId,
        userName: users.fullName,
        locationId: availabilityTemplates.locationId,
        locationName: locations.name,
        weekday: availabilityTemplates.weekday,
        startTime: availabilityTemplates.startTime,
        endTime: availabilityTemplates.endTime,
        validFrom: availabilityTemplates.validFrom,
        validUntil: availabilityTemplates.validUntil,
      })
      .from(availabilityTemplates)
      .innerJoin(users, eq(users.id, availabilityTemplates.userId))
      .innerJoin(locations, eq(locations.id, availabilityTemplates.locationId))
      .where(and(...conds))
      .orderBy(asc(users.fullName), asc(availabilityTemplates.weekday), asc(availabilityTemplates.startTime));
    return rows.map((r) => ({ ...r, startTime: hm(r.startTime), endTime: hm(r.endTime) }));
  });
}

function validate(input: AvailabilityTemplateInput): void {
  if (!input.userId || !input.locationId) throw new AdminError("invalid", "user and location required");
  if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6) {
    throw new AdminError("invalid", "weekday must be 0..6");
  }
  const re = /^\d{2}:\d{2}$/;
  if (!re.test(input.startTime) || !re.test(input.endTime)) {
    throw new AdminError("invalid", "times must be HH:MM");
  }
  // end strictly after start (mirrors the DB CHECK).
  if (input.endTime <= input.startTime) throw new AdminError("invalid", "end must be after start");
}

/** The validity window of the row being written. A create is always undated;
 *  an update never changes these columns, so it carries the row's own. */
export type TemplateValidity = { validFrom: string | null; validUntil: string | null };

/** A create writes no validity at all, so it is in force on every date. */
const ALWAYS: TemplateValidity = { validFrom: null, validUntil: null };

/**
 * Reject an overlapping ACTIVE template for the same therapist + weekday +
 * location (pre-ruled default, DECISIONS 2026-07-03). `excludeId` skips the row
 * being edited. Keeps availability data unambiguous even though the consumer
 * merges windows.
 *
 * ==========================================================================
 * IT READS THE VALIDITY WINDOW, AND UNTIL 2026-09-08 IT DID NOT. THAT WAS A P0.
 * ==========================================================================
 * TWO ROWS THAT CAN NEVER APPLY ON THE SAME DATE DO NOT OVERLAP, whatever their
 * clock times say. This compared TIMES ONLY, so it refused a pair that layer 2
 * writes ON PURPOSE and that satisfies the coverage invariant in full.
 *
 * HOW THE PAIR GETS THERE. Applying a date window CARVES layer 1 rather than
 * deleting it (lib/scheduling/schedule-window.ts): the weekly row is bounded to
 * the day BEFORE the window and an identical row resumes the day AFTER. Same
 * therapist, same weekday, same location, same times, DISJOINT validity. Legal
 * by construction - and from that moment this function refused every edit to
 * either of them, so the weekly editor was permanently unsavable for that
 * weekday. Reception at Castelo Branco hit it, could not book, and the sentence
 * she was shown was "Nao foi possivel guardar as alteracoes" and nothing else.
 *
 * `validityIntersects` IS IMPORTED RATHER THAN RESTATED. It is the same
 * predicate the coverage invariant uses (lib/scheduling/schedule-coverage.ts),
 * and that file's own header is about why a second opinion on this question is
 * how the two come to disagree. There is now one definition of "these two rows
 * can both apply on some day", and both callers read it.
 *
 * WHAT IT STILL REFUSES, WHICH IS THE POINT OF THE CONTROL IN THE SUITE: an
 * UNDATED weekly row written over a weekday that carries a dated row genuinely
 * double-covers that date, so it is refused - now with `dated_conflict`, which
 * exists so the screen can say WHICH tool to use instead of failing blank.
 */
async function assertNoOverlap(
  tx: DbTx,
  input: AvailabilityTemplateInput,
  excludeId: string | null,
  validity: TemplateValidity,
): Promise<void> {
  const siblings = await tx
    .select({
      id: availabilityTemplates.id,
      startTime: availabilityTemplates.startTime,
      endTime: availabilityTemplates.endTime,
      validFrom: availabilityTemplates.validFrom,
      validUntil: availabilityTemplates.validUntil,
    })
    .from(availabilityTemplates)
    .where(
      and(
        eq(availabilityTemplates.isActive, true),
        eq(availabilityTemplates.userId, input.userId),
        eq(availabilityTemplates.locationId, input.locationId),
        eq(availabilityTemplates.weekday, input.weekday),
        ...(excludeId ? [ne(availabilityTemplates.id, excludeId)] : []),
      ),
    );
  const candidate: CoverageRow = {
    locationId: input.locationId,
    weekday: input.weekday,
    startTime: input.startTime,
    endTime: input.endTime,
    validFrom: validity.validFrom,
    validUntil: validity.validUntil,
  };
  for (const s of siblings) {
    const sibling: CoverageRow = {
      id: s.id,
      locationId: input.locationId,
      weekday: input.weekday,
      startTime: hm(s.startTime),
      endTime: hm(s.endTime),
      validFrom: s.validFrom,
      validUntil: s.validUntil,
    };
    if (!validityIntersects(candidate, sibling)) continue;
    if (!timesOverlap(input.startTime, input.endTime, sibling.startTime, sibling.endTime)) continue;
    // A DATED row gets its own code because it has its own repair: the weekly
    // editor cannot express "the ordinary week, except those dates", so the
    // person has to go to Definir dia a dia. `invalid` sent them nowhere.
    if (isSingleDayRow(sibling)) {
      throw new AdminError(
        "dated_conflict",
        "a date-specific schedule already covers this weekday",
      );
    }
    throw new AdminError("invalid", "overlapping template for this therapist/weekday/location");
  }
}

/**
 * ==========================================================================
 * THE `…In(tx, …)` TRIO, ADDED 2026-09-08 WITH THE WEEK-ATOMICITY FIX.
 * ==========================================================================
 * Each public write below used to open its OWN `runScoped` transaction. That is
 * right for a single edit and WRONG for the weekly editor, which drives seven
 * weekdays through `reconcileWeek`: a refusal on Wednesday left Sunday, Monday
 * and Tuesday already COMMITTED while the screen said the save had failed. The
 * screen and the database disagreed, and reception read it as the form being
 * broken.
 *
 * So the body of each write is now a function that takes a caller's `tx`, and
 * the exported wrappers are what open a transaction. `saveWeekSchedule`
 * (./week-schedule.ts) opens ONE for the whole week and passes it in, so a
 * refusal on any weekday rolls the whole submit back. No caller of the public
 * functions changes behaviour.
 */
export async function createTemplateIn(
  tx: DbTx,
  actor: RequestContext,
  scope: ScheduleScope,
  input: AvailabilityTemplateInput,
): Promise<void> {
  validate(input);
  await assertTargetInScheduleScope(tx, input.userId, scope);
  await assertNoOverlap(tx, input, null, ALWAYS);
  const [row] = await tx
      .insert(availabilityTemplates)
      .values({
        tenantId: actor.tenantId, // NOT NULL + RLS WITH CHECK
        userId: input.userId,
        locationId: input.locationId,
        weekday: input.weekday,
        startTime: input.startTime,
        endTime: input.endTime,
      })
    .returning({ id: availabilityTemplates.id });
  await writeAudit(tx, actor, {
    action: "availability_template.create",
    entityType: "availability_template",
    entityId: row?.id ?? null,
  });
}

export async function createAvailabilityTemplate(
  actor: RequestContext,
  input: AvailabilityTemplateInput,
): Promise<void> {
  assertCan(actor.role, "schedule:manage");
  const scope = await resolveScheduleScope(actor);
  await runScoped(actor, (tx) => createTemplateIn(tx, actor, scope, input));
}

export async function updateTemplateIn(
  tx: DbTx,
  actor: RequestContext,
  scope: ScheduleScope,
  id: string,
  input: AvailabilityTemplateInput,
): Promise<void> {
  validate(input);
  // Both the template's CURRENT therapist and the NEW target must be in scope,
  // so a located actor can neither touch nor retarget an out-of-location row.
  // ITS OWN VALIDITY IS READ HERE and handed to the overlap check: an update
  // never writes valid_from / valid_until, so the row keeps the window it has,
  // and comparing it against anything else would answer a question nobody asked.
  const [existing] = await tx
    .select({
      userId: availabilityTemplates.userId,
      validFrom: availabilityTemplates.validFrom,
      validUntil: availabilityTemplates.validUntil,
    })
    .from(availabilityTemplates)
    .where(and(eq(availabilityTemplates.id, id), eq(availabilityTemplates.isActive, true)))
    .limit(1);
  if (!existing) throw new AdminError("not_found");
  await assertTargetInScheduleScope(tx, existing.userId, scope);
  await assertTargetInScheduleScope(tx, input.userId, scope);
  await assertNoOverlap(tx, input, id, {
    validFrom: existing.validFrom,
    validUntil: existing.validUntil,
  });
  const rows = await tx
      .update(availabilityTemplates)
      .set({
        userId: input.userId,
        locationId: input.locationId,
        weekday: input.weekday,
        startTime: input.startTime,
        endTime: input.endTime,
      })
      .where(and(eq(availabilityTemplates.id, id), eq(availabilityTemplates.isActive, true)))
    .returning({ id: availabilityTemplates.id });
  if (!rows[0]) throw new AdminError("not_found");
  await writeAudit(tx, actor, {
    action: "availability_template.update",
    entityType: "availability_template",
    entityId: id,
  });
}

export async function updateAvailabilityTemplate(
  actor: RequestContext,
  id: string,
  input: AvailabilityTemplateInput,
): Promise<void> {
  assertCan(actor.role, "schedule:manage");
  const scope = await resolveScheduleScope(actor);
  await runScoped(actor, (tx) => updateTemplateIn(tx, actor, scope, id, input));
}

/** Soft archive (is_active=false) — the consumer only reads active rows.
 *  Never hard-delete: a template may have shaped historical availability. */
export async function archiveTemplateIn(
  tx: DbTx,
  actor: RequestContext,
  scope: ScheduleScope,
  id: string,
): Promise<void> {
  const [existing] = await tx
    .select({ userId: availabilityTemplates.userId })
    .from(availabilityTemplates)
    .where(and(eq(availabilityTemplates.id, id), eq(availabilityTemplates.isActive, true)))
    .limit(1);
  if (!existing) throw new AdminError("not_found");
  await assertTargetInScheduleScope(tx, existing.userId, scope);
  const rows = await tx
    .update(availabilityTemplates)
    .set({ isActive: false })
    .where(and(eq(availabilityTemplates.id, id), eq(availabilityTemplates.isActive, true)))
    .returning({ id: availabilityTemplates.id });
  if (!rows[0]) throw new AdminError("not_found");
  await writeAudit(tx, actor, {
    action: "availability_template.archive",
    entityType: "availability_template",
    entityId: id,
  });
}

export async function archiveAvailabilityTemplate(
  actor: RequestContext,
  id: string,
): Promise<void> {
  assertCan(actor.role, "schedule:manage");
  const scope = await resolveScheduleScope(actor);
  await runScoped(actor, (tx) => archiveTemplateIn(tx, actor, scope, id));
}
