# Loop W3-03 - Booking form reorder: Terapeuta first, Serviço below, auto-select from primary (migration-free)

GATE: soft-depends on W3-04 for the "primary service" representation. The reorder + editable dropdown are INDEPENDENT and ship regardless; the auto-select reads the primary mechanism if W3-04 has merged, else falls back to the therapist's existing mapped service (the W2-02 auto-select behavior). UI lane, migration-free.

## Field 1. Scope and ground truth
Reorder the "Nova marcação" form so the therapist is chosen first and the service defaults from that therapist.

Ground truth (locked ruling to embed — GREEN runs with zero memory):
- **Booking form order** (DECISIONS 2026-07-05): **Terapeuta** field FIRST, **Serviço** field BELOW it. Serviço is AUTO-SELECTED from the therapist's PRIMARY service, and the dropdown remains EDITABLE for exceptions (the clinic can override the default per booking).
- Data source: `therapist_services` (migration 0023) — tenant-scoped join `(id, tenant_id, therapist_user_id → users.id, service_id → services.id, created_at)`, UNIQUE `(tenant_id, therapist_user_id, service_id)`. Migration-free: this loop READS the existing mapping; it does not alter schema.
- The "primary service" designation is defined by W3-04 (per-therapist primary-service admin field). If W3-04 has merged, read primary from whatever representation it established (recon reads it, does not assume a column). If W3-04 has NOT merged, the reorder still ships and the Serviço auto-select falls back to the therapist's existing single/first mapped service (the W2-02 #445 auto-select), noting the fallback.
- Prior art: W2-02 (#445/#454) already wired a therapist→service auto-select. This loop is the ORDER change (Terapeuta above Serviço) PLUS sourcing the default specifically from the PRIMARY service.

Recon before writing (report findings, paste paths):
- The Nova marcação form component and current field order (where Terapeuta and Serviço render today).
- The existing therapist→service auto-select logic from W2-02 (the shared scheduling options select / server action) and how the service default is currently computed.
- Whether W3-04's primary representation is present on `origin/main` at dispatch time; if present, the exact read path for a therapist's primary service.

## Field 2. Ordered steps
1. A0 isolation guard: `git worktree add ../osteojp-w3-03-booking-form-reorder origin/main -b osteojp-w3-03-booking-form-reorder`; assert `git rev-parse --show-toplevel` ends in the worktree name; assert `git status --porcelain` empty. HALT if either fails.
2. Recon, report BEFORE editing: current field order, the existing auto-select path, and whether/where the primary representation (W3-04) exists on main.
3. Reorder the form: Terapeuta first, Serviço immediately below it.
4. Wire the Serviço default: on therapist selection, auto-select the therapist's PRIMARY service (via the recon'd primary read) if available, else the existing mapped-service default. The Serviço dropdown stays fully editable — the user can change it for an exception, and their change is honored on submit.
5. Tests: selecting a therapist auto-fills Serviço with the primary (or fallback) service; the user can override Serviço and the override is submitted; order asserts Terapeuta renders above Serviço.
6. Full gates for the touched user-facing views: lint, typecheck, test, build, and `test:e2e` covering therapist-first → service-auto-filled → override path.

## Field 3. Definition of done (machine-verifiable)
- Migration-free PROOF: `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- Recon report pasted (current order + auto-select path + primary-representation availability).
- Terapeuta renders ABOVE Serviço: paste the component test / e2e assertion of field order.
- Serviço auto-selects the therapist's primary service (state which source was used: primary via W3-04, or documented fallback) and remains editable with the override honored on submit: paste the tests.
- e2e green for the therapist-first → auto-fill → override flow (paste summary).
- Lint/typecheck/test/build green (paste commands run).

## Field 4. Verification (paste evidence)
Recon report, migration-free `git diff --name-only`, field-order assertion, auto-select + override tests, e2e summary, gate results.

## Field 5. Restrictions and scope boundary
- Migration-free: NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. READ `therapist_services` (0023); do not alter it.
- Scope is the Nova marcação field order + Serviço default-from-primary + editable override. Do not change the booking submit contract beyond the service default; do not build the primary-service admin field (that is W3-04).
- A0 worktree isolation: work only in `../osteojp-w3-03-booking-form-reorder` off origin/main; never edit the primary clone.
- Never touch `.github/workflows/db-tests.yml` or `.github/workflows/e2e.yml`. One migration in flight (this loop opens none).
- Never force-push. Never merge with `--admin`. Never bypass branch protection.
- pt-PT via i18n keys, no hardcoded strings, no emoji. DB access only through `packages/db`; `tenant_id` from JWT context, never payload.

## Field 6. Halt loud if
- W3-04's primary representation is present on main but cannot be read tenant-scoped without a schema change (would move this out of the migration-free lane).
- The existing form binds Serviço before Terapeuta in a way that cannot be reordered without breaking the batch/lote drawer that shares the sub-component (surface the shared-component blast radius).
- Auto-selecting from primary conflicts with an existing hard requirement that Serviço be blank until chosen (surface the conflict rather than deciding).
- HALT-LOUD PROTOCOL (all halts, all W3 loops): write a halt file to `~/osteojp-mailbox/inbox/` named `halt-<UTC-timestamp>-W3-03.md` with the mismatch, options, and a recommended default. Poll `~/osteojp-mailbox/outbox/` up to 30 minutes; apply and archive under `~/osteojp-mailbox/archive/` if answered; else classic stop with the branch green and resume state recorded. Never guess a product decision.

## Field 7. Report back
Recon report, the reorder + auto-select-from-primary implementation (state primary source vs fallback), field-order + override tests, migration-free proof, e2e summary, gate results, PR number.
Close: open a PR per template. GREEN chained runner applies the merge gate (every required check SUCCESS, diff touches neither `db-tests.yml` nor `e2e.yml`, PR mergeable). A refused merge is a HALT.
