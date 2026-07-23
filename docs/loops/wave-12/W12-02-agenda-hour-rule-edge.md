# Loop W12-02 - Agenda 9:00-on-9:30 hour-rule edge (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, DEFECT, agenda gridline placement. OWNER VISUAL GATE, migration-free.** CB reports an on-the-hour appointment (9:00) reading as if it were on the 9:30 row. Recon shows the appointment PLACEMENT math is correct; the defect is the strong hour rule being drawn on the slot's BOTTOM edge, so the bold "09:00" line lands on the 9:30 gridline. Fix the gridline edge; lock it with a test. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Make the strong hour gridline + its hour label align with the top of the on-the-hour slot so a 9:00 appointment visibly sits on the 9:00 rule, not above the 9:30 one. Presentation only; no change to appointment placement math, no schema, no slot granularity (granularity is W12-25... no: W12 hour-only is a separate loop; this loop does NOT change 30-min slots).

Ground truth (recon at authoring 2026-07-23, embed - executor verifies, ZERO memory):

- **Placement math is CORRECT (do not touch it):** `apps/web/app/agenda/agenda-grid.tsx:35` `minToPx = (min) => ((min - DAY_START_MIN) / 30) * SLOT_HEIGHT` with `SLOT_HEIGHT = 48` (`:29`), `DAY_START_MIN = 480` (`:30`, `DAY_START_HOUR = 8` at `apps/web/lib/scheduling/time.ts:18`). A 9:00 start = `lisbonMinutesFromMidnight = 540` (`time.ts:139-142`) -> `minToPx(540) = ((540-480)/30)*48 = 96px`. The slot array index for 540 is `i = 2`, whose row top is `i * SLOT_HEIGHT = 96px` (`agenda-grid.tsx:157-176`). The appointment lands exactly on the 9:00 slot top. **No off-by-one in placement.**
- **The defect is the GRIDLINE edge:** both the gutter (`agenda-grid.tsx:123-140`) and the day columns (`:157-176`) draw the STRONG hour rule with `border-b` on `m % 60 === 0`, i.e. at the slot's BOTTOM (`style top: i*SLOT_HEIGHT`, border on the bottom edge). For the 9:00 slot (`i = 2`) that strong rule renders at `y = 144px` - the 9:30 gridline - while the `"09:00"` label is drawn near the slot TOP via `-top-2` (`:129-139`). So the bold line a reader ties to "09:00" is one 30-min slot BELOW the 09:00 appointment/label; `:30` rows carry only the faint `border-b border-surface-muted`. That mismatch is what reads as "9:00 shows on the 9:30 row."
- **Fix shape:** move the strong hour rule to the TOP edge of the on-the-hour slot (border-top on `m % 60 === 0`, or shift which slot index carries the strong bottom border by one), so the bold rule + the hour label + an on-the-hour appointment all coincide. Apply identically in the gutter and the columns; keep the faint `:30` rule.
- **No test asserts placement today:** `apps/web/app/agenda/agenda-grid.test.tsx` checks face text/width, not gridline `top`. Add an assertion that the strong hour rule for a given hour renders at that hour's slot top (and an on-the-hour appointment shares that `top`).

**Scope:** the gridline edge in `agenda-grid.tsx` (gutter + columns) + a placement/gridline test; ZERO change to `minToPx`/`daySlots`/`SLOT_MINUTES`, ZERO migration/workflow. Do not alter 30-min granularity (that is the separate hour-only per-location loop).

## Field 2. Ordered steps
1. **A0 isolation guard** off fresh `origin/main`; worktree `../osteojp-w12-02-hour-rule`; assert clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Reproduce** on local synthetic data: book a 9:00 appointment; screenshot showing the bold "09:00" rule on the 9:30 line relative to the appointment.
3. **Fix the gridline edge** in both the gutter (`:123-140`) and the columns (`:157-176`): the strong hour rule renders at the TOP of the on-the-hour slot, coincident with the hour label and any on-the-hour appointment. Keep faint `:30` rules; do not touch placement math.
4. **Test:** extend `agenda-grid.test.tsx` to assert the strong hour rule for hour H renders at that hour's slot top, and an appointment starting at H shares that `top`. This test must FAIL on the pre-fix code.
5. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; `git diff --name-only origin/main` shows only `agenda-grid.tsx` + the test - ZERO migration/workflow.

## Field 3. Definition of done (machine-verifiable)
- **Reproduction PROOF:** pre-fix screenshot of the 9:00 appointment vs the bold "09:00" rule.
- **Fix PROOF:** post-fix screenshot with the bold "09:00" rule, the label, and the 9:00 appointment coincident.
- **Test PROOF:** the new gridline/placement assertion FAILS on pre-fix code and passes on the fix. Paste both runs (or the failing-then-passing diff).
- **No-regression PROOF:** existing face-text/width tests + `agenda-cards.spec.ts` still green; `minToPx`/`daySlots`/`SLOT_MINUTES` unchanged (paste the unchanged lines).
- **No-schema PROOF:** `git diff --name-only origin/main` ZERO migration/workflow.
- **Gates green.**

## Field 4. Verification (paste evidence)
The before/after screenshots, the failing-then-passing test, the unchanged placement-math lines, the no-schema diff, suite counts, preview URL (owner books a 9:00 + a 9:30 and confirms rows), PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **Presentation only:** do NOT change `minToPx`, `daySlots`, `SLOT_MINUTES`, `SLOT_HEIGHT`, or `DAY_START_MIN`; the fix is which edge carries the strong border.
- **Do NOT change slot granularity** (30-min stays; the hour-only per-location setting is a separate migration-gated loop).
- Verify on local `127.0.0.1` synthetic data; no emoji; plain hyphens; no em/en dashes; no new hex. **Never force-push / `--admin`.**

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails.
- Reproduction shows the actual defect is in the placement math (not the gridline edge) - re-scope and HALT with the finding rather than moving gridlines to mask a placement bug.
- The fix appears to require changing slot granularity or `SLOT_HEIGHT` - HALT (out of scope; that is the hour-only loop).

## Field 7. Report back
The before/after screenshots, the failing-then-passing test, the no-schema diff, suite counts, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-02 is OWNER VISUAL GATE (gridline placement is visual, migration-free).** Required checks + all three Vercel deploys green (checks API not banner) NECESSARY but not sufficient; GREEN pushes the preview + before/after and HALTs; owner books a 9:00 + 9:30 and confirms, then merges. GREEN does NOT self-merge (owner ruling 2026-07-23: visual = owner-gated; a screenshot test makes the gate fast but does not convert it to self-merge).
- Runs in the defect group after W12-01, fresh `origin/main`, one PR in flight, never stacked. Workflow files never touched. HALT-LOUD on scope/reality mismatch.
