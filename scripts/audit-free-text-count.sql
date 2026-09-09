-- ===========================================================================
-- HOW MANY AUDIT ROWS ALREADY CARRY FREE TEXT. READ ONLY. Owner-run, production.
-- ===========================================================================
-- COUNTS ONLY. NO CONTENT. Every column below is a count, a key name, an action
-- name or a month. Not one line of this file projects a metadata VALUE, in raw
-- or truncated form, and that is the point of running it as a separate read
-- rather than eyeballing the table: the question is "how much is there", and
-- answering it must not spread the thing being measured.
--
-- WHY IT EXISTS. `writeAppointmentAudit` has always documented its metadata as
-- "IDs, status and ISO timestamps only - never patient PII", and
-- `cancelAppointment` wrote a free-text `reason` into it the whole time. The
-- agenda drawer passes `form.notes` - THE APPOINTMENT'S OWN NOTES FIELD,
-- pre-filled from the row - as that argument, so an existing clinical note about
-- a named patient was copied verbatim into `audit_log` on every cancel taken
-- from the agenda. `audit_log` is APPEND-ONLY AND RETAINED FOR EVER.
--
-- The writer is fixed (it records `hadReason` plus a reference, and the helper
-- now REFUSES prose). This read answers the other half: WHAT IS ALREADY THERE,
-- so strategy can decide whether it needs scrubbing. Nothing here writes.
--
--   set -o allexport && source /Users/ivan/osteojp-secrets/new-prod.env && \
--   set +o allexport && \
--   node scripts/assert-production-target.mjs && \
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -f scripts/audit-free-text-count.sql
--
-- Or paste the whole file into the Supabase SQL editor. It is read-only in both.
--
-- ===========================================================================
-- THE DEFINITION OF "FREE TEXT" IS THE SAME ONE THE CODE NOW ENFORCES.
-- ===========================================================================
-- `apps/web/lib/scheduling/audit.ts` refuses a metadata string that is
--   * longer than 64 characters, OR
--   * contains any whitespace.
-- This file asks those two questions and no others, so the number it returns is
-- exactly the number of rows the new guard would now reject. A second, cleverer
-- definition here would produce a count that answers a different question from
-- the one the code answers, and nobody would know which.
--
-- IT LOOKS AT EVERY DEPTH, not only the top level: `jsonb_path_query(metadata,
-- '$.**')` walks nested objects and arrays. The old `reason` sat at the top
-- level, but a future key could nest one, and a sweep that only reads the first
-- level would report a confident zero.
--
-- IT LOOKS AT EVERY ACTION, not only `appointment.cancel`. A sweep scoped to the
-- one known writer cannot find the second one, and finding the second one is the
-- reason to run a sweep rather than a lookup.
-- ===========================================================================
\pset pager off
\timing off

\echo ''
\echo '=== 0. CONTROL. A section that returns nothing looks the same whether it'
\echo '===    works or not. These numbers must be non-zero for the rest to mean'
\echo '===    anything, and section 1 is read against them.'
select
  count(*)                                             as audit_rows_total,
  count(*) filter (where jsonb_typeof(metadata) = 'object')
                                                       as metadata_is_an_object,
  count(*) filter (where metadata = '{}'::jsonb)       as metadata_is_empty,
  count(distinct action)                               as distinct_actions,
  min(created_at)::date                                as oldest_row,
  max(created_at)::date                                as newest_row
from audit_log;

\echo ''
\echo '=== 1. THE HEADLINE. How many audit rows carry at least one free-text'
\echo '===    value, out of how many. Both numbers, on one line, so the'
\echo '===    proportion does not have to be carried between grids.'
with strings as (
  select a.id, a.action, a.created_at, s.v #>> '{}' as val
  from audit_log a
  cross join lateral jsonb_path_query(a.metadata, '$.**') as s(v)
  where jsonb_typeof(s.v) = 'string'
),
offending as (
  select distinct id, action, created_at
  from strings
  where length(val) > 64 or val ~ '\s'
)
select
  (select count(*) from audit_log)      as audit_rows_total,
  (select count(*) from offending)      as rows_with_free_text,
  round(
    100.0 * (select count(*) from offending) / nullif((select count(*) from audit_log), 0),
    2
  )                                     as pct_of_all_rows;

\echo ''
\echo '=== 2. BY ACTION. Which writer produced them. Count only.'
\echo '===    An action that appears here and is NOT appointment.cancel is a'
\echo '===    SECOND writer nobody has looked at, and it is the finding.'
with strings as (
  select a.id, a.action, s.v #>> '{}' as val
  from audit_log a
  cross join lateral jsonb_path_query(a.metadata, '$.**') as s(v)
  where jsonb_typeof(s.v) = 'string'
),
offending as (
  select distinct id, action from strings where length(val) > 64 or val ~ '\s'
)
select
  o.action,
  count(*)                                                 as rows_with_free_text,
  (select count(*) from audit_log a2 where a2.action = o.action) as rows_of_this_action
from offending o
group by o.action
order by rows_with_free_text desc, o.action;

\echo ''
\echo '=== 3. BY METADATA KEY. WHICH KEY carries it, so the scrub - if strategy'
\echo '===    orders one - has a target. The key NAME is a column name and is'
\echo '===    not content. `max_len` is a character count and is not content'
\echo '===    either; it is here because "132 rows of about 20 characters" and'
\echo '===    "132 rows of about 2000" are different decisions.'
with kv as (
  select
    a.id,
    a.action,
    k.key                as meta_key,
    k.value #>> '{}'     as val
  from audit_log a
  cross join lateral jsonb_each(a.metadata) as k(key, value)
  where jsonb_typeof(a.metadata) = 'object'
    and jsonb_typeof(k.value) = 'string'
)
select
  meta_key,
  action,
  count(*)         as rows_with_free_text,
  max(length(val)) as max_len
from kv
where length(val) > 64 or val ~ '\s'
group by meta_key, action
order by rows_with_free_text desc, meta_key, action;

\echo ''
\echo '=== 3b. NESTED ONLY. Section 3 reads the top level, which is where the'
\echo '===     known writer put it. This line says whether ANY offender is'
\echo '===     deeper than that - if it is non-zero, section 3 is incomplete and'
\echo '===     section 1 (which walks every depth) is the number to quote.'
with deep as (
  select a.id
  from audit_log a
  cross join lateral jsonb_path_query(a.metadata, '$.**') as s(v)
  where jsonb_typeof(s.v) = 'string'
    and (length(s.v #>> '{}') > 64 or (s.v #>> '{}') ~ '\s')
),
shallow as (
  select a.id
  from audit_log a
  cross join lateral jsonb_each(a.metadata) as k(key, value)
  where jsonb_typeof(a.metadata) = 'object'
    and jsonb_typeof(k.value) = 'string'
    and (length(k.value #>> '{}') > 64 or (k.value #>> '{}') ~ '\s')
)
select
  (select count(distinct id) from deep)    as offenders_at_any_depth,
  (select count(distinct id) from shallow) as offenders_at_top_level,
  (select count(distinct id) from deep)
    - (select count(distinct id) from shallow) as offenders_only_when_nested;

\echo ''
\echo '=== 4. BY MONTH. Is it still happening? The fix stops the writer from'
\echo '===    today; this says how long it had been running and whether the'
\echo '===    curve is flat or growing. Count only.'
with strings as (
  select a.id, a.created_at, s.v #>> '{}' as val
  from audit_log a
  cross join lateral jsonb_path_query(a.metadata, '$.**') as s(v)
  where jsonb_typeof(s.v) = 'string'
),
offending as (
  select distinct id, created_at from strings where length(val) > 64 or val ~ '\s'
)
select
  to_char(date_trunc('month', created_at), 'YYYY-MM') as month,
  count(*)                                            as rows_with_free_text
from offending
group by 1
order by 1;

\echo ''
\echo '=== 5. THE TWO SEPARATE REASONS a value is counted, because they are not'
\echo '===    the same problem. A string WITH WHITESPACE is prose. A string that'
\echo '===    is merely LONG and has no whitespace is more likely a token, a'
\echo '===    path or a base64 blob - unwanted, but not patient PII. Count only.'
with strings as (
  select a.id, s.v #>> '{}' as val
  from audit_log a
  cross join lateral jsonb_path_query(a.metadata, '$.**') as s(v)
  where jsonb_typeof(s.v) = 'string'
)
select
  count(distinct id) filter (where val ~ '\s')                        as rows_with_whitespace,
  count(distinct id) filter (where length(val) > 64 and val !~ '\s')  as rows_long_but_unspaced,
  count(distinct id) filter (where length(val) > 64 or val ~ '\s')    as rows_counted_in_section_1
from strings;

\echo ''
\echo '=== DONE. Nothing was written. Paste the five grids back.'
