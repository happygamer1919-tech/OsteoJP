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
import { writeAppointmentAudit } from "./audit";
import { findConflicts, findConflictsForWindow } from "./conflict";
import { isValidInterval } from "./overlap";
import { expandRecurrence, toRRule } from "./recurrence";
import { lisbonDateTimeToUtc, lisbonParts } from "./time";
import type {
  ActionResult,
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

        return { ok: true, data: { id: parent.id } };
      },
    );
    if (result.ok) revalidatePath(AGENDA_PATH);
    return result;
  } catch (e) {
    return fail("create", e);
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
        return { ok: true, data: { id } };
      },
    );
    if (result.ok) revalidatePath(AGENDA_PATH);
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
        return { ok: true, data: { id } };
      },
    );
    if (result.ok) revalidatePath(AGENDA_PATH);
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
