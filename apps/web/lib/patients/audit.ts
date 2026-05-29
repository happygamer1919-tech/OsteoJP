// audit_log writer. ALWAYS called with the same `tx` as the mutation it records
// so the audit row and the change commit or roll back together (hard rule 6).
//
// PII SAFETY: metadata must contain only ids, counts, and changed-field NAMES —
// never field values, names, NIFs, contacts, or clinical content (hard rule 7).

import { auditLog } from "@osteojp/db";
import type { DbTx } from "@osteojp/db";
import type { RequestContext } from "../auth/context";

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
  await tx.insert(auditLog).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: entry.action,
    entityType: "patient",
    entityId: entry.entityId,
    metadata: entry.metadata ?? {},
  });
}
