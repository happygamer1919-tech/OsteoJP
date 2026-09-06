-- ===================================================================
-- THE WRITE. Production, ONLY after the pre-check. PACK-05.
-- ===================================================================
-- OWNER RULING 2026-09-06: "RETIRE BOTH PRODUCTS. Deactivate be8ec147 and
-- e291d05f so neither can be sold while bound to a service archived to '-'.
-- Nobody has bought either. Deactivating is reversible."
--
--   set -o allexport && source /Users/ivan/osteojp-secrets/new-prod.env && \
--   set +o allexport && \
--   node scripts/assert-production-target.mjs && \
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -f scripts/pack05-retire-apply.sql
--
-- ===================================================================
-- IT REFUSES RATHER THAN GUESSES, IN FIVE WAYS
-- ===================================================================
-- One transaction; ON_ERROR_STOP=1 plus RAISE EXCEPTION means a refusal leaves
-- the database exactly as it was. Same shape as the PACK-04 repoint.
--
--   1. THE IDS ARE PINNED. The UPDATE names both rows explicitly. It cannot
--      reach a third product however the catalogue changes.
--   2. THE FROM-VALUE IS PINNED. `AND sp.is_active` - it can only ever
--      deactivate something currently ACTIVE. Running this a second time after
--      a successful apply aborts with "0 rows", loudly, because a second run
--      means somebody's model of the state is wrong.
--   3. THE ROW COUNT IS PINNED to exactly 2. One row missing, renamed away or
--      already retired, and this aborts rather than doing half the ruling.
--   4. NO PATIENT MAY HOLD EITHER. THIS IS THE RULING'S OWN STOP CONDITION and
--      the reason it is in the transaction rather than only in the pre-check: if
--      an instance exists, money has moved, the decision becomes JP's, and this
--      file must not be the thing that took it. Checked at write time, not at
--      read time, so a purchase between the two commands cannot slip through.
--   5. BOTH MUST STILL SIT ON AN ARCHIVED SERVICE. If somebody has repointed one
--      to a live service in the meantime, retiring it is no longer the ruling -
--      it is destroying work somebody just did.
--
-- WHAT IT DELIBERATELY DOES NOT DO: touch `services`. The two archived rows stay
-- archived and stay orphaned. That is the END STATE the owner ruled, not a
-- leftover: a service nobody sells is inert, and repointing it is JP's separate
-- decision with his commercial knowledge. It also does not DELETE the packs -
-- a retired product is a record that the clinic once sold it.

\pset pager off
\pset format aligned

BEGIN;

\echo '=== BEFORE ==='
SELECT sp.id, sp.name, sp.is_active AS pack_active, sp.price_cents,
       sv.name AS base_service_name, sv.is_active AS base_active
  FROM public.service_packs sp
  JOIN public.services sv ON sv.id = sp.base_service_id
 WHERE sp.id IN ('be8ec147-56f5-4c3f-a642-ebfb31e915f4'::uuid,
                 'e291d05f-899f-40d3-89af-c8537c4afdad'::uuid)
 ORDER BY sp.name;

DO $$
DECLARE
  v_ids      uuid[] := ARRAY['be8ec147-56f5-4c3f-a642-ebfb31e915f4'::uuid,
                             'e291d05f-899f-40d3-89af-c8537c4afdad'::uuid];
  v_target   int;
  v_holders  int;
BEGIN
  -- Refusals 2, 3 and 5 in one count: active, still on an archived service.
  SELECT count(*) INTO v_target
    FROM public.service_packs sp
    JOIN public.services sv ON sv.id = sp.base_service_id
   WHERE sp.id = ANY(v_ids) AND sp.is_active AND NOT sv.is_active;
  IF v_target <> 2 THEN
    RAISE EXCEPTION
      'REFUSED: % of the two products are active AND still on an archived service, expected exactly 2.', v_target
      USING HINT = 'A row is already retired, gone, or has been repointed to a LIVE service since the read. '
                   'Re-run the pre-check and look before forcing anything.';
  END IF;

  -- Refusal 4: the ruling's own stop condition.
  SELECT count(*) INTO v_holders
    FROM public.patient_pack_instances ppi
   WHERE ppi.pack_id = ANY(v_ids);
  IF v_holders <> 0 THEN
    RAISE EXCEPTION
      'REFUSED: % patient instance(s) exist against these products. NOT RETIRING.', v_holders
      USING HINT = 'Money has moved. The owner ruled on products NOBODY had bought; this is now JP''s '
                   'decision, not his. Report and stop.';
  END IF;
END
$$;

UPDATE public.service_packs
   SET is_active  = false,
       updated_at = now()
 WHERE id IN ('be8ec147-56f5-4c3f-a642-ebfb31e915f4'::uuid,
              'e291d05f-899f-40d3-89af-c8537c4afdad'::uuid)
   AND is_active;

\echo ''
\echo '=== AFTER. Both pack_active must read f. ==='
SELECT sp.id, sp.name, sp.is_active AS pack_active,
       sv.name AS base_service_name, sv.is_active AS base_active
  FROM public.service_packs sp
  JOIN public.services sv ON sv.id = sp.base_service_id
 WHERE sp.id IN ('be8ec147-56f5-4c3f-a642-ebfb31e915f4'::uuid,
                 'e291d05f-899f-40d3-89af-c8537c4afdad'::uuid)
 ORDER BY sp.name;

\echo ''
\echo '=== NOTHING SELLABLE IS LEFT ON AN ARCHIVED SERVICE. Must be 0. ==='
SELECT count(*) AS active_packs_on_archived_services
  FROM public.service_packs sp
  JOIN public.services sv ON sv.id = sp.base_service_id
 WHERE sp.is_active AND NOT sv.is_active;

\echo ''
\echo '=== AND NO PATIENT LOST ANYTHING: instances against these two, still 0. ==='
SELECT count(*) AS instances_against_the_two
  FROM public.patient_pack_instances
 WHERE pack_id IN ('be8ec147-56f5-4c3f-a642-ebfb31e915f4'::uuid,
                   'e291d05f-899f-40d3-89af-c8537c4afdad'::uuid);

COMMIT;
