import "server-only";
import { and, eq } from "drizzle-orm";
import { analyticsEvents, appointmentNotes, type DbTx } from "@osteojp/db";

/**
 * Append the `appointment_status_changed` analytics event for a completion
 * transition. MUST be called inside the same tenant-scoped tx as the status
 * update it records, so the event and the status change commit or roll back
 * together (the log is the per-appointment status-transition history — 0025).
 *
 * `note_present` (DECISIONS.md 2026-07-01 soft completion gate / Q-ROW8-1):
 * completing a visit with NO per-visit note is allowed but RECORDED. The flag is
 * EXISTS(appointment_notes for this appointment), so the owner can see, per
 * appointment and per therapist, who closed a visit without a note. It is written
 * only for `to_status = "completed"`, the only transition where "was a note
 * attached?" is a meaningful question.
 *
 * Tenant scoping: the enclosing runScoped tx already confines every read to the
 * caller's tenant via RLS. The explicit `tenant_id` predicate is defense-in-depth
 * and lets appointment_notes' (tenant_id, appointment_id) indexes serve the EXISTS
 * lookup. tenant_id/actor come from the server-derived context, never a payload.
 */
export async function writeAppointmentStatusChangedEvent(
  tx: DbTx,
  args: {
    tenantId: string;
    // Server-derived actor (ctx.userId), never from client payload.
    actorUserId: string;
    appointmentId: string;
    fromStatus: string;
    toStatus: string;
    // KPI dimensions promoted to columns when known; null otherwise.
    therapistUserId: string | null;
    locationId: string | null;
    occurredAt: Date;
  },
): Promise<void> {
  let notePresent: boolean | undefined;
  if (args.toStatus === "completed") {
    const existing = await tx
      .select({ id: appointmentNotes.id })
      .from(appointmentNotes)
      .where(
        and(
          eq(appointmentNotes.tenantId, args.tenantId),
          eq(appointmentNotes.appointmentId, args.appointmentId),
        ),
      )
      .limit(1);
    notePresent = existing.length > 0;
  }

  await tx.insert(analyticsEvents).values({
    tenantId: args.tenantId,
    eventType: "appointment_status_changed",
    entityType: "appointment",
    entityId: args.appointmentId,
    therapistUserId: args.therapistUserId,
    locationId: args.locationId,
    actorUserId: args.actorUserId,
    payload: {
      appointment_id: args.appointmentId,
      from_status: args.fromStatus,
      to_status: args.toStatus,
      actor: args.actorUserId,
      ...(notePresent !== undefined ? { note_present: notePresent } : {}),
    },
    occurredAt: args.occurredAt,
  });
}
