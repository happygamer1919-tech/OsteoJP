import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { patientCareTeam, users } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";

/**
 * CARE-01 — the therapists reception has assigned to a patient.
 *
 * Ruling Q-CARE-1 (c), owner, 2026-09-16: a therapist reads a patient's whole
 * appointment history when reception has assigned them, OR when they have any
 * appointment with that patient. This module is the FIRST arm: the second needs
 * no data at all and is decided in the database by an existing helper.
 *
 * ==========================================================================
 * RECEPTION AND OWNER, AND THE THERAPIST IS THE POINT OF THE GATE
 * ==========================================================================
 * `care_team:manage` is held by reception and owner only. A therapist who could
 * assign themselves would be granting themselves the history, which is exactly
 * the decision reception is in the loop to make. The capability check here is
 * the primary enforcement; the table's RLS policies refuse the same write as
 * defence in depth, so neither layer is load-bearing alone.
 *
 * NOTE THE DEVIATION FROM THE SPEC, RECORDED RATHER THAN SILENT:
 * docs/design/SPEC-care-team.md proposes reception, admin AND owner. The
 * dispatch that ruled the feature names reception and owner, and the dispatch
 * wins. Admin is denied, and permission-matrix.test.ts pins that.
 *
 * ==========================================================================
 * REMOVAL IS AN UPDATE, NEVER A DELETE
 * ==========================================================================
 * `removed_at` is the revocation: the access helper filters on it. Keeping the
 * row keeps "who was on this patient's team in March" answerable, which is a
 * question an audit asks and a deleted row cannot answer.
 */

export type CareTeamMember = {
  userId: string;
  fullName: string;
  assignedAt: Date;
};

/** The patient's CURRENT care team, oldest assignment first. */
export async function listCareTeam(
  actor: RequestContext,
  patientId: string,
): Promise<CareTeamMember[]> {
  assertCan(actor.role, "care_team:manage");
  if (!patientId) throw new AdminError("invalid");
  return runScoped(actor, async (tx) => {
    const rows = await tx
      .select({
        userId: patientCareTeam.userId,
        fullName: users.fullName,
        assignedAt: patientCareTeam.assignedAt,
      })
      .from(patientCareTeam)
      .innerJoin(users, eq(users.id, patientCareTeam.userId))
      .where(
        and(eq(patientCareTeam.patientId, patientId), isNull(patientCareTeam.removedAt)),
      )
      .orderBy(asc(patientCareTeam.assignedAt));
    return rows.map((r) => ({
      userId: r.userId,
      fullName: r.fullName,
      assignedAt: r.assignedAt,
    }));
  });
}

/**
 * Assign a therapist. Idempotent: assigning somebody already on the team is a
 * no-op and writes NO audit row, the same rule `setStaffLocations` follows — an
 * audit trail that records non-events is one nobody reads.
 */
export async function assignTherapist(
  actor: RequestContext,
  patientId: string,
  userId: string,
): Promise<void> {
  assertCan(actor.role, "care_team:manage");
  if (!patientId || !userId) throw new AdminError("invalid");

  await runScoped(actor, async (tx) => {
    // The therapist must be a real user of this tenant. RLS scopes the read, so
    // a forged or cross-tenant id simply does not resolve and is rejected here
    // rather than reaching the insert.
    const found = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (found.length === 0) throw new AdminError("invalid");

    const live = await tx
      .select({ id: patientCareTeam.id })
      .from(patientCareTeam)
      .where(
        and(
          eq(patientCareTeam.patientId, patientId),
          eq(patientCareTeam.userId, userId),
          isNull(patientCareTeam.removedAt),
        ),
      )
      .limit(1);
    if (live.length > 0) return; // already on the team: no write, no audit

    await tx.insert(patientCareTeam).values({
      tenantId: actor.tenantId,
      patientId,
      userId,
      assignedBy: actor.userId,
    });

    // PII-free: ids only. `assertPiiFreeAuditMetadata` refuses whitespace and
    // anything over 64 characters, which is what keeps a therapist's NAME out.
    await writeAudit(tx, actor, {
      action: "care_team.assign",
      entityType: "patient_care_team",
      entityId: patientId,
      metadata: { therapistId: userId },
    });
  });
}

/**
 * Remove a therapist. A soft remove, and also idempotent: removing somebody who
 * is not on the team writes nothing.
 *
 * WHAT IT DOES NOT NECESSARILY REVOKE: a therapist who has an appointment with
 * this patient keeps the history through the ruling's second arm. Removal ends
 * the ASSIGNMENT, not the treatment relationship, and the RLS test pins exactly
 * that distinction.
 */
export async function removeTherapist(
  actor: RequestContext,
  patientId: string,
  userId: string,
): Promise<void> {
  assertCan(actor.role, "care_team:manage");
  if (!patientId || !userId) throw new AdminError("invalid");

  await runScoped(actor, async (tx) => {
    const updated = await tx
      .update(patientCareTeam)
      .set({ removedAt: new Date() })
      .where(
        and(
          eq(patientCareTeam.patientId, patientId),
          eq(patientCareTeam.userId, userId),
          isNull(patientCareTeam.removedAt),
        ),
      )
      .returning({ id: patientCareTeam.id });
    if (updated.length === 0) return; // nothing live to remove: no audit

    await writeAudit(tx, actor, {
      action: "care_team.remove",
      entityType: "patient_care_team",
      entityId: patientId,
      metadata: { therapistId: userId },
    });
  });
}
