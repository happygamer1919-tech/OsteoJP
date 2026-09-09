import "server-only";
import { auditLog, type DbTx } from "@osteojp/db";
import type { RequestContext } from "@/lib/auth/context";
import { assertPiiFreeAuditMetadata } from "@/lib/audit/metadata-contract";

/**
 * Append one audit_log row. MUST be called with the same `tx` as the mutation
 * it records, so the mutation and its audit entry commit or roll back together
 * (CLAUDE.md rule 6 — audit on every mutation, no exceptions).
 *
 * `metadata` is PII-free by contract: store changed field NAMES, role slugs and
 * ids — never raw values like email or NIF (CLAUDE.md rule 7). THE CONTRACT IS
 * ENFORCED, not merely stated: see lib/audit/metadata-contract.ts. It was a
 * comment here until 2026-09-09, and a comment is what let the same rule be
 * broken for months in the scheduling helper next door. This is the helper a
 * pacote switch will call, and PACK-06 rules that reception types a REASON.
 * tenant_id comes
 * from the actor and is validated by the audit_log RLS WITH CHECK against the
 * JWT claim, so a mismatched tenant can never be written.
 */
export async function writeAudit(
  tx: DbTx,
  actor: RequestContext,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  assertPiiFreeAuditMetadata(entry.metadata ?? {}, "admin/writeAudit");
  await tx.insert(auditLog).values({
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? {},
  });
}
