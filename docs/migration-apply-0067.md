# Apply receipt - migration 0067, the 2026-08-20 batch

**Status: VALIDATED by strategy 2026-08-20. APPLIED TO PRODUCTION 2026-08-20.**

The `NOT VALIDATED - STRATEGY REVIEW REQUIRED - DO NOT RUN` banner that stood
here was cleared on **strategy's** validation, not on PURPLE's judgement:
`PORTAL-REHYDRATE.md` §4.9 is explicit that the author never removes their own,
and 0062 records the same attribution for the same reason. It was rejected once
first, on five defects, every one of which had already been fixed at 0065 - §4
carries that history.

**DO NOT RE-RUN §4.** This document is now a record of what happened, not an
instruction. The migration is applied; running it again is what §7 forbids.

Migration: `0067_followup_packs_and_provenance` (journal idx 66, `when`
1787300200000). Branch: `db/0067-followup-packs-and-provenance`, **rebased on main at `9f196b6` on 2026-08-20** so it stays mergeable. **APPLIED FROM PINNED SHA `814872591ce9dacaff9fbe5655fd0787689f95e3`.** §4 wrote it as the placeholder `814872591ce9dacaff9fbe5655fd0787689f95e3` while the block was in review, and it is resolved to the real sha throughout now that the apply has happened. **The block checked out the SHA, not the branch**: §4a proved the sha resolved in that clone and §4b detached on the same sha, so the thing verified and the thing applied were one commit. **That sha is ORPHANED by the squash merge and the migration BLOB is what ties the receipt to `main` - see §10.4.**
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

**The sha below was a placeholder while this was in review and is now resolved
to what actually ran.** Strategy re-read the branch head before handing the block
over, which the runbook requires as its LAST action rather than at drafting time:
a sha that has gone stale still resolves, so that failure is silent.

### 4a. Pre-flight. Its own paste, BEFORE any credential is sourced.

```
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git status --short
git fetch origin --prune
git cat-file -t 814872591ce9dacaff9fbe5655fd0787689f95e3
```

| Command | Expected | STOP if |
|---|---|---|
| `git status --short` | **prints nothing** | **any line at all.** Not "any line that looks dangerous" - any line. Deciding which stray file is harmless is exactly the judgement this step exists to avoid making at the top of a production sitting. It is what caught 21 stray scripts before the 0063 apply, in the one tree whose shell is about to hold production credentials |
| `git cat-file -t 814872591ce9dacaff9fbe5655fd0787689f95e3` | **`commit`** | anything else. A sha that does not resolve is a typo, a stale paste, or a branch rebased out from under this block |

`git fetch origin --prune` sits between them deliberately: `cat-file` is
worthless against a sha this clone has never seen, and the fetch is what makes
"resolves" mean "resolves to what the PR actually carries".

### 4b. The apply.

```
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git checkout --detach 814872591ce9dacaff9fbe5655fd0787689f95e3
git log -1 --oneline
set -o allexport
source /Users/ivan/osteojp-secrets/new-prod.env
set +o allexport
pnpm --filter @osteojp/db exec node scripts/check-pending-migrations.mjs 1
pnpm --filter @osteojp/db exec drizzle-kit migrate
pnpm --filter @osteojp/db exec node scripts/check-pending-migrations.mjs 0
```

**Paste back the output of every one of those lines**, not only the migrate.

**`git checkout --detach 814872591ce9dacaff9fbe5655fd0787689f95e3` is load-bearing, and it checks out the SHA,
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

-- V5. The function was replaced and now reads BOTH arms of the disjunction.
-- CORRECTED 2026-08-20 AFTER THE APPLY: see section 10. The function is a
-- DISJUNCTION (origin = 'patient_portal' OR the notification row exists), so it
-- must read staff_notifications too - that arm is what covers the window between
-- applying this migration and deploying the code that writes the column, during
-- which the old code still creates pedidos with no origin.
select pg_get_functiondef('public.is_unconfirmed_pedido(uuid)'::regprocedure)
         like '%staff_notifications%' as still_reads_notifications;   -- expect TRUE
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
- **V5's `reads_origin` is FALSE.** The function was not replaced and the whole
  point of change 1 is undone. **`still_reads_notifications` is EXPECTED TRUE
  and is not a stop condition** - the function is a disjunction and that arm is
  load-bearing. This condition was inverted until 2026-08-20 and fired falsely on
  a correct apply; section 10 records why.
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
- **`git checkout --detach 814872591ce9dacaff9fbe5655fd0787689f95e3` errors, or `git log -1` in 4b prints a
  different sha.** The checkout did not take, and every line below it is running
  against a tree this block did not describe. This is the one stop condition
  checked BEFORE anything is applied: 4b prints the head five lines before
  `drizzle-kit migrate` runs, so stopping here costs nothing.

**ONE FAILURE THIS BLOCK CANNOT CATCH, NAMED SO IT IS OWNED RATHER THAN
ASSUMED: a STALE pin.** If the branch moved after the sha was written in, the
pre-flight still passes and the checkout still succeeds - `cat-file` prints
`commit` and `git log -1` prints exactly what was pasted, because both are
questions about the sha and not about whether it is still the head. What gets
applied is then an OLDER tree than the one that was reviewed, silently. Nothing
the owner runs can see it. **`docs/runbook-prod-migrations.md` puts that check on
STRATEGY, as the LAST action before the block is handed over**, and 0061 and 0062
are the two occasions that made it a rule. **The applied sha and the merged sha
must be the same commit**, which is also why `main` must not move between the
validation and the apply.

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

## 10. THE RECEIPT. Applied 2026-08-20. One stop condition fired and it was WRONG.

### 10.1 What ran

| | |
|---|---|
| **Applied sha** | `814872591ce9dacaff9fbe5655fd0787689f95e3` |
| **Migration** | `0067_followup_packs_and_provenance`, journal idx 66 |
| **Journal row** | id **67**, `when` **1787300200000** |
| **Row hash** | `76e20edde13a63b52e0c901189f26a45646bb3793fbb69020564f9858fee20d5` |
| **Pre-check** | `check-pending-migrations.mjs 1` - **1 pending**, as expected |
| **Post-check** | `check-pending-migrations.mjs 0` - **0 pending**, as expected |

**The journal moved 66 to 67**, which with the checker pair either side is the
proof the migrate was not a no-op. That pair is the half 0058 did not have.

### 10.2 V1 to V7, as verified

| | Result |
|---|---|
| **V1** journal | advanced by exactly one, to this tag |
| **V2** objects | `origin`, `pack_instance_id`, `legacy_consumed` all present; both `patient_followup_*` tables non-null |
| **V3** backfill identity | **0** rows where `legacy_consumed <> sessions_total - sessions_remaining`. **Every existing pacote balance is preserved exactly** |
| **V4** origin backfill | **6**, equal to P4's `pedidos_by_notification` of **6**. The two counts match, so nothing wrote appointments between the pre-check and the apply |
| **V5** function | `still_reads_notifications` **TRUE**, `reads_origin` **TRUE**. **Correct.** See 10.3 |
| **V6** grants | clean; no `DELETE` to `authenticated` on either new table, SELECT and INSERT present |
| **V7** RLS | on, policies present on both tables |

### 10.3 THE ONE STOP CONDITION THAT FIRED WAS THE DOCUMENT'S FAULT, NOT THE DATABASE'S

**V5 expected `still_reads_notifications` FALSE. It came back TRUE, and TRUE is
right.** Read the committed body at the applied sha:

```sql
AND (
  a.origin = 'patient_portal'
  OR EXISTS (
    SELECT 1 FROM public.staff_notifications n
    WHERE n.appointment_id = a.id
      AND n.kind = 'appointment_request'
  )
)
```

A disjunction. `pg_get_functiondef` therefore **must** contain both
`staff_notifications` and `origin`, so the observed pair is the only pair this
body can produce. An apply that returned FALSE would have meant the migration did
**not** run.

**HOW THE EXPECTATION WENT STALE, from the branch's own history:**

| Commit | What it did | Touched the apply block? |
|---|---|---|
| `208e753` | authored the migration with the function keyed on `origin` **alone**, and authored §5 with `expect FALSE` to match | yes, it wrote it |
| `2642c35` | **changed the function to a disjunction**, after `pedido-does-not-block.db.test.ts` went red on five assertions | **no** |
| `9a7c81c`, `7eb7d09`, `61d033f`, `51b5dfa`, `8148725` | five further edits to the apply block | yes, and none revisited §5 |

**The design changed and its verification query did not.** Five subsequent passes
over this document, including a full rebuild from the runbook after a five-defect
rejection, all read straight past an expectation that had been false since
`2642c35`.

**THE LESSON, AND IT GENERALISES PAST THIS FILE.** *A verification query whose
expectation is not regenerated when the migration changes produces a FALSE STOP -
the same class as the stale-sha defect, and arguably worse.* A stale sha stops an
apply that should have run; a stale expectation **stops an apply that DID run,
correctly**, and it does so at the moment of least tolerance for ambiguity: mid
sitting, credentials live, with the operator asked to decide whether production is
broken. It cost a full round-trip here and it was one grep from costing a rollback.

The structural point is the one `PORTAL-REHYDRATE.md` §1.3 makes about every
convenience that maps an unknown case onto a known-looking one: **a check is only
as true as the design it was written against, and nothing mechanical ties the
two.** The migration file and its verification live in different documents, in
different formats, and no test reads the second. **Carded as
`LE-apply-block-expectation-drift`.**

### 10.4 The applied sha is ORPHANED by the merge, and the blob is the tie

Under squash-merge the applied sha stops being reachable the instant the PR
merges - `docs/migration-apply-0063.md` §4 in full. **This receipt commit rides
the same branch**, so the head moves after the apply; what must be identical is
the CONTENT, and it is, byte for byte:

**PR #991 squash-merged as `e331b5b7ef390b072a67b7c8d64edb54ff10774a`**, and the
applied sha `8148725` is now confirmed unreachable from `main` -
`git merge-base --is-ancestor 8148725 origin/main` exits non-zero, exactly as
0063 predicted. Both shas are pinned here because only one of them resolves in a
fresh clone.

| Path | Blob, IDENTICAL at applied `8148725`, at squash `e331b5b`, and on `main` |
|---|---|
| `packages/db/migrations/0067_followup_packs_and_provenance.sql` | `a65ed6e2f76314107e47799417af4638bd41016d` |
| `packages/db/migrations/meta/_journal.json` | `aaeeefc36ff27f05f98251d6d6d722ccd2429ec7` |
| `supabase/migrations/0067_followup_packs_and_provenance.sql` | `90d609636f4c7c5813e6288f973978958a844741` |

**Verified across all three refs after the merge rather than assumed.**
Checkable from any clone, forever, with
`git rev-parse origin/main:packages/db/migrations/0067_followup_packs_and_provenance.sql`.
**If that blob ever stops matching `a65ed6e2`, what is on `main` is not what ran
against production.**
