# Loop W12-31 - 24h time format platform-wide + Declaração fim default

GATE: **Wave 12, quick-defect lane. OWNER VISUAL GATE** (changes visible time-entry UX). Tagged `[SELF-MERGE-OK if purely frontend]` in the owner addendum, but the owner also asked for a per-surface visual-gate checklist, so it lands as an OWNER VISUAL GATE: build -> CI green -> PR with the surface list + preview -> owner confirms. Purely frontend, no migration.

## Field 1. Scope and ground truth
Owner (2026-07-23 EVE): "24h time format platform-wide: pt-PT locale, no AM/PM anywhere. Found in Declaração de Presença manual modal (shows 08:15 PM picker); audit every time input/display (agenda, marcações, declaração, portal) and enforce 24h. Also fix the modal default: Hora de fim must default AFTER Hora de início, same day. Playwright asserts absence of AM/PM strings." Added: "produce the list of every surface touched (file:component) in the PR description so the visual gate is a checklist, not a hunt."

Ground truth (re-verified, zero memory):
- All `toLocaleTimeString`/`Intl.DateTimeFormat` DISPLAY calls already pass `hour12: false` (agenda, marcações, portal, declaração label). No display defect.
- The AM/PM came from 6 raw `<input type="time">` (in 3 files) - native time inputs render AM/PM under a 12h BROWSER/OS locale (not fixable via HTML). The codebase already standardised on 24h `TimeField` (hour/minute selects, `@osteojp/ui`) + `TimeFieldInput` (form wrapper); these 6 were unmigrated stragglers.
- Declaração manual path had NO default linking Fim to Início.

## Field 2. Ordered steps
1. Migrate the 6 native time inputs to the existing 24h components (controlled `TimeField` in the two dialogs; uncontrolled `TimeFieldInput` in the working-hours block form).
2. Declaração: default Hora de fim to Início + 1h (same day, clamped 23:59) whenever Fim is unset or not after Início; guard submit so Fim must be after Início (new i18n key).
3. Update the 3 e2e specs that drove the native inputs (declaração, agenda-block-slot, therapist-blocks pontual) to the select-based `fillTime`/`expectTime` helpers; assert no `input[type=time]` and no AM/PM text in the Declaração dialog; assert the Fim default.
4. Gates + affected e2e locally.

## Field 3. Definition of done (machine-verifiable)
- Zero `<input type="time">` in non-test app code (grep).
- Declaração e2e proves: 24h selects, no AM/PM, Fim auto-defaults after Início, Fim editable to a later time.
- All gates green (lint, typecheck, test, build) + CI (incl. E2E) green.

## Field 4. Verification (surface checklist -> PR)
Every touched surface as file:component (the owner's visual gate list) goes in the PR body.

## Field 5. Restrictions
- Purely frontend, no migration, no server/RLS change. No workflow files.
- Reuse the existing `TimeField`/`TimeFieldInput` - do NOT add a third time component.
- pt-PT + en; no emoji; no em/en dashes.

## Field 6. Halt loud if
- A time surface cannot be made 24h without a server/model change (register, do not guess).

## Field 7. Report back
The surface checklist, the Declaração default proof, suite counts, Preview URL + role steps, PR number.
