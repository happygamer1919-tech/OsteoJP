# Loop W9-01 - Recon CB (Wave 09 Correcoes CB)

GATE: **Wave 09 Correcoes CB, READ-ONLY RECON, NO CODE, NO DB WRITE.** Investigates the six root-cause-unknown / invariant questions the CB QA raised (`docs/qa/2026-07-16-castelo-branco-qa.md`) and outputs a findings document `docs/recon/W9-01-findings.md` that the downstream loops consume. **No fixes in this loop.** Runs FIRST in Wave 09. Starts from **fresh `origin/main`**; never stacked. **GREEN self-merge** (docs-only).

## Field 1. Scope and ground truth

Produce a committed findings document `docs/recon/W9-01-findings.md` answering the six questions below with file/line or query-level evidence, so W9-02, W9-05, W9-06, and W9-07 build on ground truth instead of the QA's symptom descriptions. This is an audit: read-only, no code changes, no fixes, no migration, no DB write. Any read against a live DB is inside a `SET TRANSACTION READ ONLY` transaction with counts only, no credentials printed, nothing written.

Ground truth (recon at authoring 2026-07-16, embed as the STARTING map - the executor verifies + extends it, executor runs with ZERO memory):
- **Migration head is `0037`** (Wave 08 close, `service_packs` + `patient_pack_instances` + the offered-only-where-priced encoding). `packages/db/migrations/` and `supabase/migrations/` are in lock-step; the drizzle snapshot is frozen at 0014, migrations 0015+ are hand-authored SQL + manual journal entry (STATE 2026-07-07).
- **Appointments (`appointments`, `schema.ts:373-467` region as extended through 0032):** the dual orthogonal axes are `status` (scheduled/confirmed/completed/cancelled/no_show, migration 0000) and `confirmation_state` (pending/confirmed/declined, migration 0024). They are NEVER merged (DECISIONS 2026-07-01). Secondary participants `patient_2_id` / `practitioner_2_id` (migration 0032, W4-19) are nullable linked-display data; the agenda renders under the PRIMARY therapist column only. Inline `notes text` exists; `created_by uuid` (FK users, nullable) and `created_at timestamptz` exist on `appointments` (STATE 2026-06-30 schema dump) - the executor CONFIRMS this against the current schema for W9-06.
- **Agenda / location filtering:** the agenda + marcacoes surfaces are `apps/web/app/agenda/` and `apps/web/app/marcacoes/` (UI route names, not tables). The therapist/location filters shipped through W4-17 (agenda header redesign: `Todos os terapeutas` + `Todas as localizacoes`). Therapist-to-location is derived from `availability_templates (user_id, location_id)` (both not null); `getTherapistLocationIds` + `pickAutoFillLocation` were added in W4-12 for booking location auto-fill. The location filter's therapist-scoping logic is what item 1 says is leaking LV therapists into a CB view.
- **Declaracao de Presenca:** shipped in W5-31 (FF2, #563). The responsavel line is a tenant setting (code-default + `tenants.settings.declaracao` override, Q-W5-31 / Q-W5-11); the localidade line is per-location (from the marcacao, tenant-default fallback, Q-W5-10). The PDF template lives under `docs/pdf-templates/` (`declaration-presenca.html`) and the generation path is in the clinical/declaration code. The stamp/logo asset pipeline (Q-W5-9 signature/stamp asset) is what item 2 says prints the LV carimbo on a CB declaration with a missing logo and a forced download.
- **Services + per-location pricing (from W8-01a, `0037`):** `services` (nullable base `price_cents`, `location_id` null = all), `service_location_prices` (per-location override; presence of an active row = offered there, the offered-only-where-priced semantic), the pack model (`service_packs` + `patient_pack_instances`). Service-layer: `apps/web/lib/admin/services.ts` (`listServices`, `resolveServicePriceCents`, `isServiceOfferedAtLocation`, `listServiceOfferings`, `setServiceLocationPrices`) and `apps/web/lib/admin/packs.ts`. **The W6-01b split is standing:** service FILTER dropdowns include INACTIVE services; service CREATION dropdowns show ACTIVE only. NESA exists in the CB catalog (50.00) per the W8-01a owner-confirmed seed. **The three frozen legacy rows (Pilates Terapeutico 40.00, NESA 39.00, Massagem Terapeutica 50.00) are DEACTIVATED and MUST NOT be touched or reactivated** (docs/QUESTIONS.md 2026-07-15 JP BATCH).
- **Portal booking + notes:** the portal only DISPLAYS slots; the source of truth is `apps/api` `/api/v1/booking/slots` -> `listOpenSlots` (`apps/api/lib/appointments/store.ts`, W8-04 recon). Portal appointment detail is `/portal/appointments/[id]`. `appointment_notes` (migration 0026) is the per-visit append-only staff notes relation; the portal privacy invariant (item 6) is that NONE of this reaches a patient (API responses included).

Questions to answer (each is a required section of the findings doc):
- **(a) NESA missing from the CB booking dropdown.** Check `services` + `service_location_prices` rows for CB (`LOC_CB`), active flags, and the dropdown filter logic. Creation is active-only by design (W6-01b). Determine: is the CB NESA row inactive, is its CB price row missing/inactive (so offered-only-where-priced hides it), or is the dropdown filter wrong? State the exact cause with file/line + the row state (read-only). The three frozen legacy rows are deactivated by design and are NOT the fix target.
- **(b) Agenda card visual-state render mapping.** Map every agenda card visual state (strikethrough, badges, tint) to the lifecycle axis (`status`) and the confirmation axis (`confirmation_state`). The dual-axis data model is LOCKED; this is display-layer only. State precisely what strikethrough is currently bound to, so W9-05 can correct it to strikethrough = cancelled.
- **(c) Portal notes exposure.** Determine whether the patient portal exposes marcacao notes/comments/historico anywhere - the portal UI AND the `apps/api` responses it consumes (`/api/v1/appointments`, `/portal/appointments/[id]`). Cite the response shape. If any note field reaches the portal, that is a live exposure -> HALT-LOUD (Field 6). If none does, state the guard points W9-06's test should assert.
- **(d) Declaracao asset pipeline.** Where the logo and carimbo come from, whether per-location assets exist (or a single hardcoded LV asset), why the logo does not render, and where the auto-download vs preview behaviour is decided. Cite the generation path + the template + the tenant/location settings read.
- **(e) Marcacao audit columns.** Whether `appointments` carries `created_by` and `created_at` (or equivalent audit columns) and whether they are populated on create. **If `created_by` is absent, say so EXPLICITLY** - W9-06 then becomes migration-gated. Cite the schema + the create path.
- **(f) Agenda location filter leak.** The root cause of the location filter showing LV therapists when CB is selected: which query/predicate scopes the therapist list to the selected location and why it fails to exclude LV. Cite file/line.

**Scope:** a committed findings doc `docs/recon/W9-01-findings.md` with the six sections (a)-(f) answered with evidence. Read-only; NO code, NO fixes, NO migration, NO DB write. The only writes are the findings doc under `docs/recon/` and the BACKLOG row flip on close.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; assert `origin/main` is at the Wave 08 close (head `0037`); `git worktree add ../osteojp-w9-01-recon-cb origin/main -b osteojp-w9-01-recon-cb`; assert `git rev-parse --show-toplevel` ends in the worktree name, `git status --porcelain` empty, HEAD == `origin/main` tip. HALT (Field 6) if any fails.
2. **Answer (a)-(f)** read-only, in order, with file/line citations and (where a live read is unavoidable) read-only counts. Correct the starting map where it is wrong (say so in the doc).
3. **Write `docs/recon/W9-01-findings.md`** with one section per question, each stating the cause/answer plainly and the downstream consequence (e.g. "(e) `created_by` present -> W9-06 SELF-MERGE, zero migration" or "-> ABSENT -> W9-06 migration-gated").
4. **Gates (docs-only):** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` still green (a docs change must not break them); `pnpm test:e2e` unaffected. Confirm `git diff --name-only origin/main` shows ONLY files under `docs/`.

## Field 3. Definition of done (machine-verifiable)
- **No-code PROOF:** `git diff --name-only origin/main` shows ONLY `docs/` files (no `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`, or app code, and NO DB write). Paste it.
- **Findings-doc PROOF:** `docs/recon/W9-01-findings.md` exists with all six sections (a)-(f) answered, each with file/line or query-level evidence. Paste its path + section headers.
- **W9-06 disposition PROOF:** section (e) states EXPLICITLY whether `created_by` exists, and therefore whether W9-06 is SELF-MERGE (present) or migration-gated (absent).
- **W9-07 disposition PROOF:** section (a) states whether the NESA fix is code-only (dropdown filter) or requires a cloud data write (which makes W9-07 a HALT-for-authorization).
- **Gates green** (docs change does not break lint/typecheck/test/build).

## Field 4. Verification (paste evidence)
The no-code diff, the findings doc path + section headers, the (e) and (a) dispositions, gates green, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main` (head `0037`). **READ-ONLY: no code, no fixes, no migration, no schema, no workflow, NO DB write.** Any live read is `SET TRANSACTION READ ONLY`, counts only, credential-free.
- **Do NOT scope or sequence the fixes** - this loop states causes and dispositions; W9-02/05/06/07 own the fixes.
- **The three frozen legacy rows stay frozen** (Pilates Terapeutico 40.00 / NESA 39.00 / Massagem Terapeutica 50.00) - never propose reactivating them for the NESA fix.
- Plain hyphens only; no emoji; no em/en dashes. Portuguese diacritics correct in any pt-PT strings quoted. **Never force-push / `--admin`.** SYNTHETIC/read-only.
- **Standing test-data rule (Wave 09):** never run destructive QA against patient **Maria Joao Silva** (`triboimax635+maria@gmail.com`); disposable test patients only; reference therapist **Tiago Reis**. (This loop runs no QA at all.)

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR `origin/main` is not at the Wave 08 close (head `0037`).
- Section (c) finds the portal ACTUALLY exposes marcacao notes/comments to a patient (UI or API) - that is a LIVE privacy exposure -> HALT-LOUD with the finding rather than folding it into the findings doc as a routine item; a live exposure is escalated, not queued (W9-06 then fixes it as a guarded priority).
- Producing a useful finding would require RUNNING against live data or a DB WRITE - HALT (this loop is read-only against the repo + read-only DB counts).

## Field 7. Report back
The no-code diff, the findings doc path + section headers, the six answers in one line each, the W9-06 + W9-07 dispositions, gates green, PR number.

## Merge policy (embed, Wave 09 Correcoes CB)
- **W9-01 is GREEN self-merge (docs-only, no code, no migration, no DB write).** GREEN self-merge once ALL required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform, osteojp-portal) are green, read from the checks API NOT the banner. A live portal privacy exposure found during recon is an instant HALT-LOUD, not a self-merge.
- **Runs FIRST in Wave 09**, fresh `origin/main`, never stacked. Workflow files NEVER touched. Plain hyphens only. HALT-LOUD on scope/product/data/reality mismatch.
