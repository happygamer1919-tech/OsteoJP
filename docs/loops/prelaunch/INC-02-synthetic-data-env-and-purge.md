# Loop INC-02 - Synthetic data on prod: env root-cause fix + purge (Pre-Launch incident, 2026-07-27)

GATE: **Pre-Launch, INCIDENT, two halves. (a) env root-cause = OWNER-MERGE +
owner INFRA provisioning. (b) purge = CYAN read-only inventory -> owner
AUTORIZO.** Rodica created synthetic patient "Teste CB" with multiple appointments
and at least one generated Declaracao on the LIVE DB - a repeat of the July
incident. YELLOW authors both halves; **YELLOW does NOT scope the data (CYAN
counts) and does NOT run any prod write (owner does, under AUTORIZO).** Starts from
**fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

The incident: Rodica keeps testing on prod because she has no target she can
actually use. The purge is the symptom; the missing test environment is the root
cause. Both halves are authored here.

Ground truth (recon at authoring 2026-07-27, embed - executor RE-VERIFIES
read-only, ZERO memory):

- **There is NO named test target for Rodica.** The e2e seed
  `apps/web/e2e/seed/seed-e2e.mjs` provisions synthetic tenants but defaults to
  LOCAL `http://127.0.0.1:54321` (`:37-41`) - useless to a non-technical clinic
  manager. Local Supabase is `supabase/config.toml` + `supabase/seed.sql`;
  branching doc `docs/supabase-branching.md`. **No Vercel-preview-for-Rodica doc
  exists.** pt-PT staff docs that exist: `docs/staff-cheat-sheet.md`,
  `docs/staff-faq.md`, `docs/help-text-staff.md`, `docs/test-scenarios-staff.md` -
  none is a "safe place to test" sheet.
- **Prod ref is `dfotoodqvmjhbdcxyaxf`** (`aws-0-eu-central-1.pooler.supabase.com`).
  Ref-guard precedent: `docs/runbook-prod-migrations.md`, `docs/ops/prod-migrate.md`
  (RETIRED banner), `docs/ops/prod-drift-check.md:24`. Real-data-only.
- **There is NO declarations table** - declaracoes are transient (see PL-03a). The
  "generated Declaracao" Rodica made is a transient PDF, not a stored row; the
  synthetic FOOTPRINT to inventory is the patient + its appointments + clinical
  episodes + clinical records.
- **The purge script does NOT live in this repo.** `packages/db/scripts/` does not
  exist here; the prod-apply scripts (incl. the prior purge v2) are staged in the
  sibling worktree `osteojp-prod-apply/packages/db/scripts/`. This governance loop
  lives in this repo; the script is staged there by CYAN/GREEN and run by the owner.
- **SEED_TENANT_ID = `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`** (slug `osteojp`).
- **Standing rule 8:** signed clinical records are immutable - annulment path only,
  never delete. If any of Teste CB's records are signed, they are ANNULLED, not
  purged.

**Scope:** (a) a pt-PT one-page instruction sheet
(`docs/ops/rodica-ambiente-de-teste.md`, authored in this PR as a template) + a
QUESTIONS item for the owner to PROVISION a named non-prod target; (b) a purge
governance spec: CYAN produces the read-only inventory, owner runs the purge under
AUTORIZO, signed records annulled. ZERO prod write by YELLOW; ZERO data scoped by
YELLOW.

## Field 2. Ordered steps

### Half (a) - environment root-cause fix
1. **Author the pt-PT sheet** `docs/ops/rodica-ambiente-de-teste.md` (done in this
   PR as a template): plain pt-PT, one page, placeholders `{URL_DE_TESTE}`,
   `{UTILIZADOR}`, `{PALAVRA_PASSE}` the owner fills; a "NUNCA testar em
   osteojp.pt" warning with how to tell the test URL from prod.
2. **Register the provisioning question** (Q-INC-02-1): the owner provisions a
   named, persistent NON-prod target Rodica can reach (recommended default: a
   stable "staging" Vercel deployment of `apps/web` wired to a DEDICATED non-prod
   Supabase project (EU), seeded synthetic via the seed path, with Rodica-specific
   credentials). Mark it owner/infra - YELLOW does not create Supabase projects or
   Vercel envs.
3. **DoD gate:** the target is real and verifiably NOT prod (its Supabase ref !=
   `dfotoodqvmjhbdcxyaxf`), Rodica has working credentials, the sheet is filled.

### Half (b) - purge scope (CYAN counts, owner runs)
4. **CYAN read-only inventory** (pre-flight recon, ref-guard `dfotoodqvmjhbdcxyaxf`,
   `set session characteristics as transaction read only`): count the synthetic
   footprint under `SEED_TENANT_ID` - the "Teste CB" patient, its `appointments`,
   `clinical_episodes`, `clinical_records` (flag any `record_status=signed`
   separately - those annul, not delete). Produce the exact TARGETS + PRE counts +
   a sha256'd purge script staged in `osteojp-prod-apply/packages/db/scripts/`.
   **YELLOW does not produce these counts.**
5. **Owner AUTORIZO run:** the owner runs the staged purge in his own terminal
   under one AUTORIZO phrase (one phrase per window); single transaction,
   halt-on-mismatch rollback, `audit_log` never truncated (append-only), signed
   records ANNULLED not deleted.
6. **CYAN post-purge PASS:** Teste CB footprint = 0 (or annulled), config intact,
   `audit_log` preserved. This is the evidence that flips launch gate G4.

## Field 3. Definition of done (machine-verifiable)
- **(a) Sheet PROOF:** `docs/ops/rodica-ambiente-de-teste.md` exists, pt-PT, one
  page, with the placeholders and the "never test on prod" warning. Paste it.
- **(a) Target PROOF:** a named non-prod URL exists whose Supabase ref is asserted
  `!= dfotoodqvmjhbdcxyaxf`, with Rodica credentials that log in. (Owner-provisioned;
  recorded, not YELLOW-run.)
- **(b) Inventory PROOF:** a CYAN read-only inventory of the Teste CB footprint
  (patient / appointments / episodes / records, signed flagged), ref-guarded,
  produced by CYAN. Pasted counts.
- **(b) Purge PROOF:** owner-run purge journal/output; CYAN post-purge PASS
  (footprint 0 or annulled, config intact, audit_log append-only). This is
  launch-gate G4's evidence.
- **Boundary PROOF:** `git diff --name-only origin/main` from YELLOW touches only
  docs (the sheet + this loop + QUESTIONS + the board) - no script, no prod write.

## Field 4. Verification (paste evidence)
The pt-PT sheet, the Q-INC-02-1 provisioning item, the ref!=prod assertion, the
CYAN inventory counts, the owner purge output, the CYAN post-purge PASS, the
docs-only YELLOW diff.

## Field 5. Restrictions and scope boundary
- **YELLOW authors, does NOT scope the data.** CYAN produces the read-only
  inventory and the counts; YELLOW never enumerates prod rows.
- **No prod write by anyone but the owner, under AUTORIZO.** One phrase per window;
  GREEN/CYAN stage the byte-exact script, the owner runs it. Destructive op =
  owner-confirmable; log and block, never autonomous.
- **Signed clinical records are ANNULLED, never deleted** (rule 8).
- **Root cause first:** the purge without half (a) guarantees a THIRD occurrence.
  Prioritise the environment so Rodica stops testing on prod.
- pt-PT sheet correct diacritics; plain hyphens; no em/en dashes; no emoji. Never
  force-push / `--admin`. No PII in logs or in the inventory output.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- Anyone attempts the purge before CYAN's read-only inventory + owner AUTORIZO -
  HALT (repeat of the doctrine violation the incident is about).
- CYAN finds signed clinical records in the Teste CB footprint - HALT to the
  annul-not-delete path (rule 8); do not delete.
- CYAN's PRE counts do not match the expected synthetic-only footprint (e.g. a real
  patient is entangled) - HALT; do not purge a mixed set.
- The owner cannot provision a non-prod target and Rodica must keep testing
  somewhere - HALT to a Q with the recommended default (staging Vercel + dedicated
  Supabase) rather than leaving her on prod silently.

## Field 7. Report back
The pt-PT sheet path, the provisioning question, the CYAN inventory counts (from
CYAN, not YELLOW), the owner purge + CYAN post-purge PASS status, and the
confirmation that G4 evidence is captured. YELLOW's diff is docs-only.

## Merge policy (embed, Pre-Launch)
- **INC-02 half (a) doc + board = OWNER-MERGE** (docs/board change); the target
  PROVISIONING is owner INFRA (not a mergeable code artifact). **Half (b) is
  owner AUTORIZO** - the purge is a destructive prod write the owner runs; CYAN's
  inventory + post-purge PASS are the evidence, not a merge. YELLOW authors, never
  merges its own PR, never runs a prod write. HALT-LOUD on any purge-before-
  inventory or any signed-record deletion.
