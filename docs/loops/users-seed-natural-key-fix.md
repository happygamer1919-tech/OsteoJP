# Loop - Users-seed natural-key fix (FA-1, migration-free)

Status: WRITTEN. Non-migration code lane (parallel-safe, not migration-numbered — same lane as availability-query.md / schedule-again-clone.md). Green terminal. No migration in flight required (this loop ships zero schema change). Executor: PURPLE.

## Field 1. Scope and ground truth
Close the latent same-class FK defect recorded in the Wave 01 close audit (QUESTIONS.md 2026-07-02, FA-1): extend the PR #414 natural-key resolution pattern from `roles` to `users` across the dev seed, so a pre-existing user can never orphan the seeded FK graph.

The defect (verified, current on main):
- `users` carries secondary unique key `users_tenant_email_uq (tenant_id, email)`.
- `packages/db/seed/dev-reference.ts` seeds users with `.onConflictDoNothing()` and NO explicit conflict target, so it swallows an email-unique conflict as well as a PK conflict. If a user with a seeded email (e.g. `andre.costa@osteojp-dev.pt`) pre-exists under a different real UUID, the fixture-id `USR_n` (`de000004-*`) insert is silently skipped and `USR_n` is absent.
- `packages/db/seed/appointments-dev.ts`, `availability-dev.ts`, and `episodes-dev.ts` reference `USR_1..5` by hardcoded fixture id imported from `dev-ids.ts`, and NEVER resolve users by email — so on a DB whose users originated elsewhere they hit FK violations / dangling practitioner refs. This is exactly the mechanism that bit `roles` (fixed in #414 by resolving `role_id` by `(tenant_id, slug)`); that fix was applied to roles but NOT extended to users.

Ground truth for the fix pattern: PR #414 in `dev-reference.ts` — `roleId(slug)` resolves role ids by `(tenant_id, slug)` from whatever rows actually exist. Mirror it for users on `(tenant_id, email)`.

The invariant to achieve: ZERO hardcoded user-id FK consumption in the seed chain. Every seeded FK that targets a user (`practitioner_id`, `author_user_id`, `created_by`, availability `user_id`, etc.) is resolved to the user's REAL id by `(tenant_id, email)` at seed time, never taken from a `USR_*` fixture constant. No schema change, no migration, no Supabase mirror.

## Field 2. Ordered steps
1. A0 isolation + clean-tree guard (verbatim, LOOP-DISPATCH.md): own worktree off origin/main — `git worktree add ../osteojp-users-seed-fix origin/main -b osteojp-users-seed-fix`. Assert `git rev-parse --show-toplevel` ends in the worktree name, NOT the primary checkout. Assert `git status --porcelain` empty. Never `git checkout -b` in a shared checkout. HALT if either assertion fails.
2. Read-only recon, report BEFORE writing: enumerate every place `USR_1..5` (from `dev-ids.ts`) is consumed as an FK value (`appointments-dev.ts`, `availability-dev.ts`, `episodes-dev.ts`, and any other importer); confirm the `#414` `roleId(slug)` resolution shape in `dev-reference.ts`; confirm the `users_tenant_email_uq` key and the seeded email list. Report the full consumer list.
3. Implement the resolution: after the idempotent `users` insert in `dev-reference.ts`, resolve `USR_1..5` to real ids by `(tenant_id, email)` (mirror `roleId` → e.g. `userIdByEmail`). Provide the resolved ids to the downstream seeders so they consume RESOLVED ids, not fixture constants — either by each downstream seeder resolving users by email at its own start (same helper), or by exporting a resolver. Remove every hardcoded `USR_*` FK consumption. `dev-ids.ts` may keep the `USR_*` constants for insert seeding, but they must no longer be the FK source downstream.
4. Keep the seed idempotent and the guard intact: `SEED_DEV_CONFIRM` opt-in unchanged, `PROD_REFS` unchanged. No behavior change to counts.
5. Typecheck, lint, and the seed shape tests green. No Supabase mirror (migration-free).

## Field 3. Definition of done (machine-verifiable)
- Live dev `seed:dev` run completes idempotently: source `packages/db/.env` manually (NEVER print its contents), set `SEED_DEV_CONFIRM=jaxmkwoxjcgzkwxgbayx` (the owner-verified dev ref, DECISIONS.md 2026-07-01), run the full seed chain twice. Both runs succeed; on the second run counts are UNCHANGED — `patients` = 50 and `availability_templates` = 34 (paste both counts from both runs).
- Grep proof of the invariant: `USR_1..5` (and any `dev-ids` user constant) appear ZERO times as an FK value in `appointments-dev.ts`, `availability-dev.ts`, `episodes-dev.ts` (paste the grep showing no hardcoded user-id FK consumption remains; every user FK now flows from the `(tenant_id, email)` resolver).
- Migration-free proof: `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/` and ZERO under `supabase/migrations/` (paste the full diff).
- Typecheck + lint clean; seed shape tests green (paste count). Merge-gate checks all SUCCESS.

## Field 4. Verification (paste evidence)
Recon consumer list, the resolver diff summary, both `seed:dev` runs with unchanged counts (patients=50, availability_templates=34), the zero-hardcoded-USR-FK grep, `git diff --name-only` proving migration-free, `gh pr checks` output.

## Field 5. Restrictions and scope boundary
- MIGRATION-FREE: `git diff --name-only origin/main` must show zero files under `packages/db/migrations/` and zero under `supabase/migrations/`. No schema change of any kind, no mirror. Do NOT generate a mirror.
- Seed scripts only (`packages/db/seed/`). Do NOT modify `dev-ids.ts` fixture VALUES, only their downstream usage; do NOT weaken `seed-guard.ts` or the `SEED_DEV_CONFIRM` opt-in.
- Never print the contents of `packages/db/.env` or any `DATABASE_URL`. The project ref `jaxmkwoxjcgzkwxgbayx` is the confirm token (already public in DECISIONS.md), not a secret; the connection string IS a secret — never echo it.
- `db-tests.yml` and `e2e.yml` untouchable.
- No merge-bypass. PURPLE lane: end at "open PR, HALT for owner merge" per the committed purple protocol (DECISIONS.md 2026-07-02). Do NOT self-merge.

## Field 6. Halt loud if
- A user FK consumer cannot be resolved by `(tenant_id, email)` (e.g. a seeded email is missing or duplicated across tenants in a way that breaks the lookup).
- The seed cannot be made idempotent without a count change, or the second run alters `patients`/`availability_templates` counts.
- The fix appears to need a schema change (any column/constraint/migration). Stop and report; do not improvise a migration.
- `SEED_DEV_CONFIRM` / guard behavior would have to change to complete the run.

## Field 7. Report-back format
Recon consumer list, resolver shipped (helper name + files touched), both idempotent `seed:dev` runs with unchanged counts, zero-hardcoded-USR-FK grep, `git diff --name-only` proving migration-free, `gh pr checks` result, PR number.
Close: open a PR per template, then HALT for owner merge (PURPLE lane — no self-merge).
