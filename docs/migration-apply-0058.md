# Apply block - migration 0058, patient_terms_acceptances

**Status: APPLIED AND PROVEN, 2026-08-07. Evidence in section 8.**
**Second attempt. The first applied nothing and the checker caught it (section 7).**
**PR #833 merged 2026-08-07 after the apply, squashed to `45d0bcf` on `main`.**

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

---

## 8. APPLIED, 2026-08-07. The evidence.

Second attempt, run by Ivan from the prod-apply worktree. Written into the repo
in the same turn the output arrived, per section 6. His pasted output:

```
Checkout:  HEAD is now at 67e10dc fix(db): the 0058 journal entry went BACKWARDS in time, so drizzle applied nothing
Pre-check: last applied when in DB 1786500000000, journal entries on disk 58, pending 1,
           PENDING 0058_patient_terms_acceptances when=1786600000000
           OK: the pending set is exactly what was expected.
Migrate:   migrations applied successfully.
Checker:   patient_terms_acceptances EXISTS
           OK: all 1 table(s) present.
```

### What each line proves, because three of the four also printed on the failed run

| Line | What it proves | Would it have printed on the FIRST attempt? |
|---|---|---|
| `HEAD is now at 67e10dc` | Detached at the corrected commit, not on `main`. `67e10dc` is the timestamp fix; the failed run was `630f1ea`, one commit earlier | It printed `630f1ea`. **Different commit, and that is the whole difference** |
| Pre-check `pending 1` | Drizzle's OWN pending predicate, run read-only before any write, agreed exactly one migration was pending and named it | **No. This is the new line.** On the first attempt it would have printed pending 0 and exited non-zero, and `migrate` would never have run |
| `migrations applied successfully` | Nothing on its own | **Yes, identically.** It printed on the run that applied nothing. It is not evidence |
| `patient_terms_acceptances EXISTS` | The table is in `pg_catalog` on the production database | **No.** It printed `MISSING` and exit 1 |

The arithmetic reconciles in both directions. Last applied `when` in the
database was `1786500000000`, which is 0057. The journal's 0058 entry is
`1786600000000`, which is `+100000000` and back on the synthetic series. 58
entries on disk, 57 applied, 1 pending. The pre-check computed that from the
database rather than being told it.

**Two independent confirmations, and neither is drizzle's own success message.**
The pre-check proved the work existed BEFORE the write; the table checker proved
the object existed AFTER it, by reading `pg_catalog` through `to_regclass`. That
pair is what section 4 asked for, and it is the pair the first attempt failed.

### State after the apply

- Production (`dfotoodqvmjhbdcxyaxf`) holds `public.patient_terms_acceptances`.
- `drizzle.__drizzle_migrations` has a tracking row at `created_at = 1786600000000`.
- Journal on disk: 58 entries, last `idx` 57, tag `0058_patient_terms_acceptances`.
- **The migration slot is FREE.** Next free number is `0059`. Nothing anywhere in
  the repo holds an unapplied migration, so the one-in-flight rule is satisfied
  and the next migration author may take `0059`.
- PR #833 merged after the apply, in the ruled order. Merge commit `45d0bcf`.
  `git diff --stat 67e10dc origin/main` is EMPTY: the merged tree is identical to
  the tree that was applied from, so the applied commit and the shipped commit
  are the same code.

