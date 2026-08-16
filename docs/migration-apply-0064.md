NOT VALIDATED - STRATEGY REVIEW REQUIRED - DO NOT RUN

# Apply block - migration 0064, `consultations`

**Status: DRAFTED, NOT APPLIED.** Per `PORTAL-REHYDRATE.md` §4.9 the first line
above is written by the drafting terminal and removed only by strategy. The path
is draft -> strategy -> Ivan. This document has not been sent to the owner and
must not be.

Migration: `0064_consultations` (journal idx 63, `when` 1787200000000).
Branch: `consultation/AI-03-fire-pending-retry`.
Apply worktree: `/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply`.
Written under `docs/runbook-prod-migrations.md`.

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

## 5. THE APPLY

Not run. This section is filled with the owner's verbatim transcript afterwards,
and the pinned sha is recorded alongside the squash commit - under squash-merge
the applied sha stops being reachable the instant the PR merges
(`docs/migration-apply-0063.md` §4).

## 6. What this does NOT cover

- **No UI.** A `needs_attention` consultation is visible as a queryable state
  and a `console.error` line carrying the consultation and patient ids. A screen
  for it is carded separately, per the dispatch.
- **No backfill.** Consultations recorded before this migration were never
  persisted anywhere and cannot be recovered: their audio keys are gone and the
  bucket cannot be listed. Nothing in this migration pretends otherwise.
