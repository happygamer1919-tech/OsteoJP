-- ===========================================================================
-- CB RECONCILIATION. What did NOT arrive, itemised.
-- ===========================================================================
--
-- WHO RUNS THIS: Ivan, in the Supabase SQL editor, against PRODUCTION.
--
-- The lane could not run it. SR-50 authorises a lane to connect to production,
-- and this session's harness classifier REFUSES to read
-- `~/osteojp-secrets/new-prod.env`, so the guard command cannot execute and the
-- SR-50 path cannot be taken. Same refusal, same session shape, as
-- `docs/migration-apply-0079.md` records. No production credential was read and
-- no connection to production was made.
--
-- READ ONLY. Every statement is a SELECT. No INSERT, no UPDATE, no DELETE, no
-- temp table, no transaction left open. Nothing here fixes anything, and that
-- is deliberate: the owner asked what is missing, and a script that both
-- diagnoses and repairs makes the diagnosis unreviewable.
--
-- ---------------------------------------------------------------------------
-- IT PRINTS PATIENT NAMES, IN ONE SECTION, ON PURPOSE
-- ---------------------------------------------------------------------------
-- Section 11 lists `patients.full_name` for rows that look like SCHEDULING
-- ARTEFACTS rather than people ("NAO MARCAR" and its family). The whole
-- decision the section exists to support - is this a person or a blocked slot -
-- cannot be made from a count, and the reader is the clinic's own controller
-- looking at his own database. Every other section reports ids and counts.
--
-- ---------------------------------------------------------------------------
-- ONE RESULT GRID, DELIBERATELY
-- ---------------------------------------------------------------------------
-- Every section UNIONs into a single (sort_key, line) result, so the whole
-- report is one grid to select and paste back rather than fifteen. `line` is
-- pre-formatted text; nothing downstream has to re-join anything.
--
-- ---------------------------------------------------------------------------
-- WHY THE LEDGER IS THE SOURCE-SHAPED SIDE
-- ---------------------------------------------------------------------------
-- `migration_staging_rows` holds ONE ROW PER SOURCE RECORD - the raw payload,
-- a validate->import status, and `imported_entity_id` pointing at what it
-- became. It is the only place in this database that knows what the DELIVERY
-- contained, as opposed to what landed. So "source-shaped count" here means the
-- ledger's count, and "landed count" means the target table's, and a section
-- exists for every way those two can disagree:
--
--   * a source row that never became a target row   -> sections 3, 4
--   * a source row whose target row is GONE          -> section 5
--   * a target row nobody can see                    -> section 8b
--   * a target row the LINK TABLE has lost            -> sections 8, 10
--   * a patient who landed with none of their history-> section 9
--
-- THE LEDGER IS SHARED BETWEEN THE TWO CLINICS. PROD-RUN.md section 4.1: both
-- deliveries import under the same `source_system` and the same batch id, and a
-- person present in both deliveries resolves to ONE ledger row because the
-- patient source id is the vendor's own `id_paciente`. So ledger totals are
-- CUMULATIVE across LV and CB and are NOT the sum of the two deliveries. That
-- is why section 2 prints the batch ids and their date ranges: if CB came in
-- under its own batch id, every cumulative reading below is wrong and section 2
-- is where that shows.
--
-- ===========================================================================

WITH tenant AS (
  -- ONE TENANT, AND IT IS DERIVED RATHER THAN TYPED. A hard-coded uuid in a
  -- report is a value nobody re-checks; this fails loudly (zero rows, whole
  -- report empty) if the assumption that there is exactly one is ever false.
  SELECT id AS tenant_id FROM tenants ORDER BY created_at LIMIT 1
),
loc AS (
  SELECT l.id, l.name, l.is_active
    FROM locations l, tenant t
   WHERE l.tenant_id = t.tenant_id
),

-- ---------------------------------------------------------------------------
-- 0. HEADER
-- ---------------------------------------------------------------------------
s0 AS (
  SELECT 0 AS k, 0 AS k2,
         'CB RECONCILIATION  ran ' || to_char(now() AT TIME ZONE 'Europe/Lisbon',
                                              'YYYY-MM-DD HH24:MI') ||
         ' Lisbon   tenant ' || t.tenant_id::text AS line
    FROM tenant t
),

-- ---------------------------------------------------------------------------
-- 1. LOCATIONS. Everything below is keyed on these ids; print them first so a
--    reader can tell CB from LV without guessing which name means which.
-- ---------------------------------------------------------------------------
s1 AS (
  SELECT 1 AS k, row_number() OVER (ORDER BY l.name) AS k2,
         '1. LOCATION  ' || l.id::text || '  ' || l.name ||
         '  active=' || l.is_active::text AS line
    FROM loc l
),

-- ---------------------------------------------------------------------------
-- 2. THE IMPORT BATCHES. See the header: one shared batch is the expected
--    shape and a second one invalidates every cumulative number below.
-- ---------------------------------------------------------------------------
s2 AS (
  SELECT 2 AS k, row_number() OVER (ORDER BY min(m.created_at)) AS k2,
         '2. BATCH  ' || m.batch_id::text || '  source=' || m.source_system ||
         '  rows=' || count(*)::text ||
         '  first=' || to_char(min(m.created_at) AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') ||
         '  last='  || to_char(max(m.created_at) AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') AS line
    FROM migration_staging_rows m, tenant t
   WHERE m.tenant_id = t.tenant_id
   GROUP BY m.batch_id, m.source_system
),

-- ---------------------------------------------------------------------------
-- 3. THE LEDGER MATRIX. Source-shaped count per entity, split by status.
--    `imported` is the only status that produced a target row. Everything else
--    is a source record that did not arrive, and the columns say which way.
-- ---------------------------------------------------------------------------
s3 AS (
  SELECT 3 AS k, row_number() OVER (ORDER BY m.entity_type::text) AS k2,
         '3. LEDGER  ' || rpad(m.entity_type::text, 18) ||
         ' staged='   || lpad(count(*)::text, 6) ||
         ' imported=' || lpad(count(*) FILTER (WHERE m.status = 'imported')::text, 6) ||
         ' failed='   || lpad(count(*) FILTER (WHERE m.status = 'failed')::text, 5) ||
         ' validated_not_imported=' || lpad(count(*) FILTER (WHERE m.status = 'validated')::text, 5) ||
         ' pending='  || lpad(count(*) FILTER (WHERE m.status = 'pending')::text, 5) AS line
    FROM migration_staging_rows m, tenant t
   WHERE m.tenant_id = t.tenant_id
   GROUP BY m.entity_type
),

-- ---------------------------------------------------------------------------
-- 4. EVERY ROW THAT DID NOT IMPORT, ITEMISED. Not a total: one line per source
--    record, carrying its source id and the STRUCTURED error code.
--
--    `error_detail` is structured by construction (code + field paths, never
--    raw source values - see the schema comment on the column), so printing it
--    cannot leak a patient's data into this report. `source_id` is the vendor's
--    own key, which is what the owner needs to find the record in the Drive
--    delivery.
--
--    CAPPED AT 500 LINES so one catastrophic entity cannot bury the rest of the
--    report; section 3's counts are the authority on how many there are, and a
--    truncation line says so.
-- ---------------------------------------------------------------------------
s4 AS (
  SELECT 4 AS k, row_number() OVER (ORDER BY m.entity_type::text, m.source_id) AS k2,
         '4. NOT-IMPORTED  ' || rpad(m.entity_type::text, 18) ||
         ' status=' || rpad(m.status::text, 10) ||
         ' source_id=' || m.source_id ||
         '  detail=' || coalesce(m.error_detail::text, '(none)') AS line
    FROM migration_staging_rows m, tenant t
   WHERE m.tenant_id = t.tenant_id
     AND m.status <> 'imported'
   ORDER BY m.entity_type::text, m.source_id
   LIMIT 500
),
s4b AS (
  SELECT 4 AS k, 100000 AS k2,
         '4. NOT-IMPORTED  TOTAL ' || count(*)::text ||
         CASE WHEN count(*) > 500 THEN '  (only the first 500 are listed above)' ELSE '' END AS line
    FROM migration_staging_rows m, tenant t
   WHERE m.tenant_id = t.tenant_id AND m.status <> 'imported'
),

-- ---------------------------------------------------------------------------
-- 5. THE LEDGER SAYS IMPORTED AND THE TARGET ROW IS NOT THERE.
--
--    This is the failure mode PROD-RUN.md's cross-check exists for and the one
--    that reads as success from either side alone: the ledger is satisfied, the
--    count in section 3 looks right, and the row a patient's history hangs off
--    does not exist. A soft-deleted patient counts as gone here, deliberately -
--    `deleted_at` is not visible to reception either.
-- ---------------------------------------------------------------------------
s5 AS (
  SELECT 5 AS k, row_number() OVER (ORDER BY m.entity_type::text, m.source_id) AS k2,
         '5. IMPORTED-BUT-MISSING  ' || rpad(m.entity_type::text, 18) ||
         ' source_id=' || m.source_id ||
         ' target=' || coalesce(m.imported_entity_id::text, '(null)') AS line
    FROM migration_staging_rows m, tenant t
   WHERE m.tenant_id = t.tenant_id
     AND m.status = 'imported'
     AND (
       m.imported_entity_id IS NULL
       OR (m.entity_type = 'patient'
           AND NOT EXISTS (SELECT 1 FROM patients p
                            WHERE p.id = m.imported_entity_id AND p.deleted_at IS NULL))
       OR (m.entity_type = 'appointment'
           AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.id = m.imported_entity_id))
       OR (m.entity_type = 'clinical_record'
           AND NOT EXISTS (SELECT 1 FROM clinical_records c WHERE c.id = m.imported_entity_id))
       OR (m.entity_type = 'clinical_episode'
           AND NOT EXISTS (SELECT 1 FROM clinical_episodes e WHERE e.id = m.imported_entity_id))
       OR (m.entity_type = 'attachment'
           AND NOT EXISTS (SELECT 1 FROM attachments at2 WHERE at2.id = m.imported_entity_id))
     )
   ORDER BY m.entity_type::text, m.source_id
   LIMIT 500
),

-- ---------------------------------------------------------------------------
-- 6. LANDED COUNTS, PER TABLE PER LOCATION.
--
--    HOW EACH TABLE GETS A LOCATION, because only two of the six carry one:
--      patients             -> patient_locations (MEMBERSHIP, many per patient)
--      appointments         -> appointments.location_id (NOT NULL)
--      clinical_records     -> through their appointment; a record with no
--                              appointment_id has NO location and is counted
--                              separately rather than assigned to one
--      attachments          -> through their patient's memberships
--      service_packs        -> service_packs.location_id (NULL = every clinic)
--      patient_pack_instances -> through the pack
--
--    A patient at BOTH clinics is counted at BOTH, and the totals therefore do
--    not sum to the table count. That is the honest shape: membership is not a
--    partition. Section 6 prints the table total on its own line so the two are
--    never confused.
-- ---------------------------------------------------------------------------
s6_pat AS (
  SELECT 6 AS k, row_number() OVER (ORDER BY l.name) AS k2,
         '6. patients               ' || rpad(l.name, 18) || ' = ' ||
         lpad(count(DISTINCT p.id)::text, 7) AS line
    FROM loc l
    JOIN patient_locations pl ON pl.location_id = l.id
    JOIN patients p ON p.id = pl.patient_id AND p.deleted_at IS NULL
   GROUP BY l.name
),
s6_pat_tot AS (
  SELECT 6 AS k, 50 AS k2,
         '6. patients               ' || rpad('TOTAL (distinct)', 18) || ' = ' ||
         lpad(count(*)::text, 7) ||
         '   no_location_link=' || lpad(count(*) FILTER (
             WHERE NOT EXISTS (SELECT 1 FROM patient_locations pl WHERE pl.patient_id = p.id))::text, 6) AS line
    FROM patients p, tenant t
   WHERE p.tenant_id = t.tenant_id AND p.deleted_at IS NULL
),
s6_appt AS (
  SELECT 6 AS k, 100 + row_number() OVER (ORDER BY l.name) AS k2,
         '6. appointments           ' || rpad(l.name, 18) || ' = ' ||
         lpad(count(a.id)::text, 7) AS line
    FROM loc l
    LEFT JOIN appointments a ON a.location_id = l.id
   GROUP BY l.name
),
s6_cr AS (
  SELECT 6 AS k, 200 + row_number() OVER (ORDER BY x.label) AS k2,
         '6. clinical_records       ' || rpad(x.label, 18) || ' = ' ||
         lpad(count(*)::text, 7) AS line
    FROM (
      SELECT coalesce(l.name, '(no appointment)') AS label
        FROM clinical_records c
        JOIN tenant t ON c.tenant_id = t.tenant_id
        LEFT JOIN appointments a ON a.id = c.appointment_id
        LEFT JOIN loc l ON l.id = a.location_id
    ) x
   GROUP BY x.label
),
s6_att AS (
  SELECT 6 AS k, 300 + row_number() OVER (ORDER BY l.name) AS k2,
         '6. attachments(documents) ' || rpad(l.name, 18) || ' = ' ||
         lpad(count(DISTINCT at2.id)::text, 7) AS line
    FROM loc l
    JOIN patient_locations pl ON pl.location_id = l.id
    JOIN attachments at2 ON at2.patient_id = pl.patient_id
   GROUP BY l.name
),
s6_att_tot AS (
  SELECT 6 AS k, 350 AS k2,
         '6. attachments(documents) ' || rpad('TOTAL', 18) || ' = ' ||
         lpad(count(*)::text, 7) AS line
    FROM attachments at2, tenant t WHERE at2.tenant_id = t.tenant_id
),
s6_packs AS (
  SELECT 6 AS k, 400 + row_number() OVER (ORDER BY coalesce(l.name, 'zzz-ALL CLINICS')) AS k2,
         '6. service_packs          ' || rpad(coalesce(l.name, '(all clinics)'), 18) || ' = ' ||
         lpad(count(sp.id)::text, 7) ||
         '   active=' || lpad(count(*) FILTER (WHERE sp.is_active)::text, 5) AS line
    FROM service_packs sp
    JOIN tenant t ON sp.tenant_id = t.tenant_id
    LEFT JOIN loc l ON l.id = sp.location_id
   GROUP BY l.name
),
s6_pack_prices AS (
  -- THE PER-CLINIC PRICE OVERRIDES, WHICH ARE A DIFFERENT FACT FROM
  -- `service_packs.location_id`. A pack bound to one clinic can carry a price
  -- row at another, and PACK-04 is what happens when the two disagree without
  -- anybody looking. Zero rows here means the base prices ARE the prices, which
  -- is what the 2026-09-06 production read found - and that is worth confirming
  -- after the CB import rather than assuming it survived.
  SELECT 6 AS k, 450 + row_number() OVER (ORDER BY l.name) AS k2,
         '6. pack location prices  ' || rpad(l.name, 18) || ' = ' ||
         lpad(count(*)::text, 7) ||
         '   active=' || lpad(count(*) FILTER (WHERE splp.is_active)::text, 5) ||
         '   on packs bound elsewhere=' || lpad(count(*) FILTER (
             WHERE sp.location_id IS NOT NULL AND sp.location_id <> splp.location_id)::text, 5) AS line
    FROM service_pack_location_prices splp
    JOIN tenant t ON splp.tenant_id = t.tenant_id
    JOIN service_packs sp ON sp.id = splp.pack_id
    JOIN loc l ON l.id = splp.location_id
   GROUP BY l.name
),
s6_inst AS (
  SELECT 6 AS k, 500 + row_number() OVER (ORDER BY coalesce(l.name, 'zzz-ALL CLINICS')) AS k2,
         '6. patient_pack_instances ' || rpad(coalesce(l.name, '(all clinics)'), 18) || ' = ' ||
         lpad(count(pi.id)::text, 7) AS line
    FROM patient_pack_instances pi
    JOIN tenant t ON pi.tenant_id = t.tenant_id
    JOIN service_packs sp ON sp.id = pi.pack_id
    LEFT JOIN loc l ON l.id = sp.location_id
   GROUP BY l.name
),

-- ---------------------------------------------------------------------------
-- 7. THE APPOINTMENT DATE RANGE PER LOCATION, AND THE SHAPE OF IT PER YEAR.
--
--    A TRUNCATED HISTORY IS THE FAILURE THAT READS AS SUCCESS. A count alone
--    cannot tell "we imported everything" from "we imported the last two
--    years": both look like a large number. The per-year rows are what make a
--    missing decade visible, because a clinic that has been open since 2014
--    and shows its first row in 2023 is not a clinic with few patients.
-- ---------------------------------------------------------------------------
s7 AS (
  SELECT 7 AS k, row_number() OVER (ORDER BY l.name) AS k2,
         '7. RANGE  ' || rpad(l.name, 18) ||
         ' n=' || lpad(count(a.id)::text, 7) ||
         ' first=' || coalesce(to_char(min(a.starts_at) AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD'), '(none)') ||
         ' last='  || coalesce(to_char(max(a.starts_at) AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD'), '(none)') AS line
    FROM loc l
    LEFT JOIN appointments a ON a.location_id = l.id
   GROUP BY l.name
),
s7y AS (
  SELECT 7 AS k, 100 + row_number() OVER (ORDER BY l.name, y.yr) AS k2,
         '7. YEAR   ' || rpad(l.name, 18) || ' ' || y.yr::text || ' = ' ||
         lpad(y.n::text, 7) AS line
    FROM (
      SELECT a.location_id,
             extract(year FROM a.starts_at AT TIME ZONE 'Europe/Lisbon')::int AS yr,
             count(*) AS n
        FROM appointments a JOIN tenant t ON a.tenant_id = t.tenant_id
       GROUP BY a.location_id, 2
    ) y
    JOIN loc l ON l.id = y.location_id
),

-- ---------------------------------------------------------------------------
-- 8. PATIENTS WITH NO LOCATION LINK.
--
--    CORRECTED 2026-09-08. THIS SECTION'S HEADER SAID SOMETHING FALSE AND THE
--    FALSE SENTENCE IS WHAT MADE IT LOOK LIKE THE URGENT ONE:
--      ~~"PL-09 scopes patient visibility by `patient_locations`, so a patient
--      with no row there is a patient reception at neither clinic can find."~~
--    PL-09 DOES NOT SCOPE BY THIS TABLE. `patientLocationScope`
--    (apps/web/lib/patients/scope.ts) and 0047's `patients_select` policy both
--    scope a patient to a clinic by `appointments.location_id` OR
--    `patients.primary_location_id`. NOTHING IN THE REPO READS
--    `patient_locations`: no policy names it, no query selects from it, and the
--    four application references are a hard delete, a location delete and
--    `merge_patients`' re-point. A missing link row hides nobody.
--
--    SO WHAT DOES THIS SECTION FIND? THE APPLICATION'S OWN OUTPUT, and that is
--    worth more than what it was believed to find. The importer ALWAYS writes
--    the link - `importPatient`/`insertChunk` insert one row per resolved
--    `locationKeys` entry, and the Fisiozero adapter always emits exactly one -
--    so a live patient with no link row did not come from an import. Until
--    PL-34 no application path wrote the table at all, which is how a defect in
--    the CREATE path was found by an instrument pointed at the IMPORT.
--
--    THE QUESTION IT WAS BELIEVED TO ANSWER IS SECTION 8b, BELOW.
-- ---------------------------------------------------------------------------
s8 AS (
  SELECT 8 AS k, row_number() OVER (ORDER BY p.patient_number NULLS LAST, p.id) AS k2,
         '8. NO-LOCATION  patient_number=' ||
         coalesce(p.patient_number::text, '(none)') ||
         '  id=' || p.id::text ||
         '  appts=' || (SELECT count(*) FROM appointments a WHERE a.patient_id = p.id)::text AS line
    FROM patients p, tenant t
   WHERE p.tenant_id = t.tenant_id
     AND p.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM patient_locations pl WHERE pl.patient_id = p.id)
   ORDER BY p.patient_number NULLS LAST, p.id
   LIMIT 300
),

-- ---------------------------------------------------------------------------
-- 8b. THE PATIENTS WHO REALLY ARE ON NOBODY'S SCREEN. Added 2026-09-08 with
--     the correction above, because the question section 8 was believed to
--     answer is a real and urgent question and had no instrument.
--
--     THE PREDICATE IS THE NEGATION OF `patientLocationScope`, both arms:
--     no appointment at any location (as primary OR secondary participant),
--     AND `primary_location_id` IS NULL. Such a patient is returned by neither
--     arm for ANY located reception or admin - not in the list, not in the
--     search, and `getPatient` returns null so the detail page 404s.
--
--     WHO CAN STILL SEE THEM, which is why nobody reports it: the owner (not
--     location-restricted), an UNASSIGNED reception/admin (scope null falls
--     back to tenant-wide by design), and the therapist who created them
--     (`therapistPatientScope`'s `created_by` arm). So the desk that produced
--     the row is the one place it looks fine.
--
--     `created_by` IS PRINTED because it is the diagnosis, not decoration: a
--     block of these sharing one creator is a screen that stopped asking for a
--     clinic, which is exactly what PL-34 found on /consultation.
-- ---------------------------------------------------------------------------
s8b AS (
  SELECT 8 AS k, 200000 + row_number() OVER (ORDER BY p.created_at, p.id) AS k2,
         '8b. INVISIBLE  patient_number=' ||
         coalesce(p.patient_number::text, '(none)') ||
         '  id=' || p.id::text ||
         '  created=' || to_char(p.created_at, 'YYYY-MM-DD') ||
         '  created_by=' || coalesce(p.created_by::text, '(null)') AS line
    FROM patients p, tenant t
   WHERE p.tenant_id = t.tenant_id
     AND p.deleted_at IS NULL
     AND p.primary_location_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM appointments a
        WHERE a.patient_id = p.id OR a.patient_2_id = p.id
     )
   ORDER BY p.created_at, p.id
   LIMIT 300
),
s8btot AS (
  SELECT 8 AS k, 299999 AS k2,
         '8b. INVISIBLE  TOTAL ' || count(*)::text ||
         '   (no appointment anywhere AND primary_location_id IS NULL)' AS line
    FROM patients p, tenant t
   WHERE p.tenant_id = t.tenant_id
     AND p.deleted_at IS NULL
     AND p.primary_location_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM appointments a
        WHERE a.patient_id = p.id OR a.patient_2_id = p.id
     )
),

-- ---------------------------------------------------------------------------
-- 9. PATIENTS WHO LANDED WITH NO HISTORY AT ALL. The PARTIAL-ARRIVAL section,
--    and the one the owner named as the real risk: a patient row that exists,
--    is searchable, looks complete, and carries none of the appointments or
--    records the source had for them.
--
--    IT IS NOT A DEFECT ON ITS OWN. A genuinely new patient has no history
--    either. What makes a line here worth checking is that the patient CAME
--    FROM THE IMPORT - which the ledger join proves - so the source had
--    something for them by definition.
-- ---------------------------------------------------------------------------
s9 AS (
  SELECT 9 AS k, row_number() OVER (ORDER BY p.patient_number NULLS LAST, p.id) AS k2,
         '9. NO-HISTORY  patient_number=' || coalesce(p.patient_number::text, '(none)') ||
         '  id=' || p.id::text ||
         '  source_id=' || m.source_id ||
         '  appts=0 records=0' AS line
    FROM migration_staging_rows m
    JOIN tenant t ON m.tenant_id = t.tenant_id
    JOIN patients p ON p.id = m.imported_entity_id AND p.deleted_at IS NULL
   WHERE m.entity_type = 'patient'
     AND m.status = 'imported'
     AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM clinical_records c WHERE c.patient_id = p.id)
   ORDER BY p.patient_number NULLS LAST, p.id
   LIMIT 300
),
s9tot AS (
  SELECT 9 AS k, 100000 AS k2,
         '9. NO-HISTORY  TOTAL ' || count(*)::text AS line
    FROM migration_staging_rows m
    JOIN tenant t ON m.tenant_id = t.tenant_id
    JOIN patients p ON p.id = m.imported_entity_id AND p.deleted_at IS NULL
   WHERE m.entity_type = 'patient' AND m.status = 'imported'
     AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM clinical_records c WHERE c.patient_id = p.id)
),

-- ---------------------------------------------------------------------------
-- 10. A PATIENT WHOSE APPOINTMENTS ARE AT A CLINIC THEY ARE NOT LINKED TO.
--     The other half of section 8: the link table and the history disagree.
--     This is what BLOCK 22's backfill exists to prevent and what it looks like
--     when it did not cover a row.
--
--     CORRECTED 2026-09-08, same correction as section 8:
--       ~~"so the patient is invisible at exactly the clinic that treated them"~~
--     THEY ARE NOT INVISIBLE. An appointment at that clinic is the FIRST arm of
--     `patientLocationScope` and of 0047's policy, so a patient treated there is
--     visible there BECAUSE of the appointment, link row or no link row. What
--     this section finds is the link table falling behind the history - real
--     drift, and the thing to fix before anything starts reading the table, but
--     not a person nobody can find.
-- ---------------------------------------------------------------------------
s10 AS (
  SELECT 10 AS k, row_number() OVER (ORDER BY p.patient_number NULLS LAST, p.id, l.name) AS k2,
         '10. UNLINKED-AT-CLINIC  patient_number=' || coalesce(p.patient_number::text, '(none)') ||
         '  id=' || p.id::text ||
         '  treated_at=' || l.name ||
         '  appts_there=' || cnt.n::text AS line
    FROM (
      SELECT a.patient_id, a.location_id, count(*) AS n
        FROM appointments a JOIN tenant t ON a.tenant_id = t.tenant_id
       GROUP BY a.patient_id, a.location_id
    ) cnt
    JOIN patients p ON p.id = cnt.patient_id AND p.deleted_at IS NULL
    JOIN loc l ON l.id = cnt.location_id
   WHERE NOT EXISTS (
     SELECT 1 FROM patient_locations pl
      WHERE pl.patient_id = cnt.patient_id AND pl.location_id = cnt.location_id
   )
   ORDER BY p.patient_number NULLS LAST, p.id, l.name
   LIMIT 300
),

-- ---------------------------------------------------------------------------
-- 11. SCHEDULING ARTEFACTS IN `patients`.
--
--     Reception at Fisiozero blocked a slot by booking a fake patient, because
--     the old system had no block feature. Those rows are now patients: they
--     are in the counts, in search, in statistics, in the recovery list, and
--     they CAN RECEIVE AN ONLINE BOOKING - one did, at CB.
--
--     THE PATTERN IS MATCHED ON THE NAME AND NOTHING ELSE, because nothing else
--     distinguishes them: there is no `is_placeholder` column and the import
--     had no reason to invent one. The match is deliberately WIDER than "NAO
--     MARCAR" - it covers the accented and unspaced spellings, and the other
--     words a reception desk uses to block time - and it prints every hit for
--     the owner to read rather than deciding anything itself.
--
--     FALSE POSITIVES ARE THE POINT OF PRINTING THE NAME. "Marcar" appears in
--     ordinary Portuguese, and a real person could conceivably be caught. A
--     count would hide that; a list cannot.
-- ---------------------------------------------------------------------------
s11 AS (
  SELECT 11 AS k, row_number() OVER (ORDER BY p.full_name, p.id) AS k2,
         '11. ARTEFACT?  name="' || p.full_name || '"' ||
         '  id=' || p.id::text ||
         '  number=' || coalesce(p.patient_number::text, '(none)') ||
         '  phone=' || CASE WHEN p.phone_e164 IS NULL THEN 'none' ELSE 'set' END ||
         '  nif='   || CASE WHEN p.nif IS NULL THEN 'none' ELSE 'set' END ||
         '  dob='   || CASE WHEN p.date_of_birth IS NULL THEN 'none' ELSE 'set' END ||
         '  appts=' || (SELECT count(*) FROM appointments a WHERE a.patient_id = p.id)::text ||
         '  future_appts=' || (SELECT count(*) FROM appointments a
                                WHERE a.patient_id = p.id AND a.starts_at >= now())::text ||
         '  records=' || (SELECT count(*) FROM clinical_records c WHERE c.patient_id = p.id)::text ||
         '  portal_bookings=' || (SELECT count(*) FROM appointments a
                                   WHERE a.patient_id = p.id AND a.origin <> 'staff')::text AS line
    FROM patients p, tenant t
   WHERE p.tenant_id = t.tenant_id
     AND p.deleted_at IS NULL
     -- `~*` is case-insensitive; the character classes cover the accented
     -- spellings without needing the `unaccent` extension, which this database
     -- is not known to have and which a report must not require.
     AND (
          p.full_name ~* 'n[aãáâ]o[[:space:]._-]*marcar'
       OR p.full_name ~* '^[[:space:]]*(bloque|bloqu|reserv|indispon)'
       OR p.full_name ~* '\m(ferias|f[eé]rias|almo[cç]o|pausa|reuni[aã]o|intervalo|feriado)\M'
       OR p.full_name ~* '^[[:space:]]*(teste|test|x+|-+|\.+)[[:space:]]*$'
       OR p.full_name ~* '\m(nao|n[aã]o)[[:space:]]+(usar|utilizar|mexer)\M'
     )
   ORDER BY p.full_name, p.id
   LIMIT 300
),

-- ---------------------------------------------------------------------------
-- 12. THE SERVICE CATALOGUE AND WHAT THE PUBLIC FORM CAN OFFER.
--
--     THE RULE, from apps/api/app/api/v1/booking/guest/catalog/route.ts, and it
--     is FOUR predicates plus a price row, not three:
--       is_active AND NOT internal_only AND patient_bookable
--       AND an ACTIVE service_location_prices row AT AN ACTIVE LOCATION
--     (GUEST-08, owner ruling 2026-08-19: "offered only where priced").
--
--     `offered_at` below computes exactly that, per service, so "Diversos"
--     answers the question with a row rather than with an argument.
-- ---------------------------------------------------------------------------
s12 AS (
  SELECT 12 AS k, row_number() OVER (ORDER BY s.name) AS k2,
         '12. SERVICE  ' || rpad(left(s.name, 34), 34) ||
         ' id=' || s.id::text ||
         ' active=' || s.is_active::text ||
         ' internal_only=' || s.internal_only::text ||
         ' patient_bookable=' || s.patient_bookable::text ||
         ' service.location_id=' || coalesce((SELECT l.name FROM loc l WHERE l.id = s.location_id), '(null=all)') ||
         ' priced_at=[' || coalesce((
             SELECT string_agg(l.name, ',' ORDER BY l.name)
               FROM service_location_prices slp
               JOIN loc l ON l.id = slp.location_id AND l.is_active
              WHERE slp.service_id = s.id AND slp.is_active
           ), '') || ']' ||
         ' PUBLIC_FORM_OFFERS=' || (
             s.is_active AND NOT s.internal_only AND s.patient_bookable
             AND EXISTS (SELECT 1 FROM service_location_prices slp
                          JOIN loc l ON l.id = slp.location_id AND l.is_active
                         WHERE slp.service_id = s.id AND slp.is_active)
           )::text AS line
    FROM services s, tenant t
   WHERE s.tenant_id = t.tenant_id
   ORDER BY s.name
),

-- ---------------------------------------------------------------------------
-- 13. BOOKINGS THAT CAME THROUGH A PATIENT-FACING PATH, per location, per
--     service. `origin <> 'staff'` is 0067's own discriminator.
--
--     THIS IS WHERE THE CB BOOKING ON A "DIVERSOS" SLOT SHOWS UP, and reading
--     it beside section 12 is the whole point: if section 12 says
--     PUBLIC_FORM_OFFERS=false for that service and a row appears here anyway,
--     the booking did not come through the catalogue - and the guest POST route
--     validates `serviceId` as a non-empty string and nothing else.
-- ---------------------------------------------------------------------------
s13 AS (
  SELECT 13 AS k, row_number() OVER (ORDER BY l.name, coalesce(s.name, '(none)')) AS k2,
         '13. PATIENT-ORIGIN BOOKING  ' || rpad(l.name, 18) ||
         ' service=' || rpad(left(coalesce(s.name, '(none)'), 30), 30) ||
         ' origin=' || rpad(a.origin, 16) ||
         ' n=' || count(*)::text ||
         ' first=' || to_char(min(a.starts_at) AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') ||
         ' last='  || to_char(max(a.starts_at) AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') AS line
    FROM appointments a
    JOIN tenant t ON a.tenant_id = t.tenant_id
    JOIN loc l ON l.id = a.location_id
    LEFT JOIN services s ON s.id = a.service_id
   WHERE a.origin <> 'staff'
   GROUP BY l.name, s.name, a.origin
),

-- ---------------------------------------------------------------------------
-- 13b. EVERY PATIENT-ORIGIN BOOKING, ONE LINE EACH, NEWEST FIRST.
--
--      Section 13 aggregates and this itemises, because the owner is looking
--      for ONE booking: a CB slot taken online on 07/09/2026 at 08:00 against a
--      patient whose name is a scheduling artefact. An aggregate cannot show
--      him that row and a total cannot be checked against his screen.
--
--      `patient_looks_like_artefact` re-applies section 11's pattern to THIS
--      row's patient, so the two questions - "which bookings came from a
--      patient-facing path" and "which of them landed on a fake patient" - are
--      answered on one line instead of by eye across two lists.
-- ---------------------------------------------------------------------------
s13b AS (
  SELECT 13 AS k, 1000 + row_number() OVER (ORDER BY a.starts_at DESC) AS k2,
         '13b. BOOKING  ' || to_char(a.starts_at AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') ||
         '  ' || rpad(l.name, 18) ||
         '  origin=' || rpad(a.origin, 16) ||
         '  status=' || rpad(a.status::text, 11) ||
         '  service=' || rpad(left(coalesce(s.name, '(none)'), 26), 26) ||
         '  patient="' || p.full_name || '"' ||
         '  patient_looks_like_artefact=' || (
            p.full_name ~* 'n[aãáâ]o[[:space:]._-]*marcar'
         OR p.full_name ~* '^[[:space:]]*(bloque|bloqu|reserv|indispon)'
         OR p.full_name ~* '\m(ferias|f[eé]rias|almo[cç]o|pausa|reuni[aã]o|intervalo|feriado)\M'
         OR p.full_name ~* '^[[:space:]]*(teste|test|x+|-+|\.+)[[:space:]]*$'
         OR p.full_name ~* '\m(nao|n[aã]o)[[:space:]]+(usar|utilizar|mexer)\M'
         )::text AS line
    FROM appointments a
    JOIN tenant t ON a.tenant_id = t.tenant_id
    JOIN loc l ON l.id = a.location_id
    JOIN patients p ON p.id = a.patient_id
    LEFT JOIN services s ON s.id = a.service_id
   WHERE a.origin <> 'staff'
   ORDER BY a.starts_at DESC
   LIMIT 200
),

-- ---------------------------------------------------------------------------
-- 14. GUEST BOOKING REQUESTS, per location and status. The queue reception
--     converts from; a request naming a service the form should not have
--     offered is visible here before it becomes an appointment.
-- ---------------------------------------------------------------------------
s14 AS (
  SELECT 14 AS k, row_number() OVER (ORDER BY l.name, g.status) AS k2,
         '14. GUEST REQUEST  ' || rpad(l.name, 18) ||
         ' status=' || rpad(g.status, 12) ||
         ' service=' || rpad(left(coalesce(s.name, '(none)'), 30), 30) ||
         ' n=' || lpad(count(*)::text, 5) ||
         -- STATUS IS NOT THE SAME QUESTION AS handled_at, and reading only the
         -- first is how an open queue looks empty. `dismissGuestRequest`
         -- REFUSES a request that was never converted, so an unwanted request
         -- can never be cleared and sits at status='pending' with handled_at
         -- NULL forever. These two columns are what make that visible.
         ' unhandled=' || lpad(count(*) FILTER (WHERE g.handled_at IS NULL)::text, 5) ||
         ' converted=' || lpad(count(*) FILTER (WHERE g.converted_patient_id IS NOT NULL)::text, 5) AS line
    FROM guest_booking_requests g
    JOIN tenant t ON g.tenant_id = t.tenant_id
    JOIN loc l ON l.id = g.location_id
    LEFT JOIN services s ON s.id = g.service_id
   GROUP BY l.name, g.status, s.name
)

SELECT line
  FROM (
    SELECT k, k2, line FROM s0
    UNION ALL SELECT k, k2, line FROM s1
    UNION ALL SELECT k, k2, line FROM s2
    UNION ALL SELECT k, k2, line FROM s3
    UNION ALL SELECT k, k2, line FROM s4
    UNION ALL SELECT k, k2, line FROM s4b
    UNION ALL SELECT k, k2, line FROM s5
    UNION ALL SELECT k, k2, line FROM s6_pat
    UNION ALL SELECT k, k2, line FROM s6_pat_tot
    UNION ALL SELECT k, k2, line FROM s6_appt
    UNION ALL SELECT k, k2, line FROM s6_cr
    UNION ALL SELECT k, k2, line FROM s6_att
    UNION ALL SELECT k, k2, line FROM s6_att_tot
    UNION ALL SELECT k, k2, line FROM s6_packs
    UNION ALL SELECT k, k2, line FROM s6_pack_prices
    UNION ALL SELECT k, k2, line FROM s6_inst
    UNION ALL SELECT k, k2, line FROM s7
    UNION ALL SELECT k, k2, line FROM s7y
    UNION ALL SELECT k, k2, line FROM s8
    UNION ALL SELECT k, k2, line FROM s8b
    UNION ALL SELECT k, k2, line FROM s8btot
    UNION ALL SELECT k, k2, line FROM s9
    UNION ALL SELECT k, k2, line FROM s9tot
    UNION ALL SELECT k, k2, line FROM s10
    UNION ALL SELECT k, k2, line FROM s11
    UNION ALL SELECT k, k2, line FROM s12
    UNION ALL SELECT k, k2, line FROM s13
    UNION ALL SELECT k, k2, line FROM s13b
    UNION ALL SELECT k, k2, line FROM s14
  ) report
 ORDER BY k, k2;
