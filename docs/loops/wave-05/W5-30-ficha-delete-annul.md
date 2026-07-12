# Loop W5-30 - Ficha delete + annul, migration 0035 (Wave 05 Ficha Final 2)

GATE: **Wave 05 Ficha Final 2 (FF2).** **Carries migration 0035** (`record_annulments`, append-only). Migration head is **0034**; **one migration in flight**; fetch-and-fast-forward before live-apply; live-apply verified BEFORE DONE. Reuses the W5-08 / W3-06 scrypt password gate. **The `clinical_records` immutability trigger is NOT touched in any way.** Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Three parts: (a) password-gated **hard delete** for un-finalized fichas; (b) **migration 0035** adding an append-only `record_annulments` table; (c) password-gated **Anular** for signed fichas that INSERTS an annulment row (never updates/deletes the locked record), plus an ANULADO badge and a "Mostrar anulados" toggle. Additionally: apply pending migrations **0034 and 0035** to the LOCAL 127.0.0.1 Supabase to close local drift.

Ground truth (recon at authoring 2026-07-12, embed - executor runs with ZERO memory):
- **(a) Hard delete (draft / AI-ingested pending only):** password-gated hard delete for `clinical_records` whose `record_status = draft` (this INCLUDES AI-ingested records still in `ai_review_state` pending review that have NOT been locked/signed). From the patient profile **Registos clinicos** tab. Reuse the existing scrypt gate:
  - `apps/web/lib/admin/secret-hash.ts` -> `verifySecret(plain, stored)` (`node:crypto.scryptSync` + `timingSafeEqual`; format `scrypt$<saltHex>$<hashHex>`).
  - `apps/web/lib/admin/appointment-delete-password.ts` -> `verifyDeletePassword(actor, supplied)` reading the hashed secret via `getTenantSecret`, default `"1234"` when unset.
  - `apps/web/lib/admin/tenant-secret.ts` -> `getTenantSecret`/`setTenantSecret` over `tenants.settings` JSONB `secrets` (write `settings:manage`-gated, read `server-only`, RLS fail-closed). **Never returns raw secret values.**
  - W5-08 added `hardDeletePatient()` using this exact gate as the patient precedent; follow the same shape for `hardDeleteClinicalRecord()`.
  - **The immutability trigger already blocks delete on locked/signed records** (CLAUDE.md rule 4, BEFORE UPDATE OR DELETE on `clinical_records`), so hard delete is only reachable for `draft`. Do NOT weaken or touch the trigger; the gate + status check are the affordance, the trigger is the backstop.
- **(b) Migration 0035 `record_annulments` (append-only):** columns `id` (uuid pk), `tenant_id uuid not null`, `record_id` uuid not null FK -> `clinical_records(id)`, `reason text` nullable, `annulled_by` (actor), `created_at timestamptz not null default now()`. **RLS fail-closed**, `tenant_id` from the JWT `tenant_id` claim (CLAUDE.md rules 1-3). **Append-only enforced** by the standing pattern (no UPDATE/DELETE grant; the "0-rows / 42501" pattern with tests asserting the mechanism, as prior append-only tables do). Ship the migration + `_journal.json` entry (hand-authored SQL, mirrored to `supabase/migrations/`) + an **RLS isolation test** in the SAME PR (CLAUDE.md RLS rule). Migration head is 0034 -> this is 0035; one migration in flight.
- **(c) Anular (signed fichas):** signed records get a password-gated **"Anular"** action that **INSERTS** a `record_annulments` row (reason optional). The locked/signed `clinical_record` row is **never updated or deleted** - the immutability trigger stays intact. UI: an **ANULADO badge** on annulled records; annulled records are **hidden from the default Registos clinicos list** behind a **"Mostrar anulados"** toggle. Audit the annul (CLAUDE.md rule 6).
- **Local migration drift (executor step):** apply pending migrations **0034** (`patients.contraindication_pacemaker`, W5-21) **and 0035** to the LOCAL 127.0.0.1 Supabase, closing the drift that blocks therapist E2E specs. **Local apply is unrestricted; cloud apply follows standing procedure** (fetch-and-fast-forward first, applied-state verified BEFORE DONE, secrets never printed).
- **Two orthogonal state machines respected:** `record_status` (draft/locked/signed) and `ai_review_state` are SEPARATE (CLAUDE.md rule 4); annul is a NEW append-only fact, not a status mutation. Twelve AI keys untouched; W5-13 `ficha-medica-compat.test.ts` stays green.

**Scope:** `hardDeleteClinicalRecord()` (draft/AI-pending, scrypt-gated, clinical-records-linked semantics N/A - the record itself is the target, child-first where the record has children, RETURNING, audit); migration 0035 `record_annulments` (append-only, RLS fail-closed, isolation test); a password-gated Anular action that INSERTs an annulment for signed records (trigger untouched); ANULADO badge + Mostrar anulados toggle; local 0034+0035 apply. pt-PT i18n (both files).

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; `git worktree add ../osteojp-w5-30-ficha-delete-annul origin/main -b osteojp-w5-30-ficha-delete-annul`; assert toplevel + clean tree + HEAD == `origin/main` tip; assert migration head == 0034. HALT (Field 6) if any fails.
2. **Recon, report BEFORE building:** confirm the scrypt gate files; confirm the `clinical_records` immutability trigger blocks delete/update on locked/signed (so hard delete is draft-only by construction); confirm migration head 0034; confirm the append-only pattern used by an existing append-only table (the 0-rows/42501 test shape); confirm shared-vs-separate delete-password key (recommend REUSE the shared delete-password secret unless the owner wants a distinct one - note in QUESTIONS if ambiguous). Paste findings.
3. **(a) Hard delete server action** `hardDeleteClinicalRecord()` (tenant-scoped, `draft`/AI-pending only, scrypt-gated via `verifyDeletePassword`, RETURNING, idempotent, audit). Wired to a destructive control on the Registos clinicos tab (UI-STYLE destructive variant + password prompt), server-enforced. Locked/signed never deletable (trigger + status check).
4. **(b) Migration 0035 `record_annulments`:** hand-authored SQL (columns above), RLS fail-closed keyed on JWT `tenant_id`, append-only (no UPDATE/DELETE grant), `_journal.json` entry, mirror to `supabase/migrations/`. Ship the RLS isolation test + the append-only 0-rows/42501 assertion in the SAME PR.
5. **(c) Anular action:** password-gated; INSERTs a `record_annulments` row for a signed record (reason optional); never updates/deletes the locked row; audit. ANULADO badge on annulled records; "Mostrar anulados" toggle hides them from the default list.
6. **Local apply (executor):** apply 0034 + 0035 to the LOCAL 127.0.0.1 Supabase; paste the local applied-state. **Cloud/dev apply:** fetch-and-fast-forward first, `drizzle-kit migrate`, verify `information_schema` shows `record_annulments` with RLS + append-only grants; paste before/after. Never print secrets.
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. RLS isolation + append-only + W5-13 compat), `pnpm build`, `pnpm test:e2e` (wrong password refused on both delete and annul; a draft hard-deletes on correct password; a signed record cannot hard-delete but CAN be annulled -> ANULADO badge + hidden behind Mostrar anulados; the locked row is unchanged after annul).

## Field 3. Definition of done (machine-verifiable)
- **One-migration-in-flight PROOF:** `git diff --name-only origin/main` shows EXACTLY ONE new migration `packages/db/migrations/0035_record_annulments.sql` (+ its `supabase/migrations/` mirror + `_journal.json`), ZERO `.github/workflows/`. Paste it.
- **Recon report pasted:** scrypt gate files; trigger blocks locked/signed; append-only pattern; shared-vs-separate secret decision.
- **Delete gate PROOF:** wrong password -> refused (server-enforced); correct password -> a draft hard-deletes. **Never print the password or the stored hash** (fingerprint only). Paste it.
- **Delete-scope PROOF:** a locked/signed record CANNOT be hard-deleted even with the correct password (trigger + status check). Paste it.
- **Annul-INSERT PROOF:** annulling a signed record INSERTs a `record_annulments` row and the locked `clinical_record` row is byte-for-byte unchanged (no UPDATE/DELETE on it); the immutability trigger is not touched. Paste it.
- **Append-only PROOF:** an UPDATE/DELETE against `record_annulments` fails with the standing 0-rows/42501 mechanism. Paste the test.
- **RLS isolation PROOF:** cross-tenant read/insert on `record_annulments` is denied (fail-closed, JWT `tenant_id`). Paste it (shipped same PR).
- **UI PROOF:** ANULADO badge shows on annulled records; "Mostrar anulados" toggles their visibility; default list hides them. Paste it.
- **Audit PROOF:** delete and annul each write an audit row (rule 6). Paste it.
- **Local-drift-closed PROOF:** 0034 + 0035 applied to the LOCAL 127.0.0.1 Supabase; paste the local applied-state. **Cloud live-apply PROOF (mandatory before merge):** `record_annulments` present with RLS + append-only grants on the dev DB; paste it.
- **W5-13 compat GREEN.** Paste it.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
Recon report, the one-migration diff, the delete-gate test (no secret printed), the delete-scope test, the annul-INSERT + row-unchanged test, the append-only test, the RLS isolation test, the badge/toggle UI test, the audit test, the local + cloud applied-state, passing W5-13 compat, suite counts, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`.
- **The `clinical_records` immutability trigger is NEVER touched.** Signed/locked records are never updated or deleted; annul is an INSERT into a separate table. Hard delete is `draft`/AI-pending only, enforced by the status check AND the trigger backstop.
- **One migration in flight (0035 only).** Fetch-and-fast-forward first; live-apply verified before DONE. Ship the RLS + append-only tests in the SAME PR (CLAUDE.md RLS rule). Mirror to `supabase/migrations/` + `_journal.json`.
- **Append-only + RLS fail-closed** on `record_annulments`; `tenant_id` from JWT, never payload; no UPDATE/DELETE grant.
- **Reuse the W5-08 / W3-06 scrypt gate;** do not fork a hashing scheme. **Secrets never printed** (rule 7): no password, no hash, no key id (fingerprints only).
- **Local apply unrestricted; cloud apply follows standing procedure.** DB access only through `packages/db`. Audit every mutation (rule 6).
- **Twelve AI keys frozen;** W5-13 compat stays green. **SYNTHETIC-DATA-ONLY** for any dry-run.
- pt-PT i18n (both files), no emoji, UI-STYLE.md destructive-button styling. **Never force-push / `--admin`.** Plain hyphens only.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails (not toplevel, dirty tree, HEAD != tip, or migration head != 0034).
- Migration head is NOT 0034 (drift or a competing in-flight migration) - HALT; only one migration in flight.
- Annulling or hard-deleting would require touching the `clinical_records` immutability trigger or the audit append-only (rules 4 + 6) - it must NOT; surface rather than bypass.
- The owner has not decided shared-vs-separate delete-password secret - recommend REUSE, log to QUESTIONS, proceed on the default only if unblocked; otherwise mark blocked and surface.
- Achieving append-only on `record_annulments` needs a mechanism beyond the standing 0-rows/42501 grant pattern - surface it.

## Field 7. Report back
Recon report, the one-migration diff, the delete-gate + delete-scope + annul-INSERT + append-only + RLS + badge/toggle + audit tests, the local + cloud applied-state, passing W5-13 compat, suite counts, PR number.

**Merge policy (owner amendment 2026-07-12, supersedes the original FF2 per-loop OWNER-MERGE split):** GREEN self-merge permitted once ALL required checks are green AND all three Vercel deployment checks (osteojp-api, osteojp-platform, osteojp-portal) are green. The cross-browser E2E lane is non-required and is ignored, never waited on. **Live-apply verification evidence (this loop's migration 0035 applied-state, plus the local 0034+0035 apply) must be pasted in the loop report before merge regardless.** Close: open ONE PR against `main`; self-merge on the policy above once green. Never force-push / `--admin`; never self-merge on red required checks.
