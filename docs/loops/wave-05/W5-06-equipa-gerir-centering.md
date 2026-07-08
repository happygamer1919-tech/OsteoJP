# Loop W5-06 - Equipa "Gerir" edit panel -> centered modal (Batch 1, migration-free)

GATE: none. UI-only lane, migration-free.

## Field 1. Scope and ground truth
On **Equipa**, the "Gerir" edit panel renders far to the right and needs scrolling. Center it as a proper **modal** per UI-STYLE.md, keeping every existing control wired to its **same** server-action handler.

Ground truth (recon 2026-07-08, embed - executor runs with ZERO memory):
- Equipa page: `apps/web/app/admin/staff/page.tsx`. The "Gerir" panel is an inline `<details>` disclosure (`admin.staff.manage` summary; ~line 169) expanding inline below the row. On narrow viewports the staff table overflows horizontally, so the expanded panel reads as pushed "far to the right" and needs scrolling.
- UI-STYLE.md sec 6 established the `<details>` row-actions disclosure pattern for grouping row inputs; this loop is a **deliberate deviation for Equipa** - the panel is dense enough that a centered modal reads better. Extend UI-STYLE.md in the same PR to record the modal option (per its conformance note: "Any surface that needs a pattern not covered here extends this document in the same PR").
- The grouped controls (edit fields, role select, activate/deactivate, gated delete) are each wired to existing server actions (`apps/web/lib/admin/staff.ts`), including the W3-06 scrypt delete gate. **Presentation change only - zero logic change.**
- **RECON FIRST (report BEFORE building):** the `<details>` panel markup + every control inside it + its server-action handler; whether a shared modal primitive exists in `@osteojp/ui` (reuse it; if none exists, HALT before adding a `packages/ui` primitive); how Playwright currently opens the panel (`summary`) so the e2e is updated to open the modal instead.

**Scope:** replace the far-right inline `<details>` expansion with a **centered modal** (glass surface, tokens, focus trap, Escape-to-close, one tab-stop discipline) holding the exact same controls, each still wired to its **same existing handler**; keep the gated delete's server-enforced scrypt gate unchanged. Update the Equipa e2e to open the modal. Extend UI-STYLE.md with the modal pattern. pt-PT i18n (both files).

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-06-gerir origin/main -b osteojp-w5-06-gerir`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** the `<details>` panel + its controls/handlers, the available modal primitive, and the current Playwright open path.
3. **Modal:** move the grouped controls into a centered modal per UI-STYLE.md (glass, tokens, `p-6`, focus trap, Escape/overlay close, global focus ring). Reuse a `@osteojp/ui` modal primitive if one exists; if none exists, HALT (Field 6) before adding a `packages/ui` primitive.
4. **Zero logic change:** each field, the role select, activate/deactivate, and the **gated delete keep their exact existing server-action handlers** (staff.ts); the scrypt delete gate is unchanged (restyle only - UI-STYLE.md sec 5).
5. **e2e update:** the Equipa spec opens the modal (button trigger) instead of the `<summary>`, then interacts with each control.
6. **UI-STYLE.md:** add the modal pattern note in the same PR.
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for the Equipa manage flow (open modal, edit, role change, deactivate, gated delete still prompts for the password).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under migrations/workflows. Paste it.
- **Zero-logic-change PROOF:** the diff shows no change to `apps/web/lib/admin/staff.ts` handler bodies / the delete gate; the modal is presentational. State it + paste the handler-import lines showing reuse.
- **Recon report pasted:** panel controls + handlers + modal primitive + e2e open path.
- **Modal e2e green:** opens centered, traps focus, Escape closes, every control still fires its handler, gated delete still prompts the scrypt password. Paste it.
- **UI-STYLE.md extended** with the modal pattern (paste the added note).
- **Suite counts** (baseline web 816, admin 10, ui 42) with green gates.

## Field 4. Verification (paste evidence)
Recon report, migration-free diff, zero-logic-change proof, the modal e2e summary, the UI-STYLE.md addition, before/after preview URL for Max's QA, suite counts, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`.
- **Migration-free**, **presentation only:** never weaken a server-enforced gate; the scrypt delete gate stays exactly as-is (UI-STYLE.md sec 5).
- **Reuse a `@osteojp/ui` modal primitive;** no new `packages/ui` primitive without HALT + blast-radius.
- One tab-stop discipline, focus trap, tokens, global focus ring.
- pt-PT i18n (both files), no emoji. **Never force-push / `--admin`.** Secrets never printed (the delete gate never logs the password).

## Field 6. Halt loud if (CLASSIC halt)
STOP and report to Ivan; product/scope to `docs/design/QUESTIONS.md`. Halt if: no reusable modal primitive exists and centering requires a new `packages/ui` primitive (ripple beyond Equipa), or moving a control into the modal would force changing its server-action signature.

## Field 7. Report back
Recon report, the modal implementation, migration-free + zero-logic-change proofs, the modal e2e, the UI-STYLE.md note, suite counts, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.
