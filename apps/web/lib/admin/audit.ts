import "server-only";
import { auditLog, type DbTx } from "@osteojp/db";
import type { Actor } from "@/lib/auth/context";

/**
 * Append one audit_log row. MUST be called with the same `tx` as the mutation
 * it records, so the mutation and its audit entry commit or roll back together
 * (CLAUDE.md rule 6 — audit on every mutation, no exceptions).
 *
 * `metadata` is PII-free by contract: store changed field NAMES, role slugs and
 * ids — never raw values like email or NIF (CLAUDE.md rule 7). tenant_id comes
 * from the actor and is validated by the audit_log RLS WITH CHECK against the
 * JWT claim, so a mismatched tenant can never be written.
 */
export async function writeAudit(
  tx: DbTx,
  actor: Actor,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(auditLog).values({
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? {},
  });
}
