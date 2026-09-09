// audit_log writer. ALWAYS called with the same `tx` as the mutation it records
// so the audit row and the change commit or roll back together (hard rule 6).
//
// PII SAFETY: metadata must contain only ids, counts, and changed-field NAMES —
// never field values, names, NIFs, contacts, or clinical content (hard rule 7).
// ENFORCED by lib/audit/metadata-contract.ts, not merely stated here: the same
// sentence sat above the scheduling helper while it wrote clinical notes into
// the log for months.

import { auditLog } from "@osteojp/db";
import type { DbTx } from "@osteojp/db";
import type { RequestContext } from "../auth/context";
import { assertPiiFreeAuditMetadata } from "@/lib/audit/metadata-contract";

export type PatientAuditEntry = {
  action: `patient.${string}`;
  entityId: string;
  metadata?: Record<string, unknown>;
};

export async function writeAudit(
  tx: DbTx,
  ctx: RequestContext,
  entry: PatientAuditEntry,
): Promise<void> {
  assertPiiFreeAuditMetadata(entry.metadata ?? {}, "patients/writeAudit");
  await tx.insert(auditLog).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: entry.action,
    entityType: "patient",
    entityId: entry.entityId,
    metadata: entry.metadata ?? {},
  });
}
