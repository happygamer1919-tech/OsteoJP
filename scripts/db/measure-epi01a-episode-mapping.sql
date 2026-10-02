-- EPI-01a MEASUREMENT: how the imported and the app-created episodes hold registos.
-- READ ONLY. COUNTS ONLY: no id, no title text, no name, no date and no clinical text
-- is ever printed, so the transcript carries no patient data and may be pasted.
-- Run inside the block's own `begin read only`, so the server refuses any write
-- this file could contain. Row 0 prints that the transaction is READ ONLY.
--
-- Ruled by the lead on 2026-10-01 (dispatch S-1001-A, B6): "EPI-01a PR 1,
-- measurement of the importer's episode mapping first." EPI-01 M1 read the
-- importer's code: each Fisiozero evaluation row became its own closed episode,
-- titled with the specialty, holding exactly one locked registo. M1 left three
-- facts unmeasured on production, and this file measures them before PR a1
-- (listRecordsByEpisode and the Q1 (a) grouping) is built:
--   1  how many episodes hold 0, 1, 2 or 3 or more registos, imported and
--      app-created apart (imported = an episode the import ledger,
--      migration_staging_rows with entity_type 'clinical_episode', points at);
--   2  the title buckets: 'Osteopatia', 'Fisioterapia' or "other". Other titles
--      are counted, never printed;
--   3  the registos: with and without an episode, imported and app-created
--      apart, and how many are later versions (supersedes_id set), which is how
--      an imported episode can come to hold more than one registo;
--   4  THE INTEGRITY GAP (Q9): registos whose episode belongs to another patient
--      or another tenant. Nothing in the database forbids it today;
--   5  Q1 (a) SIZING: one group per specialty per patient. How many groups the
--      imported history makes, and how many evaluations fall in each group
--      (1, 2 to 5, 6 to 10, 11 or more, and the largest).

\echo '=== EPI-01a MEASUREMENT: episodes and registos, imported and app-created. READ ONLY, counts only ==='

select '0. this transaction is READ ONLY (the server refuses writes)' as check,
       current_setting('transaction_read_only') as observed,
       'on' as expected;

\echo '--- 1. EPISODES by origin and by how many registos each holds'
with imported as (
  select distinct imported_entity_id as id
  from migration_staging_rows
  where entity_type = 'clinical_episode' and imported_entity_id is not null
),
e as (
  select ce.id, ce.status,
         exists (select 1 from imported i where i.id = ce.id) as is_imported,
         (select count(*) from clinical_records r where r.episode_id = ce.id) as n_records
  from clinical_episodes ce
)
select case when e.is_imported then 'imported' else 'app-created' end as origin,
       count(*) as episodes,
       count(*) filter (where e.n_records = 0) as holding_0,
       count(*) filter (where e.n_records = 1) as holding_1,
       count(*) filter (where e.n_records = 2) as holding_2,
       count(*) filter (where e.n_records >= 3) as holding_3_or_more,
       count(*) filter (where e.status = 'open') as open,
       count(*) filter (where e.status = 'closed') as closed
from e
group by 1
order by 1;

\echo '--- 2. EPISODE TITLES, by bucket (any other title is counted, never printed)'
with imported as (
  select distinct imported_entity_id as id
  from migration_staging_rows
  where entity_type = 'clinical_episode' and imported_entity_id is not null
)
select case when exists (select 1 from imported i where i.id = ce.id) then 'imported' else 'app-created' end as origin,
       case when ce.title in ('Osteopatia', 'Fisioterapia') then ce.title else 'other (not printed)' end as title_bucket,
       count(*) as episodes
from clinical_episodes ce
group by 1, 2
order by 1, 2;

\echo '--- 3. REGISTOS: with and without an episode, by origin, and later versions'
with imported as (
  select distinct imported_entity_id as id
  from migration_staging_rows
  where entity_type = 'clinical_record' and imported_entity_id is not null
)
select case when exists (select 1 from imported i where i.id = r.id) then 'imported' else 'app-created' end as origin,
       count(*) as registos,
       count(*) filter (where r.episode_id is not null) as with_episode,
       count(*) filter (where r.episode_id is null) as without_episode,
       count(*) filter (where r.supersedes_id is not null) as later_versions
from clinical_records r
group by 1
order by 1;

\echo '--- 4. THE INTEGRITY GAP (Q9): a registo whose episode belongs to another patient or tenant'
select 'registos whose episode is another patient''s' as item,
       count(*) filter (where e.patient_id <> r.patient_id) as observed
from clinical_records r
join clinical_episodes e on e.id = r.episode_id
union all
select 'registos whose episode is another tenant''s',
       count(*) filter (where e.tenant_id <> r.tenant_id)
from clinical_records r
join clinical_episodes e on e.id = r.episode_id
union all
select 'CONTROL: registos joined to an episode at all (the base the two counts above are taken over)',
       count(*)
from clinical_records r
join clinical_episodes e on e.id = r.episode_id;

\echo '--- 5. Q1 (a) SIZING: imported registos grouped one group per specialty per patient'
with imported_records as (
  select distinct imported_entity_id as id
  from migration_staging_rows
  where entity_type = 'clinical_record' and imported_entity_id is not null
),
g as (
  select r.patient_id,
         case when e.title in ('Osteopatia', 'Fisioterapia') then e.title else 'other' end as specialty,
         count(*) as evaluations
  from clinical_records r
  join clinical_episodes e on e.id = r.episode_id
  where exists (select 1 from imported_records i where i.id = r.id)
  group by 1, 2
)
select g.specialty,
       count(*) as groups,
       count(distinct g.patient_id) as patients,
       count(*) filter (where g.evaluations = 1) as groups_of_1,
       count(*) filter (where g.evaluations between 2 and 5) as groups_of_2_to_5,
       count(*) filter (where g.evaluations between 6 and 10) as groups_of_6_to_10,
       count(*) filter (where g.evaluations >= 11) as groups_of_11_or_more,
       max(g.evaluations) as largest_group,
       sum(g.evaluations) as evaluations
from g
group by 1
order by 1;

\echo 'EPI-01a MEASUREMENT PRINTED. Nothing was written; the block rolls the transaction back.'
