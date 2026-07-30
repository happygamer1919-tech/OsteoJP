import "server-only";
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { assertCan, type RequestContext } from "@osteojp/auth";
import { appointmentNotes, patientNoteRevisions, users } from "@osteojp/db";
import { runScoped } from "../auth/context";
import { mergePatientNotes, type MergeableNote } from "./notes-merge";

/** One patient note for the profile Notas tab (unified or legacy leg). */
export type PatientNoteRevision = {
  id: string;
  content: string;
  /** Author's full name, or null for a system/backfill revision (0030). */
  authorName: string | null;
  createdAt: string; // ISO UTC
  /** PL-13: ISO UTC of the last in-place edit, or null if never edited. */
  editedAt: string | null;
  /** Full name of whoever last edited, or null. */
  editedByName: string | null;
  /** True only for unified `appointment_notes` rows (editable in place, 0050). */
  editable: boolean;
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
    // Legacy revisions have no edit path (no UPDATE policy targets them).
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      editedAt: null,
      editedByName: null,
      editable: false,
    }));
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
    // Second users reference for the last-editor's name (PL-13).
    const editor = alias(users, "note_editor");
    const [unifiedRows, legacyRows] = await Promise.all([
      tx
        .select({
          id: appointmentNotes.id,
          content: appointmentNotes.body,
          authorName: users.fullName,
          createdAt: appointmentNotes.createdAt,
          editedAt: appointmentNotes.editedAt,
          editedByName: editor.fullName,
        })
        .from(appointmentNotes)
        .leftJoin(users, eq(users.id, appointmentNotes.authorUserId))
        .leftJoin(editor, eq(editor.id, appointmentNotes.lastEditedBy))
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
    // Unified rows are editable in place and carry the edit stamp; legacy
    // revisions are read-only (no UPDATE policy targets them).
    const unified: MergeableNote[] = unifiedRows.map((r) => ({
      id: r.id,
      content: r.content,
      authorName: r.authorName,
      createdAt: r.createdAt.toISOString(),
      editedAt: r.editedAt ? r.editedAt.toISOString() : null,
      editedByName: r.editedByName,
      editable: true,
    }));
    const legacy: MergeableNote[] = legacyRows.map((r) => ({
      id: r.id,
      content: r.content,
      authorName: r.authorName,
      createdAt: r.createdAt.toISOString(),
      editedAt: null,
      editedByName: null,
      editable: false,
    }));
    return mergePatientNotes(unified, legacy);
  });
}
