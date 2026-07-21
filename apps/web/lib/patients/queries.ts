// Read-side data access for patients. Every query: requireRequestContext →
// assertCan('patients:read') → runScoped. Tenant isolation is RLS's job; we
// never add a tenant_id filter here.

import "server-only";
import { and, asc, count, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { assertCan } from "@osteojp/auth";
import {
  analyticsEvents,
  appointmentNotes,
  appointments,
  attachments,
  clinicalEpisodes,
  clinicalRecords,
  invoices,
  patientFormSubmissions,
  patientNoteRevisions,
  patients,
} from "@osteojp/db";
import { requireRequestContext, runScoped } from "../auth/context";
import { activePatientsOnly } from "./filters";
import { therapistPatientScope } from "./scope";
import { escapeLike, parseSearch } from "./validation";
import type { Patient } from "./types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function clampLimit(limit: number | undefined): number {
  if (!limit || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

export async function getPatient(
  id: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<Patient | null> {
  const ctx = await requireRequestContext();
  assertCan(ctx.role, "patients:read");
  // W10-04: a therapist may only load a patient that is theirs (own-only);
  // a non-own id returns null -> the detail page 404s.
  const scope = therapistPatientScope(ctx, patients.id);
  return runScoped(ctx, async (tx) => {
    const base = opts.includeDeleted
      ? eq(patients.id, id)
      : and(eq(patients.id, id), activePatientsOnly);
    const where = scope ? and(base, scope) : base;
    const [row] = await tx.select().from(patients).where(where).limit(1);
    return row ?? null;
  });
}

export type DeletedPatientRow = {
  id: string;
  fullName: string;
  nif: string | null;
  patientNumber: number | null;
  /** ISO instant of the soft delete; null for a merge-only (duplicate) row. */
  deletedAt: string | null;
  /** The survivor this patient was merged into (duplicate marking); null otherwise. */
  mergedIntoId: string | null;
  /** The survivor's display name, when merged. */
  survivorName: string | null;
};

/**
 * W6-04: owner-only listing for the "Pacientes eliminados" recovery view:
 * soft-deleted (deletedAt) OR duplicate-marked (mergedIntoId) patients, with the
 * disambiguating NIF and (for merges) the survivor's name. Gated on the
 * owner-only `patients:recover` capability (query-level enforcement, defense in
 * depth with the route redirect). Tenant-scoped by RLS.
 */
export async function listDeletedPatients(): Promise<DeletedPatientRow[]> {
  const ctx = await requireRequestContext();
  assertCan(ctx.role, "patients:recover");
  const survivor = alias(patients, "survivor");
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: patients.id,
        fullName: patients.fullName,
        nif: patients.nif,
        patientNumber: patients.patientNumber,
        deletedAt: patients.deletedAt,
        mergedIntoId: patients.mergedIntoId,
        survivorName: survivor.fullName,
      })
      .from(patients)
      .leftJoin(survivor, eq(survivor.id, patients.mergedIntoId))
      .where(or(isNotNull(patients.deletedAt), isNotNull(patients.mergedIntoId)))
      .orderBy(asc(patients.fullName));
    return rows.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      nif: r.nif ?? null,
      patientNumber: r.patientNumber ?? null,
      deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
      mergedIntoId: r.mergedIntoId ?? null,
      survivorName: r.survivorName ?? null,
    }));
  });
}

export async function listPatients(
  opts: { limit?: number; offset?: number } = {},
): Promise<Patient[]> {
  const ctx = await requireRequestContext();
  assertCan(ctx.role, "patients:read");
  const limit = clampLimit(opts.limit);
  const offset = Math.max(0, opts.offset ?? 0);
  // W10-04: therapist sees only their own patients; owner/admin tenant-wide.
  const scope = therapistPatientScope(ctx, patients.id);
  return runScoped(ctx, async (tx) =>
    tx
      .select()
      .from(patients)
      .where(scope ? and(activePatientsOnly, scope) : activePatientsOnly)
      .orderBy(asc(patients.fullName)) // uses patients_tenant_name_idx
      .limit(limit)
      .offset(offset),
  );
}

/**
 * Tenant-scoped search over full_name (substring), NIF (prefix), and phone
 * (digits-only substring, tolerant of stored separators). Soft-deleted rows are
 * excluded. The (tenant_id, full_name) index serves the tenant slice + ordering;
 * within a single tenant's row count this stays well under the 300ms target.
 */
export async function searchPatients(
  rawQuery: string,
  opts: { limit?: number } = {},
): Promise<Patient[]> {
  const ctx = await requireRequestContext();
  assertCan(ctx.role, "patients:read");

  const { text, digits } = parseSearch(rawQuery);
  if (text.length === 0) return [];

  const limit = clampLimit(opts.limit);
  const nameLike = `%${escapeLike(text)}%`;
  // W10-04: therapist search is scoped to their own patients too.
  const scope = therapistPatientScope(ctx, patients.id);

  return runScoped(ctx, async (tx) => {
    const matchers = [ilike(patients.fullName, nameLike)];
    if (digits.length > 0) {
      matchers.push(ilike(patients.nif, `${escapeLike(digits)}%`));
      matchers.push(
        sql`"phone_digits" like ${`%${digits}%`}`,
      );
    }
    const where = scope
      ? and(activePatientsOnly, scope, or(...matchers))
      : and(activePatientsOnly, or(...matchers));
    return tx
      .select()
      .from(patients)
      .where(where)
      .orderBy(asc(patients.fullName))
      .limit(limit);
  });
}

export type PatientHardDeleteBlockers = {
  /** Clinical records reference the patient — permanently non-hard-deletable
   *  (locked/signed records can never be removed; immutability trigger). */
  hasClinicalRecords: boolean;
  /** Other domain rows (appointments, notes, invoices, …) reference the patient. */
  hasOtherReferences: boolean;
};

/**
 * UI-affordance read for the W5-08 hard-delete control: does anything still
 * reference this patient? Mirrors the server-enforced guards inside
 * hardDeletePatient — the button is disabled from this, but the ACTION re-checks
 * everything server-side (the disabled control is never the enforcement).
 * Tenant-scoped by RLS; counts only, no row content.
 */
export async function getPatientHardDeleteBlockers(
  id: string,
): Promise<PatientHardDeleteBlockers> {
  const ctx = await requireRequestContext();
  assertCan(ctx.role, "patients:read");
  return runScoped(ctx, async (tx) => {
    const [records, ...others] = await Promise.all([
      tx.select({ n: count() }).from(clinicalRecords).where(eq(clinicalRecords.patientId, id)),
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
      tx.select({ n: count() }).from(patients).where(eq(patients.mergedIntoId, id)),
    ]);
    return {
      hasClinicalRecords: Number(records[0]?.n ?? 0) > 0,
      hasOtherReferences: others.some(([row]) => Number(row?.n ?? 0) > 0),
    };
  });
}
