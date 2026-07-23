# Loop W12-01 - Strikethrough = cancelled only (verify-then-fix) (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, DEFECT, VERIFY-THEN-FIX. OWNER VISUAL GATE, migration-free.** CB reports confirmed appointments showing struck-through. The locked binding (W9-05) is `strikethrough = status cancelled`, never a confirmation cue. Recon at authoring shows the binding is CORRECT in code and test-locked. So this loop VERIFIES first, returns to the reporter's exact words (the Wave 09 item-9 lesson), and fixes ONLY if a confirmed-not-cancelled appointment actually strikes through. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Confirm the strikethrough binding is cancelled-only across every surface; reproduce the CB report; fix only if a real confirmed-not-cancelled strikethrough exists. This loop may legitimately CLOSE as "binding correct - reporter meant X" (HALT to a Q), not every verify loop ends in a code change.

Ground truth (recon at authoring 2026-07-23, embed - executor verifies, ZERO memory):

- **The binding is `status === "cancelled"` on all four surfaces, and it is test-locked:**
  - Agenda face: `apps/web/app/agenda/agenda-grid.tsx:263` `const cancelled = appt.status === "cancelled";` -> `:275` `${cancelled ? "line-through" : ""}` (doc comment `:252-260` "A cancelled appointment is struck through, never a non-cancelled one"). Test: `apps/web/app/agenda/agenda-grid.test.tsx:161-168` asserts cancelled -> line-through and every other status -> NOT line-through. E2E `apps/web/e2e/agenda-cards.spec.ts:93`.
  - Marcacoes row: `apps/web/app/marcacoes/marcacoes-view.tsx:190`. Hover: `apps/web/app/agenda/appointment-hover-card.tsx:64`. Portal: `apps/portal/app/portal/appointments/AppointmentsView.tsx:38`. All `status === "cancelled"`.
- **The two axes are orthogonal and neither collapses into strikethrough:** lifecycle `appointment_status` (scheduled/confirmed/completed/cancelled/no_show, `packages/db/src/schema.ts:42-48`) drives strikethrough only on `cancelled`; the confirmation axis `appointment_confirmation_state` (pending/confirmed/declined, `:54-58`) is rendered by the monochrome `ConfirmationIndicator` (`apps/web/app/agenda/confirmation-indicator.tsx:19-23`), never as strikethrough.
- **Likely realities to check against Rodica's exact words:** (a) an appointment whose STATUS was set to `cancelled` (correctly struck through) that she read as "confirmed"; (b) `no_show` mapping to a neutral badge (`marcacoes-view.tsx:140-146`) that she expected to differ; (c) the confirmation axis `declined` vs the lifecycle `cancelled`. None of these is a strikethrough bug; each is a labelling/expectation question -> HALT to a Q, do not "fix" a correct binding.
- **If a genuine defect is found** (some code path renders line-through for a non-cancelled status), fix at the binding site + extend the existing test to lock the exact failing case; presentation only, migration-free.

**Scope:** verification evidence first; a code fix ONLY if a confirmed-not-cancelled strikethrough reproduces. Any writes are presentation-only (`agenda-grid.tsx` / `marcacoes-view.tsx` / hover / portal view) + a test; ZERO migration/workflow. The full estado visual language (yellow circle / thumbs / crossed name for Falta) is NOT designed here - that is W12-10 (estados SPEC); this loop only guards the cancelled=strikethrough invariant.

## Field 2. Ordered steps
1. **A0 isolation guard** off fresh `origin/main`; worktree `../osteojp-w12-01-strikethrough`; assert clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Verify the binding read-only:** grep the four surfaces; confirm each ties line-through to `status === "cancelled"` only; confirm the test lock at `agenda-grid.test.tsx:161-168`. Paste the four bindings.
3. **Reproduce on local synthetic data:** create appointments in each status (scheduled/confirmed/completed/cancelled/no_show) and each confirmation state; screenshot which render struck-through. Expected: only `cancelled`.
4. **Branch on the result:**
   - **Binding correct (expected):** record the evidence, return to Rodica's exact report, identify what she actually saw (Field 1 candidates), and HALT to a Q with the finding + recommended default (no code change; the estado language is W12-10). Do NOT edit a correct binding.
   - **Genuine defect found:** fix at the binding site so line-through fires ONLY on `cancelled`; extend `agenda-grid.test.tsx` (+ the analogous surface test) to lock the exact case; keep all four surfaces consistent.
5. **Gates** (if a fix was made): `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; `git diff --name-only origin/main` shows ZERO migration/workflow.

## Field 3. Definition of done (machine-verifiable)
- **Binding PROOF:** the four surface bindings pasted, each `status === "cancelled"`; the test lock cited.
- **Reproduction PROOF:** per-status screenshots showing only `cancelled` struck through (or the exact defective case if one exists).
- **Outcome PROOF (one of):**
  - **No-fix outcome:** a Q registered in `docs/design/QUESTIONS.md` with the reproduction + what Rodica meant + recommended default; ZERO code diff (`git diff origin/main` empty except any evidence doc). OR
  - **Fix outcome:** the corrected binding + an extended test that FAILS on the old code and passes on the new; `git diff --name-only` shows only presentation files + test, ZERO migration.
- **Gates green** if a fix was made.

## Field 4. Verification (paste evidence)
The four bindings, the per-status reproduction screenshots, the outcome (Q or fix + test), suite counts if a fix, the preview URL, PR number (or the no-code Q PR if verify-only).

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **Do NOT edit a correct binding** - a verify loop may end in a Q, not a diff (the Wave 09 item-9 lesson: return to the reporter's exact words before concluding).
- **Do NOT design the estado glyph language here** (yellow circle / thumbs / crossed name) - that is W12-10 (SPEC); this loop only holds the cancelled=strikethrough invariant.
- Presentation only, migration-free; verify on local `127.0.0.1` synthetic data; both i18n files JSON.parse if any string changes; no emoji; plain hyphens; no em/en dashes. **Never force-push / `--admin`.**

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails.
- The binding is correct and the report cannot be reproduced as a strikethrough bug - HALT to a Q (what Rodica saw + recommended default: no change; estado language deferred to W12-10). Do NOT fabricate a fix.
- The report turns out to require the full estado visual language (Falta crossed-name etc.) - that is W12-10; HALT and route it there.

## Field 7. Report back
The four bindings, the reproduction, the outcome (Q or fix + test), suite counts if a fix, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-01 is OWNER VISUAL GATE (visual cue, migration-free).** If it ends in a fix: required checks + all three Vercel deploys green (checks API not banner) are NECESSARY but not sufficient; GREEN pushes the preview + per-status screenshots and HALTs; owner merges. If it ends verify-only: it lands as a docs/QUESTIONS PR (OWNER-MERGE). GREEN does NOT self-merge either way (owner ruling 2026-07-23: visual cue = owner-gated).
- Runs after W12-00, fresh `origin/main`, one PR in flight, never stacked. Workflow files never touched. HALT-LOUD on scope/reality mismatch.
