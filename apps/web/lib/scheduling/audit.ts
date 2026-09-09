import "server-only";
import { auditLog, type DbTx } from "@osteojp/db";
import { assertPiiFreeAuditMetadata } from "@/lib/audit/metadata-contract";

export type AppointmentAuditAction =
  | "appointment.create"
  | "appointment.update"
  | "appointment.reschedule"
  | "appointment.cancel"
  | "appointment.hard_delete";

/**
 * THE METADATA CONTRACT IS ENFORCED, AND IT NOW LIVES IN ONE PLACE.
 *
 * The guard moved to `lib/audit/metadata-contract.ts` so the other three audit
 * helpers enforce the SAME rule rather than restating it in a comment. Read that
 * file's header before adding a metadata key: it carries the reasoning, and the
 * one documented exception (`reminders/messaging-check.ts`, which bypasses every
 * helper and writes the provider's own error text on purpose).
 */
/**
 * Append an audit row for an appointment mutation. MUST be called inside the
 * same tenant-scoped tx as the mutation it records, so the two commit or roll
 * back together (hard requirement: audit on every clinical/permission-sensitive
 * mutation).
 *
 * `metadata` carries IDs, status and ISO timestamps only — never patient PII
 * (names, contacts, clinical notes). ENFORCED above; read that comment before
 * adding a key.
 */
export async function writeAppointmentAudit(
  tx: DbTx,
  args: {
    tenantId: string;
    // Non-null: every appointment mutation records its actor (ctx.userId).
    actorUserId: string;
    action: AppointmentAuditAction;
    appointmentId: string;
    metadata: Record<string, unknown>;
    ip: string | null;
  },
): Promise<void> {
  assertPiiFreeAuditMetadata(args.metadata, "scheduling/writeAppointmentAudit");
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
