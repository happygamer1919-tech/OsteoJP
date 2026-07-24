import "server-only";
import { desc, eq } from "drizzle-orm";
import { assertCan, type RequestContext } from "@osteojp/auth";
import { appointmentNotes, patientNoteRevisions, users } from "@osteojp/db";
import { runScoped } from "../auth/context";
import { mergePatientNotes, type MergeableNote } from "./notes-merge";

/** One append-only patient note revision, for the profile Notas tab. */
export type PatientNoteRevision = {
  id: string;
  content: string;
  /** Author's full name, or null for a system/backfill revision (0030). */
  authorName: string | null;
  createdAt: string; // ISO UTC
};

/**
 * A patient's note history from `patient_note_revisions` (0030), NEWEST FIRST.
 * Tenant-scoped via RLS (runScoped sets the JWT context). The 0030 backfill
 * seeded the current `patients.notes` as revision 1 (author NULL), so existing
 * notes appear here without touching `patients.notes`.
 *
 * W12-13: this is now the LEGACY leg only; the profile reads `listPatientNotes`
 * (unified + legacy). Kept internal so a future retirement loop can drop it once
 * the backfill has run.
 */
export async function listPatientNoteRevisions(
  ctx: RequestContext,
  patientId: string,
): Promise<PatientNoteRevision[]> {
  assertCan(ctx.role, "patients:read");
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: patientNoteRevisions.id,
        content: patientNoteRevisions.content,
        authorName: users.fullName,
        createdAt: patientNoteRevisions.createdAt,
      })
      .from(patientNoteRevisions)
      .leftJoin(users, eq(users.id, patientNoteRevisions.authorUserId))
      .where(eq(patientNoteRevisions.patientId, patientId))
      .orderBy(desc(patientNoteRevisions.createdAt));
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  });
}

/**
 * The patient profile Notas tab (W12-13, notes unification R3): EVERY note for
 * the patient, newest-first — both the UNIFIED `appointment_notes` (patient-level
 * AND per-appointment rows, so a note added in the Agenda now shows here) and the
 * legacy `patient_note_revisions` history. The two are merged + de-duplicated by
 * the backfill natural key (content + created_at) so nothing is lost before the
 * owner-gated backfill runs, and nothing double-counts after it. Tenant-scoped
 * via RLS. See notes-merge.ts for the dedup rationale.
 */
export async function listPatientNotes(
  ctx: RequestContext,
  patientId: string,
): Promise<PatientNoteRevision[]> {
  assertCan(ctx.role, "patients:read");
  return runScoped(ctx, async (tx) => {
    const [unifiedRows, legacyRows] = await Promise.all([
      tx
        .select({
          id: appointmentNotes.id,
          content: appointmentNotes.body,
          authorName: users.fullName,
          createdAt: appointmentNotes.createdAt,
        })
        .from(appointmentNotes)
        .leftJoin(users, eq(users.id, appointmentNotes.authorUserId))
        .where(eq(appointmentNotes.patientId, patientId))
        .orderBy(desc(appointmentNotes.createdAt)),
      tx
        .select({
          id: patientNoteRevisions.id,
          content: patientNoteRevisions.content,
          authorName: users.fullName,
          createdAt: patientNoteRevisions.createdAt,
        })
        .from(patientNoteRevisions)
        .leftJoin(users, eq(users.id, patientNoteRevisions.authorUserId))
        .where(eq(patientNoteRevisions.patientId, patientId))
        .orderBy(desc(patientNoteRevisions.createdAt)),
    ]);
    const toIso = (r: { id: string; content: string; authorName: string | null; createdAt: Date }): MergeableNote => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    });
    return mergePatientNotes(unifiedRows.map(toIso), legacyRows.map(toIso));
  });
}
