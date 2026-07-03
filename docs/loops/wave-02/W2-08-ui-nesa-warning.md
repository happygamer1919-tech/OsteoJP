# Loop W2-08 - NESA contraindication warning (UI)

GATE: PRECONDITION — W2-07 (migration 0031) must be MERGED to main first (the three contraindication columns must exist). UI lane, migration-free relative to itself. Open PR and apply the merge gate; never self-merge anything touching `db-tests.yml` or `e2e.yml` (touches neither). Confirm 0031 is on main before dispatch.

## Field 1. Scope and ground truth
Surface the NESA contraindication flags and a booking-time WARNING per ruling A (DECISIONS 2026-07-03): a clear, visible warning at booking, NEVER a hard block — the clinical decision stays with the clinic. Consistent with the soft-warning philosophy (DECISIONS 2026-07-01).

Ground truth (verify at recon): the columns from 0031 — `patients.contraindication_epilepsy`, `patients.contraindication_pregnancy`, `services.contraindication_sensitive` — exist on main. Ground truth for behavior is ruling A; on conflict, HALT.

Three surfaces:
1. **Patient edit form** — expose the two contraindication checkboxes, pt-PT labels "Epilepsia" and "Gravidez", writing `contraindication_epilepsy` / `contraindication_pregnancy`.
2. **Services admin** — expose the `contraindication_sensitive` checkbox on the service edit surface, pt-PT label (e.g. "Sensível a contraindicações NESA" or the codebase's established phrasing).
3. **Booking flow** (both "Nova marcação" AND the recorrente path): when the selected patient has ANY true contraindication flag AND the selected service is `contraindication_sensitive`, render a clearly visible warning (reuse the existing alert/warning component pattern, pt-PT), NAMING the specific contraindication(s) that matched (e.g. "Atenção: paciente com Epilepsia; serviço NESA sensível a contraindicações"). Booking PROCEEDS NORMALLY — the warning never disables submit. No event capture in this loop.

Recon before writing (report findings): the patient edit form component; the services admin edit surface; both booking entry points (Nova marcação drawer + recorrente path) and where patient/service selection state lives so the warning can react to it; the existing alert/warning component pattern.

## Field 2. Ordered steps
1. A0 isolation guard: `git worktree add ../osteojp-w2-nesawarn origin/main -b osteojp-w2-nesawarn`; assert toplevel ends in the worktree name; assert clean tree; confirm 0031 columns are on main. HALT if any fails.
2. Recon, report BEFORE editing: paste the patient edit form, services admin surface, both booking entry points + selection state, and the alert/warning component pattern.
3. Implement:
   - Patient edit form: two checkboxes (Epilepsia, Gravidez) bound to the two patient columns.
   - Services admin: the `contraindication_sensitive` checkbox.
   - Booking flow (both paths): a reactive warning shown only when (patient has any true flag) AND (service is `contraindication_sensitive`), naming the matched contraindication(s). Submit remains enabled at all times.
   - pt-PT via i18n keys throughout.
4. Tests: no warning when EITHER side is false (patient flags all false → none; service not sensitive → none); warning shown when BOTH conditions hold; submission is NEVER blocked (assert the submit path succeeds with the warning present). Cover both booking paths. Follow existing component/e2e patterns.
5. Full gates for the touched flows: lint, typecheck, test, build, `test:e2e`.

## Field 3. Definition of done (machine-verifiable)
- Migration-free PROOF: `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it. (0031 already merged separately.)
- All three surfaces implemented (paste where each landed).
- Tests pass for the flag combinations: neither/either false → NO warning; both true → warning naming the contraindication; submit succeeds in all cases (never blocked). Paste results, including that both booking paths are covered.
- e2e green for the booking flow(s) showing the warning + successful submit-with-warning (paste summary).
- Lint/typecheck/test/build green.

## Field 4. Verification (paste evidence)
Recon report, per-surface implementation, the flag-combination test results (incl. never-blocked assertion and both booking paths), migration-free proof, e2e + gate results.

## Field 5. Restrictions and scope boundary
- WARNING ONLY, never a block: submit stays enabled regardless of contraindication state (ruling A). Do not add a hard gate.
- Migration-free: NO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/` (0031 shipped the columns in W2-07).
- No event capture in this loop (a contraindication-acknowledged event, if ever wanted, is out of scope).
- pt-PT via i18n keys, no hardcoded copy, no emoji. DB writes only through `packages/db`; tenant-scoped, `tenant_id` from JWT. Preserve admin-only gating on the services surface (do not relax client-side).

## Field 6. Halt loud if
- The 0031 columns are not present on main (precondition unmet).
- The booking flow's selection state cannot expose both the patient flags and the service `contraindication_sensitive` flag to drive the reactive warning without a schema change.
- Implementing the warning would require blocking submit to satisfy any existing validation (that would violate ruling A) — surface it.

## Field 7. Report back
Recon report, three-surface implementation, flag-combination + never-blocked test results (both booking paths), migration-free proof, e2e + gate results, PR number. Open a PR per template and HALT for the merge gate (UI lane — no self-merge; poll checks to SUCCESS per LOOP-DISPATCH.md before owner merge).
