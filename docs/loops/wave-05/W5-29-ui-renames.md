# Loop W5-29 - UI renames "Ficha Clinica" + strip version suffixes (Wave 05 Ficha Final 2)

GATE: **Wave 05 Ficha Final 2 (FF2).** i18n display-string change only (`packages/i18n/src/strings.pt.json` + `strings.en.json`). **Migration-free, template-free, no code-identifier change.** Starts from **fresh `origin/main`** (fetch-and-fast-forward first); never stacked.

## Field 1. Scope and ground truth

Rename user-visible ficha strings and strip version suffixes, **display strings only**. Internal template keys (`osteopathy-v2`/`v3`/`v4`) and code identifiers are untouched.

Renames:
- Inicio quick-access tile **"Registo clinico" -> "Ficha Clinica"** (en: **"Clinical Record"**).
- Button **"Novo registo clinico" -> "Nova ficha clinica"** (en: **"New clinical record"**).
- Sweep all **user-visible** strings for **"v3"** or version suffixes appearing next to Ficha Clinica and strip them (display strings only).

Ground truth (recon at authoring 2026-07-12, embed - executor runs with ZERO memory):
- **i18n files:** `packages/i18n/src/strings.pt.json` and `packages/i18n/src/strings.en.json` (the platform locale files). All user-facing strings resolve via i18n keys (CLAUDE.md Languages). Confirmed key at authoring: `clinical.newTitle` = "Novo registo clínico" (the "Novo registo clinico" button) -> becomes "Nova ficha clinica" (en "New clinical record"). **Recon the Inicio tile key** for "Registo clinico" (a separate key on the Inicio quick-access tile) and any adjacent "v3"/version-suffix display strings.
- **Internal identifiers FROZEN:** the template key `osteopathy` and its versioned seeds `osteopathy-v2`/`v3`/`v4`, the ingestion selector `template=osteopathy` (`M1_TEMPLATE`), the twelve AI keys, and all code identifiers (variable/prop/component names, i18n KEY names) are unchanged. Only the string VALUES change. The template `title` (Ficha Clinica / Clinical Record, W5-23) is already correct and is not touched by this loop.
- **Both locales coherent:** every changed key updates in both pt and en, keeping parity. The i18n gate `JSON.parse`s BOTH files.
- **Version-suffix sweep is display-only:** strip "v3"/version suffixes only from strings a user sees next to Ficha Clinica; never touch the internal `osteopathy-vN` keys, seed filenames, or code.

**Scope:** update the Inicio tile string, the new-ficha button string, and any user-visible version-suffix strings next to Ficha Clinica, in both `strings.pt.json` and `strings.en.json`, keys + code identifiers unchanged. pt-PT authoritative; en coherent.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; `git worktree add ../osteojp-w5-29-ui-renames origin/main -b osteojp-w5-29-ui-renames`; assert toplevel + clean tree + HEAD == `origin/main` tip. HALT (Field 6) if any fails.
2. **Recon, report BEFORE building:** the Inicio tile key for "Registo clinico"; confirm `clinical.newTitle` is the "Novo registo clinico" button; enumerate every user-visible "v3"/version-suffix string next to Ficha Clinica. Paste the key list (keys, not just values).
3. **Rename values (both locales):** tile -> "Ficha Clinica"/"Clinical Record"; button -> "Nova ficha clinica"/"New clinical record"; strip the enumerated version suffixes. Keys unchanged.
4. **Parity check:** every changed key exists in both files with a coherent value; no key added/removed asymmetrically.
5. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (Inicio tile reads "Ficha Clinica"; the button reads "Nova ficha clinica"; no user-visible "v3" suffix next to Ficha Clinica; en locale coherent). W5-13 `ficha-medica-compat.test.ts` stays green (display-string sweep must not touch the template/keys).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free + template-free + key-frozen PROOF:** `git diff --name-only origin/main` shows ONLY `packages/i18n/src/strings.pt.json` and `packages/i18n/src/strings.en.json` (ZERO migrations/workflows/seeds/TSX). Paste it. Confirm no i18n KEY name changed and no `osteopathy-vN` reference changed (a diff of key names is empty).
- **Rename PROOF:** an E2E/DOM assertion that the Inicio tile renders "Ficha Clinica" and the button renders "Nova ficha clinica" (en: "Clinical Record" / "New clinical record"). Paste it.
- **Version-suffix-stripped PROOF:** a grep/assertion that no user-visible string next to Ficha Clinica contains "v3"/version suffixes; the internal `osteopathy-vN` keys and seed filenames are NOT matched (they remain). Paste it.
- **i18n parity + JSON.parse PROOF:** the gate `JSON.parse`s BOTH files and asserts key-set parity; both parse and the changed keys exist in both. Paste it.
- **W5-13 compat GREEN.** Paste it.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
Recon report (key list), the i18n-only diff, the rename E2E/DOM assertion, the version-suffix-stripped grep, the i18n parity + JSON.parse proof, passing W5-13 compat, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`.
- **Display strings only.** Never rename an i18n KEY, a code identifier, a component/prop name, a seed filename, or an `osteopathy-vN` reference. Only string VALUES change.
- **Internal template keys FROZEN:** `osteopathy`, `osteopathy-v2`/`v3`/`v4`, `template=osteopathy`, the twelve AI keys - untouched. W5-13 compat stays green.
- **Both locales coherent;** keep-both on rebase (union any concurrent i18n edits, never drop a key). The gate `JSON.parse`s both files.
- **Migration-free, template-free.** No seed edit, no migration, no workflow.
- pt-PT authoritative, en coherent, no emoji, UI-STYLE.md tokens. **Never force-push / `--admin`.** Plain hyphens only.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop)
- The A0 guard fails (not toplevel, dirty tree, or HEAD != `origin/main` tip).
- A user-visible version suffix is baked into a code identifier or template `title` rather than a display string (so stripping it would need a code/template change) - surface it; this loop is display-string only.
- The Inicio tile string cannot be changed without touching a code identifier or the template key - surface the blast radius.
- Any change would alter an `osteopathy-vN` internal key or the twelve AI keys (W5-13 compat would break) - HALT.

## Field 7. Report back
Recon report (key list), the i18n-only diff, the rename assertion, the version-suffix-stripped grep, the i18n parity proof, passing W5-13 compat, suite counts, PR number.

**Merge policy (owner amendment 2026-07-12):** GREEN self-merge permitted once ALL required checks are green AND all three Vercel deployment checks (osteojp-api, osteojp-platform, osteojp-portal) are green. The cross-browser E2E lane is non-required and is ignored, never waited on. Live-apply verification evidence (W5-27 seed, W5-30 migration 0035) must be pasted in the loop report before merge regardless (not applicable to this i18n-only loop, which has no live-DB step). Close: open ONE PR against `main`; self-merge on the policy above once green. Never force-push / `--admin`; never self-merge on red required checks.
