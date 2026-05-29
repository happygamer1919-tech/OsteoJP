import "server-only";
import { auditLog, type DbTx } from "@osteojp/db";

export type AppointmentAuditAction =
  | "appointment.create"
  | "appointment.update"
  | "appointment.reschedule"
  | "appointment.cancel";

/**
 * Append an audit row for an appointment mutation. MUST be called inside the
 * same tenant-scoped tx as the mutation it records, so the two commit or roll
 * back together (hard requirement: audit on every clinical/permission-sensitive
 * mutation).
 *
 * `metadata` carries IDs, status and ISO timestamps only — never patient PII
 * (names, contacts, clinical notes).
 */
export async function writeAppointmentAudit(
  tx: DbTx,
  args: {
    tenantId: string;
    actorUserId: string | null;
    action: AppointmentAuditAction;
    appointmentId: string;
    metadata: Record<string, unknown>;
    ip: string | null;
  },
): Promise<void> {
  await tx.insert(auditLog).values({
    tenantId: args.tenantId,
    actorUserId: args.actorUserId,
    action: args.action,
    entityType: "appointment",
    entityId: args.appointmentId,
    metadata: args.metadata,
    ip: args.ip,
  });
}
