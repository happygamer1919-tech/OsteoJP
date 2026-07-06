# Loop W3-07 - Location delete only when unreferenced; archive otherwise (migration-free)

GATE: none. Admin UI + server, migration-free. Recon-first. Runs in parallel with any one in-flight migration (touches no `packages/db/migrations` or workflow files).

## Field 1. Scope and ground truth
In the admin location list, a location may be **hard-deleted only when it has ZERO appointment references**; a referenced location offers **archive only**, with **delete disabled and an explanatory tooltip**.

Ground truth (locked ruling to embed — GREEN runs with zero memory):
- **Location delete ruling** (DECISIONS 2026-07-05): delete is enabled ONLY for locations with **zero appointment references**; referenced locations offer **archive only**; delete is **disabled with an explanatory tooltip** stating why (it still has appointments).
- **Archived stays hidden from selection** (W2-02 behavior, preserved): all option/selection queries filter `is_active = true`, so archived locations do NOT appear in any booking/selection dropdown; the admin management table intentionally still LISTS archived locations. Archive = `is_active = false` (never hard-delete for the archive path).
- Schema (STATE): `locations (id, tenant_id, name, address, phone, is_active, ...)`. `appointments.location_id` → `locations.id` **ON DELETE no action** — so the DB itself forbids deleting a location that any appointment references (the FK would error). The ruling's "zero appointment references" gate aligns with this: only a location with no appointments is DB-deletable.
- **Other FK references:** `availability_templates.location_id`, `services.location_id` (nullable), and `service_location_prices.location_id` may also reference a location. A hard delete must not orphan or FK-error on these. Recon MUST enumerate every FK into `locations`. The APPOINTMENT-reference count is the ruling's gate; but the actual delete must also handle config references (see Field 6 for the halt boundary if config rows reference an otherwise appointment-free location).

Recon before writing (report findings, paste paths):
- The admin location list component and its current archive/delete controls (W2-12/W2-02 context).
- A tenant-scoped read of the appointment-reference count (or EXISTS) per location.
- The COMPLETE set of FKs into `locations` (grep schema + migrations): appointments, availability_templates, services, service_location_prices, and any others. Report each.
- The established tooltip/disabled-button pattern and pt-PT copy convention.

Behavior:
- Per location, compute whether it has any appointment references (tenant-scoped).
- **Zero appointment references →** Delete button ENABLED. Hard-delete tenant-scoped through `packages/db`, child-safe (delete/clean dependent CONFIG rows first if the recon shows availability_templates / service_location_prices rows for it, using child-first + `RETURNING`; a truly unreferenced location deletes cleanly).
- **≥1 appointment reference →** Delete button DISABLED, with a pt-PT tooltip explaining it cannot be deleted while it has appointments; only **Archive** (set `is_active = false`) is offered.
- Archived locations remain hidden from every selection dropdown; still listed in the admin management table.

## Field 2. Ordered steps
1. A0 isolation guard: `git worktree add ../osteojp-w3-07-location-delete-when-unreferenced origin/main -b osteojp-w3-07-location-delete-when-unreferenced`; assert `git rev-parse --show-toplevel` ends in the worktree name; assert `git status --porcelain` empty. HALT if either fails.
2. Recon, report BEFORE editing: the admin location list, the appointment-reference read, the COMPLETE FK set into `locations`, and the tooltip/disabled pattern.
3. Implement the per-location reference check + conditional controls: enabled Delete for zero-appointment locations, disabled Delete + tooltip + Archive-only for referenced ones.
4. Implement the tenant-scoped hard-delete (child-config-rows-first with `RETURNING` where present) for unreferenced locations; keep Archive = `is_active = false`.
5. Tests: unreferenced location → Delete enabled and deletes cleanly (no orphan, no FK error); referenced location → Delete disabled + tooltip shown + Archive available; archived location absent from booking/selection dropdowns but present in the admin table; tenant-scoped (cannot delete another tenant's location).
6. Full gates: lint, typecheck, test, build, and `test:e2e` for the location-admin delete/archive flow.

## Field 3. Definition of done (machine-verifiable)
- Migration-free PROOF: `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- Recon report pasted, including the COMPLETE FK set into `locations`.
- Delete enabled + working ONLY for zero-appointment locations; disabled + tooltip + Archive-only for referenced ones: paste the tests + e2e.
- Hard delete leaves no orphan and no FK error (child config rows handled child-first with `RETURNING`): paste the test.
- Archived location hidden from all selection dropdowns, still listed in the admin table: paste the test/e2e.
- Tenant-scoped delete proven. Lint/typecheck/test/build green (paste commands run).

## Field 4. Verification (paste evidence)
Recon report + full FK set, migration-free `git diff --name-only`, conditional-control tests, clean-delete/no-orphan test, archived-hidden test, tenant-scope test, e2e summary, gate results.

## Field 5. Restrictions and scope boundary
- Migration-free: NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. No schema change.
- Delete is enabled ONLY for locations with zero appointment references (the ruling's gate); referenced locations get Archive only + disabled Delete + tooltip.
- Archive = `is_active = false`; archived stays hidden from selection dropdowns (preserve W2-02 behavior), still listed in the admin table. Never hard-delete a referenced location.
- Admin-only, server-enforced. A0 worktree isolation: work only in `../osteojp-w3-07-location-delete-when-unreferenced` off origin/main; never edit the primary clone.
- Never touch `.github/workflows/db-tests.yml` or `.github/workflows/e2e.yml`. One migration in flight (this loop opens none). Never force-push. Never merge with `--admin`. Never bypass branch protection. No raw SQL in app code; `tenant_id` from JWT context, never payload.

## Field 6. Halt loud if
- A location with ZERO appointment references still has CONFIG references (`availability_templates` / `service_location_prices` / `services.location_id`) whose cleanup on delete is beyond a mechanical child-first delete or would silently discard meaningful config — surface the options (cascade-clean the config vs. restrict delete to fully-unreferenced-including-config) with a recommended default rather than guessing.
- The appointment-reference count cannot be read tenant-scoped without a schema change (would leave the migration-free lane).
- Recon finds an FK into `locations` not anticipated here that a hard delete would violate.
- HALT-LOUD PROTOCOL (all halts, all W3 loops): write a halt file to `~/osteojp-mailbox/inbox/` named `halt-<UTC-timestamp>-W3-07.md` with the mismatch, options, and a recommended default. Poll `~/osteojp-mailbox/outbox/` up to 30 minutes; apply and archive under `~/osteojp-mailbox/archive/` if answered; else classic stop with the branch green and resume state recorded. Never guess a product decision.

## Field 7. Report back
Recon report + full FK set, the conditional delete/archive implementation, the test matrix, migration-free proof, e2e summary, gate results, PR number.
Close: open a PR per template. GREEN chained runner applies the merge gate (every required check SUCCESS, diff touches neither `db-tests.yml` nor `e2e.yml`, PR mergeable). A refused merge is a HALT.
