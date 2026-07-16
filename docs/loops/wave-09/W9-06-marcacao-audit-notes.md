# Loop W9-06 - Marcacao audit and notes surfacing (Wave 09 Correcoes CB)

GATE: **Wave 09 Correcoes CB, CONDITIONAL merge per W9-01 (e).** Surfaces created-by / created-at on marcacoes, moves the staff-side notes/historico into a contained hover card (not an always-on hover), and ships an automated guard test that the portal never exposes notes. **Consumes W9-01 findings (c) and (e).** Runs AFTER W9-05 merged and `origin/main` fast-forwarded. Starts from **fresh `origin/main`**; never stacked.

**Conditional merge (resolved by W9-01 (e)):**
- **If W9-01 (e) finds `created_by` PRESENT:** this loop is **migration-free, GREEN self-merge**, zero migrations.
- **If W9-01 (e) finds `created_by` ABSENT:** this loop is **migration-gated -> OWNER-MERGE**, with a single migration (both migration dirs + snapshot) that adds the audit column(s), manual `drizzle-kit` apply verified live BEFORE DONE, and RLS/isolation coverage in the same PR. One migration in flight; head is `0037`, so the next number is `0038` (fetch + list both dirs to confirm).

## Field 1. Scope and ground truth

Fix items 6, 9, and 10 of the CB QA (`docs/qa/2026-07-16-castelo-branco-qa.md`):
- **(10)** created-by and created-at are not visible on marcacoes -> show who created the appointment and when, on the marcacao detail and list.
- **(9)** marcacao notes/historico show on hover in the agenda and the marcacoes list (CB marks this "grave") -> a contained, deliberate staff-side hover card for internal notes, not an always-on hover leak.
- **(6)** the portal privacy invariant -> an automated guard test asserting the portal API AND UI never expose marcacao notes/comments to a patient.

Ground truth (recon at authoring 2026-07-16, embed - executor runs with ZERO memory; W9-01 (c) + (e) are authoritative, this is the starting map):
- **Audit columns:** `appointments` carries `created_by uuid` (FK users, nullable) and `created_at timestamptz` per the STATE 2026-06-30 schema dump. **W9-01 (e) CONFIRMS or DENIES this against the current schema.** If present and populated on create, item 10 is a display-only surfacing. If `created_by` is absent, this loop adds it (migration-gated path above). `created_at` (row insert time) is distinct from the appointment's `starts_at`.
- **Notes model:** `appointment_notes` (migration 0026) is the per-visit append-only staff notes relation `(appointment_id, patient_id, episode_id, author_user_id, body, created_at)`; inline `appointments.notes text` also exists. The W2-04 "Sem nota" indicator uses `EXISTS(appointment_notes)`. The staff-side leak (item 9) is that note/historico content shows on a plain hover in the agenda + marcacoes list; the fix is a contained hover card (a deliberate affordance) that keeps the note reachable but not always-on.
- **Portal privacy (item 6):** the portal consumes `apps/api` (`/api/v1/appointments`, `/portal/appointments/[id]`); W9-01 (c) states whether any note field reaches the portal response. The invariant: staff notes/comments/historico NEVER appear in a portal API response or the portal UI. This loop ships an automated guard test asserting that; if W9-01 (c) found a LIVE exposure, it was HALT-escalated in W9-01 and this loop closes it as a guarded priority.
- **Created-by is audit/display data, not PII to log:** surfacing the creator's name in the UI is fine; PII is never written to logs (rule 7).

**Scope:** (1) created-by + created-at shown on the marcacao detail and list; (2) internal notes/historico moved into a contained staff-side hover card (agenda + marcacoes list), not an always-on hover; (3) an automated guard test that the portal API/UI never exposes notes. Migration disposition is set by W9-01 (e) (see the conditional merge header).

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; assert `origin/main` contains W9-05's merge; `git worktree add ../osteojp-w9-06-marcacao-audit origin/main -b osteojp-w9-06-marcacao-audit`; assert toplevel + clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Consume W9-01 (c) + (e):** read `docs/recon/W9-01-findings.md`; record the `created_by` disposition (present -> migration-free; absent -> migration-gated) and the portal note-exposure guard points. Paste the citations. **Set this loop's merge path accordingly BEFORE writing code.**
3. **[Migration-gated branch only] Migration `0038`:** if `created_by` is absent, add the audit column(s) in ONE migration (both `packages/db/migrations/` + `supabase/migrations/` at `0038` + snapshot), populated on create; ship RLS/isolation coverage in the same PR. Fetch-and-fast-forward before the live apply; apply via manual `drizzle-kit` on the session pooler; paste applied-migration evidence BEFORE DONE. If `created_by` is present, SKIP this step (zero migration).
4. **created-by / created-at surfacing:** show the creator (name) + created-at on the marcacao detail and list, reading the audit columns. Display only.
5. **Contained notes hover:** replace the always-on note/historico hover in the agenda + marcacoes list with a contained, deliberate hover card (staff-side only). The note stays reachable; it is not an always-on leak.
6. **Portal guard test:** an automated test asserting the portal API response (`/api/v1/appointments`, `/portal/appointments/[id]`) AND the portal UI carry NO marcacao note/comment/historico field for a patient. This is the item-6 invariant guard.
7. **Tests:** created-by/created-at render on detail + list; the notes hover is contained (staff-side) and does not render note content in an always-on position; the portal guard test passes; (migration-gated branch) the RLS/isolation test for the new column passes. **E2E:** staff sees created-by/created-at + the contained hover; a portal fixture shows zero note content.
8. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`. JSON.parse both i18n files. Confirm `git diff --name-only origin/main`: ZERO workflow files always; ZERO migration files on the migration-free branch, or exactly the `0038` pair + snapshot on the migration-gated branch.

## Field 3. Definition of done (machine-verifiable)
- **Merge-path PROOF:** the W9-01 (e) disposition is stated and this loop's path (migration-free self-merge OR migration-gated owner-merge) is set accordingly. Paste the citation.
- **created-by/created-at PROOF:** both render on the marcacao detail and list from the audit columns. Paste the test.
- **Contained-notes PROOF:** internal notes are in a contained staff-side hover card, not an always-on hover; note content does not render in an always-on position. Paste the test + a before/after description.
- **Portal-guard PROOF:** an automated test asserts the portal API AND UI expose NO marcacao notes to a patient. Paste it.
- **[migration-gated only] Migration PROOF:** `0038` in BOTH dirs + snapshot; the audit column carries RLS/isolation coverage; the live-apply evidence is pasted BEFORE the owner merges. NO `.github/workflows/` file in the diff.
- **[migration-free only] Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO migration + ZERO workflow files. Paste it.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
The W9-01 (c)+(e) citations, the merge-path decision, the created-by/created-at + contained-notes + portal-guard proofs, (migration-gated) the `0038` diff + isolation test + live-apply evidence, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main` (contains W9-05). **Migration disposition is W9-01 (e)'s** - migration-free if `created_by` present, else ONE migration `0038` (one in flight, live-apply verified before DONE). Never author a migration on the migration-free branch.
- **The portal privacy invariant is non-negotiable:** staff notes/historico NEVER reach a patient (API or UI). The guard test is a required deliverable.
- **Notes stay contained, not removed:** the staff-side note remains reachable (a deliberate hover card); this loop contains the leak, it does not delete the notes feature.
- **created-by is display data;** PII is never logged (rule 7). Audit mutations if any new write path is added (rule 6). Every new domain column ships RLS/isolation coverage (migration-gated branch).
- pt-PT i18n (both files, JSON.parse both); no emoji; UI-STYLE.md + 55/25/20 equity. DB access only through `packages/db`. **Never force-push / `--admin`.** Plain hyphens only. **SYNTHETIC-DATA-ONLY for verify;** disposable test patients only, never **Maria Joao Silva** (`triboimax635+maria@gmail.com`); reference therapist **Tiago Reis**.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR `origin/main` does NOT contain W9-05's merge.
- W9-01 (c) reported (or this loop finds) that the portal ACTUALLY exposes marcacao notes to a patient - treat as a live privacy exposure: fix it as the guarded priority AND HALT-LOUD to record the exposure, do not merge silently.
- The migration-gated branch cannot apply `0038` live (DB access blocked / credentials only the owner holds) - HALT with the exact blocker; the owner applies + merges.
- A SECOND migration would be needed - HALT (this loop is at most one migration).
- Surfacing created-by would require exposing an actor id the audit contract keeps PII-free in a way that leaks PII - HALT (never leak PII; surface the display name via the scoped read only).

## Field 7. Report back
The W9-01 (c)+(e) citations, the merge-path decision, the created-by/created-at + contained-notes + portal-guard proofs, (migration-gated) the `0038` diff + isolation + live-apply evidence, suite counts, PR number.

## Merge policy (embed, Wave 09 Correcoes CB)
- **W9-06 is CONDITIONAL, resolved by W9-01 (e):** migration-free -> **GREEN self-merge**; migration-gated -> **OWNER-MERGE with live-apply evidence**. In BOTH cases all required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform, osteojp-portal) must be green, read from the checks API NOT the banner. On the migration-gated path the `0038` live-apply evidence is pasted BEFORE the owner merges; GREEN never self-merges a migration.
- **Runs after W9-05 merged**, fresh `origin/main`, never stacked. One migration in flight (only on the migration-gated branch). Workflow files NEVER touched. JSON.parse both i18n files in every gate. HALT-LOUD on scope/product/data/reality mismatch; any portal note exposure escalates instantly.
