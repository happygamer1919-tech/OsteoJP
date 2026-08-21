# Apply block - migration 0059, pedido does not block a slot

**Status: APPLIED AND PROVEN, 2026-08-07. Evidence in section 9.**
**Applied from `494d82f` detached in the prod-apply worktree, first attempt.**

Migration: `0059_pedido_does_not_block_slot` (journal idx 58).
Branch: `portal/W13-04a-availability-exclusion`.
PR: #836.

This block is written under the **amended** apply doctrine
(`docs/runbook-prod-migrations.md`, "The pre-check is mandatory"), which became
binding after 0058 applied nothing and printed success.

---

## 1. Pre-flight facts, each verified against the machine rather than remembered

| Fact | How it was checked | Value |
|---|---|---|
| Apply worktree path | `git worktree list` | `/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply` |
| Env file | directory listing, **name only, never read** | `/Users/ivan/osteojp-secrets/new-prod.env` |
| Migration number | `ls packages/db/migrations/*.sql` + journal tail | `0059`, idx `58` |
| Journal `when` | previous entry `+100000000` | `1786700000000` |
| Journal reconciles | `node scripts/check-journal.mjs` | 59 `.sql` files match 59 entries, in order, `when` strictly increasing |
| Mirrored trees | `node scripts/sync-supabase-migrations.mjs` | 59 in each, identical |
| Checker | `ls packages/db/scripts/` | `check-migration-functions.mjs`, **committed in this PR** |

**The number was derived at authoring, never reserved.** Rehydrate rule 7: main
ended at `0058`, the journal's last entry was idx 57, both mirrored trees held 58
files. `0059` / idx 58 follows from that and from nothing else.

**The `when` value follows the synthetic series, not the clock.** `1786600000000
+ 100000000`. A real `Date.now()` here lands BELOW its predecessor and drizzle
silently skips the migration - that is INC-07, and it is what 0058's first
attempt did. `check-journal.mjs` now asserts strictly-increasing `when` and
passes on this entry.

---

## 2. THE CHECKER IS NEW, AND THE REASON MATTERS MORE THAN USUAL

`check-migration-tables.mjs` and `check-migration-columns.mjs` do not fit: 0059
creates no table and no column. Its whole effect is two
`CREATE OR REPLACE FUNCTION` statements.

**And an existence check would be worthless for the important half.**
`public.appointment_conflicts` **already exists** - 0052 created the body this
migration replaces. Asking "does it exist" returns true whether 0059 ran or not.
That is a checker that issues a receipt for a no-op, which is the precise failure
mode the post-0058 doctrine exists to close.

So `check-migration-functions.mjs` (committed in this PR, not a one-off) checks
the function **BODY**:

- `is_unconfirmed_pedido` must **EXIST** - it is genuinely new, so existence is
  real proof.
- `appointment_conflicts` must exist **and its installed definition must contain
  the token `is_unconfirmed_pedido`** - which the 0052 body does not. That reads
  what is actually installed in the database right now.

It opens a READ ONLY transaction, reads `pg_catalog` only, and never prints the
function body, the connection string or any environment value.

---

## 3. The block

Run every line from a normal terminal. One command per line. Nothing here writes
to any file in the repo.

```
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
git checkout origin/portal/W13-04a-availability-exclusion
git log -1 --oneline
set -o allexport
source /Users/ivan/osteojp-secrets/new-prod.env
set +o allexport
pnpm install --frozen-lockfile
pnpm --filter @osteojp/db exec node scripts/check-pending-migrations.mjs 1
pnpm --filter @osteojp/db exec drizzle-kit migrate
pnpm --filter @osteojp/db exec node scripts/check-migration-functions.mjs is_unconfirmed_pedido appointment_conflicts:is_unconfirmed_pedido
unset DATABASE_URL DATABASE_URL_DIRECT
```

**STOP IF THE PRE-CHECK FAILS. Do not run the `migrate` line at all.**
`check-pending-migrations.mjs 1` reads drizzle's own bookkeeping READ ONLY,
applies drizzle's own pending predicate, and exits non-zero unless exactly one
migration is pending. It is mandatory under the amended doctrine, and it is the
line that makes 0058's first failure impossible to repeat.

**`git checkout origin/<branch>`, detached, is load-bearing.** A plain
`git checkout <branch>` is rejected in that worktree, and the fallback leaves it
on `main` where `drizzle-kit migrate` finds nothing new and prints
`migrations applied successfully` for a migration that never ran. That is the
0049 incident (`docs/DECISIONS.md`). The `git log -1 --oneline` line exists so
the detached commit appears in the pasted output and can be checked.

**`set -o allexport`, never `set -a`.** Standing rule.

---

## 4. What to paste back

All of it, verbatim:

1. The `git log -1 --oneline` line, which proves which commit was applied from.
2. The full `check-pending-migrations.mjs` output.
3. The full `drizzle-kit migrate` output.
4. The full `check-migration-functions.mjs` output.

## 5. What success looks like

- The pre-check prints `pending 1` and names `0059_pedido_does_not_block_slot`,
  then `OK`.
- `drizzle-kit migrate` prints `migrations applied successfully`.
- The function checker prints:
  ```
  appointment_conflicts   EXISTS, body contains "is_unconfirmed_pedido"
  is_unconfirmed_pedido   EXISTS
  OK: all 2 function check(s) passed.
  ```
  and **exits 0**.

**Only lines 1 and 4 are evidence.** `drizzle-kit migrate` prints success whether
or not it applied anything - it printed exactly that on the run that applied
nothing on 0058. The pre-check proves the work existed before the write; the
function checker proves the new body is installed after it.

## 6. STOP conditions

Stop and paste the output rather than working around any of these.

- **The pre-check fails**, for any reason. Do not run `migrate`.
- **The function checker exits 1**, or reports `STALE BODY`. `STALE BODY` means
  the replace did not land: the function is still 0052's, whatever drizzle
  printed.
- **`git checkout` fails or leaves you on `main`.** Do not force it. `git log -1`
  will show it; paste that and stop.
- **`drizzle-kit migrate` reports applying more than one migration.** Only 0059
  should be pending.

## 7. Rollback, if it is ever needed

Re-apply 0052's body. `CREATE OR REPLACE FUNCTION` with 0052's text restores the
previous behaviour exactly: no data is read, written or backfilled by either
version, no table is locked, and the signature is unchanged so no grant moves.
The interim behaviour a rollback restores (a pedido holds its slot) is the SAFE
side of the ruling - it over-blocks, so no double booking becomes possible.

## 8. After the paste

The evidence section gets written into this file **in the same turn the output
arrives**, not later. Then, and only then, #836 merges.


---

## 9. APPLIED, 2026-08-07. The evidence.

Run by Ivan from the prod-apply worktree, **first attempt, no retry**. Written
into the repo in the same turn the output arrived, per section 8, and committed
BEFORE #836 merged.

```
Checkout:   494d82f (detached) fix(db): the supabase mirror held a SUPERSEDED 0059 body, and nothing counted it

Pre-check:  pending 1
            PENDING 0059_pedido_does_not_block_slot when=1786700000000
            last applied when in DB 1786600000000
            OK: the pending set is exactly what was expected.

Migrate:    migrations applied successfully.

Checker:    is_unconfirmed_pedido   EXISTS
            appointment_conflicts   EXISTS, body contains "is_unconfirmed_pedido"
            OK: all 2 function check(s) passed.
```

### What each line proves, and what it does not

| Line | What it proves | Would it print on a NO-OP? |
|---|---|---|
| `494d82f` detached | Applied from the reviewed commit, not from `main` | It would print a different sha. This is the 0049 guard |
| Pre-check `pending 1` | Drizzle's OWN pending predicate, read-only, BEFORE any write, agreed exactly one migration was pending and named it | **No.** It would print `pending 0` and exit non-zero, and `migrate` would never run |
| `migrations applied successfully` | **Nothing on its own** | **Yes, identically.** It printed on the 0058 run that applied nothing. It is not evidence |
| `is_unconfirmed_pedido EXISTS` | A genuinely NEW object is in `pg_catalog` | **No.** 0059 is the only thing that creates it |
| `appointment_conflicts` **body contains** the token | The REPLACE landed. The 0052 body does not contain that token | **No — and this is the half an existence check could not give.** `appointment_conflicts` has existed since 0048, so "does it exist" answers true whether 0059 ran or not |

### The arithmetic reconciles in both directions

Last applied `when` in the database was `1786600000000`, which is 0058. The
journal's 0059 entry is `1786700000000`, which is `+100000000` and forward on the
synthetic series — so drizzle's `lastDbMigration.created_at < folderMillis` test
is TRUE and the entry is pending, which is exactly what the pre-check reported.
59 entries on disk, 58 applied, 1 pending, computed from the database rather than
asserted from the file.

**Both new guards were exercised and both passed.** The mandatory pre-check
(INC-07, made binding in #834) confirmed the work existed before the write. The
mirror-content assertion in `check-journal.mjs` — added the same day, after the
supabase mirror was found holding a superseded body — passed on the corrected
mirror, which is what the DB-gated CI job applied when it proved the SQL against
a real Postgres.

### State after the apply

- Production (`dfotoodqvmjhbdcxyaxf`) holds `public.is_unconfirmed_pedido(uuid)`
  and an `appointment_conflicts` whose body calls it.
- `drizzle.__drizzle_migrations` has a tracking row at `created_at = 1786700000000`.
- Journal on disk: 59 entries, last `idx` 58, tag `0059_pedido_does_not_block_slot`.
- **The migration slot is FREE.** Next free number is `0060`. Nothing anywhere in
  the repo holds an unapplied migration.
- **This was the wave's final planned migration.** W13-04a was sequenced as the
  last one after LOOP 5 (strategy ruling 2026-08-06), and it has now landed.
