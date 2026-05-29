"use server";

// Server actions for patient mutations. Every action:
//   1. requireRequestContext()  — verified caller
//   2. assertCan(ctx.role, ...) — app-layer permission gate (RLS is defense-in-depth)
//   3. runScoped(ctx, tx => ...) — RLS-enforced transaction
//   4. writeAudit(tx, ...)       — audit row in the SAME tx (hard rule 6)
//
// Patients are NEVER hard-deleted (hard rule: soft delete via deleted_at).

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { patients } from "@osteojp/db";
import { requireRequestContext, runScoped } from "../auth/context";
import { writeAudit } from "./audit";
import { assertNoFinalizedRecords, repointDependents } from "./merge";
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
 * Merge `loserId` into `survivorId`: repoint all dependent rows to the survivor,
 * then soft-delete the loser with merged_into_id pointing at the survivor — all
 * in one tenant-scoped transaction. Aborts (rolls back) if the loser has any
 * finalized clinical records (see PatientMergeBlockedError).
 */
export async function mergePatients(raw: MergePatientsInput): Promise<Patient> {
  const ctx = await requireRequestContext();
  assertCan(ctx.role, "patients:delete");
  const { survivorId, loserId } = parseMergeInput(raw);

  const survivor = await runScoped(ctx, async (tx) => {
    // Both must exist and be live within the tenant (RLS scopes the lookup).
    const [survivorRow] = await tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.id, survivorId), isNull(patients.deletedAt)))
      .limit(1);
    if (!survivorRow) {
      throw new InvalidMergeError("Survivor patient not found or deleted");
    }
    const [loserRow] = await tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.id, loserId), isNull(patients.deletedAt)))
      .limit(1);
    if (!loserRow) {
      throw new InvalidMergeError("Duplicate patient not found or deleted");
    }

    await assertNoFinalizedRecords(tx, loserId);
    const repointed = await repointDependents(tx, loserId, survivorId);

    const [merged] = await tx
      .update(patients)
      .set({ deletedAt: new Date(), mergedIntoId: survivorId })
      .where(and(eq(patients.id, loserId), isNull(patients.deletedAt)))
      .returning();
    if (!merged) throw new PatientNotFoundError();

    await writeAudit(tx, ctx, {
      action: "patient.merge",
      entityId: survivorId,
      metadata: { mergedFrom: loserId, repointed },
    });

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
