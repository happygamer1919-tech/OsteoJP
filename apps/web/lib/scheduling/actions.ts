"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray, or } from "drizzle-orm";
import {
  assertCan,
  ForbiddenError,
  type Capability,
  type RequestContext,
} from "@osteojp/auth";
import { appointments, type DbTx } from "@osteojp/db";
import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { clientIp } from "./actor";
import { batchSchedule, type BatchScheduleInput, type BatchScheduleResult } from "./batch";
import { writeAppointmentStatusChangedEvent } from "./analytics";
import { writeAppointmentAudit } from "./audit";
import { buildClonedAppointment } from "./clone-core";
import { findConflicts, findConflictsForWindow } from "./conflict";
import { getTherapistAvailability, type DayAvailability } from "./day-availability";
import { isValidInterval } from "./overlap";
import { expandRecurrence, toRRule } from "./recurrence";
import { getTherapistServiceIds } from "./therapist-services";
import {
  enqueueRemindersAfterCommit,
  enqueueStatusNotificationsAfterCommit,
  type ReminderEnqueueTarget,
  type StatusNotificationTarget,
} from "./reminders";
import { lisbonDateTimeToUtc, lisbonParts } from "./time";
import type {
  ActionResult,
  AppointmentStatusValue,
  ConflictInfo,
  CreateAppointmentInput,
  RescheduleInput,
  SeriesOptions,
  SeriesScope,
  UpdateAppointmentPatch,
} from "./types";

const AGENDA_PATH = "/agenda";
const CONFLICT_CAP = 10; // cap aggregated conflict lists across a series

type Authorized = { actor: RequestContext };
type Denied = Extract<ActionResult<never>, { ok: false }>;

/** Resolve the acting user and assert the capability. Returns a Denied result on failure. */
async function authorize(
  capability: Capability,
): Promise<Authorized | Denied> {
  let actor: RequestContext;
  try {
    actor = await requireRequestContext();
  } catch {
    return { ok: false, error: "unauthenticated" };
  }
  try {
    assertCan(actor.role, capability);
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: "forbidden" };
    throw e;
  }
  return { actor };
}

function isDenied(a: Authorized | Denied): a is Denied {
  return "ok" in a;
}

/** Log a sanitized failure (no PII / payload) and return a generic error. */
function fail(action: string, e: unknown): Denied {
  console.error(`scheduling: ${action} failed`, e instanceof Error ? e.name : "unknown");
  return { ok: false, error: "error" };
}

function hhmmOf(d: Date): string {
  const p = lisbonParts(d);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

type SeriesMember = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  practitionerId: string;
  locationId: string;
  room: string | null;
  // Pre-mutation lifecycle status — the `from_status` a status-change event
  // records. Read inside the tx BEFORE the update is applied.
  status: AppointmentStatusValue;
};

/**
 * The appointment rows a scoped mutation applies to.
 *   one       → just the target.
 *   series    → the whole series (parent + all children).
 *   following → series members at/after the target's start.
 * A non-recurring appointment resolves to itself for every scope.
 */
async function resolveSeries(
  tx: DbTx,
  targetId: string,
  scope: SeriesScope,
): Promise<SeriesMember[] | null> {
  const [target] = await tx
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      practitionerId: appointments.practitionerId,
      locationId: appointments.locationId,
      room: appointments.room,
      status: appointments.status,
      recurrenceParentId: appointments.recurrenceParentId,
    })
    .from(appointments)
    .where(eq(appointments.id, targetId))
    .limit(1);
  if (!target) return null;

  const self: SeriesMember = {
    id: target.id,
    startsAt: target.startsAt,
    endsAt: target.endsAt,
    practitionerId: target.practitionerId,
    locationId: target.locationId,
    room: target.room,
    status: target.status,
  };
  if (scope === "one") return [self];

  const seriesId = target.recurrenceParentId ?? target.id;
  const members = await tx
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      practitionerId: appointments.practitionerId,
      locationId: appointments.locationId,
      room: appointments.room,
      status: appointments.status,
    })
    .from(appointments)
    .where(
      or(
        eq(appointments.id, seriesId),
        eq(appointments.recurrenceParentId, seriesId),
      ),
    );
  if (scope === "series") return members;
  return members.filter((m) => m.startsAt.getTime() >= target.startsAt.getTime());
}

/** Aggregate conflicts across a set of candidate windows (capped). */
async function collectConflicts(
  tx: DbTx,
  windows: { startsAt: Date; endsAt: Date }[],
  fixed: { practitionerId: string; locationId: string; room: string | null },
  excludeIds?: string[],
): Promise<ConflictInfo[]> {
  const conflicts: ConflictInfo[] = [];
  for (const w of windows) {
    const c = await findConflictsForWindow(tx, {
      practitionerId: fixed.practitionerId,
      locationId: fixed.locationId,
      room: fixed.room,
      startsAt: w.startsAt,
      endsAt: w.endsAt,
      excludeIds,
    });
    conflicts.push(...c);
    if (conflicts.length >= CONFLICT_CAP) break;
  }
  return conflicts.slice(0, CONFLICT_CAP);
}

/**
 * Read-only availability for one therapist on one Lisbon calendar day. Feeds
 * the new-appointment availability panel (SPEC-appointments §5) — same
 * getTherapistAvailability query the batch engine uses, single-day range.
 */
export async function getTherapistDayAvailability(
  input: { therapistId: string; date: string; locationId?: string | null },
): Promise<ActionResult<DayAvailability>> {
  const auth = await authorize("appointments:read");
  if (isDenied(auth)) return auth;
  const { actor } = auth;

  if (!input.therapistId || !input.date) {
    return { ok: false, error: "validation" };
  }

  try {
    const days = await getTherapistAvailability(actor, {
      therapistId: input.therapistId,
      from: input.date,
      to: input.date,
      locationId: input.locationId ?? null,
    });
    return { ok: true, data: days[0] ?? { date: input.date, working: [], booked: [], free: [] } };
  } catch (e) {
    return fail("availability", e);
  }
}

/**
 * Read-only service IDs a therapist is mapped to deliver (`therapist_services`,
 * migration 0023). Feeds the new-appointment service auto-select (SPEC-
 * appointments §6): the drawer filters its service Select to this list and
 * preselects when there is exactly one.
 */
export async function getTherapistServices(
  therapistId: string,
): Promise<ActionResult<string[]>> {
  const auth = await authorize("appointments:read");
  if (isDenied(auth)) return auth;
  const { actor } = auth;

  if (!therapistId) {
    return { ok: false, error: "validation" };
  }

  try {
    const serviceIds = await getTherapistServiceIds(actor, therapistId);
    return { ok: true, data: serviceIds };
  } catch (e) {
    return fail("therapist-services", e);
  }
}

export async function createAppointment(
  input: CreateAppointmentInput,
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("appointments:write");
  if (isDenied(auth)) return auth;
  const { actor } = auth;

  if (!input.patientId || !input.practitionerId || !input.locationId) {
    return { ok: false, error: "validation" };
  }
  const firstStart = new Date(input.startsAt);
  const firstEnd = new Date(input.endsAt);
  if (!isValidInterval(firstStart, firstEnd)) {
    return { ok: false, error: "validation" };
  }

  const recurring = !!input.recurrence && input.recurrence.count >= 2;
  const durationMin = (firstEnd.getTime() - firstStart.getTime()) / 60_000;
  const occ = recurring
    ? expandRecurrence(
        lisbonParts(firstStart).date,
        hhmmOf(firstStart),
        durationMin,
        input.recurrence!,
      )
    : [{ startsAt: firstStart, endsAt: firstEnd }];

  const common = {
    tenantId: actor.tenantId, // required by NOT NULL + RLS WITH CHECK
    patientId: input.patientId,
    practitionerId: input.practitionerId,
    locationId: input.locationId,
    serviceId: input.serviceId ?? null,
    room: input.room ?? null,
    status: input.status,
    notes: input.notes ?? null,
    createdBy: actor.userId,
  };

  const ip = await clientIp();
  // Captured inside the tx, enqueued AFTER commit (network out of the tx).
  let reminderTargets: ReminderEnqueueTarget[] = [];
  try {
    const result = await runScoped<ActionResult<{ id: string }>>(
      actor,
      async (tx) => {
        if (!input.allowConflict) {
          const conflicts = await collectConflicts(tx, occ, {
            practitionerId: input.practitionerId,
            locationId: input.locationId,
            room: input.room ?? null,
          });
          if (conflicts.length > 0) {
            return { ok: false, error: "conflict", conflicts };
          }
        }

        const [parent] = await tx
          .insert(appointments)
          .values({
            ...common,
            startsAt: occ[0].startsAt,
            endsAt: occ[0].endsAt,
            recurrenceRule: recurring ? toRRule(input.recurrence!) : null,
          })
          .returning({ id: appointments.id });

        const created: { id: string; startsAt: Date }[] = [
          { id: parent.id, startsAt: occ[0].startsAt },
        ];

        if (occ.length > 1) {
          const children = await tx
            .insert(appointments)
            .values(
              occ.slice(1).map((o) => ({
                ...common,
                startsAt: o.startsAt,
                endsAt: o.endsAt,
                recurrenceParentId: parent.id,
              })),
            )
            .returning({ id: appointments.id });
          children.forEach((c, i) =>
            created.push({ id: c.id, startsAt: occ[i + 1].startsAt }),
          );
        }

        for (let i = 0; i < created.length; i++) {
          await writeAppointmentAudit(tx, {
            tenantId: actor.tenantId,
            actorUserId: actor.userId,
            action: "appointment.create",
            appointmentId: created[i].id,
            metadata: {
              patientId: input.patientId,
              practitionerId: input.practitionerId,
              locationId: input.locationId,
              serviceId: input.serviceId ?? null,
              status: input.status,
              startsAt: created[i].startsAt.toISOString(),
              seriesId: recurring ? parent.id : null,
              occurrence: recurring ? i : null,
              count: recurring ? created.length : null,
            },
            ip,
          });
        }

        reminderTargets = created.map((c) => ({
          appointmentId: c.id,
          startsAt: c.startsAt,
        }));
        return { ok: true, data: { id: parent.id } };
      },
    );
    if (result.ok) {
      revalidatePath(AGENDA_PATH);
      // Stream E: schedule reminders for the new appointment(s). Best-effort,
      // post-commit; safe with REMINDERS_LIVE_SEND off (sandbox downstream).
      await enqueueRemindersAfterCommit(actor.tenantId, reminderTargets);
    }
    return result;
  } catch (e) {
    return fail("create", e);
  }
}

/**
 * Partial-success batch booking (ruling G, DECISIONS 2026-07-03). Books every
 * FREE slot in the expanded recurrence and reports each busy slot in `failures`
 * (with its reason and nearest free alternative) — it never refuses the whole
 * batch. The recorrente ("Marcação recorrente") drawer path routes here instead
 * of createAppointment's all-or-nothing recurring branch. Thin wrapper: auth +
 * validate, then delegate to the batch engine (no engine change here).
 */
export async function batchScheduleAppointments(
  input: BatchScheduleInput,
): Promise<ActionResult<BatchScheduleResult>> {
  const auth = await authorize("appointments:write");
  if (isDenied(auth)) return auth;
  const { actor } = auth;
  if (!input.patientId || !input.practitionerId || !input.locationId) {
    return { ok: false, error: "validation" };
  }
  try {
    const result = await batchSchedule(actor, input);
    revalidatePath(AGENDA_PATH);
    return { ok: true, data: result };
  } catch (e) {
    return fail("batchSchedule", e);
  }
}

/**
 * Schedule-again clone. Given an existing appointment's id and a new start time,
 * create ONE new standalone appointment that copies the source's clinical shape
 * (patient / practitioner / service / location) and duration, on a fresh
 * lifecycle. The caller supplies ONLY the new `startsAt`; `endsAt` is derived
 * from the source duration. Unblocks Max's "schedule-again" UI action.
 *
 * Scope (loop-decided): this action does NOT enforce availability — the UI
 * surfaces availability and the clinic may deliberately book over a busy slot,
 * so the clone is created unconditionally at the requested start. Availability
 * lives in the read-only availability query the UI consumes, not here.
 *
 * Cross-tenant safety: the source is read INSIDE the tenant-scoped tx, so RLS
 * confines the lookup to the caller's tenant. A cross-tenant (or missing) source
 * id resolves to zero rows and the clone is refused (`not_found`) — no row is
 * inserted. tenant_id and created_by come from the JWT context, never the source
 * or the payload.
 */
export async function cloneAppointment(
  sourceId: string,
  startsAt: string, // ISO UTC — the new start; endsAt is derived from the source
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("appointments:write");
  if (isDenied(auth)) return auth;
  const { actor } = auth;

  if (!sourceId) return { ok: false, error: "validation" };
  const newStart = new Date(startsAt);
  if (Number.isNaN(newStart.getTime())) return { ok: false, error: "validation" };

  const ip = await clientIp();
  // Captured inside the tx, enqueued AFTER commit (network out of the tx).
  let reminderTargets: ReminderEnqueueTarget[] = [];
  try {
    const result = await runScoped<ActionResult<{ id: string }>>(
      actor,
      async (tx) => {
        // RLS scopes this read to the caller's tenant: a cross-tenant / missing
        // source id returns zero rows → hard failure, nothing inserted.
        const [source] = await tx
          .select({
            patientId: appointments.patientId,
            practitionerId: appointments.practitionerId,
            locationId: appointments.locationId,
            serviceId: appointments.serviceId,
            startsAt: appointments.startsAt,
            endsAt: appointments.endsAt,
          })
          .from(appointments)
          .where(eq(appointments.id, sourceId))
          .limit(1);
        if (!source) return { ok: false, error: "not_found" };

        const values = buildClonedAppointment(source, newStart, {
          tenantId: actor.tenantId,
          userId: actor.userId,
        });
        // Defensive: the duration comes from an already-valid stored row, so this
        // only trips on a corrupt source or a NaN start slipping the guard above.
        if (!isValidInterval(values.startsAt, values.endsAt)) {
          return { ok: false, error: "validation" };
        }

        const [created] = await tx
          .insert(appointments)
          .values(values)
          .returning({ id: appointments.id });

        await writeAppointmentAudit(tx, {
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: "appointment.create",
          appointmentId: created.id,
          metadata: {
            patientId: values.patientId,
            practitionerId: values.practitionerId,
            locationId: values.locationId,
            serviceId: values.serviceId,
            status: values.status,
            startsAt: values.startsAt.toISOString(),
            clonedFrom: sourceId, // id only — no PII
          },
          ip,
        });

        reminderTargets = [{ appointmentId: created.id, startsAt: values.startsAt }];
        return { ok: true, data: { id: created.id } };
      },
    );
    if (result.ok) {
      revalidatePath(AGENDA_PATH);
      // A clone is a real new appointment: schedule its reminders like any other
      // creation. Best-effort, post-commit; safe with REMINDERS_LIVE_SEND off.
      await enqueueRemindersAfterCommit(actor.tenantId, reminderTargets);
    }
    return result;
  } catch (e) {
    return fail("clone", e);
  }
}

export async function updateAppointment(
  id: string,
  patch: UpdateAppointmentPatch,
  opts?: SeriesOptions,
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("appointments:write");
  if (isDenied(auth)) return auth;
  const { actor } = auth;

  if (!id) return { ok: false, error: "validation" };
  // Cancelling is a delete-capability action — route it through cancelAppointment.
  if (patch.status === "cancelled") return { ok: false, error: "validation" };

  const set: Partial<typeof appointments.$inferInsert> = {};
  if ("serviceId" in patch) set.serviceId = patch.serviceId ?? null;
  if ("room" in patch) set.room = patch.room ?? null;
  if ("status" in patch && patch.status) set.status = patch.status;
  if ("notes" in patch) set.notes = patch.notes ?? null;
  if (Object.keys(set).length === 0) return { ok: false, error: "validation" };

  const scope: SeriesScope = opts?.scope ?? "one";
  const newRoom = typeof set.room === "string" ? set.room.trim() : "";

  const ip = await clientIp();
  // Captured inside the tx, emitted AFTER commit (network out of the tx).
  let statusTargets: StatusNotificationTarget[] = [];
  try {
    const result = await runScoped<ActionResult<{ id: string }>>(
      actor,
      async (tx) => {
        const affected = await resolveSeries(tx, id, scope);
        if (!affected || affected.length === 0) {
          return { ok: false, error: "not_found" };
        }
        const ids = affected.map((a) => a.id);

        // A room change can create a room double-booking at each occurrence's
        // existing time. Therapist/time are untouched here, so only room
        // conflicts are relevant.
        if (!opts?.allowConflict && "room" in set && newRoom) {
          const conflicts: ConflictInfo[] = [];
          for (const a of affected) {
            const c = await findConflicts(tx, {
              practitionerId: a.practitionerId,
              locationId: a.locationId,
              room: newRoom,
              startsAt: a.startsAt,
              endsAt: a.endsAt,
              excludeIds: ids,
            });
            conflicts.push(...c.filter((x) => x.kind === "room"));
            if (conflicts.length >= CONFLICT_CAP) break;
          }
          if (conflicts.length > 0) {
            return {
              ok: false,
              error: "conflict",
              conflicts: conflicts.slice(0, CONFLICT_CAP),
            };
          }
        }

        await tx
          .update(appointments)
          .set(set)
          .where(inArray(appointments.id, ids)); // RLS scopes tenant

        for (const aid of ids) {
          await writeAppointmentAudit(tx, {
            tenantId: actor.tenantId,
            actorUserId: actor.userId,
            action: "appointment.update",
            appointmentId: aid,
            metadata: { changed: Object.keys(set), scope },
            ip,
          });
        }

        // Completion is the transition the soft gate cares about: emit the
        // status-change event carrying note_present, so closing a visit without
        // a per-visit note is recorded, never blocked (Q-ROW8-1). Same tx as the
        // status write — the event and the transition commit atomically. Other
        // transitions are intentionally not logged here (out of Q-ROW8-1 scope).
        if (patch.status === "completed") {
          const occurredAt = new Date();
          for (const a of affected) {
            await writeAppointmentStatusChangedEvent(tx, {
              tenantId: actor.tenantId,
              actorUserId: actor.userId,
              appointmentId: a.id,
              fromStatus: a.status,
              toStatus: "completed",
              therapistUserId: a.practitionerId,
              locationId: a.locationId,
              occurredAt,
            });
          }
        }

        if (patch.status === "completed" || patch.status === "no_show") {
          statusTargets = affected.map((a) => ({ appointmentId: a.id, endsAt: a.endsAt }));
        }

        return { ok: true, data: { id } };
      },
    );
    if (result.ok) {
      revalidatePath(AGENDA_PATH);
      if (
        (patch.status === "completed" || patch.status === "no_show") &&
        statusTargets.length > 0
      ) {
        await enqueueStatusNotificationsAfterCommit(actor.tenantId, statusTargets, patch.status);
      }
    }
    return result;
  } catch (e) {
    return fail("update", e);
  }
}

export async function rescheduleAppointment(
  id: string,
  input: RescheduleInput,
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("appointments:write");
  if (isDenied(auth)) return auth;
  const { actor } = auth;

  if (!id || !input.practitionerId || !input.locationId) {
    return { ok: false, error: "validation" };
  }
  const inStart = new Date(input.startsAt);
  const inEnd = new Date(input.endsAt);
  if (!isValidInterval(inStart, inEnd)) {
    return { ok: false, error: "validation" };
  }
  const scope: SeriesScope = input.scope ?? "one";

  const ip = await clientIp();
  // Captured inside the tx, enqueued AFTER commit (network out of the tx).
  let reminderTargets: ReminderEnqueueTarget[] = [];
  try {
    const result = await runScoped<ActionResult<{ id: string }>>(
      actor,
      async (tx) => {
        const affected = await resolveSeries(tx, id, scope);
        if (!affected || affected.length === 0) {
          return { ok: false, error: "not_found" };
        }
        const ids = affected.map((a) => a.id);

        // scope "one": move to the exact window from input (date may change).
        // scope following/series: keep each occurrence's date, apply the new
        // time-of-day + duration (preserves wall-clock across DST).
        const newHHMM = hhmmOf(inStart);
        const durationMin = (inEnd.getTime() - inStart.getTime()) / 60_000;
        const targets =
          scope === "one"
            ? [{ id, startsAt: inStart, endsAt: inEnd, room: affected[0].room }]
            : affected.map((a) => {
                const start = lisbonDateTimeToUtc(
                  lisbonParts(a.startsAt).date,
                  newHHMM,
                );
                return {
                  id: a.id,
                  startsAt: start,
                  endsAt: new Date(start.getTime() + durationMin * 60_000),
                  room: a.room,
                };
              });

        if (!input.allowConflict) {
          const conflicts: ConflictInfo[] = [];
          for (const t of targets) {
            const c = await findConflictsForWindow(tx, {
              practitionerId: input.practitionerId,
              locationId: input.locationId,
              room: t.room,
              startsAt: t.startsAt,
              endsAt: t.endsAt,
              excludeIds: ids,
            });
            conflicts.push(...c);
            if (conflicts.length >= CONFLICT_CAP) break;
          }
          if (conflicts.length > 0) {
            return {
              ok: false,
              error: "conflict",
              conflicts: conflicts.slice(0, CONFLICT_CAP),
            };
          }
        }

        for (const t of targets) {
          await tx
            .update(appointments)
            .set({
              startsAt: t.startsAt,
              endsAt: t.endsAt,
              practitionerId: input.practitionerId,
              locationId: input.locationId,
            })
            .where(eq(appointments.id, t.id)); // RLS scopes tenant
          await writeAppointmentAudit(tx, {
            tenantId: actor.tenantId,
            actorUserId: actor.userId,
            action: "appointment.reschedule",
            appointmentId: t.id,
            metadata: {
              practitionerId: input.practitionerId,
              locationId: input.locationId,
              startsAt: t.startsAt.toISOString(),
              endsAt: t.endsAt.toISOString(),
              scope,
            },
            ip,
          });
        }
        reminderTargets = targets.map((t) => ({
          appointmentId: t.id,
          startsAt: t.startsAt,
        }));
        return { ok: true, data: { id } };
      },
    );
    if (result.ok) {
      revalidatePath(AGENDA_PATH);
      // Stream E: re-enqueue at the NEW time. The new appointment/scheduled event
      // supersedes the prior sleeping run (cancelOn on appointment id), so the old
      // time never fires. Best-effort, post-commit.
      await enqueueRemindersAfterCommit(actor.tenantId, reminderTargets);
    }
    return result;
  } catch (e) {
    return fail("reschedule", e);
  }
}

export async function cancelAppointment(
  id: string,
  reason?: string,
  opts?: SeriesOptions,
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("appointments:delete");
  if (isDenied(auth)) return auth;
  const { actor } = auth;

  if (!id) return { ok: false, error: "validation" };
  const scope: SeriesScope = opts?.scope ?? "one";

  const ip = await clientIp();
  try {
    const result = await runScoped<ActionResult<{ id: string }>>(
      actor,
      async (tx) => {
        const affected = await resolveSeries(tx, id, scope);
        if (!affected || affected.length === 0) {
          return { ok: false, error: "not_found" };
        }
        const ids = affected.map((a) => a.id);

        // Never hard delete — cancel via the status field only.
        await tx
          .update(appointments)
          .set({ status: "cancelled" })
          .where(inArray(appointments.id, ids)); // RLS scopes tenant

        for (const aid of ids) {
          await writeAppointmentAudit(tx, {
            tenantId: actor.tenantId,
            actorUserId: actor.userId,
            action: "appointment.cancel",
            appointmentId: aid,
            metadata: { reason: reason?.trim() || null, scope },
            ip,
          });
        }
        return { ok: true, data: { id } };
      },
    );
    if (result.ok) revalidatePath(AGENDA_PATH);
    return result;
  } catch (e) {
    return fail("cancel", e);
  }
}
