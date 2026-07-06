# Loop W3-06 - Password-gated appointment hard-delete (server + UI)

GATE: **W3-05 MERGED** (the tenant-settings home for the hashed password must exist on main). Confirm before dispatch. Server + admin UI, migration-free (consumes the W3-05 home). Runs in parallel with any one in-flight migration (touches no `packages/db/migrations` beyond reads).

## Field 1. Scope and ground truth
Allow an appointment to be **hard-deleted** behind a **password gate**, with a linked-records guard and a full audit trail.

Ground truth (locked ruling to embed — GREEN runs with zero memory):
- **Never-hard-delete lock (prior state, STATE 2026-06-30 finding #2):** appointments were never hard-deleted — cancellation is a `status = 'cancelled'` value; the code comment reads "Never hard delete — cancel via the status field only." Repo-wide `.delete(appointments)` had zero non-test matches.
- **AMENDMENT (owner ruling, DECISIONS 2026-07-05):** appointments MAY now be hard-deleted **behind a password gate**. Specifics, all binding:
  - **Password:** initial value **`1234`**; changeable in **Administração**; stored **server-side HASHED** as a tenant setting (the W3-05 home); **NEVER stored or checked client-side**.
  - **Linked-records guard:** deletion is **REFUSED when the appointment has linked clinical notes or records** (per-visit `appointment_notes` (0026), and any `clinical_records` / `clinical_episodes` referencing the appointment). If any exist, refuse and return a clear pt-PT message; do not delete.
  - **Audit:** every deletion writes an **`audit_log`** entry — actor (`actor_user_id`) + an appointment **snapshot** in `metadata`.
  - **Permanent-delete discipline:** delete **child rows first**, using **`RETURNING`**, then the appointment row, all in one tenant-scoped transaction.
- **Audit metadata is PII-FREE by contract** (CLAUDE.md rule 7; `audit_log` metadata is ids/field-names/status/ISO-timestamps only). The appointment snapshot = `appointment_id`, `patient_id`, `practitioner_id`, `service_id`, `location_id`, `starts_at`, `ends_at`, `status`, `confirmation_state` — IDs + timestamps + enums ONLY. NEVER the notes body, patient name, or any free text.
- `audit_log` shape (STATE): `(id, tenant_id, actor_user_id, action text, entity_type text, entity_id uuid, metadata jsonb, ip, created_at)`, append-only (SELECT+INSERT policies), written in the SAME tx as the mutation. Use `action` = `appointment.hard_delete`, `entity_type` = `appointment`, `entity_id` = the deleted appointment id, `metadata` = the PII-free snapshot.

Recon before writing (report findings, paste paths):
- The W3-05 tenant-settings home: the exact server-only read/write for the hashed password (confirm it is on main / merged). If absent, HALT (gate not met).
- The appointment mutation module (`apps/web/lib/scheduling/actions.ts`) and the existing cancel path; the `appointment_notes` (0026) relation and any `clinical_records`/`clinical_episodes` link to an appointment; the audit writer `apps/web/lib/scheduling/audit.ts`.
- The Administração admin surface for the password-change control (admin-gated per the permission matrix: Tenant settings = Admin only).

Behavior:
- **Delete action (server):** verify the supplied password against the hashed tenant setting (server-side, constant-time compare against the stored hash; a hashing lib already in the repo, e.g. the auth stack's, not a bespoke one). On mismatch → refuse (no delete). On match → run the linked-records guard; if any clinical note/record is linked → refuse with a pt-PT reason. Else, in one tenant-scoped tx: delete child rows first (`RETURNING`), delete the appointment (`RETURNING`), write the `audit_log` entry with actor + PII-free snapshot. Return success.
- **Password change (server + UI in Administração):** admin sets a new password; the server hashes it and writes the hash to the W3-05 tenant setting. The initial value is `1234` (seed the hash on first use if unset). The plaintext is never persisted, logged, or returned.
- **UI:** a delete control on the appointment (admin-gated) that prompts for the password; a password-change control in Administração.

## Field 2. Ordered steps
1. A0 isolation guard: `git worktree add ../osteojp-w3-06-password-gated-appointment-delete origin/main -b osteojp-w3-06-password-gated-appointment-delete`; assert `git rev-parse --show-toplevel` ends in the worktree name; assert `git status --porcelain` empty. HALT if either fails. Confirm W3-05 is merged on main; HALT if not.
2. Recon, report BEFORE writing: the W3-05 secret read/write path, the appointment mutation module + linked-records relations, the audit writer, and the Administração surface.
3. Implement the server delete action: password verify (hashed, server-side) → linked-records guard (refuse if any `appointment_notes`/`clinical_records`/`clinical_episodes` linked) → child-rows-first delete with `RETURNING` → appointment delete with `RETURNING` → `audit_log` insert (actor + PII-free snapshot), all in one tenant-scoped tx.
4. Implement the password-change server action + Administração UI (admin-gated), writing the hash to the W3-05 tenant setting; initial `1234` on first use.
5. Implement the appointment delete UI control (admin-gated) with the password prompt and pt-PT copy.
6. Tests:
   - Wrong password → no delete, appointment still present.
   - Correct password + linked clinical note/record → REFUSED, appointment still present, clear reason.
   - Correct password + no linked notes/records → deleted; child rows gone; exactly one `audit_log` row with `action = appointment.hard_delete`, correct actor, and a snapshot containing ONLY ids/timestamps/enums (assert NO free text / notes body / patient name).
   - Password change → new password works, old fails; hash stored server-side, plaintext never returned/logged.
   - Non-admin cannot delete or change the password (server-enforced).
   - RLS/tenant: a caller cannot delete another tenant's appointment (tenant-scoped).
7. Full gates: lint, typecheck, test, build, and `test:e2e` for the delete + password-change flows.

## Field 3. Definition of done (machine-verifiable)
- Migration-free PROOF: `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/` (this loop consumes W3-05's home; it authors no migration). Paste it.
- W3-05 merged confirmed (paste the check).
- Wrong-password-refused, linked-records-refused, and successful-delete tests all pass (paste results).
- Successful delete writes exactly one `audit_log` `appointment.hard_delete` row with actor + a PII-free snapshot (assert no free text): paste the test.
- Child-rows-first + `RETURNING` discipline proven (paste the test/queries showing child rows deleted before the parent, none orphaned).
- Password change works, hash stored server-side, plaintext never persisted/logged/returned: paste the test.
- Non-admin refused (delete + password change) and tenant-scoped delete proven: paste results.
- e2e green for delete + password-change (paste summary). Lint/typecheck/test/build green (paste commands run).

## Field 4. Verification (paste evidence)
Recon report, W3-05-merged check, migration-free `git diff --name-only`, the full test matrix (wrong pw, linked-refused, success+audit snapshot, child-first RETURNING, password change, non-admin, tenant-scoped), e2e summary, gate results.

## Field 5. Restrictions and scope boundary
- Migration-free: consumes the W3-05 tenant-settings home; authors NO migration. NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`.
- Password is hashed server-side and verified server-side ONLY; NEVER stored, checked, or exposed client-side. Never log or return the plaintext.
- Deletion is REFUSED when clinical notes or records are linked — never delete through the guard.
- Audit snapshot is PII-FREE (ids/timestamps/enums only); never write the notes body or patient name to `audit_log`.
- Child-rows-first, `RETURNING`, single tenant-scoped tx. Admin-only (permission matrix), server-enforced.
- A0 worktree isolation: work only in `../osteojp-w3-06-password-gated-appointment-delete` off origin/main; never edit the primary clone.
- Never touch `.github/workflows/db-tests.yml` or `.github/workflows/e2e.yml`. One migration in flight (this loop opens none). Never force-push. Never merge with `--admin`. Never bypass branch protection. No raw SQL in app code (access through `packages/db`); `tenant_id` from JWT context, never payload.

## Field 6. Halt loud if
- W3-05 is not merged on main (gate not met) — the hashed-secret home does not exist.
- The password cannot be verified server-side against the stored hash without exposing the hash to the client, or no server-side hashing primitive is available without a new vendor/dependency (a new dependency is owner-confirmable).
- The linked-records guard cannot be evaluated tenant-scoped (e.g. an unclear link between appointments and clinical records) — surface it rather than deleting.
- Building the PII-free snapshot would require storing PII to satisfy the audit requirement (contradiction) — surface it.
- The delete would violate an FK from a child relation not anticipated here (recon a broader child set; do not orphan or force).
- HALT-LOUD PROTOCOL (all halts, all W3 loops): write a halt file to `~/osteojp-mailbox/inbox/` named `halt-<UTC-timestamp>-W3-06.md` with the mismatch, options, and a recommended default. Poll `~/osteojp-mailbox/outbox/` up to 30 minutes; apply and archive under `~/osteojp-mailbox/archive/` if answered; else classic stop with the branch green and resume state recorded. Never guess a product decision.

## Field 7. Report back
Recon report, W3-05-merged check, the server delete action + password-change + UI, the full test matrix, migration-free proof, e2e summary, gate results, PR number.
Close: open a PR per template. GREEN chained runner applies the merge gate (every required check SUCCESS, diff touches neither `db-tests.yml` nor `e2e.yml`, PR mergeable). A refused merge is a HALT.
