import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { auditLog, patientCareTeam, users, type DbTx } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import {
  CARE_TEAM_CLINIC_HELPER_CALL,
  careTeamClinicHelperPresent,
} from "@/lib/patients/care-team-reads-gate";
import { writeAudit } from "./audit";
import {
  CARE_TEAM_AUTO_ACTION,
  CARE_TEAM_ENTITY_TYPE,
  careTeamSource,
  type CareTeamSource,
} from "./care-team-core";
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
  /**
   * CARE-02c. "automatic" when a booking wrote the row, "manual" when reception
   * or the owner pressed Atribuir. Every row from before CARE-02c is manual.
   */
  source: CareTeamSource;
};

/**
 * The care-team rows among `rowIds` that a booking wrote.
 *
 * Read from audit_log under the caller's RLS (tenant-scoped SELECT, 0001). The
 * match is the audit row's entity_id against the care-team row's primary key,
 * so it is exact; care-team-core.ts explains why the discriminator is an audit
 * row rather than a column.
 */
async function automaticRowIds(tx: DbTx, rowIds: readonly string[]): Promise<Set<string>> {
  if (rowIds.length === 0) return new Set();
  const rows = await tx
    .select({ id: auditLog.entityId })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, CARE_TEAM_ENTITY_TYPE),
        eq(auditLog.action, CARE_TEAM_AUTO_ACTION),
        inArray(auditLog.entityId, [...rowIds]),
      ),
    );
  return new Set(rows.map((r) => r.id).filter((id): id is string => id !== null));
}

/** The live rows of one patient's team that the caller's RLS lets them read. */
async function readCareTeam(tx: DbTx, patientId: string): Promise<CareTeamMember[]> {
  const rows = await tx
    .select({
      id: patientCareTeam.id,
      userId: patientCareTeam.userId,
      fullName: users.fullName,
      assignedAt: patientCareTeam.assignedAt,
    })
    .from(patientCareTeam)
    .innerJoin(users, eq(users.id, patientCareTeam.userId))
    .where(and(eq(patientCareTeam.patientId, patientId), isNull(patientCareTeam.removedAt)))
    .orderBy(asc(patientCareTeam.assignedAt));
  const automatic = await automaticRowIds(
    tx,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({
    userId: r.userId,
    fullName: r.fullName,
    assignedAt: r.assignedAt,
    source: careTeamSource(r.id, automatic),
  }));
}

/** The patient's CURRENT care team, oldest assignment first, each with its source. */
export async function listCareTeam(
  actor: RequestContext,
  patientId: string,
): Promise<CareTeamMember[]> {
  assertCan(actor.role, "care_team:manage");
  if (!patientId) throw new AdminError("invalid");
  return runScoped(actor, (tx) => readCareTeam(tx, patientId));
}

/**
 * CARE-02b, WIRED BY CARE-02a (0098): the care team as a THERAPIST reads it, for
 * the read-only card on the ficha.
 *
 * `patient_care_team_select` (0098 v2) admits a therapist to every row of a
 * patient whose live team they are on AT ONE OF THEIR OWN CLINICS (the
 * clinic-limited helper, care-team-reads-gate.ts), and to their own rows
 * wherever they are, because the booking writer's ON CONFLICT ... RETURNING
 * needs to read the row it writes. So a therapist can read a list that names
 * them and is still not the team:
 *
 *   on the team, at their clinic       every live row, their own included
 *   on the team, NOT at their clinic   their own row and nothing else
 *   not on the team                    nothing of anybody else
 *   0098 not applied                   nothing
 *
 * RETURNS NULL UNLESS THE VIEWER READS THE WHOLE TEAM, and the page renders no
 * card for null. Two tests decide it, both in the database:
 *
 *   1. the patient is in the clinic-limited helper's set, the same term that
 *      admits the colleagues' rows under RLS (before 0098 there is no helper,
 *      nothing is read, and the answer is null, as it was); and
 *   2. the list names the viewer (round 1's rule, kept).
 *
 * Without (1), the second row of the table above would render a card listing
 * the viewer alone, which is a confident wrong statement about a patient whose
 * team has other members. The ficha reached through getPatient's read scope
 * does not normally put that viewer here, since the same helper decides it;
 * (1) holds even when the ficha was reached by the narrow arm (a patient they
 * created or treated elsewhere).
 *
 * THERAPIST ONLY. Owner and reception read the same list through
 * `listCareTeam`, with controls; admin is excluded from the table by both
 * migrations and is refused here before any read.
 */
export async function listCareTeamForTherapist(
  actor: RequestContext,
  patientId: string,
): Promise<CareTeamMember[] | null> {
  assertCan(actor.role, "patients:read");
  if (actor.role !== "therapist") throw new AdminError("forbidden");
  if (!patientId) throw new AdminError("invalid");
  if (!(await careTeamClinicHelperPresent(actor))) return null;
  return runScoped(actor, async (tx) => {
    const res = (await tx.execute(sql`
      select ${patientId}::uuid = ANY (coalesce((SELECT ${sql.raw(CARE_TEAM_CLINIC_HELPER_CALL)}), '{}'::uuid[])) as whole_team
    `)) as unknown;
    const rows = (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as Array<{
      whole_team?: boolean;
    }>;
    if (rows[0]?.whole_team !== true) return null;
    const team = await readCareTeam(tx, patientId);
    return team.some((m) => m.userId === actor.userId) ? team : null;
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
 *
 * CARE-02c: AN AUTOMATIC ENTRY IS NOT REMOVABLE. The panel offers Remover on
 * manual entries only; this is the same rule where it cannot be bypassed by a
 * stale tab or a hand-built form post. An automatic entry records that a booking
 * put the therapist there, and a removal would be undone by their next booking
 * anyway. Refused as `forbidden`, before any write.
 */
export async function removeTherapist(
  actor: RequestContext,
  patientId: string,
  userId: string,
): Promise<void> {
  assertCan(actor.role, "care_team:manage");
  if (!patientId || !userId) throw new AdminError("invalid");

  await runScoped(actor, async (tx) => {
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
    if (live.length === 0) return; // nothing live to remove: no audit
    const automatic = await automaticRowIds(
      tx,
      live.map((l) => l.id),
    );
    if (careTeamSource(live[0]!.id, automatic) === "automatic") {
      throw new AdminError("forbidden");
    }

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
