"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import {
  assertCan,
  ForbiddenError,
  type Capability,
} from "@osteojp/auth";
import { appointments } from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { clientIp, requireActor, type Actor } from "./actor";
import { writeAppointmentAudit } from "./audit";
import { findTherapistConflicts } from "./conflict";
import { isValidInterval } from "./overlap";
import type {
  ActionResult,
  CreateAppointmentInput,
  RescheduleInput,
  UpdateAppointmentPatch,
} from "./types";

const AGENDA_PATH = "/agenda";

type Authorized = { actor: Actor };
type Denied = Extract<ActionResult<never>, { ok: false }>;

/** Resolve the acting user and assert the capability. Returns a Denied result on failure. */
async function authorize(
  capability: Capability,
): Promise<Authorized | Denied> {
  let actor: Actor;
  try {
    actor = await requireActor();
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

export async function createAppointment(
  input: CreateAppointmentInput,
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("appointments:write");
  if (isDenied(auth)) return auth;
  const { actor } = auth;

  if (!input.patientId || !input.practitionerId || !input.locationId) {
    return { ok: false, error: "validation" };
  }
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (!isValidInterval(startsAt, endsAt)) {
    return { ok: false, error: "validation" };
  }

  const ip = await clientIp();
  try {
    const result = await runScoped<ActionResult<{ id: string }>>(
      actor,
      async (tx) => {
        if (!input.allowConflict) {
          const conflicts = await findTherapistConflicts(tx, {
            practitionerId: input.practitionerId,
            startsAt,
            endsAt,
          });
          if (conflicts.length > 0) {
            return { ok: false, error: "conflict", conflicts };
          }
        }
        const [row] = await tx
          .insert(appointments)
          .values({
            tenantId: actor.tenantId, // required by NOT NULL + RLS WITH CHECK
            patientId: input.patientId,
            practitionerId: input.practitionerId,
            locationId: input.locationId,
            serviceId: input.serviceId ?? null,
            room: input.room ?? null,
            startsAt,
            endsAt,
            status: input.status,
            notes: input.notes ?? null,
            createdBy: actor.userId,
          })
          .returning({ id: appointments.id });

        await writeAppointmentAudit(tx, {
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: "appointment.create",
          appointmentId: row.id,
          metadata: {
            patientId: input.patientId,
            practitionerId: input.practitionerId,
            locationId: input.locationId,
            serviceId: input.serviceId ?? null,
            status: input.status,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
          },
          ip,
        });
        return { ok: true, data: { id: row.id } };
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

  const ip = await clientIp();
  try {
    const result = await runScoped<ActionResult<{ id: string }>>(
      actor,
      async (tx) => {
        const [row] = await tx
          .update(appointments)
          .set(set)
          .where(eq(appointments.id, id)) // RLS scopes tenant
          .returning({ id: appointments.id });
        if (!row) return { ok: false, error: "not_found" };

        await writeAppointmentAudit(tx, {
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: "appointment.update",
          appointmentId: row.id,
          metadata: { changed: Object.keys(set) },
          ip,
        });
        return { ok: true, data: { id: row.id } };
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
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (!isValidInterval(startsAt, endsAt)) {
    return { ok: false, error: "validation" };
  }

  const ip = await clientIp();
  try {
    const result = await runScoped<ActionResult<{ id: string }>>(
      actor,
      async (tx) => {
        if (!input.allowConflict) {
          const conflicts = await findTherapistConflicts(tx, {
            practitionerId: input.practitionerId,
            startsAt,
            endsAt,
            excludeId: id,
          });
          if (conflicts.length > 0) {
            return { ok: false, error: "conflict", conflicts };
          }
        }
        const [row] = await tx
          .update(appointments)
          .set({
            startsAt,
            endsAt,
            practitionerId: input.practitionerId,
            locationId: input.locationId,
          })
          .where(eq(appointments.id, id)) // RLS scopes tenant
          .returning({ id: appointments.id });
        if (!row) return { ok: false, error: "not_found" };

        await writeAppointmentAudit(tx, {
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: "appointment.reschedule",
          appointmentId: row.id,
          metadata: {
            practitionerId: input.practitionerId,
            locationId: input.locationId,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
          },
          ip,
        });
        return { ok: true, data: { id: row.id } };
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
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("appointments:delete");
  if (isDenied(auth)) return auth;
  const { actor } = auth;

  if (!id) return { ok: false, error: "validation" };

  const ip = await clientIp();
  try {
    const result = await runScoped<ActionResult<{ id: string }>>(
      actor,
      async (tx) => {
        // Never hard delete — cancel via the status field only.
        const [row] = await tx
          .update(appointments)
          .set({ status: "cancelled" })
          .where(eq(appointments.id, id)) // RLS scopes tenant
          .returning({ id: appointments.id });
        if (!row) return { ok: false, error: "not_found" };

        await writeAppointmentAudit(tx, {
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: "appointment.cancel",
          appointmentId: row.id,
          metadata: { reason: reason?.trim() || null },
          ip,
        });
        return { ok: true, data: { id: row.id } };
      },
    );
    if (result.ok) revalidatePath(AGENDA_PATH);
    return result;
  } catch (e) {
    return fail("cancel", e);
  }
}
