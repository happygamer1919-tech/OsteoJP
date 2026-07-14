# Loop W6-01a - BUG: ficha delete/annul fails on test patients (Wave 06 Melhorias)

GATE: **Wave 06 Melhorias, BUG loop, DIAGNOSIS-FIRST.** Password-gated ficha delete errors out ("there is an error") on synthetic test patients **paol** and **paul**. **Read-only recon and a recorded root-cause finding are MANDATORY before any fix.** Expected migration-free; if recon proves a schema/FK defect that needs a migration, that is a HALT (see Field 6). Runs FIRST in Wave 06 (blocks W6-04). Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Fix the failure where the password-gated **delete** of a ficha (clinical record) errors on the patients **paol** and **paul**, and replace the opaque "there is an error" with clear pt-PT messages that distinguish **wrong password** vs **signed record (Anular only)** vs **server error**. Diagnosis first: the root cause is recorded in this loop file before any code changes.

Ground truth (recon at authoring 2026-07-14, embed - executor runs with ZERO memory):
- **The delete/annul UI:** `apps/web/app/patients/[id]/record-lifecycle-actions.tsx`. A DRAFT (or AI-pending) ficha shows a password-gated **"Eliminar"** (hard delete); a SIGNED ficha shows a password-gated **"Anular"** (append-only, optional reason). Local `open` state is `null | "delete" | "annul"` (line ~41); on submit it calls the delete action for draft or `annulRecordAction(recordId, patientId, password, reason)` for signed (line ~60). Error text is mapped from an error-code map (e.g. `already_annulled -> s["clinical.recordAlreadyAnnulled"]`) with a fallback to `s["errors.generic"]` - the opaque "there is an error" the owner saw is almost certainly this **generic fallback masking a specific error code**.
- **The server actions:** the draft hard-delete action (W5-30, `hardDeleteClinicalRecord()`-shaped) and `annulRecordAction` live under `apps/web/app/patients/[id]/` and/or `apps/web/lib/clinical/`. They return a discriminated result (`ok` vs `{ error: <code> }`). Recon must enumerate EVERY error code each action can return and confirm each maps to a distinct pt-PT string.
- **The scrypt password gate (W5-08 / W3-06 precedent, do NOT fork):**
  - `apps/web/lib/admin/secret-hash.ts` -> `verifySecret(plain, stored)` (`node:crypto.scryptSync` + `timingSafeEqual`; format `scrypt$<saltHex>$<hashHex>`).
  - `apps/web/lib/admin/appointment-delete-password.ts` -> `verifyDeletePassword(actor, supplied)` reading the hashed secret via `getTenantSecret`, default `"1234"` when unset.
  - `apps/web/lib/admin/tenant-secret.ts` -> `getTenantSecret` over `tenants.settings` JSONB `secrets` (RLS fail-closed, never returns raw secret values).
- **The annulment table (W5-30, migration 0035):** `record_annulments` (`packages/db/src/schema.ts:842`), append-only, FK `record_id -> clinical_records(id)`, RLS fail-closed on JWT `tenant_id`. Migration head is 0035 (applied cloud + local per FF2 close).
- **The immutability backstop:** the `clinical_records` BEFORE UPDATE OR DELETE trigger (CLAUDE.md rule 4) blocks delete/update on locked/signed rows. Hard delete is reachable only for `draft`/AI-pending; signed fichas are annul-only.
- **Test patients:** paol and paul are SYNTHETIC dev-DB fixtures. This session does NOT touch the database; the executor reproduces on the dev/preview DB with synthetic data only.

**Candidate causes to investigate (recon each, record verdict per candidate):**
1. **scrypt password gate** - the gate throws or returns false unexpectedly (e.g. unset secret path, hash-format mismatch, actor context missing the tenant secret read).
2. **RLS** - the delete/annul runs under a context whose JWT `tenant_id` does not authorize the write (fail-closed denial surfacing as a generic error), or the read of the record is denied so the action sees "not found".
3. **draft-vs-signed state confusion with the Anular path** - the UI or action mis-routes: a signed ficha sent down the hard-delete path (trigger blocks it), or a draft sent to Anular, or the record's `record_status` is misread so the wrong action fires. paol/paul may hold records in a state that exposes this.
4. **FK from `record_annulments` (0035)** - the annul INSERT or the hard delete violates/collides with the `record_id` FK (e.g. deleting a record that already has an annulment row, or an annul referencing a record the FK cannot resolve), surfacing as a constraint error mapped to the generic fallback.

**Scope:** (1) recon + recorded root-cause finding (which candidate(s), with evidence); (2) the minimal fix for that root cause; (3) a regression test that reproduces the pre-fix failure and passes post-fix; (4) pt-PT error messages that distinguish wrong password vs signed-record-is-annul-only vs server error, wired through the existing error-code map (no generic-fallback masking for known cases). **Signed fichas remain annul-only; the `clinical_records` immutability trigger and all append-only mechanisms are NEVER touched.** i18n copy is pt-PT (both files); this loop MAY add error-string keys (values only, keep-both on rebase, JSON.parse both files in the gate).

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; `git worktree add ../osteojp-w6-01a-ficha-delete-bugfix origin/main -b osteojp-w6-01a-ficha-delete-bugfix`; assert toplevel + clean tree + HEAD == `origin/main` tip. HALT (Field 6) if any fails.
2. **RECON, record BEFORE any fix (mandatory):** reproduce the failure on paol and paul (synthetic DB), capture the exact error code / server log (PII-free). Walk all four candidate causes; for EACH, record a verdict (root cause / contributing / ruled out) with the evidence. Enumerate every error code the delete and annul actions return and its current pt-PT mapping. **Write the root-cause finding into this loop file's "Root-cause finding" appendix (below) in the PR** so the diagnosis is durable. No code changes yet.
3. **Fix the root cause** with the minimal change. If the root cause is the gate, RLS, state routing, or the FK, fix exactly that; do not refactor adjacent code. Never weaken the immutability trigger or the append-only mechanism.
4. **Error messages:** wire distinct pt-PT strings for wrong password, signed-record-is-annul-only, and server error, through the existing error-code map. Remove the generic-fallback masking for these known cases (fallback stays only for truly-unexpected errors).
5. **Regression test:** a test that reproduces the pre-fix failure (fails without the fix, passes with it) plus assertions for the three distinguished error messages. Reuse the suite's synthetic fixtures.
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. RLS isolation + W5-13 compat + the new regression test), `pnpm build`, `pnpm test:e2e` (delete on a draft with correct password succeeds; wrong password refused with the wrong-password message; a signed ficha cannot hard-delete and shows the annul-only message, and CAN be annulled; the paol/paul reproduction no longer errors). JSON.parse both i18n files in the gate.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it. (If a migration proved necessary, this loop HALTED per Field 6 instead.)
- **Root-cause finding pasted** in the loop file appendix: the reproduction, the per-candidate verdicts, and the identified root cause with evidence.
- **Fix PROOF:** the delete on paol and paul (synthetic) now succeeds where it previously errored. Paste it (PII-free, never print the password or hash - fingerprints only).
- **Distinct-error PROOF:** wrong password -> wrong-password message; signed ficha down the delete affordance -> annul-only message; forced server error -> server-error message. Paste all three; none falls through to the opaque generic text.
- **Signed-annul-only PROOF:** a signed ficha still cannot be hard-deleted (trigger + status check) and can still be annulled; the immutability trigger and append-only mechanism are byte-for-byte untouched (diff shows no trigger/migration change). Paste it.
- **Regression-test PROOF:** the new test fails on pre-fix code and passes post-fix. Paste it.
- **W5-13 compat GREEN** (delete/annul touch the ficha surface). Paste it.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
Recon report + root-cause finding, the migration-free diff, the fix reproduction, the three distinct-error proofs, the signed-annul-only proof, the regression test, passing W5-13 compat, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **Diagnosis-first:** no fix commit before the root-cause finding is recorded.
- **The `clinical_records` immutability trigger and the `record_annulments` append-only mechanism are NEVER touched.** Signed fichas stay annul-only. This is the known failure mode - an immutability-bypass "fix" is an instant HALT, never a shortcut.
- **Reuse the W5-08 / W3-06 scrypt gate;** do not fork a hashing scheme. **Secrets never printed** (rule 7): no password, no hash, no key id (fingerprints only).
- **Migration-free expected.** DB access only through `packages/db`. Audit every mutation (rule 6, unchanged).
- **SYNTHETIC-DATA-ONLY** for the reproduction and verify; real patient data is never touched.
- pt-PT i18n (both files, keep-both on rebase, JSON.parse both in the gate); no emoji; UI-STYLE.md destructive-button styling. **Never force-push / `--admin`.** Plain hyphens only.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails (not toplevel, dirty tree, or HEAD != `origin/main` tip).
- The root cause is a schema/FK defect that requires a **migration** to fix (e.g. the `record_annulments` FK or a missing constraint) - HALT with the finding and a proposed migration; this loop is migration-free and one-migration-in-flight rules + OWNER-MERGE would apply to a follow-up. Do NOT author a migration here.
- The only apparent path to make delete succeed is to weaken/touch the immutability trigger or the append-only grant - surface it, never bypass (instant escalation).
- Recon cannot reproduce the failure on paol/paul at all (state already changed) - HALT with the recon evidence and a recommended default (proceed on the most likely code-path defect, or request a fresh repro fixture).

## Field 7. Report back
Recon report + recorded root-cause finding, the migration-free diff, the fix reproduction, the three distinct-error proofs, the signed-annul-only proof, the regression test, passing W5-13 compat, suite counts, PR number.

## Root-cause finding (executor fills this appendix in the PR before the fix commit)
- Reproduction (paol / paul, PII-free):
- Candidate 1 (scrypt gate) verdict + evidence:
- Candidate 2 (RLS) verdict + evidence:
- Candidate 3 (draft-vs-signed / Anular routing) verdict + evidence:
- Candidate 4 (record_annulments FK, 0035) verdict + evidence:
- **Identified root cause:**
- Fix summary:

**Merge policy (owner amendment 2026-07-12, standing for Wave 06):** GREEN self-merge permitted once ALL required checks are green (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deployment checks (osteojp-api, osteojp-platform, osteojp-portal) are green, read from the checks API, never the banner. The cross-browser lane no longer exists. This loop is migration-free -> GREEN self-merge; if a migration surfaced it HALTED to a follow-up OWNER-MERGE loop with live-apply evidence. Workflow files are never touched. Close: open ONE PR against `main`; self-merge on the policy above once green. Never force-push / `--admin`; never self-merge on red required checks.
