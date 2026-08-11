# Apply block - migration 0061, no double-confirmed + the confirm notification

**Status: NOT VALIDATED. Drafted 2026-08-11 by PURPLE. Strategy review required
before this reaches the owner.**

Migration: `0061_no_double_confirmed_and_confirm_notification` (journal idx 60).
Branch: `db/0061-no-double-confirmed`. PR: #870.
**Apply from sha `6fd75f5`.**
Cards: `INC-08-double-booking-state-not-path`, `ACC-13-item20-staff-fanout`.

Written under `docs/runbook-prod-migrations.md`, "The pre-check is mandatory".

---

## 1. What this migration does

**Two independent changes, one apply.** Owner instruction, 2026-08-11: an apply
costs an owner sitting and there is a deadline. They touch different tables and
neither depends on the other; if one had to be reverted the other would stand.

**Part 1 — `appointments_no_double_confirmed`.** A partial `EXCLUDE` over
`(practitioner_id WITH =, tstzrange(starts_at, ends_at) WITH &&)`
`WHERE (status = 'confirmed')`, plus `CREATE EXTENSION IF NOT EXISTS btree_gist`.

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
| PR head sha | `git rev-parse HEAD` on the branch | `6fd75f5` |
| Migration number | file count + journal tail | `0061`, idx `60` |
| Journal `when` | previous `+100000000` | `1786900000000` (prev `1786800000000`) |
| Journal + mirror | `node scripts/check-journal.mjs` | 61 `.sql`, 61 entries, in order, `when` strictly increasing, **mirror matches by CONTENT** |
| Column nullability | `packages/db/src/schema.ts` | `practitioner_id`, `starts_at`, `ends_at`, `status` all `NOT NULL` — no row for which the constraint is vacuous |

---

## 5. The block

NOT VALIDATED - STRATEGY REVIEW REQUIRED - DO NOT RUN

```
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
git checkout --detach 6fd75f5
git log -1 --oneline
set -o allexport
source /Users/ivan/osteojp-secrets/new-prod.env
set +o allexport
pnpm install --frozen-lockfile
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

**`set -o allexport`, never `set -a`.** Standing rule.

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
