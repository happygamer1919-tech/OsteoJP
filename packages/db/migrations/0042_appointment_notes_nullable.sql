/* ================================================================== */
/* 0042 — appointment_notes: appointment_id + author_user_id NULLABLE   */
/*         (W12-13 notes unification, R3) — DDL ONLY, no backfill        */
/*                                                                    */
/* Makes appointment_notes the ONE unified note relation (SPEC-notes-   */
/* unification §3): appointment_id NULLABLE so a row can be a           */
/* PATIENT-LEVEL note (no specific visit); author_user_id NULLABLE so   */
/* the backfill can carry historical notes with no resolvable author.   */
/* patient_id stays NOT NULL (a note always has a patient).             */
/*                                                                    */
/* Loosening NOT NULL is safe + non-destructive: every existing row     */
/* already has both values, so nothing changes for current data. RLS is */
/* UNCHANGED (tenant_isolation SELECT/INSERT, append-only — no UPDATE/   */
/* DELETE policy). The existing appointment_notes_patient_idx            */
/* (tenant_id, patient_id) already covers patient-level lookups, so no   */
/* new index is added.                                                  */
/*                                                                    */
/* NO BACKFILL here. The one-time backfill from appointments.notes +    */
/* patient_note_revisions is a DATA mutation, deferred as an owner-gated */
/* step (incident-cleanup hold). The read/write re-point + the Início    */
/* patient/appointment selectors follow as non-migration PRs once this   */
/* DDL is applied.                                                       */
/* ================================================================== */

ALTER TABLE "appointment_notes" ALTER COLUMN "appointment_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "appointment_notes" ALTER COLUMN "author_user_id" DROP NOT NULL;
