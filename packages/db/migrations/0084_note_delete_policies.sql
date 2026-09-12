/* ================================================================== */
/* 0084 — appointment_notes + patient_note_revisions: a DELETE policy  */
/*        each. Nothing else.                                          */
/*                                                                    */
/* THE CLINIC REPORTED THAT A PATIENT NOTE CANNOT BE DELETED, and that */
/* a patient carrying one cannot be hard-deleted either. Both are true */
/* and they are the same fact seen twice. MEASURED on a lane database, */
/* not inferred:                                                       */
/*                                                                    */
/*   DELETE appointment_notes as authenticated admin      -> 0 rows    */
/*   DELETE appointment_notes as authenticated therapist  -> 0 rows    */
/*   appointment_notes policies      insert(a) select(r) update(w)     */
/*   patient_note_revisions policies insert(a) select(r)               */
/*                                                                    */
/* DELETE IS ALREADY GRANTED TO `authenticated` ON BOTH TABLES. 0026   */
/* and 0030 each granted the FULL DML set deliberately - their own     */
/* comments say append-only is enforced by the MISSING POLICY and not  */
/* by a grant carve-out, so that an UPDATE or DELETE denies as 0 rows   */
/* via RLS in every environment rather than as a permission error in    */
/* some. Verified on a migrated database rather than read off the       */
/* migration (SR-52 / SR-56: a grant is an end state you assert):       */
/*                                                                    */
/*   appointment_notes      authenticated  DELETE,INSERT,...,UPDATE     */
/*   patient_note_revisions authenticated  DELETE,INSERT,...,UPDATE     */
/*                                                                    */
/* So this migration adds NO grant. Adding one would be a no-op that    */
/* looks like the load-bearing part of the change.                      */
/*                                                                    */
/* ================================================================== */
/* THIS REVERSES A RULING, AND SAYS SO RATHER THAN QUIETLY WIDENING     */
/* ================================================================== */
/* 0050's header states: "DELETE is deliberately STILL denied (no       */
/* DELETE policy): the owner ruled editable, not deletable; history is  */
/* preserved." That was PL-13, 2026-07-30. The 2026-09-10 clinic batch   */
/* asks for deletion in the owner's own words. A reader of 0050 must be  */
/* able to find out that its sentence no longer holds, so the policy      */
/* comments below name 0050 and the reversal explicitly.                 */
/*                                                                    */
/* ================================================================== */
/* SCOPE IS TENANT-ONLY, EXACTLY LIKE 0050's UPDATE POLICY              */
/* ================================================================== */
/* The finer "who may delete" rule - `patients:write`, and a therapist   */
/* only for their own patients - stays at the APP layer, in the delete   */
/* action, which is the same place `appendAppointmentNoteAction` and     */
/* `editAppointmentNoteAction` enforce it and the same split 0050 chose  */
/* and stated. Notes are internal staff communication, not clinical      */
/* records, so this is deliberately NOT the stricter clinical (0045)     */
/* scope.                                                               */
/*                                                                    */
/* WHY DELETE IS NOT A BIGGER POWER THAN THE EDIT THAT ALREADY SHIPPED:  */
/* `editAppointmentNoteAction` replaces `body` outright. The previous    */
/* text is gone - nothing versions it, and only `edited_at` and          */
/* `last_edited_by` survive. A capability that can already destroy the   */
/* content of a note is not meaningfully widened by also removing the    */
/* row. Stated because it is the argument for keeping both at            */
/* `patients:write`, and it is the owner's to overrule.                  */
/*                                                                    */
/* ================================================================== */
/* WHAT IS NOT TOUCHED                                                  */
/* ================================================================== */
/* No table, no column, no index, no function, no existing policy and no */
/* grant. Two CREATE POLICY statements. ADDITIVE under SR-50(d): it       */
/* creates new objects and ALTERs and DROPs nothing.                     */
/*                                                                    */
/* `audit_log` keeps NO delete policy of any kind and is not mentioned    */
/* here: the audit row for a note deletion is an INSERT on the existing   */
/* append-only log, written by the action in the same transaction as the  */
/* DELETE (hard rule 6). Nothing about the trail becomes erasable.        */
/* ================================================================== */

CREATE POLICY "appointment_notes_tenant_delete" ON public.appointment_notes
  FOR DELETE TO authenticated
  USING (tenant_id = (select public.jwt_tenant_id()));--> statement-breakpoint

COMMENT ON POLICY "appointment_notes_tenant_delete" ON public.appointment_notes IS
  'Tenant-scoped DELETE. Added by 0084 for the 2026-09-10 clinic batch. It '
  'REVERSES the sentence in 0050''s header ("DELETE is deliberately STILL '
  'denied ... the owner ruled editable, not deletable"): a note can now be '
  'removed. Who may remove one is decided in the app layer, in '
  'deleteAppointmentNoteAction, exactly as 0050 left the edit rule.';--> statement-breakpoint

CREATE POLICY "patient_note_revisions_tenant_delete" ON public.patient_note_revisions
  FOR DELETE TO authenticated
  USING (tenant_id = (select public.jwt_tenant_id()));--> statement-breakpoint

COMMENT ON POLICY "patient_note_revisions_tenant_delete" ON public.patient_note_revisions IS
  'Tenant-scoped DELETE. Added by 0084 alongside the appointment_notes twin. '
  'The profile Notas tab renders BOTH relations in one merged list, so a delete '
  'that reached only the unified rows would leave the legacy half of a '
  'patient''s history undeletable - and a hard delete counts both, so the '
  'patient would stay undeletable for the half nobody could remove.';
