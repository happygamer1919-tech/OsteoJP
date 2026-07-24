"use server";

// Server actions for patient mutations. Every action:
//   1. requireRequestContext()  — verified caller
//   2. assertCan(ctx.role, ...) — app-layer permission gate (RLS is defense-in-depth)
//   3. runScoped(ctx, tx => ...) — RLS-enforced transaction
//   4. writeAudit(tx, ...)       — audit row in the SAME tx (hard rule 6)
//
// Soft delete (deleted_at) is the DEFAULT delete path. Hard delete exists only
// as a password-gated escalation (W5-08, hardDeletePatient below): admin-only,
// server-verified scrypt password gate, and REFUSED whenever clinical records
// (or any other domain rows) still reference the patient.

import { revalidatePath } from "next/cache";
import { and, count, eq, isNotNull, isNull, max, or, sql } from "drizzle-orm";
import { assertCan, can } from "@osteojp/auth";
import {
  analyticsEvents,
  appointmentNotes,
  appointments,
  attachments,
  clinicalEpisodes,
  clinicalRecords,
  invoices,
  patientFormSubmissions,
  patientLocations,
  patients,
  patientNoteRevisions,
} from "@osteojp/db";
import { AdminError, isAdminError } from "@/lib/admin/errors";
import { verifyDeletePassword } from "@/lib/admin/appointment-delete-password";
import { requireRequestContext, runScoped } from "../auth/context";
import { writeAudit } from "./audit";
import {
  InvalidMergeError,
  PatientNotFoundError,
} from "./errors";
import {
  parseCreatePatient,
  parseMergeInput,
  parseUpdatePatient,
  type CreatePatientInput,
  type MergePatientsInput,
  type UpdatePatientInput,
} from "./validation";
import { searchPatients } from "./queries";
import type { Patient } from "./types";

function revalidatePatient(id: string): void {
  revalidatePath("/patients");
  revalidatePath(`/patients/${id}`);
}

export async function createPatient(raw: CreatePatientInput): Promise<Patient> {
  const ctx = await requireRequestContext();
  assertCan(ctx.role, "patients:write");
  const input = parseCreatePatient(raw);

  const patient = await runScoped(ctx, async (tx) => {
    // Per-tenant sequential patient number (JP ruling, DECISIONS 2026-07-02).
    // Serialize concurrent inserts for this tenant with the same transaction-
    // scoped advisory lock the 0029 trigger uses, then assign MAX+1. Setting it
    // explicitly here makes the trigger pass it through untouched; the trigger
    // stays the safety net for the other insert paths (import, seeds, tests).
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('patients_patient_number'), hashtext(${ctx.tenantId}::text))`,
    );
    const [agg] = await tx
      .select({ maxNumber: max(patients.patientNumber) })
      .from(patients)
      .where(eq(patients.tenantId, ctx.tenantId));
    const patientNumber = Number(agg?.maxNumber ?? 0) + 1;

    // tenant_id is set explicitly because it is NOT NULL; RLS WITH CHECK then
    // verifies it equals the caller's tenant. This is the required INSERT value,
    // not a hand-rolled tenant filter.
    const [row] = await tx
      .insert(patients)
      .values({
        tenantId: ctx.tenantId,
        patientNumber,
        createdBy: ctx.userId,
        fullName: input.fullName,
        dateOfBirth: input.dateOfBirth,
        sex: input.sex,
        nif: input.nif,
        email: input.email,
        phone: input.phone,
        address: input.address,
        postalCode: input.postalCode,
        city: input.city,
        profession: input.profession,
        referralSource: input.referralSource,
        contraindicationEpilepsy: input.contraindicationEpilepsy,
        contraindicationPregnancy: input.contraindicationPregnancy,
        contraindicationPacemaker: input.contraindicationPacemaker,
        contraindicationOther: input.contraindicationOther,
        contraindicationOtherNote: input.contraindicationOtherNote,
      })
      .returning();
    if (!row) throw new Error("Patient insert returned no row");
    await writeAudit(tx, ctx, { action: "patient.create", entityId: row.id });
    return row;
  });

  revalidatePatient(patient.id);
  return patient;
}

export async function updatePatient(
  id: string,
  raw: UpdatePatientInput,
): Promise<Patient> {
  const ctx = await requireRequestContext();
  assertCan(ctx.role, "patients:write");
  const input = parseUpdatePatient(raw);

  // Only set columns the caller actually provided; an omitted key is untouched,
  // an explicit empty value clears the column (→ null) via the zod transforms.
  const patch: Partial<typeof patients.$inferInsert> = {
    ...(input.fullName !== undefined && { fullName: input.fullName }),
    ...(input.dateOfBirth !== undefined && { dateOfBirth: input.dateOfBirth }),
    ...(input.sex !== undefined && { sex: input.sex }),
    ...(input.nif !== undefined && { nif: input.nif }),
    ...(input.email !== undefined && { email: input.email }),
    ...(input.phone !== undefined && { phone: input.phone }),
    ...(input.address !== undefined && { address: input.address }),
    ...(input.postalCode !== undefined && { postalCode: input.postalCode }),
    ...(input.city !== undefined && { city: input.city }),
    ...(input.profession !== undefined && { profession: input.profession }),
    ...(input.referralSource !== undefined && { referralSource: input.referralSource }),
    ...(input.contraindicationEpilepsy !== undefined && {
      contraindicationEpilepsy: input.contraindicationEpilepsy,
    }),
    ...(input.contraindicationPregnancy !== undefined && {
      contraindicationPregnancy: input.contraindicationPregnancy,
    }),
    ...(input.contraindicationPacemaker !== undefined && {
      contraindicationPacemaker: input.contraindicationPacemaker,
    }),
    ...(input.contraindicationOther !== undefined && {
      contraindicationOther: input.contraindicationOther,
    }),
    ...(input.contraindicationOtherNote !== undefined && {
      contraindicationOtherNote: input.contraindicationOtherNote,
    }),
  };

  const patient = await runScoped(ctx, async (tx) => {
    const [row] = await tx
      .update(patients)
      .set(patch)
      .where(and(eq(patients.id, id), isNull(patients.deletedAt)))
      .returning();
    if (!row) throw new PatientNotFoundError();
    await writeAudit(tx, ctx, {
      action: "patient.update",
      entityId: row.id,
      // field NAMES only — never values (PII).
      metadata: { fields: Object.keys(patch) },
    });
    return row;
  });

  revalidatePatient(patient.id);
  return patient;
}

export async function softDeletePatient(id: string): Promise<Patient> {
  const ctx = await requireRequestContext();
  assertCan(ctx.role, "patients:delete");

  const patient = await runScoped(ctx, async (tx) => {
    const [row] = await tx
      .update(patients)
      .set({ deletedAt: new Date() })
      .where(and(eq(patients.id, id), isNull(patients.deletedAt)))
      .returning();
    if (!row) throw new PatientNotFoundError(); // missing or already deleted
    await writeAudit(tx, ctx, { action: "patient.soft_delete", entityId: row.id });
    return row;
  });

  revalidatePatient(patient.id);
  return patient;
}

export async function restorePatient(id: string): Promise<Patient> {
  const ctx = await requireRequestContext();
  assertCan(ctx.role, "patients:delete");

  const patient = await runScoped(ctx, async (tx) => {
    // A merged-away loser is not independently restorable — restoring it would
    // duplicate rows already repointed to the survivor. Require merged_into_id null.
    const [row] = await tx
      .update(patients)
      .set({ deletedAt: null })
      .where(
        and(
          eq(patients.id, id),
          isNotNull(patients.deletedAt),
          isNull(patients.mergedIntoId),
        ),
      )
      .returning();
    if (!row) throw new PatientNotFoundError(); // missing, not deleted, or merged
    await writeAudit(tx, ctx, { action: "patient.restore", entityId: row.id });
    return row;
  });

  revalidatePatient(patient.id);
  return patient;
}

export type HardDeletePatientError =
  | "forbidden" // caller lacks settings:manage (admin/owner tier)
  | "validation" // missing/blank input
  | "password" // wrong delete password (server-verified scrypt gate)
  | "has_clinical_records" // clinical records reference the patient — permanently non-hard-deletable
  | "has_references" // other domain rows (appointments/notes/invoices/…) reference the patient
  | "not_found" // missing, already hard-deleted, or cross-tenant (RLS = 0 rows)
  | "error";

export type HardDeletePatientResult =
  | { ok: true; id: string }
  | { ok: false; error: HardDeletePatientError };

/**
 * Hard-delete a patient behind the tenant delete-password gate (W5-08).
 * Replicates the W3-06 scrypt gate (verifyDeletePassword → tenants.settings
 * .secrets, shared "appointmentDeletePasswordHash" key) and the
 * hardDeleteAppointment structure: admin-only (settings:manage), server-side
 * password verification, refuse guards, child-first RETURNING deletes, and a
 * PII-free audit row in the SAME tx (rule 6).
 *
 * Refuse guards (server-enforced; the disabled UI control is only an affordance):
 *  - has_clinical_records: ANY clinical_records row with this patient_id. The
 *    locked/signed immutability trigger (rule 4) means finalized records can
 *    never be removed, so a records-linked patient is PERMANENTLY
 *    non-hard-deletable. The trigger and the append-only audit log are never
 *    touched or bypassed here.
 *  - has_references: any other domain row still referencing the patient
 *    (episodes, appointments incl. secondary, visit notes, note revisions,
 *    invoices, attachments, form submissions, analytics events, merge losers).
 *    Note revisions / visit notes / analytics are append-only by RLS policy
 *    (0025/0026/0030) and invoices are fiscally sensitive, so these can never
 *    be cascaded — only a reference-free patient (e.g. created by mistake) is
 *    hard-deletable. Everything else stays on the soft-delete path.
 *
 * The only deletable child is the patient_locations junction (child-first,
 * RETURNING), then the patients row itself (RETURNING). Idempotent: a second
 * call (or a cross-tenant id) sees 0 rows and returns not_found.
 */
export async function hardDeletePatient(
  id: string,
  password: string,
): Promise<HardDeletePatientResult> {
  const ctx = await requireRequestContext();
  // Tenant-settings tier, like appointment/staff hard delete — NOT patients:delete.
  if (!can(ctx.role, "settings:manage")) return { ok: false, error: "forbidden" };
  if (!id || !password) return { ok: false, error: "validation" };

  // Password gate — server-side, scrypt-hashed tenant secret. Never client-checked.
  if (!(await verifyDeletePassword(ctx, password))) {
    return { ok: false, error: "password" };
  }

  try {
    const deletedId = await runScoped(ctx, async (tx) => {
      // Existence snapshot. RLS scopes the tenant → cross-tenant/missing = 0 rows.
      const [target] = await tx
        .select({
          id: patients.id,
          patientNumber: patients.patientNumber,
          deletedAt: patients.deletedAt,
        })
        .from(patients)
        .where(eq(patients.id, id))
        .limit(1);
      if (!target) throw new AdminError("not_found");

      // Clinical-records refuse guard — checked FIRST and alone so the caller
      // gets the precise "permanently blocked" signal (records can never be
      // removed once locked/signed; see the immutability trigger, rule 4).
      const [{ n: records }] = await tx
        .select({ n: count() })
        .from(clinicalRecords)
        .where(eq(clinicalRecords.patientId, id));
      if (Number(records) > 0) throw new AdminError("has_clinical_records");

      // Remaining-references guard — tenant-scoped counts (RLS). Append-only
      // tables (notes/revisions/analytics) and invoices can never be cascaded.
      const refCounts = await Promise.all([
        tx.select({ n: count() }).from(clinicalEpisodes).where(eq(clinicalEpisodes.patientId, id)),
        tx
          .select({ n: count() })
          .from(appointments)
          .where(or(eq(appointments.patientId, id), eq(appointments.patientTwoId, id))),
        tx.select({ n: count() }).from(appointmentNotes).where(eq(appointmentNotes.patientId, id)),
        tx
          .select({ n: count() })
          .from(patientNoteRevisions)
          .where(eq(patientNoteRevisions.patientId, id)),
        tx.select({ n: count() }).from(invoices).where(eq(invoices.patientId, id)),
        tx.select({ n: count() }).from(attachments).where(eq(attachments.patientId, id)),
        tx
          .select({ n: count() })
          .from(patientFormSubmissions)
          .where(eq(patientFormSubmissions.patientId, id)),
        tx.select({ n: count() }).from(analyticsEvents).where(eq(analyticsEvents.patientId, id)),
        // Merge losers pointing at this patient as their survivor.
        tx.select({ n: count() }).from(patients).where(eq(patients.mergedIntoId, id)),
      ]);
      const references = refCounts.reduce((sum, [row]) => sum + Number(row?.n ?? 0), 0);
      if (references > 0) throw new AdminError("has_references");

      // Child rows FIRST (RETURNING), then the parent — no orphans. The
      // location junction is the only patient child that is deletable.
      await tx
        .delete(patientLocations)
        .where(eq(patientLocations.patientId, id))
        .returning({ id: patientLocations.id });

      const deleted = await tx
        .delete(patients)
        .where(eq(patients.id, id))
        .returning({ id: patients.id });
      if (deleted.length === 0) throw new AdminError("not_found");

      // Audit in the SAME tx (rule 6). PII-FREE: ids + patient number + flags
      // only — never the name, NIF, or contacts (rule 7).
      await writeAudit(tx, ctx, {
        action: "patient.hard_delete",
        entityId: id,
        metadata: {
          patientNumber: target.patientNumber,
          wasSoftDeleted: target.deletedAt !== null,
        },
      });
      return id;
    });

    revalidatePatient(deletedId);
    return { ok: true, id: deletedId };
  } catch (e) {
    if (isAdminError(e)) {
      const code = e.code;
      if (
        code === "not_found" ||
        code === "has_clinical_records" ||
        code === "has_references"
      ) {
        return { ok: false, error: code };
      }
    }
    // PII/secret-safe log (rule 7): error NAME only, never message/values.
    console.error("patients: hardDelete failed", e instanceof Error ? e.name : "unknown");
    return { ok: false, error: "error" };
  }
}

/**
 * Read-only search action for the agenda appointment drawer Combobox.
 * Returns at most 50 matches for the given query string.
 */
export async function searchPatientsAction(
  query: string,
): Promise<{ id: string; label: string }[]> {
  const rows = await searchPatients(query, { limit: 50 });
  return rows.map((p) => ({ id: p.id, label: p.fullName }));
}

/**
 * Read-only fetch of a patient's NESA contraindication flags for the booking
 * drawer's soft warning (W2-08). Tenant-scoped via RLS; a missing/cross-tenant
 * id resolves to all-false (no warning). No mutation, no audit.
 */
export async function getPatientContraindications(
  patientId: string,
): Promise<{ epilepsy: boolean; pregnancy: boolean; pacemaker: boolean }> {
  const ctx = await requireRequestContext();
  return runScoped(ctx, async (tx) => {
    const [row] = await tx
      .select({
        epilepsy: patients.contraindicationEpilepsy,
        pregnancy: patients.contraindicationPregnancy,
        pacemaker: patients.contraindicationPacemaker,
      })
      .from(patients)
      .where(eq(patients.id, patientId))
      .limit(1);
    return {
      epilepsy: row?.epilepsy ?? false,
      pregnancy: row?.pregnancy ?? false,
      pacemaker: row?.pacemaker ?? false,
    };
  });
}

/**
 * Append a new patient note revision (W2-11). Append-only: never edits/deletes
 * an existing revision. author = current user, tenant from JWT. Used by the
 * profile Notas tab composer and the dashboard Notas Rápidas quick-note.
 */
export async function appendPatientNoteAction(
  patientId: string,
  content: string,
): Promise<{ ok: boolean }> {
  const ctx = await requireRequestContext();
  assertCan(ctx.role, "patients:write");
  const text = content.trim();
  if (!patientId || text.length === 0 || text.length > 5000) return { ok: false };
  await runScoped(ctx, async (tx) => {
    await tx.insert(patientNoteRevisions).values({
      tenantId: ctx.tenantId, // NOT NULL + RLS WITH CHECK
      patientId,
      content: text,
      authorUserId: ctx.userId,
    });
  });
  revalidatePatient(patientId);
  return { ok: true };
}

/**
 * Merge `loserId` into `survivorId`. This delegates to the DB function
 * `merge_patients(source, target, actor)` (packages/db/migrations/0005) — the
 * single, authoritative merge path. The function runs inside this scoped
 * transaction, derives the tenant from the JWT claims (rejecting cross-tenant
 * input), re-points every dependent INCLUDING locked/signed clinical_records
 * (via the re-parent-aware immutability trigger, which still forbids any change
 * to clinical content), soft-handles the loser (merged_into_id + deleted_at,
 * never hard-deleted), and writes the one `patient.merge` audit row itself.
 *
 * There is deliberately no app-side repoint/finalized-record guard: the old
 * path blocked merges whenever the loser had a finalized record. That divergent
 * behaviour is gone — the trigger handles finalized records correctly.
 */
export async function mergePatients(raw: MergePatientsInput): Promise<Patient> {
  const ctx = await requireRequestContext();
  assertCan(ctx.role, "patients:delete");
  // survivor = target, loser = source. parseMergeInput rejects self-merge.
  const { survivorId, loserId } = parseMergeInput(raw);

  const survivor = await runScoped(ctx, async (tx) => {
    try {
      // Audit row is written inside the function, in THIS transaction.
      await tx.execute(
        sql`select public.merge_patients(${loserId}, ${survivorId}, ${ctx.userId})`,
      );
    } catch (err) {
      // The function raises no_data_found (P0002) when either patient is not a
      // live member of the caller's tenant — including cross-tenant input.
      const code = (err as { code?: string } | null)?.code;
      if (code === "P0002") {
        throw new InvalidMergeError("Patient not found, deleted, or in another tenant");
      }
      if (code === "23514") {
        throw new InvalidMergeError("Cannot merge a patient into itself");
      }
      throw err;
    }

    // Return the survivor (RLS-scoped read in the same tx).
    const [survivorRowFull] = await tx
      .select()
      .from(patients)
      .where(eq(patients.id, survivorId))
      .limit(1);
    if (!survivorRowFull) throw new PatientNotFoundError();
    return survivorRowFull;
  });

  revalidatePatient(survivorId);
  revalidatePatient(loserId);
  return survivor;
}
