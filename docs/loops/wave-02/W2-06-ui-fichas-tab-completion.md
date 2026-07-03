# Loop W2-06 - Fichas tab completion (UI)

GATE: none — precondition satisfied (ruling F received, DECISIONS 2026-07-03 "Fichas Clínicas placement: tab in the patient profile"). UI lane, migration-free. Open PR and apply the merge gate; never self-merge anything touching `db-tests.yml` or `e2e.yml` (touches neither). Supersedes abandoned PR #446 — do NOT touch that PR.

## Field 1. Scope and ground truth
Complete the "Fichas Clínicas as a tab" relocation per ruling F: all clinical-record entry points route through the patient profile's Registos clínicos tab, and the top-level Registos Clínicos nav section is removed.

Ground truth (verify at recon — recorded in the row-7 halt, QUESTIONS 2026-07-03): a `registos` tab already exists in the patient profile (`apps/web/app/patients/[id]/page.tsx`), permission-gated on `clinical_records:read`, listing the patient's records with links to `/clinical/[id]`. The top-level `/clinical` route (`apps/web/app/clinical/page.tsx`) is a separate CROSS-PATIENT list with its own `/clinical/new` create entry, linked from primary nav (`apps/web/lib/nav/nav-items.ts`). This loop adds the create + addendum actions to the tab and removes the top-level section. Ground truth for placement is ruling F; on conflict, HALT.

Scope inside the patient-profile Registos clínicos tab:
- Action "Nova ficha" — create a new clinical record for THIS patient, reusing the existing creation flow (the `/clinical/new` creation logic, pre-scoped to the patient). Do not build a new creation flow.
- Per-ficha action "Nova versão (adenda)" — surface the EXISTING immutable-version/addendum flow (already present in the record editor per current UI, per the CLAUDE.md record_status lifecycle: changes after locking create addendum versions) from the tab's ficha list.
- Remove the top-level Registos Clínicos nav section entirely (`nav-items.ts`); all entry points route through the patient profile.

Recon before writing (report findings):
- What the top-level `/clinical` section provides that the tab does NOT — specifically cross-patient listing/search, and any reporting/admin view. Paste the capabilities.
- HALT CHECK: if removing the top-level section would ORPHAN a capability with no replacement inside the patient-profile flow (e.g. a cross-patient search staff rely on), STOP with evidence and a recommended default (e.g. keep `/clinical/[id]` deep links working, and either preserve a narrowed cross-patient view or explicitly confirm its drop). Do NOT infer the drop silently.
- The existing creation flow (`/clinical/new`) and the addendum/new-version control in the record editor, so both are REUSED, not reinvented.

Deep-link invariant (from the row-7 recommended default): `/clinical/[id]` record-detail deep links keep resolving unchanged regardless of the list/nav changes.

## Field 2. Ordered steps
1. A0 isolation guard: `git worktree add ../osteojp-w2-fichastab origin/main -b osteojp-w2-fichastab`; assert toplevel ends in the worktree name; assert clean tree. HALT if either fails.
2. Recon, report BEFORE editing: the tab component + its current record list; the `/clinical/new` creation flow to reuse; the addendum/new-version control in the record editor; and what the top-level `/clinical` section provides beyond the tab (cross-patient list/search/reporting). Run the HALT CHECK on orphaned capabilities.
3. Implement in the Registos clínicos tab: "Nova ficha" (reuse the creation flow, scoped to the patient) and per-ficha "Nova versão (adenda)" (surface the existing addendum flow). pt-PT via i18n.
4. Remove the top-level Registos Clínicos nav section (`nav-items.ts`) and its route entry point from primary nav. Keep `/clinical/[id]` detail deep links resolving (do not delete the record-detail route).
5. Tests: nav no longer shows the section; the tab's "Nova ficha" opens the creation flow for the patient and creates a record; "Nova versão (adenda)" opens the addendum flow on an existing ficha; `/clinical/[id]` still resolves. e2e per existing patterns.
6. Full gates for the touched flows: lint, typecheck, test, build, `test:e2e`.

## Field 3. Definition of done (machine-verifiable)
- Migration-free PROOF: `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- Primary nav no longer renders the top-level Registos Clínicos section (paste the `nav-items.ts` diff + a test asserting absence).
- Tab shows both actions working: "Nova ficha" creates a record for the patient; "Nova versão (adenda)" opens the addendum flow (paste test results).
- `/clinical/[id]` deep link still resolves (paste the test/e2e evidence).
- Recon's orphaned-capability HALT CHECK resolved (either no orphan, or the recommended default applied per ruling / owner note).
- Lint/typecheck/test/build + e2e green.

## Field 4. Verification (paste evidence)
Recon report (tab, creation flow, addendum control, top-level section capabilities), HALT-check outcome, `nav-items.ts` diff, the action tests, deep-link resolution evidence, migration-free proof, e2e + gate results.

## Field 5. Restrictions and scope boundary
- Migration-free: NO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. No schema change.
- REUSE the existing creation and addendum flows — do not build new ones. Records stay on the `record_status` lifecycle (draft → locked → signed; post-lock changes are addenda) per CLAUDE.md; this loop changes placement/entry points, not the record model.
- Keep `/clinical/[id]` detail deep links working. Per-visit appointment notes (0026) and fichas remain DISTINCT objects (ruling F) — do not merge them.
- pt-PT via i18n keys, no hardcoded copy, no emoji. Permission gating on `clinical_records:read`/`:edit` preserved (do not relax client-side).
- Do NOT touch PR #446 (abandoned; superseded). Closing comment handled per the QUESTIONS 2026-07-03 housekeeping ticket on merge.

## Field 6. Halt loud if
- Removing the top-level section orphans a capability (cross-patient listing/search/reporting) with no replacement — surface it, do not silently drop.
- The creation or addendum flow cannot be reused from the tab without building a new flow (scope creep beyond this loop).
- A `/clinical/[id]` deep link would break under the nav/list change.

## Field 7. Report back
Recon report, HALT-check outcome, nav-removal diff + test, both tab-action tests, deep-link evidence, migration-free proof, e2e + gate results, PR number. Open a PR per template and HALT for the merge gate (UI lane — no self-merge; poll checks to SUCCESS per LOOP-DISPATCH.md). On merge, post the superseded-by comment on #446 per the QUESTIONS 2026-07-03 housekeeping ticket.
