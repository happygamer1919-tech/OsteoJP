# Apply block - migration 0061, no double-confirmed + the confirm notification

**Status: VALIDATED by strategy 2026-08-12. Cleared to run.**

The `NOT VALIDATED` banner that stood in section 5 was cleared by strategy on the
basis of a **nine-point review**: the working directory, the detached checkout of
the pinned sha, the env source and `set -o allexport`, the pre-check with a
literal expected count, the post-check proving pending drops to zero, one command
per line with no backticks, no credential echoed or interpolated, nothing that
builds or installs or tests, and explicit paste-back instructions.

**PURPLE did not clear its own banner.** Two of the nine failed on the first pass
and were fixed before clearance: an apply-only worktree was running
`pnpm install --frozen-lockfile`, and the paste-back instructions were
incomplete. The install was proven unnecessary by comparing the lockfile hash at
the pinned sha with the worktree's, rather than by assuming.

Migration: `0061_no_double_confirmed_and_confirm_notification` (journal idx 60).
Branch: `db/0061-no-double-confirmed`. PR: #870.
**Apply from sha `65d9611`.**
Cards: `INC-08-double-booking-state-not-path`, `ACC-13-item20-staff-fanout`.

Written under `docs/runbook-prod-migrations.md`, "The pre-check is mandatory".

---

## 1. What this migration does

**Two independent changes, one apply.** Owner instruction, 2026-08-11: an apply
costs an owner sitting and there is a deadline. They touch different tables and
neither depends on the other; if one had to be reverted the other would stand.

**Part 1 — `appointments_no_double_confirmed`.** A partial `EXCLUDE` over
`(practitioner_id WITH =, tstzrange(starts_at, ends_at) WITH &&)`
`WHERE (status = 'confirmed')`, plus `btree_gist`.

**It does not trust `search_path`.** `practitioner_id WITH =` needs the
`gist_uuid_ops` operator class, which Postgres resolves through `search_path`.
On Supabase extensions conventionally live in the **`extensions`** schema rather
than `public`, and if `search_path` excludes it the `ALTER` fails with *"data
type uuid has no default operator class for access method gist"* — which reads
like a missing extension when the extension is present and merely out of scope.
**CI cannot catch this**: a `supabase db reset` database has its own extension
layout, so a green CI run proves the DDL works *there* and says nothing about
production. Part 1 is therefore a `DO` block that asks the catalog which schema
holds the opclass and schema-qualifies it, correct under either layout. It also
short-circuits if the constraint already exists, so re-applying is a no-op.

**Part 2 — the `confirmed` notification kind.** Rewrites
`staff_notifications_kind_check` from four values to five, and adds a nullable
`actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL`.

---

## 2. THIS MIGRATION CAN FAIL, AND THAT IS THE POINT

**Unlike 0058, 0059 and 0060, this one is not guaranteed to apply.**
`ADD CONSTRAINT … EXCLUDE` builds an index over existing rows and is **refused
outright** if any pair already violates it — `23P01`, nothing is changed, the
transaction rolls back.

**The surviving row from INC-08 may be exactly such a pair.** The production
double booking was real: practitioner `8ac3b349`, one window, two rows reaching
`confirmed`. The pedido was later cancelled, which probably clears it — but
"probably" is not a pre-check.

**So section 3 runs FIRST and separately.** If it returns rows, this apply does
not happen at all and the overlap is resolved by a person.

---

## 3. THE PRE-CHECK. Read-only. Run this BEFORE anything in section 5.

It is the constraint's own predicate, written as a self-join, so a zero-row
result is a direct statement that the `ALTER` will succeed.

```
SELECT a.tenant_id,
       a.practitioner_id,
       a.id         AS appointment_a,
       a.starts_at  AS a_starts,
       a.ends_at    AS a_ends,
       b.id         AS appointment_b,
       b.starts_at  AS b_starts,
       b.ends_at    AS b_ends
  FROM public.appointments a
  JOIN public.appointments b
    ON  b.practitioner_id = a.practitioner_id
    AND b.id > a.id
    AND tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at)
 WHERE a.status = 'confirmed'
   AND b.status = 'confirmed'
 ORDER BY a.practitioner_id, a.starts_at;
```

**`b.id > a.id`** so each colliding pair is reported once rather than twice.
**No `tenant_id` join condition**, deliberately: `practitioner_id` already
partitions by tenant, and adding one would hide a cross-tenant data defect rather
than surface it.

**ZERO ROWS → proceed to section 5.**
**ANY ROWS → STOP. Do not run section 5.** Report the rows; the overlap is a real
double booking in the clinic's diary and a person decides which one moves.

---

## 4. Pre-flight facts, verified against the machine rather than remembered

| Fact | How it was checked | Value |
|---|---|---|
| Apply worktree | `git worktree list` | `/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply` |
| Env file | directory listing, **name only, never read** | `/Users/ivan/osteojp-secrets/new-prod.env` |
| Apply sha | `git log -n1 -- packages/db/migrations supabase/migrations` | `65d9611` |
| Migration number | file count + journal tail | `0061`, idx `60` |
| Journal `when` | previous `+100000000` | `1786900000000` (prev `1786800000000`) |
| Journal + mirror | `node scripts/check-journal.mjs` | 61 `.sql`, 61 entries, in order, `when` strictly increasing, **mirror matches by CONTENT** |
| Column nullability | `packages/db/src/schema.ts` | `practitioner_id`, `starts_at`, `ends_at`, `status` all `NOT NULL` — no row for which the constraint is vacuous |

---

## 5. The block

VALIDATED BY STRATEGY 2026-08-12 - CLEARED TO RUN

```
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
git checkout --detach 65d9611
git log -1 --oneline
set -o allexport
source /Users/ivan/osteojp-secrets/new-prod.env
set +o allexport
pnpm --filter @osteojp/db exec node scripts/check-pending-migrations.mjs 1
pnpm --filter @osteojp/db exec drizzle-kit migrate
pnpm --filter @osteojp/db exec node scripts/check-pending-migrations.mjs 0
unset DATABASE_URL DATABASE_URL_DIRECT
```

**`git checkout --detach <sha>` is load-bearing.** A plain `git checkout <branch>`
is rejected in that worktree, and the fallback leaves it on `main` — where
`db:migrate` finds nothing pending and prints success over a no-op. That is
INC-07, twice.

**STOP IF `check-pending-migrations.mjs 1` FAILS.** It reads drizzle's own
pending calculation. If it does not say exactly one is pending, the tree is not
what this block assumes and nothing below it means anything.

**`set -o allexport`, never `set -a`.** Standing rule; `set -a` errors in zsh.

**NO INSTALL, AND THAT IS DELIBERATE.** An earlier draft ran
`pnpm install --frozen-lockfile` here. It is removed: **the prod-apply worktree
is for applying, not for building.** It is also provably unnecessary rather than
merely unwanted, checked on 2026-08-12 before removal:

- `osteojp-prod-apply/packages/db/node_modules/.bin/drizzle-kit` exists, so the
  migrate command resolves;
- `pnpm-lock.yaml` at `65d9611` is **byte-identical** to the one in that
  worktree, so there is nothing an install would change.

**If `drizzle-kit` is ever not found, STOP and say so.** Do not add an install to
this block to get past it; that is a separate, deliberate act outside the apply.

**CLOSE THE TERMINAL WINDOW WHEN THE APPLY IS DONE. Owner instruction,
2026-08-12, and it generalises to every apply doc after this one.**
The final `unset` names only `DATABASE_URL` and `DATABASE_URL_DIRECT`, but
`set -o allexport` exported **every** variable in the env file. Unsetting two of
them leaves the rest live in that shell. Closing the window is the only complete
answer, and it is cheaper than maintaining a list that will drift.

**SCAN THE OUTPUT FOR `postgres://` BEFORE PASTING IT BACK. Owner instruction,
2026-08-12.** `drizzle-kit migrate` can print the connection string on some
failures. Our own `check-pending-migrations.mjs` never does - it reads
`DATABASE_URL_DIRECT` at line 61 and prints only counts, tags and `when` values -
but the migrate tool is not ours and its failure paths are not ours to promise.
A leaked connection string in a pasted block has already cost this project one
password rotation.

**WHAT TO PASTE BACK, and it is four things:**

1. the `git log -1 --oneline` line, proving which sha was applied;
2. the **first** `check-pending-migrations` output, showing `pending: 1`;
3. the `drizzle-kit migrate` output;
4. the **second** `check-pending-migrations` output, showing `pending: 0`.

**Items 2 and 4 together are the journal proof.** Neither alone is: a success
message from `migrate` is not evidence that anything ran, which is INC-07 twice
over.

**WHY `65d9611` AND NOT THE BRANCH HEAD.** It is the last commit that touches
anything **this block executes** — `packages/db/migrations/` (the SQL and the
journal) and `supabase/migrations/` (the mirror). Re-derive it with
`git log -n1 -- packages/db/migrations supabase/migrations`.

**The paths are narrow deliberately.** A coarser `-- packages/db supabase` also
matches `packages/db/tests/`, and test commits on this branch must NOT force a
repin: the block runs `drizzle-kit migrate`, never vitest, so a test change
cannot affect what it applies.

**THIS SHA HAS MOVED TWICE, AND BOTH REASONS ARE WORTH KEEPING.** It first
pinned `6fd75f5`; rebasing onto `main` to pick up #869 rewrote it to `a8b2b1b`.
It then pinned `a8b2b1b` while the migration BODY changed underneath it —
`65d9611` made the DDL schema-agnostic — which is the more dangerous of the two,
because the sha still existed and still checked out cleanly. It would simply
have applied the OLD DDL, the one that fails when `search_path` excludes the
schema holding `btree_gist`. **Whenever `packages/db/migrations/` changes on this
branch, this sha must change with it.**

**THIS SHA WAS REPINNED ONCE, and the reason is worth keeping.** The block first
pinned `6fd75f5`, the pre-rebase commit. Rebasing onto `main` to pick up #869
rewrote it to `65d9611`, and a block pointing at a commit that is no longer on
the branch would have sent the apply worktree to a detached sha with the right
content but no relationship to the PR being merged — or, if the old object had
been garbage-collected, to a hard failure at the checkout. **If this branch is
rebased again, this sha must be updated again.**

---

## 6. What proves it actually ran

`check-pending-migrations.mjs 1` **before** and `0` **after** is the execution
proof, and unlike 0060 this migration also creates objects, so there is a second,
independent confirmation available. Paste back:

1. the `git log -1 --oneline` line;
2. both `check-pending-migrations` outputs;
3. the `drizzle-kit migrate` output;
4. the pre-check result from section 3 (the zero-row confirmation).

---

## 7. STOP conditions

- The section 3 pre-check returns **any** rows.
- `check-pending-migrations.mjs 1` does not report exactly one pending.
- `drizzle-kit migrate` reports `23P01` — that means the pre-check was run
  against a different database than the migration, and both must be re-checked.
- `CREATE EXTENSION btree_gist` is refused for privilege. It is available on
  Supabase and the migration role owns the schema, but if it fails, **stop**:
  the constraint cannot be created without it and the rest of the file must not
  be half-applied.
- The migration raises `btree_gist is installed but no gist operator class for
  uuid was found`. That means the extension exists but is broken or partial;
  **stop** rather than reinstalling it under a running clinic.

---

## 8. Rollback

```
ALTER TABLE public.appointments DROP CONSTRAINT appointments_no_double_confirmed;
```

Part 2 needs no rollback in practice: a widened `CHECK` and a nullable column
break nothing that ran before them. If it is wanted anyway, the `CHECK` is
restored by re-running 0055's original four-value constraint, and the column is
dropped — but **only after** confirming no `confirmed` rows exist, since those
would violate the narrower check.

---

## 9. After the paste

Merge PR #870. Apply-before-merge: the PR does **not** merge until the journal
output above is pasted back.
