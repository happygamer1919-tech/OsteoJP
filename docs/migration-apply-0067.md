NOT VALIDATED - STRATEGY REVIEW REQUIRED - DO NOT RUN

# Apply block - migration 0067, the 2026-08-20 batch

**Status: DRAFT. Authored by PURPLE 2026-08-20. Not reviewed, not sent to the
owner.** The path is draft -> strategy -> Ivan, per `PORTAL-REHYDRATE.md` §4.9.
Strategy replaces the line above with `VALIDATED`; the author never removes
their own.

Migration: `0067_followup_packs_and_provenance` (journal idx 66, `when`
1787300200000). Branch: `db/0067-followup-packs-and-provenance`, rebased on main at `0b60e95` on 2026-08-20 so it stays mergeable; apply from the CURRENT branch head, not from a sha noted earlier.
Card: `RB-00-migration-0067`. Gate: `owner_merge` - **apply BEFORE merge**.

Written under `docs/runbook-prod-migrations.md`.

---

## 1. What this migration does

Four changes, in one file, by owner ruling 2026-08-20 (rule 8 allows one
migration in flight repo-wide and the batch needs all four).

| # | Change | Shape |
|---|---|---|
| 1 | `appointments.origin` | new column, `NOT NULL DEFAULT 'staff'`, CHECK, partial index, **one backfill UPDATE**, and `is_unconfirmed_pedido` rekeyed |
| 2 | `appointments.pack_instance_id` | new nullable column with a real FK, partial index |
| 3 | `patient_pack_instances.legacy_consumed` | new column `NOT NULL DEFAULT 0`, **one backfill UPDATE**, CHECK |
| 4 | `patient_followup_postponements`, `patient_followup_contacts` | two new tables, grants, RLS, policies |

**Two data-writing statements**, both `UPDATE`s over existing rows, both
described below. Everything else is additive DDL.

## 2. The two backfills, and what they are allowed to do

**2a. `appointments.origin`.** Every existing row takes the `'staff'` default;
the `UPDATE` then sets `'patient_portal'` for any appointment carrying a
`staff_notifications` row with `kind = 'appointment_request'`.

> **It recovers what is knowable and nothing else.** A pedido whose notification
> was never written is the exact failure this column exists to prevent — it was
> already invisible before this migration and stays invisible for history. **The
> column prevents the next one; it does not recover the last one.**

**2b. `patient_pack_instances.legacy_consumed`.** Set to
`sessions_total - sessions_remaining` for every row.

> **This is an arithmetic identity, not a judgement.** With zero linked
> appointments the derived balance is
> `sessions_total - (sessions_total - sessions_remaining) = sessions_remaining` —
> the value the row already carried, for every row, with no case analysis.
> `sessions_remaining` is **left in place and frozen** so the backfill remains
> checkable afterwards.

## 3. Pre-checks — run these BEFORE the apply and keep the output

`0058`'s lesson: without a pre-check a backwards timestamp produced success over
a no-op. `0060`'s: an apply block must be able to prove a no-op migration ran at
all. So the counts below are taken **before** and compared **after**.

```
-- P1. The slot is free and the journal is where this migration expects it.
select max(id) as max_idx from drizzle.__drizzle_migrations;

-- P2. Columns must NOT exist yet. Three rows expected, all false.
select 'appointments.origin'           as what, to_regclass('public.appointments') is not null as tbl,
       exists (select 1 from information_schema.columns
                where table_name='appointments' and column_name='origin') as col
union all
select 'appointments.pack_instance_id', true,
       exists (select 1 from information_schema.columns
                where table_name='appointments' and column_name='pack_instance_id')
union all
select 'patient_pack_instances.legacy_consumed', true,
       exists (select 1 from information_schema.columns
                where table_name='patient_pack_instances' and column_name='legacy_consumed');

-- P3. Tables must NOT exist yet. Both null expected.
select to_regclass('public.patient_followup_postponements') as postponements,
       to_regclass('public.patient_followup_contacts')      as contacts;

-- P4. THE NUMBERS THE BACKFILLS WILL BE CHECKED AGAINST. Record all three.
select count(*) as appointments_total from public.appointments;
select count(*) as pedidos_by_notification
  from public.appointments a
 where exists (select 1 from public.staff_notifications n
                where n.appointment_id = a.id and n.kind = 'appointment_request');
select count(*) as pack_instances, coalesce(sum(sessions_total - sessions_remaining),0) as consumed_so_far
  from public.patient_pack_instances;
```

## 4. The apply

Per rule 7, and the two failures that make each line non-optional: the worktree
must be checked out **detached** (`git checkout origin/<branch>`), because a
plain `git checkout <branch>` is rejected and `db:migrate` then silently no-ops
on main; and `drizzle-kit migrate` **prints success on a no-op** (INC-07), which
is why §5 verifies the schema rather than trusting the output.

```
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
git checkout origin/db/0067-followup-packs-and-provenance   # DETACHED. Not `git checkout db/...`
git log -1 --oneline                                        # paste this
set -a; . ~/osteojp-secrets/new-prod.env; set +a
pnpm --filter @osteojp/db db:migrate                        # paste the whole output
```

## 5. Post-checks — the apply is not proven until these are pasted

```
-- V1. The journal advanced by exactly one, and to this tag.
select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;

-- V2. Every object exists. Three true, two non-null.
select exists (select 1 from information_schema.columns
                where table_name='appointments' and column_name='origin')            as origin_col,
       exists (select 1 from information_schema.columns
                where table_name='appointments' and column_name='pack_instance_id')  as pack_col,
       exists (select 1 from information_schema.columns
                where table_name='patient_pack_instances' and column_name='legacy_consumed') as legacy_col,
       to_regclass('public.patient_followup_postponements') as postponements,
       to_regclass('public.patient_followup_contacts')      as contacts;

-- V3. THE BACKFILL IDENTITY. MUST be 0. If it is not, STOP and report.
select count(*) as rows_where_backfill_is_wrong
  from public.patient_pack_instances
 where legacy_consumed <> sessions_total - sessions_remaining;

-- V4. The origin backfill matches P4's pedido count EXACTLY.
select count(*) as origin_patient_portal
  from public.appointments where origin = 'patient_portal';

-- V5. The function was replaced and no longer reads staff_notifications.
select pg_get_functiondef('public.is_unconfirmed_pedido(uuid)'::regprocedure)
         like '%staff_notifications%' as still_reads_notifications;   -- expect FALSE
select pg_get_functiondef('public.is_unconfirmed_pedido(uuid)'::regprocedure)
         like '%origin%' as reads_origin;                             -- expect TRUE

-- V6. Grants on the two new tables, because 0064 shipped a policy with no
--     grant and every statement answered `permission denied`.
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
  from information_schema.role_table_grants
 where table_name in ('patient_followup_postponements','patient_followup_contacts')
 group by table_name, grantee order by table_name, grantee;

-- V7. RLS is ON and the policies exist.
select relname, relrowsecurity from pg_class
 where relname in ('patient_followup_postponements','patient_followup_contacts');
select tablename, policyname, cmd from pg_policies
 where tablename in ('patient_followup_postponements','patient_followup_contacts')
 order by tablename, policyname;
```

## 6. Stop conditions

**STOP and report rather than continuing if any of these is true.**

- **V3 is not 0.** The pack balance identity failed. Every existing balance is
  now wrong and the feature must not ship on top of it.
- **V4 does not equal P4's `pedidos_by_notification`.** The origin backfill saw a
  different set than the pre-check did, which means something wrote appointments
  between the two.
- **V5's `still_reads_notifications` is TRUE.** The function was not replaced,
  and the whole point of change 1 is undone.
- **V6 shows `authenticated` with DELETE on either table**, or without SELECT and
  INSERT. Both directions are wrong and both are silent.
- **`db:migrate` prints success and V2 shows a missing object.** That is INC-07
  exactly: a no-op reported as a success.

## 7. Rollback

**There is no rollback script and that is deliberate.** Every change is additive:
two nullable-or-defaulted columns, one defaulted column, two new tables, and a
`CREATE OR REPLACE` of one function. Nothing is dropped and no existing value is
destroyed — `sessions_remaining` is left intact precisely so 2b stays checkable.

If the apply must be undone, the honest path is a **forward** migration `0068`
that drops what `0067` added, authored and reviewed like any other. Hand-editing
production to reverse a migration is what `docs/runbook-prod-migrations.md`
forbids.

**The one irreversible-in-practice item is `is_unconfirmed_pedido`.** A
`CREATE OR REPLACE` overwrites the previous body; 0059's version is in the
repository at `packages/db/migrations/0059_pedido_does_not_block_slot.sql` and
can be restored by a forward migration.

## 8. After the apply

Paste every output from §3 and §5 back. **Only then does the PR merge** (rule 7),
and only then do `RB-01` and `RB-02` leave `blocked`.
