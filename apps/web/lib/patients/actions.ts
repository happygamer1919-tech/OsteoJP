"use server";

// Server actions for patient mutations. Every action:
//   1. requireRequestContext()  — verified caller
//   2. assertCan(ctx.role, ...) — app-layer permission gate (RLS is defense-in-depth)
//   3. runScoped(ctx, tx => ...) — RLS-enforced transaction
//   4. writeAudit(tx, ...)       — audit row in the SAME tx (hard rule 6)
//
// Patients are NEVER hard-deleted (hard rule: soft delete via deleted_at).

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { patients } from "@osteojp/db";
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
    // tenant_id is set explicitly because it is NOT NULL; RLS WITH CHECK then
    // verifies it equals the caller's tenant. This is the required INSERT value,
    // not a hand-rolled tenant filter.
    const [row] = await tx
      .insert(patients)
      .values({
        tenantId: ctx.tenantId,
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
        notes: input.notes,
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
    ...(input.notes !== undefined && { notes: input.notes }),
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
