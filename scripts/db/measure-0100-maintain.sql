-- 0100 MEASUREMENT: who holds which table privilege in `public`, and which default
-- privileges would hand them to the next table. READ ONLY. A PROFILE, not verdicts:
-- it asserts nothing about the counts, it prints them, so the lead can rule 0100's
-- scope on production's numbers rather than on a throwaway's.
-- Run inside the block's own `begin read only`, so the server refuses any write this
-- file could contain. Row 0 prints that the transaction is READ ONLY.
--
-- Ruled by the lead on 2026-10-01 (dispatch S-1001-A, R3): "Measurement before build.
-- ... It prints, for schema public: per role (PUBLIC, anon, authenticated,
-- service_role) the count of tables holding each of the 8 privileges; pg_default_acl
-- per grantor." The 0100 migration (MAINTAIN off `authenticated`, the same shape as
-- 0099) is not written until this output is back. Anything it finds on `anon` or
-- PUBLIC comes back as a question, not as scope.
--
-- WHAT IT PRINTS
--   0  the transaction is READ ONLY;
--   1  GRANTED: per grantee (PUBLIC, anon, authenticated, service_role, and
--      `patient` and the owner `postgres` as context), the number of ordinary and
--      partitioned tables in `public` whose ACL names that grantee for each of the
--      eight table privileges (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES,
--      TRIGGER, MAINTAIN). A NULL relacl reads as acldefault('r', owner): the owner
--      alone. This is what a REVOKE acts on;
--   2  EFFECTIVE: the same counts read with has_table_privilege, which also counts
--      what a role holds through PUBLIC or through a role it belongs to. A role
--      whose EFFECTIVE count exceeds its GRANTED count holds that privilege by some
--      other path, which a REVOKE from that role alone would not remove;
--      CONTROL for both: `postgres` (the owner of every table, 0099's pre-check
--      verdict 5) reads N of N on all eight, so a zero elsewhere is not a blind
--      instrument;
--   3  every pg_default_acl entry for `public` or global (no schema), per grantor,
--      object type and grantee, with the privileges it hands out;
--   4  context: the number of tables, views, materialized views and foreign tables
--      in `public`, and the number of default-privilege entries in other schemas
--      (not listed: out of scope).

\echo '=== 0100 MEASUREMENT: table privileges in public, and the defaults that hand them out. READ ONLY, a profile ==='

select '0. this transaction is READ ONLY (the server refuses writes)' as check,
       current_setting('transaction_read_only') as observed,
       'on' as expected;

\echo '--- 1. GRANTED: tables in public whose ACL names the grantee, per privilege'
with t as (
  select c.oid, coalesce(c.relacl, acldefault('r', c.relowner)) as acl
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
),
g as (
  select t.oid, x.grantee, x.privilege_type
  from t cross join lateral aclexplode(t.acl) x
),
who(ord, label, roleoid) as (
  select 1, 'PUBLIC', 0::oid
  union all select 2, 'anon', (select oid from pg_roles where rolname = 'anon')
  union all select 3, 'authenticated', (select oid from pg_roles where rolname = 'authenticated')
  union all select 4, 'service_role', (select oid from pg_roles where rolname = 'service_role')
  union all select 5, 'patient (context)', (select oid from pg_roles where rolname = 'patient')
  union all select 6, 'postgres (control)', (select oid from pg_roles where rolname = 'postgres')
)
select w.label as grantee,
       count(distinct g.oid) filter (where g.privilege_type = 'SELECT') as "SELECT",
       count(distinct g.oid) filter (where g.privilege_type = 'INSERT') as "INSERT",
       count(distinct g.oid) filter (where g.privilege_type = 'UPDATE') as "UPDATE",
       count(distinct g.oid) filter (where g.privilege_type = 'DELETE') as "DELETE",
       count(distinct g.oid) filter (where g.privilege_type = 'TRUNCATE') as "TRUNCATE",
       count(distinct g.oid) filter (where g.privilege_type = 'REFERENCES') as "REFERENCES",
       count(distinct g.oid) filter (where g.privilege_type = 'TRIGGER') as "TRIGGER",
       count(distinct g.oid) filter (where g.privilege_type = 'MAINTAIN') as "MAINTAIN",
       (select count(*) from t) as of_tables,
       case when w.roleoid is null then 'ROLE ABSENT' else '' end as note
from who w
left join g on g.grantee = w.roleoid
group by w.ord, w.label, w.roleoid
order by w.ord;

\echo '--- 2. EFFECTIVE: the same counts by has_table_privilege (through PUBLIC and role membership too)'
with t as (
  select c.oid
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
),
who(ord, label, rolname) as (
  values (1, 'PUBLIC', 'public'), (2, 'anon', 'anon'), (3, 'authenticated', 'authenticated'),
         (4, 'service_role', 'service_role'), (5, 'patient (context)', 'patient'),
         (6, 'postgres (control)', 'postgres')
),
present as (
  select w.* from who w
  where w.rolname = 'public' or exists (select 1 from pg_roles r where r.rolname = w.rolname)
)
select p.label as role,
       count(*) filter (where has_table_privilege(p.rolname, t.oid, 'SELECT')) as "SELECT",
       count(*) filter (where has_table_privilege(p.rolname, t.oid, 'INSERT')) as "INSERT",
       count(*) filter (where has_table_privilege(p.rolname, t.oid, 'UPDATE')) as "UPDATE",
       count(*) filter (where has_table_privilege(p.rolname, t.oid, 'DELETE')) as "DELETE",
       count(*) filter (where has_table_privilege(p.rolname, t.oid, 'TRUNCATE')) as "TRUNCATE",
       count(*) filter (where has_table_privilege(p.rolname, t.oid, 'REFERENCES')) as "REFERENCES",
       count(*) filter (where has_table_privilege(p.rolname, t.oid, 'TRIGGER')) as "TRIGGER",
       count(*) filter (where has_table_privilege(p.rolname, t.oid, 'MAINTAIN')) as "MAINTAIN",
       count(*) as of_tables
from present p
cross join t
group by p.ord, p.label
order by p.ord;

\echo '--- 3. DEFAULT PRIVILEGES for public and global, per grantor (what the next object of that type is given)'
select pg_get_userbyid(d.defaclrole) as grantor,
       case when d.defaclnamespace = 0 then '(global)' else n.nspname end as in_schema,
       case d.defaclobjtype when 'r' then 'TABLES' when 'S' then 'SEQUENCES' when 'f' then 'FUNCTIONS'
                            when 'T' then 'TYPES' when 'n' then 'SCHEMAS' else d.defaclobjtype::text end as objects,
       case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end as grantee,
       string_agg(x.privilege_type, ',' order by x.privilege_type) as privileges
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) x
where d.defaclnamespace = 0 or n.nspname = 'public'
group by 1, 2, 3, 4
order by 1, 2, 3, 4;

\echo '--- 4. CONTEXT'
select 'relations in public, by kind' as item,
       format('tables %s, partitioned %s, views %s, materialized views %s, foreign tables %s',
              count(*) filter (where c.relkind = 'r'), count(*) filter (where c.relkind = 'p'),
              count(*) filter (where c.relkind = 'v'), count(*) filter (where c.relkind = 'm'),
              count(*) filter (where c.relkind = 'f')) as observed
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
union all
select 'default-privilege entries in OTHER schemas (not listed)',
       count(*)::text
from pg_default_acl d
where d.defaclnamespace <> 0
  and d.defaclnamespace <> (select oid from pg_namespace where nspname = 'public');

\echo '0100 MEASUREMENT PRINTED. Nothing was written; the block rolls the transaction back.'
