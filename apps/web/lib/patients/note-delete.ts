import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { appointmentNotes, patientNoteRevisions, type DbTx } from "@osteojp/db";

/**
 * NOTES-04 — deleting a note, the database half.
 *
 * ==========================================================================
 * WHAT 0084 PERMITS, AND WHERE THE REST OF THE RULE LIVES
 * ==========================================================================
 * 0084 gave both note relations a DELETE policy scoped to the JWT tenant and
 * nothing finer. Its own comment leaves "who may delete" to the app layer,
 * beside the edit rule: `patients:write`, and a therapist only for their own
 * patients. That half is `deleteNoteAction`; this module only reads and deletes,
 * under whatever RLS context the caller's transaction carries.
 *
 * ==========================================================================
 * WHY A DELETE OF A UNIFIED NOTE ALSO REMOVES ITS LEGACY TWIN
 * ==========================================================================
 * The profile Notas tab merges `appointment_notes` with the legacy
 * `patient_note_revisions`, and HIDES a legacy revision when a unified row has
 * the same text at the same instant (`mergePatientNotes`, the backfill's natural
 * key). Delete only the unified row and the hidden legacy copy comes back on the
 * next render: the operator presses Eliminar and the note is still there.
 *
 * So the twin goes in the same transaction, matched on the SAME key the merge
 * uses - patient, exact text, and the instant compared to the millisecond,
 * because `naturalKey` compares `getTime()`. A legacy revision the merge would
 * NOT hide is not a twin and is left alone.
 */

export type NoteRelation = "appointment_notes" | "patient_note_revisions";

export function isNoteRelation(value: unknown): value is NoteRelation {
  return value === "appointment_notes" || value === "patient_note_revisions";
}

/**
 * The patient a note belongs to, read under the caller's RLS. Null when the id is
 * not a note in that relation, or not one the caller's tenant can see - the same
 * answer either way, so a forged id learns nothing.
 */
export async function readNotePatientId(
  tx: DbTx,
  relation: NoteRelation,
  noteId: string,
): Promise<string | null> {
  if (relation === "appointment_notes") {
    const [row] = await tx
      .select({ patientId: appointmentNotes.patientId })
      .from(appointmentNotes)
      .where(eq(appointmentNotes.id, noteId))
      .limit(1);
    return row?.patientId ?? null;
  }
  const [row] = await tx
    .select({ patientId: patientNoteRevisions.patientId })
    .from(patientNoteRevisions)
    .where(eq(patientNoteRevisions.id, noteId))
    .limit(1);
  return row?.patientId ?? null;
}

export type NoteDeletion = {
  patientId: string;
  /** The marcação the note documented, or null for a patient-level or legacy note. */
  appointmentId: string | null;
  /** Legacy revisions removed because the merge would have shown them in its place. */
  legacyTwinsDeleted: number;
};

/**
 * Delete one note, and for a unified note its hidden legacy twin. Returns null
 * when nothing was deleted (unknown id, another tenant, or a policy that refused
 * it), so the caller writes no audit row for a deletion that did not happen.
 */
export async function deleteNoteInTx(
  tx: DbTx,
  relation: NoteRelation,
  noteId: string,
): Promise<NoteDeletion | null> {
  if (relation === "patient_note_revisions") {
    const [gone] = await tx
      .delete(patientNoteRevisions)
      .where(eq(patientNoteRevisions.id, noteId))
      .returning({ patientId: patientNoteRevisions.patientId });
    return gone ? { patientId: gone.patientId, appointmentId: null, legacyTwinsDeleted: 0 } : null;
  }

  const [gone] = await tx
    .delete(appointmentNotes)
    .where(eq(appointmentNotes.id, noteId))
    .returning({
      patientId: appointmentNotes.patientId,
      appointmentId: appointmentNotes.appointmentId,
      body: appointmentNotes.body,
      createdAt: appointmentNotes.createdAt,
    });
  if (!gone) return null;

  const twins = await tx
    .delete(patientNoteRevisions)
    .where(
      and(
        eq(patientNoteRevisions.patientId, gone.patientId),
        eq(patientNoteRevisions.content, gone.body),
        sql`date_trunc('milliseconds', ${patientNoteRevisions.createdAt}) = ${gone.createdAt.toISOString()}::timestamptz`,
      ),
    )
    .returning({ id: patientNoteRevisions.id });

  return {
    patientId: gone.patientId,
    appointmentId: gone.appointmentId,
    legacyTwinsDeleted: twins.length,
  };
}
