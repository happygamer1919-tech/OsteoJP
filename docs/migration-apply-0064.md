# Apply receipt - migration 0064, `consultations`

**Status: APPLIED TO PRODUCTION 2026-08-18. MERGED THE SAME DAY.**

The `NOT VALIDATED` line that opened this file is gone because the path it
guarded completed: draft -> strategy -> owner -> applied. It is quoted in §5.0
rather than deleted silently, so the next reader can see the block was gated
rather than assume it.

Migration: `0064_consultations` (journal idx 63, `when` 1787200000000).
Branch: `consultation/AI-03-fire-pending-retry` (deleted at merge).
PR: **#916, squash-merged as `267fce9`.**
**Applied from sha `f2101ad`** - orphaned by the squash. See §5.1, which is the
whole reason this receipt pins three identifiers instead of one.
Applied by the owner from `/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply`.
Written under `docs/runbook-prod-migrations.md`.

**Next free migration number: `0065`.** The slot is now clear, and `GUEST-07`
(the guest ACL normalisation) is the card that holds it.

**THE PIN IS NOT SET IN THIS FILE, DELIBERATELY.** The runbook requires strategy
to re-read the branch head and set `PINNED_SHA` as the **last action before the
owner runs anything**, because a pin written at draft time silently stops being
the branch head while the block sits in review - `cat-file` still prints
`commit`, the pre-flight still passes, and an *older* tree than the one reviewed
gets applied. That happened on both 0061 and 0062. A placeholder that must be
filled cannot go stale; a real sha written now can.

---

## 0. THE AUTHORISATION QUESTION, FIRST, BECAUSE A COMMITTED FILE SAYS NO

`docs/migration-apply-0063.md:11-13` states, unqualified:

> **Next free migration number: `0064`. It is unoccupied and it is NOT
> authorized** - the GUEST-04 Option A ruling of 2026-08-14 states so
> explicitly, and the guest flow was built without one.

**That is not resolved here and it is not reconciled away.** Read in context the
sentence is about the GUEST-04 dispatch - it explains that the guest flow needed
no second migration - and the `GUEST-04-public-guest-form` card's ruling text is
entirely about the public form's scope, saying nothing about consultations. Read
literally, it says 0064 is not authorised at all.

**The owner's dispatch of 2026-08-16 authorises this one in terms**: "A
consultations table, or equivalent, written BEFORE the M1 fire... Migration
numbering continues past the current boundary. Do NOT touch migration 0063."
He is the authorising party and the instruction is newer and specific.

**Reported rather than assumed.** Strategy should confirm before this block is
validated. Nothing downstream of that confirmation is blocked by it: the table
is authored and the PR is open either way, and no apply happens without the
owner's explicit word regardless.

## 0.1 RULE 8 IS NOW BINDING AGAIN, REPO-WIDE

`PORTAL-REHYDRATE.md` §1.1: **"NEITHER LANE AUTHORS A MIGRATION... If a
migration ever becomes necessary, two-lane operation ends and single-lane
resumes until it is applied and merged."** §1.2 lists
`packages/db/migrations/**` as owned by **NEITHER**.

From the moment this branch exists there is **one migration in flight across the
whole repo**, so PURPLE and AMBER must not author one until 0064 is applied and
merged. That is a consequence of the dispatch, not a decision made here, and the
other lanes have not been told - this terminal has no channel to them. **The
owner is the channel.**

---

## 1. What this migration does

Creates `public.consultations`: one row per recorded consultation, written
**before** the M1 webhook fires.

- **The gap it closes.** `fireConsultationWebhookAction` fired and returned,
  persisting nothing. The audio object key, the patient, the clinician and both
  consultation timestamps lived only in React state in `Recorder.tsx`
  (`consultation_started_at` in a `useRef`). A failed fire showed
  "O processamento será retomado" and no code kept that promise; one refresh and
  every value needed to retry was gone. The scoped S3 credential is
  `PutObject` + `GetObject` with **no list**, so the orphaned audio could not be
  found by hand either, and a 7-day lifecycle then deleted it.
- **Columns:** `id`, `tenant_id`, `patient_id`, `doctor_id`, `audio_object_key`,
  `consultation_started_at`, `consultation_ended_at`, `fire_status`,
  `attempt_count`, `last_attempt_at`, `last_error`, `created_at`.
- **Constraints:** `fire_status IN ('pending','fired','needs_attention')`;
  `consultation_ended_at >= consultation_started_at`; `attempt_count >= 0`;
  and `UNIQUE (tenant_id, patient_id, consultation_started_at,
  consultation_ended_at)` - the partner's own idempotency grain.
- **Indexes:** a partial index on `last_attempt_at` where
  `fire_status = 'pending'` (the retry scanner's only query), and
  `(tenant_id, fire_status, created_at DESC)` (the human's query).
- **RLS:** ENABLE, with a tenant-scoped SELECT policy for `authenticated` and
  **no INSERT, UPDATE or DELETE policy for any role**. Writes are the
  service-role seam with `tenant_id` set explicitly, exactly as 0063 and 0008
  do. The missing UPDATE policy is load-bearing: `fire_status` is a machine
  verdict, and a staff session that could set it to `'fired'` would make the
  scanner skip a consultation the partner never received.

It creates one table. It alters nothing, drops nothing, and touches no existing
row. `0063` is not modified.

## 2. The pre-check number, which is the thing to read before running anything

**Expected pending count: `1`.**

Only `0064` is unapplied. `0063` was applied to production on 2026-08-14 and
merged (`docs/migration-apply-0063.md` §5), and the journal on `origin/main`
carries 63 entries, idx 0..62, with 0064 appended here as idx 63.

The pre-check is mandatory and it is the half that refuses a no-op rather than
diagnosing one afterwards. `drizzle-kit migrate` prints
`migrations applied successfully` when it applies **nothing** - which is how
0049 and 0058 both reported success over an unchanged schema.

```
pnpm --filter @osteojp/db exec node scripts/check-pending-migrations.mjs 1
```

**A non-zero exit means do not run `migrate` at all.** Not "investigate and
continue": stop, and report what it printed.

## 3. Pre-flight, before any credential is sourced

Four lines, in the apply worktree, per `docs/runbook-prod-migrations.md`
"THE PRE-FLIGHT":

```
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git status --short
git fetch origin --prune
git cat-file -t PINNED_SHA
```

Expected: `git status --short` prints **nothing**; `git cat-file -t` prints
**`commit`**. Any line at all from the first, or anything but `commit` from the
second, is a stop - including a stray file that looks harmless, because judging
which stray is harmless is the judgement this step exists to avoid making at the
top of a production sitting.

**The checkout is `git checkout --detach PINNED_SHA`.** A plain
`git checkout <branch>` is rejected while another worktree holds that branch, and
the fallback leaves the tree on `main`, where `db:migrate` silently no-ops. That
is what happened to 0049.

## 4. After the apply - independent verification, both directions

The migrate output is not evidence. Verify the side effect from a different
source:

```
pnpm --filter @osteojp/db exec node scripts/check-migration-tables.mjs consultations
```

and the journal row for idx 63 / tag `0064_consultations`.

Meaningful here in a way it was not for 0059: this migration's whole product is
a new relation, so `to_regclass('public.consultations')` returning non-null is a
direct answer to "did the schema change", not an adjacent one.

## 5. THE APPLY. 2026-08-18. Verbatim, as pasted back by the owner.

### 5.0 The block was gated, and this is the line that gated it

The file opened with, verbatim:

```
NOT VALIDATED - STRATEGY REVIEW REQUIRED - DO NOT RUN
```

Quoted rather than deleted. A receipt that simply lacks the line is
indistinguishable from a block that never carried one, and PORTAL-REHYDRATE §4.9
exists because three apply blocks have been defective while their migrations were
fine.

### 5.1 THE PINNED SHA IS ORPHANED. Read this before trying to verify §5.2.

`f2101ad` **will not resolve in a fresh clone.** It sat on
`consultation/AI-03-fire-pending-retry`; #916 was squash-merged, so that branch's
commits never became ancestors of `main`, and the branch was deleted at merge.
Checked, not assumed: `git merge-base --is-ancestor f2101ad origin/main` exits
non-zero today.

**What makes this receipt verifiable anyway** is the same tie 0063 §4 established
as the general rule - pin the sha that was checked out, the squash commit that
carries the same content, and the blob hash that binds them:

| Ref | Blob for `packages/db/migrations/0064_consultations.sql` |
|---|---|
| `f2101ad` (applied) | `226bb858c06af62596fa4a8c51189a4a27a4b935` |
| `267fce9` (squash merge of #916) | `226bb858c06af62596fa4a8c51189a4a27a4b935` |
| `origin/main` | `226bb858c06af62596fa4a8c51189a4a27a4b935` |

`meta/_journal.json` is byte-identical across all three as well
(`2c22a00b7782066bad68f296bf743a977ae1453d`).

**So what ran against production is byte-identical to what is on `main` today**,
and anyone can check it from any clone:

```
git rev-parse origin/main:packages/db/migrations/0064_consultations.sql
```

**AND THE MERGE PRESERVED THE APPLIED SHA EXACTLY, which was a deliberate choice
rather than a convenience.** #916 was 7 commits BEHIND main when the apply
completed, so GitHub refused the merge as out of date. Updating the branch would
have moved the head and broken the identity between "what was applied" and "what
merged" - the migration file would have been unchanged, but the evidence chain
would have rested on two different commits. The owner authorised
`gh pr merge --squash --admin` instead, which merged `f2101ad` as applied. The
branch head was re-verified as still `f2101ad` as the last action before merging.

### 5.2 The transcript

```
HEAD is now at f2101ad Merge branch 'main' into consultation/AI-03-fire-pending-retry
last applied "when" in the database: 1787100000000
journal entries on disk: 64
pending: 1
  PENDING 0064_consultations when=1787200000000
OK: the pending set is exactly what was expected.
[drizzle-kit migrate ran; two expected NOTICE lines: schema
"drizzle" already exists, skipping; relation
"__drizzle_migrations" already exists, skipping]
migrations applied successfully!
last applied "when" in the database: 1787200000000
journal entries on disk: 64
pending: 0
OK: the pending set is exactly what was expected.
consultations EXISTS
OK: all 1 table(s) present.
```

### 5.3 The transcript checked against the committed repo, not just read

Every figure above was re-derived from `origin/main` by the terminal writing this
file. This is the section that distinguishes a receipt from a paste.

| Transcript says | Committed repo says | Agrees |
|---|---|---|
| `journal entries on disk: 64` | `meta/_journal.json` holds 64 entries | yes |
| `PENDING 0064_consultations when=1787200000000` | last entry is `idx 63`, `tag 0064_consultations`, `when 1787200000000` | yes |
| `last applied "when" ... 1787200000000` after | same `when` as the journal's final entry | yes |
| `pending: 0` after | nothing on disk beyond idx 63 | yes |
| `consultations EXISTS` | `0064_consultations.sql` creates it; blob pinned in §5.1 | yes |

**THE PRE-CHECK IS THE PART THAT MATTERS AND IT DID ITS JOB.** The `when` moved
`1787100000000` -> `1787200000000` and pending went `1` -> `0`. §2 of this
document was written because `migrations applied successfully!` is printed even
when drizzle applies **nothing** - which is how 0058 produced a success over a
no-op. A success line alone would not have been evidence; the two numbers moving
is.

## 6. What this does NOT cover

- **No UI.** A `needs_attention` consultation is visible as a queryable state
  and a `console.error` line carrying the consultation and patient ids. A screen
  for it is carded separately, per the dispatch.
- **No backfill.** Consultations recorded before this migration were never
  persisted anywhere and cannot be recovered: their audio keys are gone and the
  bucket cannot be listed. Nothing in this migration pretends otherwise.
