/* ==================================================================== */
/* 0068 - appointments.patient_2_id gets the index it never had.        */
/* ==================================================================== */
/*                                                                      */
/* PERF-01. Authored by BLUE under strategy ruling SR-11, which moves   */
/*   migration authorship to this lane for THIS MIGRATION ONLY and      */
/*   freezes it again the moment 0068 merges.                           */
/*                                                                      */
/* THE DEFECT. `patient_2_id` was added by 0032_secondary_participants  */
/*   with a foreign key and NO INDEX. Every clause behind /recuperacao  */
/*   and the `patients_select` RLS helper                               */
/*   `patient_appt_at_viewer_location()` (0047) filter on               */
/*                                                                      */
/*       (patient_id = X OR patient_2_id = X)                           */
/*                                                                      */
/*   An OR whose second arm has no index CANNOT be answered by a        */
/*   BitmapOr, so Postgres sequentially scans all 41,000 appointments,  */
/*   once per patient row, 13,881 times per /recuperacao page load.     */
/*   Confirmed in production by Sentry statement timeouts on            */
/*   /recuperacao and /estatisticas/indicadores, 2026-08-30.            */
/*                                                                      */
/* EIGHT CALL SITES, NOT ONE. Five expressions in                       */
/*   packages/db/src/followup-selection.ts (:63 :80 :96 :198 :214) and  */
/*   three RLS helper functions across 0045 and 0047. The shape was     */
/*   correct every time; nobody asked whether the database could        */
/*   answer it.                                                         */
/*                                                                      */
/* MEASURED, NOT ESTIMATED. Stock postgres:16, schema and index set     */
/*   transcribed from this repo's own migrations, seeded to production  */
/*   scale (8,400 patients / 41,000 appointments / 1,640 dual-patient / */
/*   35,720 completed), ANALYZEd, warm cache:                           */
/*                                                                      */
/*     /recuperacao, the page's real window                             */
/*       BEFORE  17,962.890 ms      AFTER  190.940 ms                   */
/*     /recuperacao, a 90-21 day window                                 */
/*       BEFORE  14,449.862 ms      AFTER  ~178 ms over three runs      */
/*     patients_select RLS helper over all 8,400 patients               */
/*       BEFORE   1,077.421 ms      AFTER   36.255 ms                   */
/*                                                                      */
/*   The plan flips from `Seq Scan on appointments` to `Bitmap Heap     */
/*   Scan` under a BitmapOr of appointments_patient_idx and this index. */
/*                                                                      */
/* WHY PARTIAL, AND IT IS MEASURED RATHER THAN ASSUMED. Only 1,640 of   */
/*   41,000 rows carry a secondary patient. The partial index is 32 kB  */
/*   against 632 kB for the full one, produces an IDENTICAL plan and    */
/*   identical timings (177 ms vs 177 ms), and costs nothing on the     */
/*   96% of inserts that leave the column NULL. The predicate is safe   */
/*   because `patient_2_id = <non-null uuid>` implies NOT NULL, so the  */
/*   planner can always use it for these lookups.                       */
/*                                                                      */
/* NOT CONCURRENTLY, and that is a decision rather than an omission.    */
/*   CREATE INDEX CONCURRENTLY cannot run inside drizzle-kit's          */
/*   migration transaction. The clinic is closed on the day this is     */
/*   applied and the build is sub-second on 41,000 rows, so the plain   */
/*   form is correct here. A future apply against a working clinic      */
/*   should use the concurrent form as a separate, non-transactional    */
/*   statement.                                                         */
/*                                                                      */
/* IDEMPOTENT. IF NOT EXISTS, so a re-apply is a no-op.                 */
/* ==================================================================== */

CREATE INDEX IF NOT EXISTS appointments_patient_2_idx
  ON public.appointments (patient_2_id)
  WHERE patient_2_id IS NOT NULL;
