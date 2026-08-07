# Apply block - migration 0058, patient_terms_acceptances

**Status: CORRECTED after the first attempt applied NOTHING. For strategy validation.**
**PR #833 is green. The first attempt failed and the checker caught it.**

Migration: `0058_patient_terms_acceptances` (journal idx 57).
Branch: `portal/W13-05-terms-acceptance`.

---

## 1. Pre-flight facts, each verified rather than remembered

| Fact | How it was checked | Value |
|---|---|---|
| Apply worktree path | `git worktree list` on this machine | `/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply` |
| Env file | directory listing, **name only, never read** | `/Users/ivan/osteojp-secrets/new-prod.env` |
| Checker | `ls packages/db/scripts/` | `check-migration-tables.mjs`, committed |
| Journal | `node scripts/check-journal.mjs` | 58 `.sql` files match 58 entries, in order |
| Mirrored trees | `diff` of both file lists | identical |

**The path is NOT `~/osteojp-prod-apply`.** That is what prose in earlier notes
implies and it does not exist. The 0057 apply block named a worktree path taken
from prose instead of the filesystem and it was wrong; this one comes from
`git worktree list`.

**A TABLE migration gets the TABLE checker.** `check-migration-columns.mjs` is
its sibling for column-only migrations. 0058 creates a table, so
`check-migration-tables.mjs` is the correct one, and it is committed, not a
one-off script that gets deleted afterwards and cannot be re-run.

---

## 2. The block

Run every line from a normal terminal. One command per line. Nothing here
writes to any file in the repo.

```
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
git checkout origin/portal/W13-05-terms-acceptance
git log -1 --oneline
set -o allexport
source /Users/ivan/osteojp-secrets/new-prod.env
set +o allexport
pnpm install --frozen-lockfile
pnpm --filter @osteojp/db exec node scripts/check-pending-migrations.mjs 1
pnpm --filter @osteojp/db exec drizzle-kit migrate
pnpm --filter @osteojp/db exec node scripts/check-migration-tables.mjs patient_terms_acceptances
unset DATABASE_URL DATABASE_URL_DIRECT
```

**STOP IF THE PRE-CHECK FAILS.** `check-pending-migrations.mjs 1` is new, and it
is the line that makes the first attempt's failure impossible to repeat. It
reads drizzle's own bookkeeping READ ONLY, applies drizzle's own pending
predicate, and exits non-zero unless exactly one migration is pending. If it
fails, do not run the `migrate` line at all.

**`git checkout origin/<branch>`, detached, is load-bearing.** A plain
`git checkout <branch>` is rejected in that worktree, and the fallback leaves it
on `main` where `drizzle-kit migrate` finds nothing new and prints
`migrations applied successfully` for a migration that never ran. That is the
0049 incident, recorded at `docs/DECISIONS.md:2215`. The `git log -1 --oneline`
line exists so the detached commit is in the pasted output and can be checked.

**`set -o allexport`, never `set -a`.** Standing rule.

---

## 3. What to paste back

All of it, verbatim:

1. The `git log -1 --oneline` line, which proves which commit was applied from.
2. The full `drizzle-kit migrate` output.
3. The full `check-migration-tables.mjs` output.

## 4. What success looks like

- `drizzle-kit migrate` prints `migrations applied successfully`.
- The checker prints `patient_terms_acceptances` as present and **exits 0**.

**The checker is the real proof, not drizzle-kit.** `drizzle-kit migrate` prints
success whether or not it applied anything, which is exactly how 0049 was
reported applied when it had not run. The checker opens a READ ONLY transaction,
reads `pg_catalog` via `to_regclass`, touches no patient table, and exits 1
naming what is missing if the table is not there.

## 5. STOP conditions

Stop and paste the output rather than working around any of these.

- **The checker exits 1**, or names `patient_terms_acceptances` as missing. The
  migration did not run, whatever drizzle-kit printed.
- **`git checkout` fails or leaves you on `main`.** Do not force it. `git log -1`
  will show it; paste that and stop.
- **`drizzle-kit migrate` reports applying more than one migration.** Only 0058
  should be pending. Anything else means the slot was not what this PR assumed.
- **Any error mentioning a relation that already exists.** Stop; do not re-run.

## 6. After the paste

The evidence section gets written into the repo **in the same turn the output
arrives**, not later. The 0057 apply record was written late and only when the
owner asked, and that was logged as a process failure. Then, and only then,
#833 merges.

---

## 7. FIRST ATTEMPT FAILED, 2026-08-07. What happened and why.

The block was run on `630f1ea`, the checkout was correct, and drizzle printed:

```
[checkmark] migrations applied successfully!
patient_terms_acceptances  MISSING
FAIL: 1 table(s) missing: patient_terms_acceptances
exit code 1
```

**Nothing was applied.** The checker earned its place.

### The cause, with file evidence

`drizzle-orm/pg-core/dialect.js:62` decides what is pending:

```
if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis)
```

`folderMillis` is the journal entry's `when` (`drizzle-orm/migrator.js:22`), and
`created_at` is the `when` of the last row in `__drizzle_migrations`
(`dialect.js:67` inserts `folderMillis` into it).

The journal's `when` values are a SYNTHETIC series stepping `+100000000` per
entry, already years in the future:

```
0056  1786400000000
0057  1786500000000
0058  1786093200000   <-- 406800000 LOWER than 0057
```

The 0058 entry was hand-appended with a real-world timestamp
(`Date.parse("2026-08-07T09:00:00Z")`) instead of following that convention.
Since `1786500000000 < 1786093200000` is false, drizzle treated 0058 as already
in the past, applied nothing, and printed success anyway.

Corrected to `1786600000000`.

### Ruled out, so they are not re-investigated

- **Wrong database.** `drizzle.config.ts` reads
  `DATABASE_URL_DIRECT ?? DATABASE_URL` and THROWS when neither is set. There is
  no default or fallback connection. It did not throw, so the environment was
  sourced correctly.
- **A blank or wrong database.** The output carried
  `NOTICE 42P06 schema "drizzle" already exists` and
  `NOTICE 42P07 relation "__drizzle_migrations" already exists`. It connected to
  a database that already held drizzle's bookkeeping, which a default or fresh
  database would not.
- **Wrong checkout or missing file.** `git log -1` confirmed `630f1ea`, and
  `0058_patient_terms_acceptances.sql` is present at that commit in both
  mirrored trees.

### Two guards added so this cannot recur silently

1. **`scripts/check-journal.mjs` now asserts `when` is STRICTLY INCREASING.**
   It previously checked counts, `idx` contiguity and filename order, all of
   which reconciled while the migration was unappliable. Proven against the real
   bug: restoring the bad timestamp fails the check and prints the correct value.
2. **`packages/db/scripts/check-pending-migrations.mjs`**, the new pre-check in
   the block above. It refuses a no-op BEFORE `migrate` runs rather than
   diagnosing it afterwards.

