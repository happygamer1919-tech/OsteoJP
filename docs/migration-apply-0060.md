# Apply block - migration 0060, pin the SECURITY DEFINER owner

**Status: DRAFTED, FOR STRATEGY VALIDATION. NOT sent to Ivan.**

Migration: `0060_pin_security_definer_owner` (journal idx 59).
Branch: `sec/0060-pin-function-owner`.
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

## 2. Pre-flight facts, verified against the machine rather than remembered

| Fact | How it was checked | Value |
|---|---|---|
| Apply worktree | `git worktree list` | `/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply` |
| Env file | directory listing, **name only, never read** | `/Users/ivan/osteojp-secrets/new-prod.env` |
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

## 3. The block

```
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
git checkout origin/sec/0060-pin-function-owner
git log -1 --oneline
set -o allexport
source /Users/ivan/osteojp-secrets/new-prod.env
set +o allexport
pnpm install --frozen-lockfile
pnpm --filter @osteojp/db exec node scripts/check-security-definer-owner.mjs
pnpm --filter @osteojp/db exec node scripts/check-pending-migrations.mjs 1
pnpm --filter @osteojp/db exec drizzle-kit migrate
pnpm --filter @osteojp/db exec node scripts/check-security-definer-owner.mjs
unset DATABASE_URL DATABASE_URL_DIRECT
```

**The ownership checker runs TWICE, before and after, and that is deliberate.**
Because the migration is a no-op, an after-only check would pass identically
whether `migrate` ran or not — it would be a receipt, not evidence. The BEFORE
run records the state the migration is asserting; the AFTER run proves it still
holds. Any difference between the two is itself the finding.

**STOP IF THE PRE-CHECK FAILS.** `check-pending-migrations.mjs 1` reads drizzle's
own bookkeeping READ ONLY and exits non-zero unless exactly one migration is
pending. If it fails, do not run `migrate` at all.

**`git checkout origin/<branch>`, detached, is load-bearing** — a plain
`git checkout <branch>` is rejected in that worktree and the fallback leaves it
on `main`, where `migrate` finds nothing and prints success anyway (the 0049
incident).

---

## 4. What to paste back

All five: the `git log -1 --oneline` line, the **first** ownership check, the
pre-check, the migrate output, and the **second** ownership check.

## 5. What success looks like

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

Pre-check: `pending 1`, naming `0060_pin_security_definer_owner`.

## 6. STOP conditions

- **The FIRST ownership check fails.** Something already diverged and this
  migration is no longer a no-op — stop and paste it, because pinning to
  `postgres` would then be a real ownership MOVE that nobody has authorised.
- **The count is not 13.** A function was added or dropped outside this list.
- **The pre-check fails.** Do not run `migrate`.
- **`git checkout` leaves you on `main`.** Paste `git log -1` and stop.

## 7. Rollback

Re-issue the same thirteen statements with the previous owner, recorded above as
`postgres`. Since the migration is a no-op against today's state, a rollback is
also a no-op.

## 8. After the paste

The evidence section is written into this file **in the same turn the output
arrives**. Then, and only then, the PR merges.
