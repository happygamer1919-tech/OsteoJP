import "server-only";
import { headers } from "next/headers";
import { auditLog, type DbTx } from "@osteojp/db";

export type ClinicalAuditAction =
  | "clinical_record.create"
  | "clinical_record.update"
  | "clinical_record.version"
  | "clinical_record.sign"
  | "clinical_record.review_claim" // therapist claimed a review-queue item (→ in_review)
  | "clinical_record.review_finalize" // therapist finalized a review item (→ approved + locked/signed)
  | "clinical_episode.create"
  | "attachment.create"
  | "patient_document.create"; // staff uploaded an administrative doc to a patient

/**
 * Append an audit row for a clinical mutation. MUST be called inside the same
 * tenant-scoped tx as the mutation it records, so the two commit or roll back
 * together (CLAUDE.md rule 6 — audit on every clinical record mutation).
 *
 * actor_user_id is non-null on every clinical mutation (it is ctx.userId).
 * `metadata` carries ids / status / ISO timestamps only — never clinical
 * content or patient PII (CLAUDE.md rule 7).
 */
export async function writeClinicalAudit(
  tx: DbTx,
  args: {
    tenantId: string;
    actorUserId: string;
    action: ClinicalAuditAction;
    entityType: "clinical_record" | "clinical_episode" | "attachment";
    // "attachment" is also the entity type for a patient administrative document
    // (both are rows in the `attachments` table; the audit action distinguishes them).
    entityId: string;
    metadata: Record<string, unknown>;
    ip: string | null;
  },
): Promise<void> {
  await tx.insert(auditLog).values({
    tenantId: args.tenantId,
    actorUserId: args.actorUserId,
    action: args.action,
    entityType: args.entityType,
    entityId: args.entityId,
    metadata: args.metadata,
    ip: args.ip,
  });
}

/** Best-effort client IP for the audit row. Never throws. */
export async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    const ip = fwd?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "";
    return ip ? ip.slice(0, 45) : null;
  } catch {
    return null;
  }
}
