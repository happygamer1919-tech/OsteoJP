# Loop W5-08 - Patient hard-delete scrypt password gate (Batch 1, migration-free)

GATE: none. Server-action + UI lane, migration-free. Replicates the W3-06 scrypt gate pattern.

## Field 1. Scope and ground truth
Patient hard-delete gains the **same scrypt password gate** as therapist and marcacao deletes (the W3-06 pattern, `tenants.settings.secrets`). The **refuse-when-clinical-records-linked guard stays**.

Ground truth (recon 2026-07-08, embed - executor runs with ZERO memory):
- **There is NO patient hard-delete today** - `apps/web/lib/patients/actions.ts` only exposes `softDeletePatient()` (sets `deleted_at`); a comment there states "Patients are NEVER hard-deleted (hard rule: soft delete via deleted_at)." So this loop **introduces `hardDeletePatient()` net-new**, and the "refuse-when-clinical-records-linked guard" and the scrypt gate are **added together with it** (the guard is not pre-existing on patients; the appointment path is the precedent).
- **W3-06 scrypt gate pattern to replicate:**
  - `apps/web/lib/admin/secret-hash.ts` -> `verifySecret(plain, stored): boolean` uses `node:crypto.scryptSync` (no external dep) + `timingSafeEqual`; hash format `scrypt$<saltHex>$<hashHex>` (16-byte salt, 32-byte key).
  - `apps/web/lib/admin/appointment-delete-password.ts` -> `verifyDeletePassword(actor, supplied)` reads the hashed secret via `getTenantSecret`, applies `verifySecret`, and falls back to the default `"1234"` when unset.
  - Secret storage: `apps/web/lib/admin/tenant-secret.ts` -> `getTenantSecret`/`setTenantSecret` over the `tenants.settings` JSONB `secrets` namespace; write is `settings:manage`-gated, read is `server-only`, RLS fail-closed (`tenants_tenant_isolation`). **Never returns raw secret values.**
  - Consumers today: `hardDeleteAppointment()` and `deleteStaffMember()` both call the gate. Use `hardDeleteAppointment` as the structural precedent (gate + reference guard + `RETURNING` + audit in one tx).
- **Clinical-records-linked refuse guard:** a patient must NOT be hard-deletable while clinical records reference it. The appointment precedent checks `clinicalRecords` by `appointmentId`; the patient equivalent checks `clinicalRecords` by **`patientId`** (`count > 0` -> refuse with a server error like `AdminError("has_clinical_records")`, surfaced as a disabled control + pt-PT tooltip, gate server-enforced).
- Audit on every clinical/permission-sensitive mutation (CLAUDE.md rule 6).
- **RECON FIRST (report BEFORE building):** confirm no `hardDeletePatient` exists; confirm the scrypt gate files above; confirm how `clinical_records.patientId` links (and whether locked/signed records specifically must block - they do: the immutability trigger means those records can never be removed, so a linked patient is permanently non-hard-deletable); confirm whether patient delete should use the **same** secret key as appointment/staff delete or a distinct `patientDeletePasswordHash` (recommend: reuse the shared delete-password secret unless the owner wants a separate one - note in QUESTIONS if ambiguous).

**Scope:** add a server-enforced `hardDeletePatient()` that (1) **refuses if any clinical record references the patient** (`clinicalRecords.patientId` count > 0), and (2) requires the **scrypt password gate** (reuse `verifyDeletePassword` / `verifySecret` / `getTenantSecret`); wire a destructive UI control (UI-STYLE.md `variant="destructive"` + password prompt) that stays disabled/guarded when records are linked; audit the deletion. Soft-delete remains the default path; hard-delete is the gated escalation. pt-PT i18n (both files).

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-08-patient-delete origin/main -b osteojp-w5-08-patient-delete`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** no existing hardDeletePatient; the scrypt gate files; the `clinical_records.patientId` link; the shared-vs-separate secret-key decision.
3. **`hardDeletePatient()` server action** (in `apps/web/lib/patients/actions.ts`, tenant-scoped, child-first, `RETURNING`, idempotent), gated by `verifyDeletePassword` and by the clinical-records-linked refuse guard (server-enforced `AdminError`). Audit the delete (rule 6).
4. **Clinical-records refuse guard:** count `clinicalRecords` by `patientId`; > 0 -> refuse. (Any locked/signed record makes the patient permanently non-hard-deletable by construction - the immutability trigger; state this.)
5. **UI:** a destructive control (UI-STYLE.md sec 5) with the password prompt; disabled + pt-PT tooltip when records are linked; the gate is server-enforced (the disabled control is only an affordance).
6. **RLS/tenant isolation test** for the new destructive path (delete only within tenant scope; cross-tenant id deletes nothing).
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. RLS isolation), `pnpm build`, `pnpm test:e2e` (wrong password refused; linked-records refused; clean patient deletes on correct password).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- **Recon report pasted:** no prior hardDeletePatient; the reused gate files; the patientId link; the secret-key decision.
- **Gate proven:** a unit/e2e shows wrong password -> refused (server-enforced), correct password -> allowed. Paste it. **Never print the password or the stored hash** (fingerprint only).
- **Clinical-records guard proven:** a patient with a linked clinical record cannot be hard-deleted (server-enforced), even with the correct password. Paste the test.
- **RLS isolation test** for the destructive path (CLAUDE.md RLS rule - shipped in the same PR). Paste it.
- **Audit proven:** the delete writes an audit row (rule 6). Paste it.
- **Suite counts** (baseline web 816, @osteojp/db 56 + gated) with green gates.

## Field 4. Verification (paste evidence)
Recon report, migration-free diff, the password-gate test (no secret printed), the clinical-records-refuse test, the RLS isolation test, the audit test, suite counts, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`.
- **Migration-free;** reuse the W3-06 scrypt gate (`verifySecret`/`verifyDeletePassword`/`getTenantSecret`) - do not fork a new hashing scheme.
- **Server-enforced gate + guard:** the disabled control is only an affordance; both the password gate and the clinical-records refuse guard are enforced server-side. Never weaken either.
- **Secrets never printed** (CLAUDE.md rule 7): no password, no hash, no key id in logs/reports (fingerprints only).
- **Soft-delete stays the default;** hard-delete is the gated escalation - do not replace soft-delete.
- Audit every mutation (rule 6). DB via `packages/db`; `tenant_id` from JWT context, never payload.
- pt-PT i18n (both files), no emoji, UI-STYLE.md destructive-button styling. **Never force-push / `--admin`.**

## Field 6. Halt loud if (CLASSIC halt)
STOP and report to Ivan; product/scope to `docs/design/QUESTIONS.md` with a recommended default. Halt if: the owner has not decided shared-vs-separate delete-password secret (recommend reuse); or hard-deleting a patient would require touching the clinical-records immutability trigger / audit append-only (rules 4 + 6) - it must NOT (a records-linked patient is simply non-hard-deletable), so surface rather than bypass.

## Field 7. Report back
Recon report, the `hardDeletePatient` implementation, the gate + clinical-records-refuse + RLS + audit tests, migration-free proof, suite counts, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.
