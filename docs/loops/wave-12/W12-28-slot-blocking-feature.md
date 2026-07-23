# Loop W12-28 - Slot-blocking from the agenda (retire "Nao Marcar" pseudo-patients) (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, FEATURE. OWNER VISUAL GATE. Migration-free (the `time_off` block model already exists).** Give reception an agenda-side "block this slot" affordance writing to the existing `time_off` model, so the informal "Nao Marcar" fake-appointment hack is no longer needed. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Add an agenda-facing block-creation affordance (reception-usable) that writes a `time_off` block for the chosen therapist/slot, reusing the existing block model + booking-exclusion + rendering. The pseudo-patient hack has no code footprint; the missing piece is the agenda-side UI. No schema (the model exists).

Ground truth (recon at authoring 2026-07-23, embed - executor verifies, ZERO memory):

- **"Nao Marcar" pseudo-patient has NO code footprint** - it is an informal reception workaround (booking a fake appointment to occupy a slot), not represented anywhere.
- **A real time-off/blocking feature EXISTS (`time_off`):** table + enum `time_off_reason` (vacation/sick/holiday/other), migration `0006_availability_timeoff.sql` (RLS + grants); Drizzle `schema.ts:112-113,679-698`. Create/edit/delete via **Admin -> Working Hours only** (`TherapistBlocks.tsx`, `working-hours/actions.ts:13-85` create/update/delete, lib `@/lib/admin/time-off`): two modes - Bloqueio pontual (same-day hour range) + Ausencia prolongada (date range).
- **Booking EXCLUDES blocks** (`day-availability.ts` `getTherapistAvailability`/`blockOverlapsRange`, `conflict.ts`, drawer conflict lines `appointment-drawer.tsx:632,1038,1129-1143`); **agenda RENDERS blocks** (W9-04, `blocked-time-core.ts`, `agenda-view.tsx:17,50`, `agenda-grid.tsx:11` `BlockSpan`), when scoped to a single therapist.
- **The gap:** blocks are creatable ONLY from Admin -> Working Hours (per-therapist), NOT from the agenda; the agenda "+" creates appointments only (`agenda-view.tsx:243-244` comment "Blocked-time has no data model, so the single action ships as Nova Marcacao" - a STALE comment; the model exists). So reception has no agenda-facing block affordance, hence the "Nao Marcar" hack.
- **Recommended default:** add an agenda-side "Bloquear horario" action (alongside "Nova Marcacao") that writes a `time_off` block (Bloqueio pontual: therapist + date + start/end + reason) via the existing `createTimeOffBlock`, respecting the permission matrix (reception can create blocks in its scope). Reuse the model + exclusion + rendering; update the stale `agenda-view.tsx:243-244` comment. Optionally (owner-gated DATA) inventory + retire any existing "Nao Marcar" fake-patient rows in prod - if any exist, that is a separate owner-gated cleanup.

**Scope:** the agenda "Bloquear horario" affordance -> `createTimeOffBlock` + the matrix scoping + tests; optional owner-gated cleanup of fake blocking-patients (data). Migration-free (model exists). Verify on local + Preview; cloud REAL DATA ONLY.

## Field 2. Ordered steps
1. **A0 isolation guard** off fresh `origin/main`; worktree `../osteojp-w12-28-slot-blocking`; assert clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Agenda affordance:** add "Bloquear horario" to the agenda action(s) (beside "Nova Marcacao") opening a small form (therapist + date + start/end + reason) that calls the EXISTING `createTimeOffBlock`; the created block renders via the existing `BlockSpan` + excludes booking via the existing paths. Do NOT duplicate the block model or the exclusion logic.
3. **Matrix scoping:** reception can create blocks within its scope (server-enforced); a therapist blocks own; owner/admin per matrix. Update the stale `agenda-view.tsx:243-244` comment.
4. **Test:** an e2e creates a block from the agenda, asserts it renders + that the slot becomes non-bookable (booking excludes it); an existing-block rendering test stays green.
5. **Optional cleanup (owner-gated DATA):** inventory any "Nao Marcar"-style fake patients/appointments in prod; if present, propose an owner-gated removal (separate window). If none, record that.
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; `git diff --name-only origin/main` ZERO migration/workflow.

## Field 3. Definition of done (machine-verifiable)
- **Block-create PROOF:** an e2e creates a block from the agenda (via `createTimeOffBlock`) and asserts it renders as a block + the slot is non-bookable. Paste it.
- **Reuse PROOF:** `git grep` shows the agenda affordance calls the EXISTING `createTimeOffBlock` + reuses `BlockSpan`/the exclusion paths (no duplicate model). Paste the call sites.
- **Matrix PROOF:** a test asserts reception can create a block in scope + cannot exceed it (server-enforced).
- **No-schema PROOF:** `git diff --name-only origin/main` ZERO migration/workflow.
- **Cleanup PROOF (if applicable):** the fake-patient inventory + the owner-gated removal proposal (or a "none found" note).
- **Gates green.**

## Field 4. Verification (paste evidence)
The agenda block-create e2e, the reuse call sites, the matrix test, the no-schema diff, the fake-patient inventory, suite counts, the Preview URL (owner blocks a slot from the agenda), PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **Migration-free:** reuse the existing `time_off` model + exclusion + rendering; NO schema, NO duplicate block model.
- **Permission matrix server-enforced** - the agenda affordance never relaxes who can block; reception is scoped, not widened.
- **Any fake-patient cleanup is a REAL-PROD data write - owner-gated** (separate window, before/after counts); the loop's code path does not delete data. Cloud REAL DATA ONLY; verify on local `127.0.0.1` + Preview.
- pt-PT + en both; no emoji; plain hyphens; no em/en dashes. **Never force-push / `--admin`.**

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails.
- Creating a block from the agenda appears to need a schema change (it should not; `time_off` exists) - HALT with the finding.
- The agenda grid cannot render a block when NOT scoped to a single therapist (multi-column day view) - HALT to a Q on the rendering scope (recommended default: block creation works from any scope; rendering follows the existing single-therapist-scope rule until a broader render is specced).
- A "Nao Marcar" fake-patient cleanup is wanted but the rows are ambiguous/real - HALT to a Q; never guess-delete patient data.

## Field 7. Report back
The agenda block-create e2e, the reuse call sites, the matrix test, the no-schema diff, the fake-patient inventory, suite counts, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-28 is OWNER VISUAL GATE (agenda affordance is visual, migration-free).** Required checks + all three Vercel deploys green (checks API not banner) NECESSARY but not sufficient; GREEN pushes the Preview + a blocked slot and HALTs; owner confirms + merges. NOT `[SELF-MERGE-OK]`. Any fake-patient data cleanup is a separate owner-gated window.
- Fresh `origin/main`, one PR in flight, never stacked. Workflow files never touched. HALT-LOUD on a schema need or ambiguous cleanup data.
