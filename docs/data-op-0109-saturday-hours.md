NOT READY: draft, awaiting its own R4 review and strategy's ruling on when it runs
# Saturday hours: each active clinic opens 09:00 and closes 13:00 on Saturday

**A DRAFT. Nothing in this document may be pasted, and it has no pasteable block yet.** The SQL below is the shape of the operation, written in `sql` fences so no reader takes it for a block GREEN runs. The blocks are authored after the ruling, in the form of `docs/migration-apply-0109.md` (explicit halts, never `set -e`, the HEAD CHECK, the target guard, the weekday clock, a fault-injection test), with their own sidecar.

**Status: NOT RUN. NOT REHEARSED. NOT REVIEWED.** A DATA operation, not a migration: no schema change, no journal entry, no `drizzle-kit`.

**Authored by SOLO. Run by GREEN,** a fresh apply-only session, on the owner's dispatch naming this operation by filename (`CLAUDE.md`, "Who applies migrations"). The lane that wrote it never runs it.

## What must happen first, and none of it by GREEN

1. **0109 is applied to production**, and GREEN has reported `0109 POST-CHECK PASSED` and the closing read (journal 107). This operation writes the two columns 0109 creates; on a database without them its pre-check stops (psql exits 3 on the missing column).
2. **Its own R4 round** on this document, its SQL files and its blocks, once they exist. It is Tier C (a production data op), held, with a question block.
3. **Strategy's ruling on WHEN it runs.** The default is its own sitting, on a later closed night than 0109's, because R38 gives 0109 its own night ("never with another apply"). It may follow the migration in the same sitting **only if strategy rules so in those words**; nothing in this document assumes it.
4. **The answers to the three questions** at the end, and the dispatch's two clinic ids.
5. **The rehearsal** on a throwaway at production's position after 0109 (two active clinics, both NULL in both columns), by a session that did not write it.

## What it does, and what it never touches

| Fact | Value |
|---|---|
| Ruling | The owner, 2026-10-31: "Saturday hours per clinic: 9am to 1pm, sunday closed." |
| The values | `saturday_opens_at` **09:00**, `saturday_closes_at` **13:00**, on every active clinic. They satisfy `locations_saturday_hours_valid` (both set, closing after opening) |
| The clinics | **Exactly the clinics GREEN's dispatch names, by id, as `LV_ID` and `CB_ID`.** `docs/data-op-location-hours.md` records production's two clinics as Linda-a-Velha `de000002-0000-0000-0000-000000000001` and Castelo Branco `de000002-0000-0000-0000-000000000002`; this author did not read them on production. The pre-check proves the dispatch's ids are both active, of one tenant, and the ONLY active clinics, so "every active clinic" is a fact the database confirms rather than a list this document asserts |
| What the write changes | `saturday_opens_at` and `saturday_closes_at` on exactly **2** rows, and only rows where both are NULL. Plus, if Q2 is answered that way, one `audit_log` row per clinic |
| What it never touches | the weekday hours (`opens_at`, `closes_at`), the midday closure, `is_active`, any other location, any appointment, any Horarios row, any user |

**What changes for people.** On the **staff side**, a therapist with no Horarios rows becomes bookable on Saturday from 09:00 to 13:00 at their clinic by default (HOR-01's rule, `apps/web/lib/scheduling/effective-availability.ts`, which reads the columns only once both exist). By the 10-31 HOR count that is **two therapists at Linda-a-Velha** (the dispatch's number; this author did not re-measure it). A therapist WITH Horarios rows is unchanged: their own rows decide. **On the patient portal, nothing changes:** the portal (`apps/api`) keeps its own SQL over `availability_templates` and does not read these columns (the effective-availability module says so, pinned by `apps/api/lib/appointments/portal-default-hours-off.db.test.ts`). **The agenda** shows the change within a minute: its reference data is cached for 60 seconds and nothing invalidates it on a SQL write (the same note `docs/data-op-location-hours.md` makes).

**Castelo Branco's midday closure (13:00 to 14:00)** does not overlap a Saturday that ends at 13:00, so no closure question arises. There is no Saturday closure column.

## The clock

Closed hours only, by the same weekday table as 0109 (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed), read by machine with `TZ=Europe/Lisbon` and a STOP unless the zone is WET or WEST. Not R9-eligible: it writes a table every booking read joins, and its pre-check has not run on production in an earlier sitting.

## The pre-check (READ ONLY), as drafted

Run inside the block's own `begin read only`, with `-v lv_id=... -v cb_id=...` from the dispatch. Every verdict OK or FAIL; the block requires the whole profile, `9 OK / 0 VACUOUS / 0 FAIL`, and carries `rows_before` and `weekday_md5` to the write and the post-check.

```sql
\if :{?lv_id}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v lv_id is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?cb_id}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v cb_id is missing. This file refuses to guess.'; END $missing$;
\endif
SET LOCAL row_security = off;

WITH named AS (
  SELECT unnest(ARRAY[(:'lv_id')::uuid, (:'cb_id')::uuid]) AS id
), j AS (
  SELECT
    current_setting('transaction_read_only')                                                     AS ro,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = 'ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a')           AS has_0109,
    (SELECT count(*)::int FROM pg_attribute a
      WHERE a.attrelid = 'public.locations'::regclass AND NOT a.attisdropped
        AND a.attname IN ('saturday_opens_at', 'saturday_closes_at'))                            AS cols,
    (SELECT count(*)::int FROM pg_constraint c
      WHERE c.conrelid = 'public.locations'::regclass AND c.conname = 'locations_saturday_hours_valid') AS con,
    (SELECT count(DISTINCT id)::int FROM named)                                                  AS distinct_named,
    (SELECT count(*)::int FROM public.locations l JOIN named n ON n.id = l.id WHERE l.is_active) AS named_active,
    (SELECT count(DISTINCT l.tenant_id)::int FROM public.locations l JOIN named n ON n.id = l.id) AS named_tenants,
    (SELECT count(*)::int FROM public.locations l
      WHERE l.is_active AND l.id NOT IN (SELECT id FROM named))                                   AS other_active,
    (SELECT count(*)::int FROM public.locations l
      WHERE l.saturday_opens_at IS NOT NULL OR l.saturday_closes_at IS NOT NULL)                  AS already_set,
    (SELECT count(*)::int FROM public.locations)                                                 AS rows_before,
    (SELECT md5(string_agg(l.id::text || ':' || l.opens_at::text || ':' || l.closes_at::text || ':'
                || coalesce(l.midday_closed_from::text, '-') || ':' || coalesce(l.midday_closed_to::text, '-')
                || ':' || l.is_active::text, ';' ORDER BY l.id))
       FROM public.locations l)                                                                  AS weekday_md5,
    (SELECT string_agg(l.name || ' ' || to_char(l.opens_at, 'HH24:MI') || '-' || to_char(l.closes_at, 'HH24:MI'), '; ' ORDER BY l.id)
       FROM public.locations l JOIN named n ON n.id = l.id)                                       AS named_profile
)
SELECT '0. READ ONLY' AS "check", ro AS observed, CASE WHEN ro = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
UNION ALL SELECT '1. 0109 is in the journal once, by hash', has_0109::text, CASE WHEN has_0109 = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '2. both Saturday columns and the CHECK are there', cols::text || ' columns, ' || con::text || ' CHECK', CASE WHEN cols = 2 AND con = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '3. the dispatch names two different clinics', distinct_named::text, CASE WHEN distinct_named = 2 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '4. both named clinics exist and are active', named_active::text, CASE WHEN named_active = 2 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '5. both are of one tenant', named_tenants::text, CASE WHEN named_tenants = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '6. no other clinic is active, so the two ARE every active clinic', other_active::text, CASE WHEN other_active = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '7. no clinic has a Saturday value yet (a second run stops here)', already_set::text, CASE WHEN already_set = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '8. there are rows to compare (a zero comparand is not a pass)', rows_before::text, CASE WHEN rows_before >= 2 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'rows_before', rows_before::text, 'CARRY' FROM j
UNION ALL SELECT 'weekday_md5', weekday_md5, 'CARRY' FROM j
UNION ALL SELECT 'INFO the two named clinics, weekday hours', named_profile, 'INFO' FROM j;
```

## The write, as drafted

One transaction (`psql -v ON_ERROR_STOP=1 --single-transaction`), refusing before it writes anything unless every guard holds, then writing exactly two rows. The guards repeat the pre-check's verdicts 3 to 7 and compare `rows_before` and `weekday_md5` with this sitting's carries (SR-59), so a database that moved between the stages stops the write.

```sql
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL row_security = off;
SELECT set_config('sathours.lv', :'lv_id', true),
       set_config('sathours.cb', :'cb_id', true),
       set_config('sathours.rows_before', :'rows_before', true),
       set_config('sathours.weekday_md5', :'weekday_md5', true);

DO $write$
DECLARE
  c_opens   constant time := time '09:00';
  c_closes  constant time := time '13:00';
  v_ids     uuid[] := ARRAY[current_setting('sathours.lv')::uuid, current_setting('sathours.cb')::uuid];
  v_n       integer;
  v_md5     text;
BEGIN
  IF (SELECT count(DISTINCT x) FROM unnest(v_ids) AS x) <> 2 THEN
    RAISE EXCEPTION 'STOP: the dispatch does not name two different clinics';
  END IF;
  IF (SELECT count(*) FROM public.locations WHERE id = ANY (v_ids) AND is_active) <> 2 THEN
    RAISE EXCEPTION 'STOP: the two named clinics are not both there and active';
  END IF;
  IF (SELECT count(DISTINCT tenant_id) FROM public.locations WHERE id = ANY (v_ids)) <> 1 THEN
    RAISE EXCEPTION 'STOP: the two named clinics are not of one tenant';
  END IF;
  IF EXISTS (SELECT 1 FROM public.locations WHERE is_active AND id <> ALL (v_ids)) THEN
    RAISE EXCEPTION 'STOP: another clinic is active; the two named are not every active clinic';
  END IF;
  IF EXISTS (SELECT 1 FROM public.locations WHERE saturday_opens_at IS NOT NULL OR saturday_closes_at IS NOT NULL) THEN
    RAISE EXCEPTION 'STOP: a clinic already has a Saturday value; this write has run, or someone else wrote one';
  END IF;
  IF (SELECT count(*) FROM public.locations)::text <> current_setting('sathours.rows_before') THEN
    RAISE EXCEPTION 'STOP: locations no longer holds the rows the pre-check counted; run the pre-check again';
  END IF;
  SELECT md5(string_agg(l.id::text || ':' || l.opens_at::text || ':' || l.closes_at::text || ':'
             || coalesce(l.midday_closed_from::text, '-') || ':' || coalesce(l.midday_closed_to::text, '-')
             || ':' || l.is_active::text, ';' ORDER BY l.id))
    INTO v_md5 FROM public.locations l;
  IF v_md5 IS DISTINCT FROM current_setting('sathours.weekday_md5') THEN
    RAISE EXCEPTION 'STOP: the weekday hours moved since the pre-check; run the pre-check again';
  END IF;

  UPDATE public.locations
     SET saturday_opens_at = c_opens,
         saturday_closes_at = c_closes
   WHERE id = ANY (v_ids) AND is_active
     AND saturday_opens_at IS NULL AND saturday_closes_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'STOP: updated % clinics, expected exactly 2; nothing is kept', v_n;
  END IF;

  -- THE AUDIT ROWS ARE Q2's. Until it is answered, this draft writes none, and the block is not READY.
END
$write$;
```

**The dry-run** is the same write followed by the post-check, inside a transaction the block opens with `begin` and closes with `rollback` (`psql -c "begin" -f <write> -f <post-check> -c "rollback"`): it shows the after-state on production without keeping it. It runs in the same closed-hours window as the write, just before it, and takes the same locks for milliseconds. The write file holds no transaction control of its own, which is what makes both uses safe; the script test will hold it to that.

## The post-check (READ ONLY), as drafted

```sql
SET LOCAL row_security = off;
WITH named AS (
  SELECT unnest(ARRAY[(:'lv_id')::uuid, (:'cb_id')::uuid]) AS id
), j AS (
  SELECT
    current_setting('transaction_read_only') AS ro,
    (SELECT count(*)::int FROM public.locations l JOIN named n ON n.id = l.id
      WHERE l.saturday_opens_at = time '09:00' AND l.saturday_closes_at = time '13:00')            AS named_set,
    (SELECT count(*)::int FROM public.locations l
      WHERE l.id NOT IN (SELECT id FROM named)
        AND (l.saturday_opens_at IS NOT NULL OR l.saturday_closes_at IS NOT NULL))                AS others_set,
    (SELECT count(*)::int FROM public.locations)                                                 AS rows_after,
    (SELECT md5(string_agg(l.id::text || ':' || l.opens_at::text || ':' || l.closes_at::text || ':'
                || coalesce(l.midday_closed_from::text, '-') || ':' || coalesce(l.midday_closed_to::text, '-')
                || ':' || l.is_active::text, ';' ORDER BY l.id))
       FROM public.locations l)                                                                  AS weekday_md5
)
SELECT '0. READ ONLY' AS "check", ro AS observed, CASE WHEN ro = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
UNION ALL SELECT '1. both named clinics read 09:00 to 13:00 on Saturday', named_set::text, CASE WHEN named_set = 2 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '2. no other clinic has a Saturday value', others_set::text, CASE WHEN others_set = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '3. no row came or went', rows_after::text, CASE WHEN rows_after::text = :'rows_before' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '4. the weekday hours, closures and active flags are as before', weekday_md5, CASE WHEN weekday_md5 = :'weekday_md5' THEN 'OK' ELSE 'FAIL' END FROM j;
```

The block requires `5 OK / 0 VACUOUS / 0 FAIL` (plus the audit verdict once Q2 is answered).

## Undoing it

Owner-confirmable, and its own operation with its own ruling, never run from this document: set both columns back to NULL on exactly the two rows, in one statement (the CHECK admits both NULL). The staff side then reads "no Saturday hours" again within a minute; the portal never noticed either way. If Q2 writes audit rows, each carries the values it replaced (both NULL), so the undo is exact.

## Questions for the ruling (blocked_what, options, recommendation)

- **Q1. When it runs.** Options: (a) its own closed night after 0109's report; (b) the same sitting as 0109, after the closing read. **Recommendation: (a).** R38 gives 0109 its own night, and a data op after a migration in one sitting doubles what a single halt can leave half-done. Only a strategy ruling in those words makes (b) possible.
- **Q2. The audit trail.** Options: (a) one `audit_log` row per clinic under a new action `location.saturday_hours_set`, metadata `{card: "HOR-02", source: "psql_data_op", ruling: "owner-saturday-hours-2026-10-31", saturday_opens_at_before, saturday_closes_at_before, saturday_opens_at_after, saturday_closes_at_after}`; (b) the existing `location.hours_set` action with a `day: "saturday"` key; (c) no audit row. **Recommendation: (a).** The hours op of AGENDA-2100 wrote one row per clinic, and the architecture rule asks for an audit row on every permission-sensitive action; a new action keeps the existing op's "has this target run" guard (keyed on `location.hours_set` metadata) from reading Saturday rows. The action vocabulary was not checked against any constraint here; the rehearsal does.
- **Q3. Every active clinic, both of them.** The owner's words are "per clinic", read here as both Linda-a-Velha and Castelo Branco. Options: (a) both; (b) only the clinics the owner names. **Recommendation: (a)**, with the dispatch naming both ids; if Castelo Branco does not open on Saturday, the dispatch names one id and verdicts 3 and 6 are re-drafted for one clinic before any R4 round.
