# Loop 0024 - Appointment confirmation state

GATE: 0023 DONE (merged on main). Do not run until met.

## Field 1. Scope and ground truth
Migration 0024. Adds a confirmation axis on appointments, separate from the lifecycle status enum, never collapsed into it. Lifecycle status (scheduled/confirmed/completed/cancelled/no_show) is "where the appointment is in its life." Confirmation state is "did the patient confirm the reminder." Orthogonal, same rule as record_status vs ai_review_state. Unblocks Max's confirmation-thumbs UI. Confirm 0023 is merged and no other migration PR is open before starting; this is 0024.
Credential ground truth: drizzle-kit migrate runs cwd=packages/db, loads packages/db/.env (rotated password, perms 600). Do not touch .env.local.
Mirror ground truth: after authoring the Drizzle migration you MUST generate the Supabase mirror (node scripts/sync-supabase-migrations.mjs, then --check) before opening the PR, or two required CI checks fail.

## Field 2. Ordered steps
1. Fresh-main sync: branch osteojp-appointment-confirmation-state (worktree fallback).
2. Read-only recon: confirm appointments columns and that no confirmation_* column or confirmation enum already exists. Report before writing.
3. Write migration 0024:
   - enum appointment_confirmation_state: pending, confirmed, declined.
   - appointments.confirmation_state (that enum, not null, default pending).
   - appointments.confirmation_received_at (timestamptz, nullable).
   - appointments.confirmation_channel (text, nullable; label such as sms, whatsapp, phone, email, manual). Keep as text not enum, so a new channel does not force a migration.
   - Do NOT touch or overload the lifecycle status enum.
4. Confirm new columns inherit appointments RLS (tenant isolation, fail-closed). Add a policy only if a new object needs it.
5. Generate Supabase mirror, run --check, confirm clean.
6. Apply on dev, confirm clean apply, confirm db tests pass.

## Field 3. Definition of done (machine-verifiable)
- 0024 applies clean on dev (paste apply output).
- enum plus three columns exist on dev (paste introspection).
- lifecycle status enum unchanged (paste its values, prove no new value).
- mirror --check passes (paste line).
- db suite green (paste count).

## Field 4. Verification (paste evidence)
Recon output, apply output, appointments introspection showing three new columns plus enum, status-enum-unchanged proof, mirror --check line, db test count.

## Field 5. Restrictions and scope boundary
Confirmation axis only. Do not modify lifecycle status. Do not collapse the two axes. No UI. Do not touch db-tests.yml or e2e.yml. tenant_id from JWT. No merge-bypass box on the PR.

## Field 6. Halt loud if
A confirmation_* column or confirmation enum already exists, appointments RLS is not what STATE.md describes, or the task appears to require a status-enum change. Stop and report.

## Field 7. Report back
Recon findings, migration confirmed 0024, apply-clean y/n, columns+enum present y/n, status-enum-unchanged y/n, mirror --check, db test count, PR number.

Close: open a PR per template.
