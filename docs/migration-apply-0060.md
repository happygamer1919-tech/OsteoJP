# Apply block - migration 0060, pin the SECURITY DEFINER owner

**Status: DRAFTED, FOR STRATEGY VALIDATION. NOT sent to Ivan.**

Migration: `0060_pin_security_definer_owner` (journal idx 59).
Branch: `sec/0060-pin-function-owner`. PR: #844.
**Apply from sha `1ea8697`**, which is NOT the branch head — see below.
Card: `SEC-function-owner-unpinned`.

Written under the amended doctrine (`docs/runbook-prod-migrations.md`, "The
pre-check is mandatory").

---

## 1. What this migration does, and why it is a no-op

Thirteen `ALTER FUNCTION … OWNER TO postgres` statements, one per public
SECURITY DEFINER function, explicit, no loop and no dynamic SQL.

**Every one is a no-op.** The production read on 2026-08-07 returned all thirteen
already owned by `postgres`. The value is that ownership becomes a **repo fact**
instead of an accident of who ran migrate.

**It is therefore the lowest-risk migration this repo has applied.** It changes
no body, no signature, no grant and no volatility; it reads and writes no table
row; nothing is locked beyond a catalog entry. Re-running it is harmless.

---

## 2. HOW THIS BLOCK PROVES `migrate` ACTUALLY RAN

**This is the one thing a no-op migration makes hard, and it is why the block has
four checks rather than two.**

Everything else in this repo's apply history proved execution by proving a NEW
OBJECT EXISTS — a table for 0058, a function body for 0059. **0060 creates
nothing.** Its correct end state is byte-identical to its correct start state, so:

- **`drizzle-kit migrate` printing success proves nothing.** It prints that on a
  no-op. It printed exactly that on the 0058 run that applied nothing.
- **The ownership checker passing afterwards proves nothing either.** It passed
  *before* the migration too. An after-only ownership check on a no-op migration
  is a receipt, not evidence.

**The ONLY thing that proves execution is drizzle's own pending count going from
exactly 1 to exactly 0.** That transition can happen for one reason: `migrate`
ran and wrote a tracking row into `drizzle.__drizzle_migrations`. Nothing else in
the block can move it.

So the block runs **`check-pending-migrations.mjs 1` before** and
**`check-pending-migrations.mjs 0` after**. The pair is the execution proof, and
it is the only part of the output that is.

The two ownership runs answer a different question — *is the state still what the
migration asserts* — and they bracket the write so that any difference between
them is itself a finding.

| Check | Answers | Proves execution? |
|---|---|---|
| ownership, before | is the premise true right now | no |
| **pending == 1** | there is exactly one migration to run | **sets up the proof** |
| `migrate` output | the command ran | **no** — prints success on a no-op |
| **pending == 0** | **it was applied** | **YES — this is the proof** |
| ownership, after | the state still holds | no |

---

## 3. Pre-flight facts, verified against the machine rather than remembered

| Fact | How it was checked | Value |
|---|---|---|
| Apply worktree | `git worktree list` on this machine | `/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply` |
| Env file | directory listing, **name only, never read** | `/Users/ivan/osteojp-secrets/new-prod.env` |
| PR head sha | `gh pr view 844 --json headRefOid` | `1ea8697` |
| Migration number | file count + journal tail | `0060`, idx `59` |
| Journal `when` | previous `+100000000` | `1786800000000` |
| Journal + mirror | `node scripts/check-journal.mjs` | 60 `.sql` files, 60 entries, in order, `when` strictly increasing, **mirror matches by CONTENT** |
| Checker | `ls packages/db/scripts/` | `check-security-definer-owner.mjs`, **committed in this PR** |

**The function list was reconciled against PRODUCTION, not derived by grep.** An
earlier grep reported twelve; it missed `appointment_conflicts` because it read
six lines of context above each `SECURITY DEFINER` marker and that function's
`CREATE` line sits **eighteen** lines above. A migration built on the twelve-item
list would have left the most important function unpinned **while reporting
success**.

**One signature error was caught before the apply**, by checking each against its
`CREATE`: `merge_patients` takes **three** uuid parameters, not two. A
two-argument signature would have failed mid-migration with `function does not
exist`.

---

## 4. The block

```
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
git checkout --detach 1ea8697
git log -1 --oneline
set -o allexport
source /Users/ivan/osteojp-secrets/new-prod.env
set +o allexport
pnpm install --frozen-lockfile
pnpm --filter @osteojp/db exec node scripts/check-security-definer-owner.mjs
pnpm --filter @osteojp/db exec node scripts/check-pending-migrations.mjs 1
pnpm --filter @osteojp/db exec drizzle-kit migrate
pnpm --filter @osteojp/db exec node scripts/check-pending-migrations.mjs 0
pnpm --filter @osteojp/db exec node scripts/check-security-definer-owner.mjs
unset DATABASE_URL DATABASE_URL_DIRECT
```

**WHY `1ea8697` AND NOT THE BRANCH HEAD.** Commits after it on this branch are
**documentation and board only** — verified: nothing under `packages/db/` or
`supabase/` changed after it, so the SQL, the journal, the mirror and all three
checkers are byte-identical at both. `1ea8697` is the last commit that touched
anything this block executes, and pinning it means the block stays valid while
the PR body and the plan keep being revised. If a future commit does change
`packages/db/` or `supabase/`, this sha must be updated with it.

**`git checkout --detach <sha>`, on the explicit sha, is load-bearing.** A plain
`git checkout <branch>` is rejected in that worktree, and the fallback leaves it
on `main`, where `migrate` finds nothing pending and prints success anyway — the
0049 incident. Pinning the sha rather than the branch name also means a push to
the branch between validation and apply cannot silently change what runs.
`git log -1 --oneline` must echo `1ea8697`.

**STOP IF `check-pending-migrations.mjs 1` FAILS.** It reads drizzle's own
bookkeeping READ ONLY and exits non-zero unless exactly one migration is pending.
If it fails, **do not run `migrate` at all**.

**`set -o allexport`, never `set -a`.** Standing rule.

---

## 5. What to paste back

All six, verbatim and in order:

1. `git log -1 --oneline` — proves which commit was applied from.
2. The **first** ownership check.
3. The **pre-check** (`pending 1`).
4. The full `drizzle-kit migrate` output.
5. The **post-check** (`pending 0`) — **this is the execution proof**.
6. The **second** ownership check.

## 6. What success looks like

Pre-check:

```
last applied when in DB 1786700000000, journal entries on disk 60, pending 1
PENDING 0060_pin_security_definer_owner when=1786800000000
OK: the pending set is exactly what was expected.
```

Post-check, **the line that matters**:

```
last applied when in DB 1786800000000, journal entries on disk 60, pending 0
OK: the pending set is exactly what was expected.
```

Both ownership runs identical, thirteen rows, every owner `postgres`:

```
appointment_conflicts            postgres     OK
assign_patient_number            postgres     OK
clinical_admin_sees_patient      postgres     OK
clinical_therapist_sees_patient  postgres     OK
custom_access_token_hook         postgres     OK
is_unconfirmed_pedido            postgres     OK
jwt_patient_id                   postgres     OK
jwt_tenant_id                    postgres     OK
location_in_viewer_scope         postgres     OK
merge_patients                   postgres     OK
patient_appt_at_viewer_location  postgres     OK
patient_appt_treated_by_viewer   postgres     OK
viewer_has_location_assignment   postgres     OK

13 SECURITY DEFINER function(s) in public.

OK: all 13 owned by postgres.
```

## 7. STOP conditions

- **`pending 1` fails.** Do not run `migrate`.
- **`pending 0` fails after migrate** — it still reports 1. **The migration did
  NOT run**, whatever `drizzle-kit` printed. This is the condition the whole
  block is built to detect.
- **The FIRST ownership check fails.** Something already diverged and this
  migration is no longer a no-op — stop, because pinning to `postgres` would then
  be a real ownership MOVE that nobody has authorised.
- **The count is not 13** on either run. A function was added or dropped outside
  this list.
- **`git log -1` shows anything but `1ea8697`.** Do not force it; paste and stop.

## 8. Rollback

Re-issue the same thirteen statements with the previous owner, recorded above as
`postgres`. Since the migration is a no-op against today's state, a rollback is
also a no-op.

## 9. After the paste

The evidence section is written into this file **in the same turn the output
arrives**. Then, and only then, #844 merges.
