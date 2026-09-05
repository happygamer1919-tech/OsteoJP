-- ===================================================================
-- THE WRITE. Run by the OWNER, on production, ONLY after the pre-check.
-- ===================================================================
-- PACK-04 (a). Owner ruling 2026-09-05: "Repoint that pacote to the live NESA
-- (270fb115)."
--
--   set -o allexport && source /Users/ivan/osteojp-secrets/new-prod.env && \
--   set +o allexport && \
--   node scripts/assert-production-target.mjs && \
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -f scripts/pack04-repoint-apply.sql
--
-- ===================================================================
-- IT REFUSES RATHER THAN GUESSES, IN FOUR WAYS
-- ===================================================================
-- This is a patient-data write on a live clinic and the whole thing runs in ONE
-- transaction that aborts on any surprise. `ON_ERROR_STOP=1` plus a RAISE
-- EXCEPTION means a refusal leaves the database exactly as it was.
--
--   1. THE FROM-VALUE IS PINNED. The UPDATE's WHERE names the archived id, so
--      it can only ever move a row that is still bound to the archived service.
--      REHEARSED: running this file a second time after a successful apply
--      aborts with "REFUSED: 0 service_packs rows are bound to the archived
--      service, expected exactly 1" and writes nothing. That is louder than a
--      silent no-op on purpose - a second run means somebody's model of the
--      state is wrong, and saying so is worth an alarming message.
--   2. THE ROW COUNT IS PINNED to exactly 1. If a second pacote has since been
--      bound to the archived service, this aborts rather than repointing both -
--      the owner ruled on ONE pacote and a second one is a new decision.
--   3. THE TARGET MUST BE LIVE. If 270fb115 is not is_active, this aborts. The
--      entire defect is a pacote bound to a service that is not live; repeating
--      it against a different row would be absurd.
--   4. THE TARGET MUST EXIST IN THIS TENANT. A cross-tenant repoint is refused
--      explicitly rather than left to the FK, which would allow it.
--
-- WHAT IT DELIBERATELY DOES NOT DO: touch `patient_pack_instances`. Balances are
-- DERIVED (sessions_total - legacy_consumed - linked appointments), so the
-- sessions follow the binding on their own. Any write to an instance here would
-- be inventing a number.

\pset pager off
\pset format aligned

BEGIN;

\echo '=== BEFORE ==='
SELECT sp.id, sp.name, sp.base_service_id, sv.name AS base_service_name, sv.is_active
  FROM public.service_packs sp
  JOIN public.services sv ON sv.id = sp.base_service_id
 WHERE sp.base_service_id = '7e3359a7-219c-44c7-a84d-0dc38373b1b0'::uuid;

DO $$
DECLARE
  v_from  uuid := '7e3359a7-219c-44c7-a84d-0dc38373b1b0';
  v_to    uuid := '270fb115-154a-4c4e-a2f7-f4976c71cfbd';
  v_packs int;
  v_ok    int;
BEGIN
  SELECT count(*) INTO v_packs FROM public.service_packs WHERE base_service_id = v_from;
  IF v_packs <> 1 THEN
    RAISE EXCEPTION
      'REFUSED: % service_packs rows are bound to the archived service, expected exactly 1.', v_packs
      USING HINT = 'The owner ruled on ONE pacote. A second binding is a new decision, not this one.';
  END IF;

  SELECT count(*) INTO v_ok
    FROM public.services tgt
    JOIN public.service_packs sp ON sp.base_service_id = v_from
   WHERE tgt.id = v_to
     AND tgt.is_active
     AND tgt.tenant_id = sp.tenant_id;
  IF v_ok <> 1 THEN
    RAISE EXCEPTION
      'REFUSED: the target service is missing, not active, or in another tenant.'
      USING HINT = 'Repointing a pacote at a non-live service is the defect being repaired.';
  END IF;
END
$$;

UPDATE public.service_packs
   SET base_service_id = '270fb115-154a-4c4e-a2f7-f4976c71cfbd'::uuid,
       updated_at      = now()
 WHERE base_service_id = '7e3359a7-219c-44c7-a84d-0dc38373b1b0'::uuid;

\echo ''
\echo '=== AFTER. base_service_name must read NESA and is_active must be t. ==='
SELECT sp.id, sp.name, sp.base_service_id, sv.name AS base_service_name, sv.is_active
  FROM public.service_packs sp
  JOIN public.services sv ON sv.id = sp.base_service_id
 WHERE sp.id IN (SELECT id FROM public.service_packs
                  WHERE base_service_id = '270fb115-154a-4c4e-a2f7-f4976c71cfbd'::uuid);

\echo ''
\echo '=== NOTHING IS LEFT BOUND TO THE ARCHIVED ROW. Must be 0. ==='
SELECT count(*) AS still_bound_to_archived
  FROM public.service_packs
 WHERE base_service_id = '7e3359a7-219c-44c7-a84d-0dc38373b1b0'::uuid;

COMMIT;
