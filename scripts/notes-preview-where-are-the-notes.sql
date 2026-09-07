-- ===================================================================
-- READ-ONLY. Run by the OWNER, on production. NOTHING WRITES.
-- Every statement is a SELECT. There is no INSERT, UPDATE, DELETE or DDL in
-- this file, and no transaction to roll back because none is needed.
-- ===================================================================
-- INC-NOTES-PREVIEW. The owner opened /recuperacao and saw no note line on any
-- row. This answers the ONE question the screen cannot: do those patients have
-- notes, and if so WHERE do they live.
--
--   set -o allexport && source /Users/ivan/osteojp-secrets/new-prod.env && \
--   set +o allexport && \
--   node scripts/assert-production-target.mjs && \
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -f scripts/notes-preview-where-are-the-notes.sql
--
-- ===================================================================
-- WHY THE SCREEN CANNOT ANSWER THIS ITSELF
-- ===================================================================
-- The design is that absence draws nothing - no label, no empty box, no dead
-- button - which is the owner's own ruling and is right for a list of fifty.
-- The cost of that ruling is exactly this: **a broken read and a correct empty
-- state are the same screen**, and no amount of looking at it distinguishes
-- them. Only the data does.
--
-- THE READ ITSELF HAS BEEN PROVEN SOUND, on a lane at the same Postgres version,
-- through the product's own write path, as RECEPTION, in a real browser:
-- `apps/web/e2e/recuperacao-note-roundtrip.spec.ts` writes a note on a patient
-- who is on the list, returns, and reads it off the row - with a second row on
-- the same page correctly showing nothing. So what is left to establish is
-- whether production HAS any note the read could have found.
--
-- ===================================================================
-- IT PRINTS COUNTS AND NEVER CONTENT. THAT IS A HARD REQUIREMENT.
-- ===================================================================
-- A note body is clinical data and a patient name is personal data, and this
-- output is pasted back into a terminal's context. Every column below is a
-- COUNT or a boolean. No `body`, no `content`, no `full_name`, no id that
-- resolves to a person. Standing rule 7.
--
-- ===================================================================
-- THE FOUR PLACES A "PATIENT NOTE" COULD BE, AND ONLY TWO ARE READ
-- ===================================================================
--   appointment_notes, appointment_id IS NULL   a note about the PERSON.  READ.
--   patient_note_revisions                      the legacy store.         READ.
--   appointment_notes, appointment_id SET       a note about a VISIT.     not
--                                               read here by design - it is the
--                                               Marcações line, not this one.
--   patients.notes                              the pre-0030 free-text column.
--                                               NOT READ BY ANYTHING. If this
--                                               is where production's notes are,
--                                               that is a DEFECT and section 3
--                                               is the one that finds it.
-- ===================================================================

\echo ''
\echo '=== 1. DO ANY PATIENT-LEVEL NOTES EXIST AT ALL? ==='
\echo '--- If both are 0, nobody has written one yet and the screen is CORRECT.'
SELECT
  (SELECT count(*) FROM public.appointment_notes WHERE appointment_id IS NULL)
    AS patient_level_notes_read_by_the_preview,
  (SELECT count(*) FROM public.patient_note_revisions)
    AS legacy_revisions_read_by_the_preview,
  (SELECT count(*) FROM public.appointment_notes WHERE appointment_id IS NOT NULL)
    AS visit_notes_NOT_on_this_line;

\echo ''
\echo '=== 2. HOW MANY DISTINCT PATIENTS CARRY ONE ==='
SELECT
  (SELECT count(DISTINCT patient_id) FROM public.appointment_notes WHERE appointment_id IS NULL)
    AS patients_with_a_patient_level_note,
  (SELECT count(DISTINCT patient_id) FROM public.patient_note_revisions)
    AS patients_with_a_legacy_revision;

\echo ''
\echo '=== 3. THE DEAD COLUMN. A NON-ZERO HERE WITH ZEROS ABOVE IS A DEFECT. ==='
\echo '--- patients.notes is read by NOTHING in the application. 0030 seeded its'
\echo '--- value into patient_note_revisions; anything written there SINCE - by an'
\echo '--- import or by hand - is invisible to every screen, not just this one.'
SELECT count(*) AS patients_with_a_nonempty_dead_notes_column
  FROM public.patients
 WHERE nullif(btrim(notes), '') IS NOT NULL
   AND deleted_at IS NULL;

\echo ''
\echo '=== 4. THE ONE THAT DECIDES IT: notes ON PATIENTS THE LIST CAN SHOW ==='
\echo '--- The recuperacao list needs a COMPLETED attendance and NO future booking.'
\echo '--- This asks how many patients satisfy both AND carry a note the preview'
\echo '--- reads. It is deliberately WIDER than the real window (which also bounds'
\echo '--- the attendance date and excludes postponements), so a 0 here is'
\echo '--- conclusive and a small number is not necessarily on todays page.'
SELECT count(*) AS listable_patients_with_a_note_the_preview_reads
  FROM public.patients p
 WHERE p.deleted_at IS NULL
   AND EXISTS (SELECT 1 FROM public.appointments a
                WHERE a.patient_id = p.id AND a.status = 'completed')
   AND NOT EXISTS (SELECT 1 FROM public.appointments a
                    WHERE a.patient_id = p.id AND a.starts_at > now()
                      AND a.status NOT IN ('cancelled', 'no_show'))
   AND (
     EXISTS (SELECT 1 FROM public.appointment_notes n
              WHERE n.patient_id = p.id AND n.appointment_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.patient_note_revisions r WHERE r.patient_id = p.id)
   );

\echo ''
\echo '=== 5. AND THE SAME PATIENTS, COUNTED WITHOUT THE NOTE CONDITION ==='
\echo '--- The denominator. Section 4 over section 5 is the share of the list that'
\echo '--- SHOULD be showing a note line.'
SELECT count(*) AS listable_patients_total
  FROM public.patients p
 WHERE p.deleted_at IS NULL
   AND EXISTS (SELECT 1 FROM public.appointments a
                WHERE a.patient_id = p.id AND a.status = 'completed')
   AND NOT EXISTS (SELECT 1 FROM public.appointments a
                    WHERE a.patient_id = p.id AND a.starts_at > now()
                      AND a.status NOT IN ('cancelled', 'no_show'));

\echo ''
\echo '=== HOW TO READ THE ANSWER ==='
\echo '--- 4 = 0 and 1 = 0        nobody has written a patient note. The screen is'
\echo '---                        CORRECT and there is nothing to fix.'
\echo '--- 4 = 0 and 1 > 0        notes exist but on patients the list never shows.'
\echo '---                        Still correct; the feature is waiting for a case.'
\echo '--- 4 > 0                  the preview SHOULD be rendering and is not.'
\echo '---                        That is a live defect - send this output back.'
\echo '--- 3 > 0 with 1 = 0       the notes are in the dead column. A real defect,'
\echo '---                        and a different one: the read is fine, the DATA'
\echo '---                        is somewhere nothing reads.'
\echo ''
