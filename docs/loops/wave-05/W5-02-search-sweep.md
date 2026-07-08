# Loop W5-02 - Search sweep across list surfaces (Batch 1, migration-free, demo priority)

GATE: none. UI-only lane, migration-free. Runs in parallel with any one in-flight migration.

## Field 1. Scope and ground truth
Add a search bar to **Equipa** (missing today) and audit every list surface involving patients or therapists, adding search wherever a list can exceed a screenful.

Ground truth (recon 2026-07-08, embed - executor runs with ZERO memory). **Search audit as-found:**

| Surface | Has search today | Component |
|---|---|---|
| Pacientes list | PRESENT | `apps/web/app/patients/_components/search-box.tsx` (`SearchBox`) |
| Equipa / Staff list | **ABSENT** | `apps/web/app/admin/staff/page.tsx` (table only) |
| Servicos therapist-mapping picker | ABSENT (plain Select) | `apps/web/app/agenda/appointment-drawer.tsx` (service Select) |
| Agenda patient picker | PRESENT (async Combobox) | `apps/web/app/agenda/appointment-drawer.tsx` |
| Agenda therapist picker | ABSENT (Select) | `apps/web/app/agenda/agenda-view.tsx` |
| Marcacoes list | ABSENT (date-range + status/service filter selects only) | `apps/web/app/marcacoes/marcacoes-view.tsx` |
| Revisao Consulta queue | ABSENT | `apps/web/app/clinical/review/page.tsx` |
| Record-creation patient selector | ABSENT (Select listing all patients) | `apps/web/app/clinical/new/page.tsx` |

- **Reusable primitive:** `apps/web/app/patients/_components/search-box.tsx` (`SearchBox`) is the established pattern; the Agenda patient picker uses an async Combobox. Prefer reusing one of these over inventing a new input.
- **Design language:** UI-STYLE.md toolbar layout (search/filters align into one toolbar row); `admin-ui.ts` input classes (`adminInput`, `adminInputInline`).
- **RECON FIRST (report BEFORE building):** re-verify the table above against `origin/main` (surfaces may have shifted); for each ABSENT surface, decide "list can exceed a screenful?" -> action. A short Select of <=~7 fixed options (e.g. a 3-therapist picker) does not need search; a patient/therapist list that grows does.

**Scope:** add a search/filter input to **Equipa** for certain; sweep the other ABSENT surfaces and add search where a list can exceed a screenful, reusing `SearchBox` / the async Combobox. Client-side filter where the list is already fully loaded; server-side query only if the surface already paginates. pt-PT i18n keys (both files), no emoji.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-02-search origin/main -b osteojp-w5-02-search`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Recon audit, report BEFORE building:** paste the re-verified surface table (surface | had-search | can-exceed-a-screenful | action-taken).
3. **Equipa search (mandatory):** add a search input to `admin/staff/page.tsx` filtering the staff table by name/role, aligned into the toolbar row (UI-STYLE.md), reusing `SearchBox`.
4. **Sweep the other ABSENT surfaces:** for each that can exceed a screenful, add search reusing `SearchBox` / async Combobox. Leave short fixed Selects alone (record the skip + reason in the audit table).
5. **No data-model or query-semantics change** beyond adding a filter; existing filters/sorts stay wired to their handlers.
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for the surfaces that gained search (type a query, list filters, clear restores).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- **Audit table pasted** in the DoD: `surface | had-search | action-taken` for every one of the eight surfaces above (every ABSENT surface either gains search or is recorded as deliberately-skipped with a reason).
- **Equipa search proven:** an e2e types a query on Equipa and the staff table filters. Paste it.
- **i18n parity** (both files) - paste typecheck.
- **Suite counts** pasted (baseline web 816, admin 10) with green lint/typecheck/test/build.

## Field 4. Verification (paste evidence)
Recon audit table, migration-free diff, the Equipa + swept-surface e2e summaries, i18n parity, suite counts, preview URL for Max's QA, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`; never edit the primary clone.
- **Migration-free:** NO files under migrations/workflows.
- **Additive only:** search is a filter over existing role-scoped reads; never widen what a role can see (RLS + permission matrix unchanged - a receptionist searching patients still only sees what they may see).
- **Reuse `SearchBox` / async Combobox;** no new `packages/ui` primitive without HALT + blast-radius.
- pt-PT i18n (both files), no emoji, UI-STYLE.md toolbar layout + tokens.
- **Never force-push / `--admin` / bypass protection.** Secrets never printed.

## Field 6. Halt loud if (CLASSIC halt)
STOP and report to Ivan (mismatch / options / recommended default); leave branch GREEN. Product/scope calls go to `docs/design/QUESTIONS.md` with a recommended default. Halt if: adding search to a surface would require widening a role-scoped query (security), or would need a new `packages/ui` primitive.

## Field 7. Report back
Recon audit table, the per-surface actions, migration-free proof, e2e summaries, suite counts, preview URL, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.
