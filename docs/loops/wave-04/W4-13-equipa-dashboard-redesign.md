# Loop W4-13 - Equipa admin: full-width invite area + team dashboard table + ESTABLISH the UI design language (docs/design/UI-STYLE.md) (design anchor, recon-first, migration-free)

GATE: none. **RUNS FIRST in the Wave 04 design batch (W4-13 … W4-18).** Admin UI, migration-free, functionality-preserving. **This loop ESTABLISHES the shared visual system in `docs/design/UI-STYLE.md`; W4-14 → W4-18 MUST follow it.** Runs in parallel with any one in-flight migration (touches no `packages/db/migrations`, `supabase/migrations`, or `.github/workflows` files).

## Field 1. Scope and ground truth
Redesign the **Equipa** admin surface (the staff-management tab) into a clean dashboard, and in doing so **define the app's design language** for the rest of the Wave 04 surface redesigns. This is a **refinement of the existing app shell, NOT a rebrand** — brand tokens (CLAUDE.md: teal `#45B9A7`, magenta `#8B1863`, grey `#98B2C2`; Inter; clinical, generous spacing) are unchanged.

Ground truth (locked mechanisms to embed — GREEN runs with ZERO memory; do not assume anything not written here):
- **The Equipa surface already carries several confirmed behaviors — ALL must be preserved EXACTLY (functionality-preserving redesign):**
  - **Invite new member** (the "Convidar novo membro" form).
  - **Role change** via the per-member role dropdown + **Aplicar**.
  - **Desativar / Reativar** (activate/deactivate a member).
  - **Password-gated therapist delete** — a therapist (staff user) delete behind the **tenant delete password** (scrypt-hashed in `tenants.settings.secrets`, W3-05 home), **reference-guarded** (activity-free = hard delete; referenced = deactivate-only), owner + self never deletable (DECISIONS 2026-07-06 "Therapist delete", shipped #480). **DO NOT remove or weaken the password gate in this redesign — the ruling is unchanged; this loop only restyles it.**
  - **Primary-service dropdown** listing all active tenant services; zero-mapping → INSERT, existing → delete+insert re-designation, **never UPDATE** `therapist_services` (0023 no-grant, 42501), W4-01 (#480). Keep the **Definir / Serviço principal** control visible.
  - **Horários deep link** into `/admin/working-hours?t=<id>` (the W4-01 per-therapist working-hours entry point), preselecting that therapist.
- **Admin-only, server-enforced** (permission matrix "Manage users/roles = Admin"). The redesign is presentational; it does NOT relax any server-side gate.
- **Exact route + component are recon items:** W3-04 landed the primary-service control at `/admin/staff`; W4-01 added the primary dropdown + Horários entry point. Confirm the current Equipa route and component tree in recon before editing.

**Owner findings (live QA 2026-07-06):**
- The **Convidar novo membro** form occupies a **narrow left column with a large dead zone to its right**.
- The **team list below is loose stacked rows**, each member repeating inline edit inputs (name, email, role dropdown, Aplicar, Desativar/Reativar, Palavra-passe, Eliminar) — **hard to scan**.

**Build:**
- **(a) Rework the invite area to use the FULL width** — either a horizontal form layout, or the form plus a **team summary panel beside it** showing counts: **active members, inactive, therapists with a primary service set, therapists with hours set**. (Recommended default: form + summary panel, since it fills the dead zone with useful context.)
- **(b) Convert the team list into a clean dashboard TABLE:** clear columns **Nome, Email, Função, Serviço principal, Estado (as a badge), Ações**; edit affordances **grouped into a compact row-actions pattern** (a row-actions menu **or** an edit drawer) instead of permanently-rendered inline inputs; the **Horários** link and the primary-service **Definir** control kept visible.
- **(c) Preserve ALL existing functionality exactly:** invite, role change (Aplicar), Desativar/Reativar, password-gated therapist delete (gate unchanged), primary-service dropdown (no-UPDATE mechanism), Horários deep link.

**Design-language deliverable (the reason this loop runs first):** commit **`docs/design/UI-STYLE.md`** recording the chosen patterns so W4-14 → W4-18 conform: **card anatomy, table anatomy, spacing scale, badge styles for estados, button hierarchy, toolbar layout, and the Tailwind v4 tokens used.** Keep it consistent with the existing app shell.

All UI copy is **pt-PT via i18n keys** (no hardcoded strings, no emoji). **Migration-free** (any proven schema need is a HALT). All build/verify work is **synthetic-data-only**; verify each action on the **E2E seed tenant**.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w4-13-equipa-dashboard-redesign origin/main -b osteojp-w4-13-equipa-dashboard-redesign`; assert `git rev-parse --show-toplevel` ends in `osteojp-w4-13-equipa-dashboard-redesign`; assert `git status --porcelain` is empty. HALT (Field 6) if either fails.
2. **Recon, report BEFORE editing (paste paths):** the Equipa route + component tree; each existing action's handler (invite, role Aplicar, Desativar/Reativar, password-gated delete, primary-service INSERT/delete+insert, Horários deep link); the reads available for the summary counts (active/inactive members, therapists with a primary `therapist_services` mapping, therapists with an active `availability_templates` row) — **reuse existing reads, no raw SQL**; the current Playwright specs that target the Equipa surface (they WILL move — plan the on-branch spec update).
3. **(a) Full-width invite area:** rebuild the invite region to span the full width (recommended: form + a **team summary panel** with the four counts). No new server behavior; the invite action is unchanged.
4. **(b) Team dashboard table:** render the columns (Nome, Email, Função, Serviço principal, Estado badge, Ações); move the per-row edit inputs into a **compact row-actions menu or an edit drawer**; keep Horários + primary-service Definir visible. Every action wires to the SAME existing handler (no logic rewrite).
5. **(c) Verify each preserved action** on the E2E seed tenant: invite, role change, Desativar/Reativar, password-gated delete (gate still enforced), primary-service set (no UPDATE to `therapist_services`), Horários deep link preselects.
6. **Author `docs/design/UI-STYLE.md`:** record card/table anatomy, spacing scale, estado badge styles, button hierarchy, toolbar layout, and the Tailwind v4 tokens used. State explicitly that W4-14 → W4-18 conform to it.
7. **Update the Playwright specs on-branch** to the new selectors (**never touch `db-tests.yml` or `e2e.yml`**). **Full gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for the Equipa surface (invite + a role change + a password-gated delete refusal path + the primary-service set + the Horários deep link).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- **Recon report pasted:** route + component + each action handler + the summary-count reads + the Equipa Playwright specs that move.
- **Zero functional regression — each action verified on the E2E seed tenant:** invite, role change (Aplicar), Desativar/Reativar, **password-gated therapist delete with the gate still enforced** (paste the non-password-refused proof), primary-service set (paste the **no-UPDATE** delete+insert proof), Horários deep link preselects the therapist. Paste test/e2e evidence per action.
- **New Equipa layout rendered:** full-width invite area (+ summary counts) and the dashboard table (Nome, Email, Função, Serviço principal, Estado badge, Ações) with row-actions grouped. Paste a screenshot or DOM assertion replacing the loose-rows QA state.
- **`docs/design/UI-STYLE.md` committed** with the seven pattern sections (card, table, spacing, estado badges, button hierarchy, toolbar, Tailwind v4 tokens) and the "W4-14 → W4-18 conform" statement.
- **Suite counts** pasted (web + db) with green `lint/typecheck/test/build`. Baseline: web 685, db 56 local + 255 DB-gated (STATE 2026-07-06) — report new totals.

## Field 4. Verification (paste evidence)
Recon report, migration-free `git diff --name-only origin/main`, the per-action zero-regression evidence (incl. password-gate-enforced + no-UPDATE proofs), before/after screenshots of the invite area and team list, the committed `UI-STYLE.md`, e2e summary, and suite counts.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation:** work ONLY in `../osteojp-w4-13-equipa-dashboard-redesign` off `origin/main`; never edit the primary clone.
- **Migration-free:** NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. No schema change. Any proven schema need is a **HALT**. One migration may be in flight system-wide; this loop opens none.
- **Functionality-preserving:** every existing Equipa action keeps its exact behavior and server-side gate. **Do NOT remove or weaken the password gate on therapist delete** (DECISIONS 2026-07-06, unchanged). No UPDATE to `therapist_services` (0023 42501; re-designation stays delete+insert).
- **Redesign WILL move Playwright selectors:** update the affected test specs **on-branch**. **NEVER touch `.github/workflows/db-tests.yml` or `.github/workflows/e2e.yml`.**
- **Refinement, not rebrand:** brand tokens + app shell unchanged; UI-STYLE.md records what IS, chosen consistently, not a new identity.
- **LIVE-DATA CAUTION:** real therapist accounts (Max's entries) live on dev tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`. **Never modify or delete a real account, its `availability_templates`, or its `therapist_services` rows.** Verify against a real-therapist-shaped fixture on the **E2E seed tenant**; do not exercise Desativar/Eliminar against a real account.
- **Admin-only, server-enforced** — the redesign does not relax any gate client-side.
- **Never force-push. Never merge with `--admin`. Never bypass branch protection.**
- **pt-PT via i18n keys**, no hardcoded strings, no emoji. DB access ONLY through `packages/db`; `tenant_id` from JWT context, never payload.

## Field 6. Halt loud if (CLASSIC halt — no CYAN desk running this batch)
Halt protocol for this batch is **CLASSIC**: on any blocker, **STOP and report to Ivan** with (1) the exact mismatch, (2) the options, (3) a recommended default. Leave the branch GREEN and record the resume state. **Never guess a product decision.** Do NOT poll a mailbox (none is running).

Halt if:
- The Equipa surface or any action handler is not where recon expects (build target moved) — report the actual state before proceeding.
- A summary count (e.g. "therapists with hours set") **cannot be derived from an existing read** without a schema change or raw SQL — surface it; drop that one count to keep the loop migration-free and note the omission, or recommend the cheaper read.
- Preserving the password-gated delete would require changing its gate/logic to fit the new layout — STOP; restyle only, the ruling is fixed.
- Any required change would force editing a `packages/ui` primitive whose ripple extends beyond the Equipa surface — surface the blast radius.

## Field 7. Report back
Recon report, the full-width invite + dashboard-table implementation, the per-action zero-regression evidence (password-gate + no-UPDATE proofs included), before/after screenshots, the committed `docs/design/UI-STYLE.md`, migration-free proof, e2e summary, suite counts, and the PR number.
Close: **open ONE PR against `main` per the standard template and HALT for owner merge.** Do NOT self-merge (this batch has no runner self-merge authority; classic stop-and-report). A refused or blocked merge is a HALT reported to Ivan.
