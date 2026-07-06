# Loop W3-04 - Per-therapist primary service admin field (migration-free, recon-first)

GATE: none. Admin UI + server, migration-free. Recon-first: the representation of "primary" must fit the existing `therapist_services` grant mechanism WITHOUT a schema change. Runs in parallel with any one in-flight migration (touches no `packages/db/migrations` or workflow files).

## Field 1. Scope and ground truth
In the therapist management admin, add a per-therapist **primary service** field. The primary service is what W3-03 auto-selects into the Serviço field when a therapist is chosen at booking.

Ground truth (locked mechanism to embed — GREEN runs with zero memory):
- **`therapist_services` (migration 0023)** — tenant-scoped join `(id, tenant_id, therapist_user_id → users.id, service_id → services.id, created_at)`, UNIQUE `(tenant_id, therapist_user_id, service_id)`. It uses the **NO-GRANT append pattern**: RLS/grants allow **SELECT / INSERT / DELETE only**; **UPDATE is revoked at the privilege layer and THROWS SQLSTATE 42501** (DECISIONS 2026-07-01 "Append-only table conventions"; 0023 mapping is add/remove, not edit-in-place). Re-designation is therefore DELETE + INSERT, never UPDATE.
- This loop is **migration-free** (only W3-05 is authorized to author a migration this wave). "Primary" must be represented WITHOUT a new column on `therapist_services` and WITHOUT any `UPDATE` to it. Recon decides how — respect the existing mechanism.
- Build and verify against the EXISTING dev fixture therapists (the seeded `USR_*` therapist users). Max enters the REAL therapists later, through this same admin surface, with NO further code change.

Recon before writing (report findings, paste paths + the chosen representation):
- The therapist management admin surface (where a therapist's services are managed today) and the server action(s) that INSERT/DELETE `therapist_services` rows.
- How "primary" can be represented within SELECT/INSERT/DELETE-only, no-migration constraints. Enumerate the options found and pick one, e.g.:
  - a designated-primary marker that lives OUTSIDE `therapist_services` (an existing tenant/therapist settings surface, if one exists — coordinate with W3-05's recon), OR
  - a deterministic convention over the existing rows (e.g. the earliest-created mapping, or an existing ordering column if one exists), OR
  - any other no-migration representation recon surfaces.
- If NONE of the available representations can express "primary" without a schema change, HALT (see Field 6) — do not smuggle a migration into this migration-free loop.

Behavior: the admin can set/change a therapist's primary service among the services already mapped to that therapist. Re-designating primary uses DELETE + INSERT semantics where it touches `therapist_services` (never UPDATE, which 42501-throws). The primary is readable tenant-scoped for W3-03's auto-select.

## Field 2. Ordered steps
1. A0 isolation guard: `git worktree add ../osteojp-w3-04-primary-service-admin origin/main -b osteojp-w3-04-primary-service-admin`; assert `git rev-parse --show-toplevel` ends in the worktree name; assert `git status --porcelain` empty. HALT if either fails.
2. Recon, report BEFORE writing: the therapist admin surface + `therapist_services` write actions, and the chosen no-migration representation for "primary" (with the options considered). If representation needs a schema change, HALT here.
3. Implement the admin field: set/change a therapist's primary service among that therapist's mapped services. Any write to `therapist_services` uses SELECT/INSERT/DELETE only (re-designate = delete+insert), never UPDATE. Admin-gated (permission matrix: Manage users/roles = Admin only; server-enforced, not client-only).
4. Expose a tenant-scoped read of a therapist's primary service for W3-03 to consume.
5. Tests: set primary → read returns it; change primary → old cleared, new returned, and NO `UPDATE` is issued against `therapist_services` (assert the delete+insert or off-table representation); non-admin cannot set primary (permission check); works against the existing dev fixture therapists.
6. Full gates for the touched admin views: lint, typecheck, test, build, and `test:e2e` for the therapist-admin primary-service flow.

## Field 3. Definition of done (machine-verifiable)
- Migration-free PROOF: `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- Recon report pasted, including the chosen representation and why it needs no migration.
- Admin can set and change a therapist's primary service (verified against a dev fixture therapist): paste the tests + e2e summary.
- No `UPDATE` against `therapist_services`: paste the test proving re-designation uses delete+insert (or an off-table representation), consistent with the 42501-on-UPDATE mechanism.
- Primary is readable tenant-scoped for W3-03: paste the read test.
- Admin-gating enforced server-side: paste the non-admin-refused test.
- Lint/typecheck/test/build green (paste commands run).

## Field 4. Verification (paste evidence)
Recon report + chosen representation, migration-free `git diff --name-only`, set/change primary tests, no-UPDATE proof, tenant-scoped read test, permission-gate test, e2e summary, gate results.

## Field 5. Restrictions and scope boundary
- Migration-free: NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Represent "primary" WITHOUT a schema change and WITHOUT any `UPDATE` to `therapist_services` (respect the 0023 no-grant mechanism).
- Build/verify against EXISTING dev fixture therapists only; do not create real therapists (Max does that later through this same UI, no code change).
- Admin-only, server-enforced (permission matrix). Do not relax gating client-side.
- A0 worktree isolation: work only in `../osteojp-w3-04-primary-service-admin` off origin/main; never edit the primary clone.
- Never touch `.github/workflows/db-tests.yml` or `.github/workflows/e2e.yml`. One migration in flight (this loop opens none).
- Never force-push. Never merge with `--admin`. Never bypass branch protection.
- pt-PT via i18n keys, no hardcoded strings, no emoji. DB access only through `packages/db`; `tenant_id` from JWT context, never payload.

## Field 6. Halt loud if
- No available representation can express "primary" without a schema change (a new column/table). Do NOT add a migration here — HALT with the options (fold the primary marker into W3-05's tenant-settings migration, or open a dedicated follow-up migration loop) and a recommended default.
- Representing primary would require an `UPDATE` to `therapist_services` (which 42501-throws under the no-grant mechanism) with no delete+insert or off-table alternative.
- The therapist admin surface does not exist or does not manage `therapist_services` as assumed (the build target is missing).
- HALT-LOUD PROTOCOL (all halts, all W3 loops): write a halt file to `~/osteojp-mailbox/inbox/` named `halt-<UTC-timestamp>-W3-04.md` with the mismatch, options, and a recommended default. Poll `~/osteojp-mailbox/outbox/` up to 30 minutes; apply and archive under `~/osteojp-mailbox/archive/` if answered; else classic stop with the branch green and resume state recorded. Never guess a product decision.

## Field 7. Report back
Recon report + chosen representation, the admin field implementation, set/change + no-UPDATE + read + permission tests, migration-free proof, e2e summary, gate results, PR number.
Close: open a PR per template. GREEN chained runner applies the merge gate (every required check SUCCESS, diff touches neither `db-tests.yml` nor `e2e.yml`, PR mergeable). A refused merge is a HALT.
