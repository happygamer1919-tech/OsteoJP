NOT VALIDATED - STRATEGY REVIEW REQUIRED - DO NOT RUN

# Apply block - migration 0067, the 2026-08-20 batch

**Status: DRAFT. Authored by PURPLE 2026-08-20. Not reviewed, not sent to the
owner.** The path is draft -> strategy -> Ivan, per `PORTAL-REHYDRATE.md` §4.9.
Strategy replaces the line above with `VALIDATED`; the author never removes
their own.

Migration: `0067_followup_packs_and_provenance` (journal idx 66, `when`
1787300200000). Branch: `db/0067-followup-packs-and-provenance`, **rebased on main at `9f196b6` on 2026-08-20** so it stays mergeable. **The branch head is PINNED for this apply**, and section 4 writes it as the literal placeholder `PINNED_SHA` for strategy to substitute at validation time. **The block checks out the SHA, not the branch**: section 4a proves the sha resolves in that clone and section 4b detaches on the same sha, so the thing verified and the thing applied are one commit. `git log -1 --oneline` in 4b records it in the pasted transcript. **The applied sha and the merged sha must be the same commit**, so main must not move before this merges - see section 6.
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

**Built from `docs/runbook-prod-migrations.md`, not from a sibling apply
document.** That is the whole of what went wrong in the draft this replaces, and
`docs/migration-apply-0065.md` §0 records the same failure happening once
before: an author works from the previous file, and steps that were corrected
months ago silently revert to an older form.

**`PINNED_SHA` below is a literal placeholder.** Strategy substitutes the real
sha when it stamps this block `VALIDATED`, and the runbook requires it re-read
the branch head at that moment rather than at drafting time - a sha that has
gone stale still resolves, so the failure is silent.

### 4a. Pre-flight. Its own paste, BEFORE any credential is sourced.

```
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git status --short
git fetch origin --prune
git cat-file -t PINNED_SHA
```

| Command | Expected | STOP if |
|---|---|---|
| `git status --short` | **prints nothing** | **any line at all.** Not "any line that looks dangerous" - any line. Deciding which stray file is harmless is exactly the judgement this step exists to avoid making at the top of a production sitting. It is what caught 21 stray scripts before the 0063 apply, in the one tree whose shell is about to hold production credentials |
| `git cat-file -t PINNED_SHA` | **`commit`** | anything else. A sha that does not resolve is a typo, a stale paste, or a branch rebased out from under this block |

`git fetch origin --prune` sits between them deliberately: `cat-file` is
worthless against a sha this clone has never seen, and the fetch is what makes
"resolves" mean "resolves to what the PR actually carries".

### 4b. The apply.

```
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git checkout --detach PINNED_SHA
git log -1 --oneline
set -o allexport
source /Users/ivan/osteojp-secrets/new-prod.env
set +o allexport
pnpm --filter @osteojp/db exec node scripts/check-pending-migrations.mjs 1
pnpm --filter @osteojp/db exec drizzle-kit migrate
pnpm --filter @osteojp/db exec node scripts/check-pending-migrations.mjs 0
```

**Paste back the output of every one of those lines**, not only the migrate.

**`git checkout --detach PINNED_SHA` is load-bearing, and it checks out the SHA,
not the branch.** A plain `git checkout <branch>` is rejected in that worktree
and the fallback leaves it on `main`, where the migrate finds nothing pending
and prints success over a no-op - INC-07, twice. Detaching on the **sha** rather
than on `origin/<branch>` also closes the gap the pre-flight would otherwise
leave open: `cat-file` verifies a sha, so the checkout must take the same sha,
or the two steps are about different commits and the check proves nothing about
what runs.

**`set -o allexport`, never `set -a`**, and **no tilde paths**. Standing rule:
`set -a` errors in zsh, and the env file is named by absolute path.

**STOP IF `check-pending-migrations.mjs 1` FAILS, AND DO NOT RUN THE MIGRATE
AT ALL.** It opens a READ ONLY transaction, reads drizzle's own bookkeeping
table, applies drizzle's own pending predicate, and exits non-zero unless the
pending set is exactly the expected count. If it does not say exactly one is
pending, the tree is not what this block assumes and nothing below it means
anything. The literal count is the point: called bare it reports instead of
gating.

**The trailing `0` check is the other half.** `drizzle-kit migrate` prints
`migrations applied successfully` when it applies **nothing**, so its output
answers "did the command run", never "did the schema change". `1` before and
`0` after is the pair that proves the pending set actually moved - and §5 then
verifies the objects themselves, from a different source.

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
- **`drizzle-kit migrate` prints success and V2 shows a missing object.** That is
  INC-07 exactly: a no-op reported as a success.
- **Either `check-pending-migrations.mjs` call exits non-zero.** The `1` before
  means do not run the migrate at all; the `0` after means the migrate did not
  apply what it claimed and §5 must be read as untrusted until it is explained.
- **`git status --short` prints anything, or `git cat-file -t` prints anything
  but `commit`.** Both are pre-flight and both stop the sitting before a single
  credential is sourced.
- **`git log -1` in section 4 does not print the PINNED SHA** named in the dispatch.
  Main moved and the branch was rebased again, so the commit in front of you is not
  the commit that will merge. **The applied sha and the merged sha must be the same
  commit**; a mismatch means the migration you are applying is not the migration the
  PR will land. Stop and ask for a re-pin. UNLIKE EVERY OTHER STOP CONDITION HERE
  THIS ONE IS CHECKED BEFORE THE APPLY: section 4 prints the head two lines before
  `drizzle-kit migrate` runs, so a mismatch stops the run having changed nothing.

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

## 9. Teardown. Run this, then close the window.

```
unset DATABASE_URL DATABASE_URL_DIRECT
close the terminal window
```

**The second line is not a command and is not decoration.** `set -o allexport`
exported **every** variable in the secrets file, not the two named here, and this
block cannot name the rest without reading them - which it must never do. The
`unset` clears the two that matter for a database connection; **closing the
window is what clears the others**, along with the shell history holding them.

Until the window is closed, that shell is one `node <path>` away from the live
database, which is the same exposure the §4a pre-flight exists to measure.
