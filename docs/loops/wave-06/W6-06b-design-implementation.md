# Loop W6-06b - Design implementation: patient section + platform palette equity (Wave 06 Melhorias)

GATE: **Wave 06 Melhorias, DESIGN PASS (implementation half), runs LAST, AFTER W6-06a is merged.** Implements the W6-06a plan: patient profile tabs first, then patient-section dashboards/layouts, then the platform-wide color-equity palette. **GREEN MUST use the `/ui-ux-pro-max` skill.** **Migration-free** (presentation only). Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

The IMPLEMENTATION half of the Wave 06 design pass. Executes, in priority order: (1) fix the patient profile tabs (Registos clinicos stray line, weak Documentos); (2) improve dashboards and layouts across the patient section; (3) apply the platform-wide color-equity palette per the W6-06a plan. AA preserved; bodychart marker tokens untouched.

Ground truth (recon at authoring 2026-07-14, embed - executor runs with ZERO memory):
- **Depends on W6-06a merged:** the visual-audit inventory + the color-equity palette plan (the 55/25/20 map, AA proofs, the UI-STYLE.md 7 replacement wording, the bodychart exclusion) are the spec this loop implements. Read them first; implement to that plan, not by improvisation.
- **(1) Patient profile tabs:** `apps/web/app/patients/[id]/page.tsx` renders `<ProfileTabs patientId=... current=tab items=tabItems ...>`; tabs include **Registos clinicos** (a stray line appears mid-layout - fix the errant rule/border/divider) and **Documentos** (visually weak - strengthen per the plan). Recon the `ProfileTabs` component + the Registos + Documentos tab bodies; fix the stray line and lift Documentos without changing behaviour/data.
- **(2) Patient-section dashboards/layouts:** the patient list (`apps/web/app/patients/page.tsx`), the profile summary/dashboard, and the section's cards/layouts - improve spacing, hierarchy, and consistency per the audit findings.
- **(3) Platform-wide palette equity:** apply the W6-06a 55/25/20 map (55 white+grey, 25 cyan/accent-2, 20 purple/accent-1) across surfaces via the design tokens, updating `docs/design/UI-STYLE.md` 7 to the agreed wording and shifting token USAGE (not the canonical hexes). The purple is accent-1 `#8B1863` + its existing scale tints. **Canonical hexes never change** (`packages/ui/src/tokens.test.ts` stays green).
- **Bodychart markers untouched:** the W5-25/W5-28 nine-entry `fill-marker-*` / `stroke-marker-*` palette in `apps/web/app/globals.css` is NOT modified. The equity work must not touch it.
- **AA preserved:** every restyled foreground/background pairing (especially new purple usage) meets AA; reuse the W6-06a AA table and re-verify in situ.
- **Migration-free, no data change:** presentation only; no schema, no seed, no migration. Any ficha-touching change keeps W5-13 compat green.

**Scope:** fix the patient profile tabs (Registos stray line + strengthen Documentos), improve patient-section dashboards/layouts, and apply the platform-wide 55/25/20 color-equity palette per the W6-06a plan (incl. the UI-STYLE.md 7 update). AA preserved; canonical hexes unchanged; bodychart marker tokens untouched. Migration-free, presentation only. pt-PT i18n (both files) for any new copy.

## Field 2. Ordered steps
1. **Sequence gate:** confirm W6-06a is MERGED on `origin/main`; read its audit inventory + palette plan. If not merged, do not start.
2. **A0 isolation guard:** fetch origin; `git worktree add ../osteojp-w6-06b-design-impl origin/main -b osteojp-w6-06b-design-impl`; assert toplevel + clean tree + HEAD == `origin/main` tip. HALT (Field 6) if any fails.
3. **Load `/ui-ux-pro-max`** and use it to drive the implementation (mandatory).
4. **(1) Patient profile tabs:** fix the Registos clinicos stray line; strengthen Documentos per the plan. Behaviour/data unchanged.
5. **(2) Patient-section dashboards/layouts:** apply the audit's patient-section fixes (spacing, hierarchy, cards, consistency).
6. **(3) Platform palette equity:** apply the 55/25/20 token-usage map across surfaces; update UI-STYLE.md 7 to the agreed wording; keep canonical hexes fixed; do not touch the bodychart palette.
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. `tokens.test.ts` canonical-hex guard + W5-13 compat for any ficha-touching change), `pnpm build`, `pnpm test:e2e` (patient profile tabs render without the stray line; Documentos reads as strengthened; the patient section + platform reflect the palette; AA holds on restyled surfaces). JSON.parse both i18n files in the gate.

## Field 3. Definition of done (machine-verifiable)
- **Sequence PROOF:** W6-06a is merged on `origin/main` (paste the merge ref) before this loop's first commit.
- **Migration-free + canonical-hex PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`; `packages/ui/src/tokens.test.ts` passes unchanged (canonical hexes intact). Paste both.
- **`/ui-ux-pro-max` used PROOF:** name the skill in the report.
- **Stray-line PROOF:** the Registos clinicos tab renders with no errant mid-layout line (before/after). Paste it.
- **Documentos PROOF:** the Documentos tab is strengthened per the plan (before/after). Paste it.
- **Patient-section PROOF:** the patient dashboards/layouts reflect the audit fixes. Paste representative before/after.
- **Palette-equity PROOF:** surfaces reflect the 55/25/20 map; UI-STYLE.md 7 updated to the agreed wording; purple is accent-1 (no new hex). Paste it.
- **AA PROOF:** restyled pairings (especially purple) meet AA in situ. Paste the re-verified table.
- **Bodychart-untouched PROOF:** `git diff origin/main -- apps/web/app/globals.css` shows the `marker-*` palette unchanged; the bodychart renders identically. Paste it.
- **W5-13 compat GREEN** for any ficha-touching change. Paste it.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
Sequence proof, the migration-free + canonical-hex diff, the skill-used statement, the stray-line + Documentos + patient-section + palette-equity before/afters, the AA table, the bodychart-untouched diff, passing W5-13 compat, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **Runs after W6-06a merged.** A0 worktree isolation off fresh `origin/main`. **`/ui-ux-pro-max` mandatory.**
- **Implement to the W6-06a plan;** do not improvise the equity ratios or re-audit from scratch.
- **Presentation only.** No schema, no seed, no migration, no data change.
- **Canonical brand hexes never change** (accent-1 `#8B1863`, accent-2 `#45B9A7`, grey `#98B2C2`); `tokens.test.ts` stays green. The equity is a usage shift, not a re-hex.
- **Bodychart marker palette (W5-25/W5-28) is untouched** - no change to `apps/web/app/globals.css` `marker-*` tokens.
- **AA preserved** on every restyled surface. Ficha-touching changes keep W5-13 compat green.
- pt-PT i18n (both files, keep-both on rebase, JSON.parse both in the gate); no emoji; UI-STYLE.md. **Never force-push / `--admin`.** Plain hyphens only. SYNTHETIC-DATA-ONLY for verify.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- W6-06a is NOT merged - do not start.
- The A0 guard fails (not toplevel, dirty tree, or HEAD != `origin/main` tip).
- Achieving the equity at AA on a surface would require changing a canonical hex or touching the bodychart palette - HALT with the pairing; use an existing accent-1 tint that meets AA, never re-hex a brand token or touch markers.
- A patient-section layout fix cannot be done presentation-only (needs a data/schema change) - surface it; do not add a migration in this design loop.
- The W6-06a plan is ambiguous or incomplete on a surface - resolve via the plan doc / a QUESTIONS entry with a recommended default; do not improvise a different equity.

## Field 7. Report back
Sequence proof, the migration-free + canonical-hex diff, the skill-used statement, the stray-line + Documentos + patient-section + palette-equity before/afters, the AA table, the bodychart-untouched diff, passing W5-13 compat, suite counts, PR number.

**Merge policy (owner amendment 2026-07-12, standing for Wave 06):** GREEN self-merge permitted once ALL required checks are green (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deployment checks (osteojp-api, osteojp-platform, osteojp-portal) are green, read from the checks API, never the banner. The cross-browser lane no longer exists. This loop is migration-free -> GREEN self-merge. Workflow files are never touched. Close: open ONE PR against `main`; self-merge on the policy above once green. Never force-push / `--admin`; never self-merge on red required checks.
