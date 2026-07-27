# Loop PL-01 - Agenda same-hour render: concurrent appointments read as the next hour (Pre-Launch, Rodica batch 2026-07-27)

GATE: **Pre-Launch, DEFECT, agenda vertical placement. OWNER VISUAL GATE,
migration-free.** Rodica reports same-hour appointments descend past their hour
line and read as the next hour. **Recon at authoring found the vertical stacking
is INTENTIONAL and TESTED, and that migration 0041 (`slot_granularity_min`) is
INERT in the grid** - so the briefing's hypothesis ("split into columns", "hour-
only grid") must be TESTED, not assumed, and the fix must not regress the
intentional design. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Rodica's words, verbatim, do not translate:

> "Agenda continua mal configurada .. as marcacoes descem para a hora seguinte"

Evidence: Terca 28, four appointments at 09:00 and three at 10:00 render below
their hour line, reading as the next hour.

**Hypothesis to test, NOT to assume** (per the briefing): concurrent-appointment
stacking offsets vertically instead of splitting into columns. Recon has already
partially tested it - embed these findings, the executor RE-VERIFIES read-only,
ZERO memory:

- **Placement anchor is one absolute `top` per start-group.** `agenda-grid.tsx:37`
  `minToPx = (min) => ((min - DAY_START_MIN)/30) * SLOT_HEIGHT`; `SLOT_HEIGHT = 48`
  (`:31`). A 09:00 start = `minToPx(540) = 96px`; 10:00 = `192px`. Each start-group
  is one absolutely-positioned column at `:214-215`
  `style={{ top: minToPx(lisbonMinutesFromMidnight(new Date(startsAt))) }}`.
- **Vertical stacking is DELIBERATE, not a bug.** `groupByStart()` (`:47-60`)
  buckets by the exact `startsAt`; the header comment (`:39-46`) states
  appointments "stack VERTICALLY (never side by side) ... No horizontal
  overlap-splitting." Four 09:00 appointments render as four `AppointmentName`
  lines (`:286-315`) stacked downward from `top:96px` (`:217-219`). With enough
  same-hour rows the stack grows downward past the 09:30 gridline (144px) toward
  the 10:00 gridline (192px) - which is exactly why they "descem para a hora
  seguinte."
- **An existing test LOCKS the vertical stack.** `agenda-grid.test.tsx:227-250`
  asserts same-slot appointments stack vertically with "NO horizontal-split width
  style"; e2e `agenda-cards.spec.ts:104` asserts three same-14:00 appointments
  "stack VERTICALLY (equal x, different y)." **A column-split fix would REGRESS
  both.**
- **The hour band is 96px tall (two 30-min slots), not 48.** `time.ts:17-19`
  `SLOT_MINUTES=30`, day 08:00-20:00; `daySlots()` steps every 30 min
  (`:226-228`). The strong hour rule is drawn on the slot TOP edge (`m%60===0`,
  `border-t`, `:173-178`, the W12-02 fix). So the 09:00 band spans y=96 to y=192.
- **Migration 0041 is INERT in the grid.** `locations.slotGranularityMin`
  (`schema.ts:245`, default 30, CB->60) is STORED but has **zero consumers** in
  the agenda grid (grep `slotGranularity` over `apps/web` = 0). Row height and
  appointment `top` are hard-coded to 30-min. **The briefing's "hour-only grid
  (migration 0041)" premise does not hold** - CB still renders 30-min rows. Do
  NOT activate 0041 as part of this fix.

**Fix shape (design-preserving):** keep the intentional vertical stack; bound the
same-start group so all its rows stay INSIDE their hour band (e.g. clamp the
group's rendered height to the band, compact the line-height, or cap visible rows
with a "+N" affordance) so four 09:00 appointments all read within the 09:00
band, not crossing into 10:00. Do NOT convert to side-by-side columns (regresses
the tested design); do NOT touch `minToPx`/`SLOT_HEIGHT`/`daySlots`; do NOT
activate `slot_granularity_min`.

**Scope:** the same-start rendering in `agenda-grid.tsx` (`:211-221` + the
`AppointmentName` stack) + a repro test. ZERO migration, ZERO workflow, ZERO
change to placement math or slot granularity.

## Field 2. Ordered steps
1. **A0 isolation guard** off fresh `origin/main`; worktree `../osteojp-pl-01-same-hour`; assert clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Reproduce + MEASURE** on local synthetic data: book four 09:00 + three 10:00 appointments (mirror the Terca-28 evidence). Record the rendered `top`/height of each 09:00 row and confirm whether any crosses y=144 (09:30) or y=192 (10:00). Screenshot.
3. **Decide against the intentional design (Field 6 gate):** if the DoD ("all four inside the 09:00 band") is reachable by bounding the vertical stack, proceed. If it is ONLY reachable by side-by-side columns or by activating 0041, HALT to a question (do not silently regress the tested design).
4. **Fix** the same-start group so its rows stay within the hour band; keep the vertical-stack contract (`agenda-cards.spec.ts:104` still green). Do not touch placement math or granularity.
5. **Repro test:** add an assertion (unit in `agenda-grid.test.tsx` and/or an e2e locator) that four same-09:00 appointments all render with `top` in the 09:00 band `[96,192)` and none cross into the 10:00 band. This test MUST fail on pre-fix code.
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; `git diff --name-only origin/main` shows only `agenda-grid.tsx` + tests - ZERO migration/workflow.

## Field 3. Definition of done (machine-verifiable)
- **Repro PROOF:** pre-fix screenshot + measured `top`/height showing 09:00 rows crossing the 09:30/10:00 gridline.
- **Fix PROOF:** post-fix, a repro test asserts four same-09:00 appointments all render with `top` inside `[96,192)` (the 09:00 band) and none cross into the 10:00 band; the test FAILS on pre-fix code and passes on the fix. Paste both runs.
- **No-regression PROOF:** `agenda-grid.test.tsx:227-250` (vertical stack, no width style) and `agenda-cards.spec.ts:104` (equal x, different y) still green - the fix did NOT convert to columns. Paste them.
- **No-design-drift PROOF:** `minToPx`/`SLOT_HEIGHT`/`daySlots`/`SLOT_MINUTES` unchanged (paste the unchanged lines); `slot_granularity_min` still has zero grid consumers.
- **No-schema PROOF:** `git diff --name-only origin/main` ZERO migration/workflow.
- **Gates green.**

## Field 4. Verification (paste evidence)
The before/after screenshots + measurements, the failing-then-passing band assertion, the still-green vertical-stack tests, the unchanged placement-math lines, the no-schema diff, suite counts, the Preview URL (owner books four 09:00 + three 10:00 and confirms they read within their hours), PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **Presentation only:** do NOT change `minToPx`, `SLOT_HEIGHT`, `daySlots`, `SLOT_MINUTES`, or `DAY_START_MIN`.
- **Preserve the intentional vertical stack.** No side-by-side columns; the fix bounds the stack to the hour band. If columns are genuinely wanted, that is a design change - HALT to a question (Field 6), do not implement it under a defect loop.
- **Do NOT activate `slot_granularity_min`** (0041 is inert in the grid; activating it is a separate migration-gated loop, not this fix).
- Verify on local `127.0.0.1` synthetic data; cloud is REAL DATA ONLY. pt-PT + en for any new label; no emoji; plain hyphens; no em/en dashes; no new hex. Never force-push / `--admin`.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails.
- **Reproduction shows the DoD ("all four inside the 09:00 band") is unreachable without EITHER side-by-side columns (regressing `agenda-cards.spec.ts:104` + the intentional design) OR activating the inert `slot_granularity_min` grid** - HALT with the finding and a recommended default (bound the vertical stack), do NOT silently regress the design. This is the briefing-versus-reality mismatch: the hypothesis named columns + an hour-only 0041 grid; recon found vertical-stack-by-design + inert 0041.
- Reproduction shows the 09:00 rows do NOT actually cross their band (defect not reproduced) - return to Rodica's exact words, capture what "descem para a hora seguinte" means on her real Terca-28 data (row count, screen size), HALT to a Q rather than assuming.

## Field 7. Report back
The before/after + measurements, the failing-then-passing band test, the still-green vertical-stack tests, the no-schema diff, suite counts, PR number - and, if the design-mismatch halt fired, the finding + recommended default.

## Merge policy (embed, Pre-Launch)
- **PL-01 is OWNER VISUAL GATE (vertical placement is visual, migration-free).**
  Required checks + all three Vercel deploys green (checks API not banner)
  NECESSARY but not sufficient; GREEN pushes the Preview + before/after and HALTs;
  owner books the same-hour cluster and confirms it reads within the hour. GREEN
  does NOT self-merge. Fresh `origin/main`, one PR in flight, never stacked.
  Workflow files never touched. HALT-LOUD on the design mismatch above.
