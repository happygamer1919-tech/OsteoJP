# Loop W3-09 - Set dev therapists to the real clinic schedule (live-DB guarded data op)

GATE: none. PURPLE-style live-DB data operation, migration-free, no app code. Guarded by `SEED_DEV_CONFIRM`. Idempotent. Independent of the other W3 loops (does not require W3-08).

## Field 1. Scope and ground truth
Update `availability_templates` for the EXISTING dev therapists so their working hours match the confirmed real clinic schedule. This is a data op on the shared dev Supabase project (all data synthetic, owner-authorized), NOT app code and NOT a migration.

Ground truth (locked rulings to embed — GREEN runs with zero memory):
- **Real clinic schedule** (DECISIONS 2026-07-05): **Mon–Fri 08:00–20:00, Sat 09:00–13:00**. Target state: each existing dev therapist has availability templates covering Mon–Fri 08:00–20:00 and Sat 09:00–13:00.
- **`availability_templates` shape** (STATE / schema): recurring weekly hours per `(user_id, location_id, weekday, start_time, end_time)`. CHECKS: `weekday between 0 and 6`, `start_time < end_time`. Unique `availability_templates_dedupe_uq` with `.nullsNotDistinct()`. **Recon the weekday convention** (which integer is Monday vs Sunday) before writing — the mapping is NOT assumed here; confirm it against the schema/consumer (`getTherapistAvailability`/`buildDay`).
- **Idempotence = zero delta between two consecutive runs** (STANDING RULING, DECISIONS 2026-07-02), NOT equality to any fixture floor. On a shared dev project that also carries QA data, a second run must change zero rows.
- **`SEED_DEV_CONFIRM` guard** (DECISIONS 2026-07-01): the operator sets `SEED_DEV_CONFIRM` to the exact project ref parsed from `DATABASE_URL`; missing/mismatched → refuse. Source env manually; **never print credentials — fingerprints only**. **Live counts beat fingerprints** (STATE convention): report live `count(*)` evidence, not just hashes.
- **Deletions are owner-confirmable** (CLAUDE.md). This op must NOT hard-delete rows. Reconcile toward the target set by UPSERT (insert missing target rows; leave matching rows untouched); for any existing template OUTSIDE the target schedule for a dev therapist, ARCHIVE it (`is_active = false`) rather than delete — unless the owner authorizes deletion via halt.

Recon before writing (report findings, paste evidence — no credentials):
- The set of existing dev therapist users and their location(s) for `availability_templates`.
- The weekday integer convention (Monday value) confirmed against the schema + consumer.
- The current `availability_templates` state for those therapists (live `count(*)` and per-therapist/weekday rows), as the BEFORE baseline.

## Field 2. Ordered steps
1. A0 isolation guard: `git worktree add ../osteojp-w3-09-working-hours-real-schedule origin/main -b osteojp-w3-09-working-hours-real-schedule`; assert `git rev-parse --show-toplevel` ends in the worktree name; assert `git status --porcelain` empty. HALT if either fails.
2. Recon, report BEFORE writing: dev therapists + locations, the weekday convention, and the BEFORE live counts/rows.
3. Author an IDEMPOTENT script (committed under the seed/scripts area, matching the existing guarded-seed pattern — `SEED_DEV_CONFIRM` opt-in, ref parsed from `DATABASE_URL`): upsert the target templates (Mon–Fri 08:00–20:00, Sat 09:00–13:00) per dev therapist/location; archive (`is_active = false`) any existing template outside the target schedule; never hard-delete. Respect the CHECKS (`weekday 0–6`, `start_time < end_time`) and the `nullsNotDistinct` dedupe unique.
4. Run the op guarded (`SEED_DEV_CONFIRM=<ref>`), capture AFTER live counts/rows.
5. Re-run the op unchanged, capture AFTER-RE-RUN live counts/rows → must be a ZERO delta vs AFTER.
6. Do NOT open until evidence is captured: BEFORE, AFTER, AFTER-RE-RUN live counts, all with credentials redacted (fingerprints/counts only).

## Field 3. Definition of done (machine-verifiable)
- Recon report pasted (dev therapists, weekday convention, BEFORE live counts).
- The script is idempotent: **zero delta on the second run** — paste AFTER and AFTER-RE-RUN live `count(*)` (and the per-therapist/weekday row summary) showing no change on the re-run. This is the binding DoD.
- Target state reached: each dev therapist has Mon–Fri 08:00–20:00 + Sat 09:00–13:00 templates (paste the resulting per-therapist/weekday rows).
- No hard deletes: rows outside the target schedule are archived (`is_active = false`), not removed (paste the count reconciliation — total rows before vs after accounts for upserts + archives, zero deletions).
- No credentials printed anywhere in the evidence (fingerprints/counts only).

## Field 4. Verification (paste evidence)
Recon report, BEFORE live counts, AFTER live counts, AFTER-RE-RUN live counts (zero delta vs AFTER), resulting per-therapist/weekday target rows, archive-not-delete reconciliation. Live counts beat fingerprints; credentials redacted.

## Field 5. Restrictions and scope boundary
- Live-DB DATA OP ONLY on the shared dev project (synthetic data, owner-authorized). NO app code, NO migration: NO files under `packages/db/migrations/`, `supabase/migrations/`, `apps/`, or `.github/workflows/` (the committed artifact is the guarded script only).
- Guarded by `SEED_DEV_CONFIRM` (ref parsed from `DATABASE_URL`); refuse on missing/mismatch. Never print `DATABASE_URL` or any credential — fingerprints/counts only.
- Idempotent: a re-run changes zero rows. Never hard-delete (owner-confirmable) — archive rows outside target via `is_active = false`.
- A0 worktree isolation: work only in `../osteojp-w3-09-working-hours-real-schedule` off origin/main; never edit the primary clone.
- Never touch `.github/workflows/db-tests.yml` or `.github/workflows/e2e.yml`. One migration in flight (this loop opens none). Never force-push. Never merge with `--admin`. Never bypass branch protection.

## Field 6. Halt loud if
- The weekday integer convention cannot be confirmed unambiguously against the schema + consumer (a wrong Monday mapping would set the wrong days).
- Reaching the target set would require DELETING rows (e.g. a unique/dedupe collision that upsert cannot resolve without a delete) — deletions are owner-confirmable; surface it with the recommended archive-instead default.
- The live BEFORE state for dev therapists differs materially from the recon assumption (e.g. no availability rows exist, or multiple locations complicate the target) — surface it, as W2-03 did, rather than guessing scope.
- `SEED_DEV_CONFIRM` cannot be matched to the `DATABASE_URL` ref (guard cannot arm) — do not proceed unguarded.
- HALT-LOUD PROTOCOL (all halts, all W3 loops): write a halt file to `~/osteojp-mailbox/inbox/` named `halt-<UTC-timestamp>-W3-09.md` with the mismatch, options, and a recommended default (no credentials in the halt file). Poll `~/osteojp-mailbox/outbox/` up to 30 minutes; apply and archive under `~/osteojp-mailbox/archive/` if answered; else classic stop with the branch green and resume state recorded. Never guess a product decision.

## Field 7. Report back
Recon report, the guarded idempotent script, BEFORE/AFTER/AFTER-RE-RUN live counts (zero-delta re-run proof), target rows reached, archive-not-delete reconciliation, PR number. Credentials redacted throughout.
Close: open a PR per template (the committed script + pasted live-count evidence, modeled on the W2-03 #455 data-op PR). GREEN chained runner applies the merge gate (every required check SUCCESS, diff touches neither `db-tests.yml` nor `e2e.yml`, PR mergeable). A refused merge is a HALT.
