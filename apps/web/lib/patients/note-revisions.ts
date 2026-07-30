import "server-only";
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { assertCan, type RequestContext } from "@osteojp/auth";
import { appointmentNotes, appointments, patientNoteRevisions, users } from "@osteojp/db";
import { runScoped } from "../auth/context";
import {
  mergePatientNotes,
  type MergeableNote,
  type NoteAppointmentLink,
} from "./notes-merge";

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
  /**
   * PL-17 — the visit this note belongs to, or null for a patient-level note /
   * a legacy revision. Drives the "Marcação de …" line and the button that opens
   * that marcação from the Notas tab.
   */
  appointment: NoteAppointmentLink | null;
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
    // Legacy revisions have no edit path (no UPDATE policy targets them), and no
    // appointment link (the relation has no appointment_id).
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      editedAt: null,
      editedByName: null,
      editable: false,
      appointment: null,
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
    // Second users reference for the last-editor's name (PL-13); a third for the
    // linked visit's practitioner (PL-17).
    const editor = alias(users, "note_editor");
    const practitioner = alias(users, "note_appt_practitioner");
    const [unifiedRows, legacyRows] = await Promise.all([
      tx
        .select({
          id: appointmentNotes.id,
          content: appointmentNotes.body,
          authorName: users.fullName,
          createdAt: appointmentNotes.createdAt,
          editedAt: appointmentNotes.editedAt,
          editedByName: editor.fullName,
          // PL-17: which visit this note documents. LEFT joins - a patient-level
          // note has no appointment_id, and its link stays null.
          appointmentId: appointmentNotes.appointmentId,
          appointmentStartsAt: appointments.startsAt,
          appointmentPractitionerName: practitioner.fullName,
        })
        .from(appointmentNotes)
        .leftJoin(users, eq(users.id, appointmentNotes.authorUserId))
        .leftJoin(editor, eq(editor.id, appointmentNotes.lastEditedBy))
        .leftJoin(appointments, eq(appointments.id, appointmentNotes.appointmentId))
        .leftJoin(practitioner, eq(practitioner.id, appointments.practitionerId))
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
      appointment: r.appointmentId
        ? {
            id: r.appointmentId,
            // appointments.starts_at is NOT NULL, so a matched join always has it;
            // the fallback only satisfies the LEFT-join type.
            startsAt: (r.appointmentStartsAt ?? r.createdAt).toISOString(),
            practitionerName: r.appointmentPractitionerName,
          }
        : null,
    }));
    const legacy: MergeableNote[] = legacyRows.map((r) => ({
      id: r.id,
      content: r.content,
      authorName: r.authorName,
      createdAt: r.createdAt.toISOString(),
      editedAt: null,
      editedByName: null,
      editable: false,
      // The legacy relation has no appointment_id at all.
      appointment: null,
    }));
    return mergePatientNotes(unified, legacy);
  });
}

/**
 * PL-16 — the note thread of ONE appointment, newest-first. The unified store has
 * held a thread per visit since W12-13 (every save APPENDS a row); the agenda
 * drawer simply never rendered it, showing only the latest note in a textarea.
 * This is the read behind that board, and behind the Marcações "Notas" popup.
 *
 * Unified rows only: `appointment_notes` is the only relation with an
 * appointment_id, so the legacy `patient_note_revisions` leg has nothing to
 * contribute here (a legacy note belongs to a patient, not to a visit). Every
 * row is editable in place (PL-13, migration 0050).
 *
 * Tenant-scoped via RLS. The therapist own-patient narrowing is applied by the
 * CALLER (the server action re-checks with getPatient, exactly as the append and
 * edit paths do) so this stays a plain read.
 */
export async function listAppointmentNotes(
  ctx: RequestContext,
  appointmentId: string,
): Promise<PatientNoteRevision[]> {
  assertCan(ctx.role, "patients:read");
  return runScoped(ctx, async (tx) => {
    const editor = alias(users, "note_editor");
    const rows = await tx
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
      .where(eq(appointmentNotes.appointmentId, appointmentId))
      .orderBy(desc(appointmentNotes.createdAt));
    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      authorName: r.authorName,
      createdAt: r.createdAt.toISOString(),
      editedAt: r.editedAt ? r.editedAt.toISOString() : null,
      editedByName: r.editedByName,
      editable: true,
      // Already scoped to one visit: the caller knows which, so the per-note
      // link would be redundant (and a needless join on a hot path).
      appointment: null,
    }));
  });
}
