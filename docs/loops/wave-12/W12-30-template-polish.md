# Loop W12-30 - Template polish (scope-first) (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, POLISH, SCOPE-FIRST. OWNER VISUAL GATE. Migration-free.** Inventory the printed/PDF/email templates against the CLAUDE.md print-branding rule + the brand tokens, propose a prioritized polish list for the owner, then apply the approved first pass. Low priority; runs late. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

The carried "template polish" register item is unscoped. This loop scopes it: audit the document/email templates, propose a ranked polish list (owner picks), then apply the approved items as a small visual pass. Presentation only; no schema, no content/legal change without owner sign-off.

Ground truth (recon at authoring 2026-07-23, embed - executor verifies, ZERO memory):

- **Template surfaces to audit:** the declaration/report/invoice PDFs (`docs/pdf-templates/`, `apps/web/lib/clinical/declaracao/*`, the clinical report PDF pipeline), the reminder/confirmation + post-visit emails (`apps/web/lib/reminders/templates.ts`, `docs/email-templates-reminders.md`, `docs/email-templates-post-visit.md`), the SMS templates (`apps/web/lib/reminders/templates.ts` SMS section, `docs/sms-templates.md`).
- **The standard:** CLAUDE.md print-branding rule (every report/declaration/invoice carries logo + location contacts + fiscal info), the brand tokens (`docs/brand-tokens.md`, canonical hexes teal #45B9A7 / magenta #8B1863 / grey #98B2C2), the brand voice (`docs/brand-voice.md`, serious/precise/no emoji), and pt-PT correctness.
- **This is polish, not new features** - typography, spacing, branding consistency, header/footer, pt-PT wording; NOT new document types, NOT legal-copy changes (those are JP/owner).

**Scope:** a committed audit + ranked polish list (`docs/design/W12-30-template-polish-audit.md`) + the owner-approved first pass (presentation-only template edits) + tests where a template has a snapshot/render test. Migration-free. Any legal/fiscal wording change is out of scope (HALT to a Q).

## Field 2. Ordered steps
1. **A0 isolation guard** off fresh `origin/main`; worktree `../osteojp-w12-30-template-polish`; assert clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Audit:** inventory each template surface against the print-branding rule + brand tokens + voice + pt-PT; write `docs/design/W12-30-template-polish-audit.md` with a ranked list of concrete, presentation-only polish items (each with a before/after intent).
3. **Owner pick:** the audit + list is the owner-visual deliverable; the owner picks which items to apply (or the loop applies the top presentation-only items with no legal/fiscal impact as the recommended default first pass).
4. **Apply the approved first pass:** presentation-only edits (typography/spacing/branding/pt-PT); keep logo + location contacts + fiscal info intact; no content/legal change.
5. **Test:** update any template snapshot/render test; visual before/after for each changed template.
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; `git diff --name-only origin/main` ZERO migration/workflow.

## Field 3. Definition of done (machine-verifiable)
- **Audit PROOF:** `docs/design/W12-30-template-polish-audit.md` exists with a ranked, presentation-only polish list per template surface.
- **First-pass PROOF:** the approved items applied; before/after renders for each changed template; branding (logo + contacts + fiscal) intact.
- **No-legal-change PROOF:** a diff confirming no legal/fiscal WORDING changed (only presentation); any wording change would be HALTed to a Q.
- **No-schema PROOF:** `git diff --name-only origin/main` ZERO migration/workflow.
- **Gates green** incl. any snapshot test + i18n parity if strings moved.

## Field 4. Verification (paste evidence)
The audit doc, the before/after template renders, the no-legal-change diff, the no-schema diff, suite counts, the Preview URL (owner reviews the polished templates), PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **Presentation only, migration-free:** no schema; no new document type; no legal/fiscal wording change (JP/owner only).
- **Branding intact:** every report/declaration/invoice keeps logo + location contacts + fiscal info; canonical hexes only (no new hex without token approval); no emoji (brand voice).
- Verify on local `127.0.0.1`; pt-PT + en both where applicable; plain hyphens; no em/en dashes. **Never force-push / `--admin`.** No PII in logs.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails.
- A polish item turns out to change legal/fiscal wording or a document's meaning - HALT to a Q (JP/owner decision).
- The audit surfaces a genuine defect (not polish) in a template - split it to its own loop; do not fold a defect into a polish pass.

## Field 7. Report back
The audit doc, the before/after renders, the no-legal-change diff, suite counts, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-30 is OWNER VISUAL GATE (templates are visible documents, migration-free).** The audit + first pass are owner-visual; required checks + all three Vercel deploys green (checks API not banner) NECESSARY but not sufficient; GREEN pushes the audit + before/after renders and HALTs; owner picks/approves + merges. NOT `[SELF-MERGE-OK]`.
- Runs LATE (low priority), fresh `origin/main`, one PR in flight, never stacked. Workflow files never touched. HALT-LOUD on any legal/fiscal wording change.
