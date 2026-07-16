# Loop W9-05 - Agenda cards v2 (Wave 09 Correcoes CB)

GATE: **Wave 09 Correcoes CB, migration-free, DISPLAY LAYER, OWNER VISUAL GATE.** Rebuilds the agenda card visuals: therapist name on every card, deterministic per-therapist colour, legible same-hour overlap, and corrected cancelled-vs-confirmed semantics (strikethrough = cancelled). **Consumes W9-01 finding (b).** Runs AFTER W9-04 merged and `origin/main` fast-forwarded. Starts from **fresh `origin/main`**; never stacked. **OWNER VISUAL GATE:** all checks green is NECESSARY but NOT sufficient; GREEN pushes + pastes the osteojp-platform PREVIEW URL + the agenda surface, then HALTs; the owner merges.

## Field 1. Scope and ground truth

Fix items 5, 7, and 8 of the CB QA (`docs/qa/2026-07-16-castelo-branco-qa.md`) in one display-layer pass on the agenda cards:
- **(7)** the therapist name is not on the card and all cards are the same colour -> put the therapist name on every card and give each therapist a deterministic colour.
- **(8)** same-hour overlapping cards are unreadable and hide the patient name -> Fisiozero-style compact rendering that keeps the patient name legible.
- **(5)** strikethrough currently appears for confirmations, but the intended (Fisiozero) convention is strikethrough = cancelled -> correct the mapping per W9-01 (b).

Ground truth (recon at authoring 2026-07-16, embed - executor runs with ZERO memory; W9-01 finding (b) is the authoritative render-state mapping, this is the starting map):
- **Agenda surface `apps/web/app/agenda/`.** The six-day + 24h grid (W3-08), the toolbar filters (W4-17), the location filter (W9-02), and the blocked-time band (W9-04) are UNCHANGED by this loop. This loop touches only the appointment CARD render.
- **The dual orthogonal axes are LOCKED:** `status` (scheduled/confirmed/completed/cancelled/no_show) and `confirmation_state` (pending/confirmed/declined) are never merged (DECISIONS 2026-07-01). W9-01 (b) states exactly what strikethrough is currently bound to; the correct convention is **strikethrough = cancelled** (a `status = cancelled` cue), NOT a confirmation cue. This is a display-layer remap only - no axis change, no data change.
- **Per-therapist colour:** deterministic (same therapist -> same colour every render, e.g. a stable hash of the therapist id into a fixed AA-checked palette), meeting AA contrast. The §7 token palette and the W5-25 nine-entry `marker-*` palette are for OTHER surfaces; a per-therapist agenda palette is either a reuse of existing AA-checked tints or a new small AA-checked set added to UI-STYLE.md (extend the doc, do not drift canonical hexes; `packages/ui/src/tokens.test.ts` must stay green). Colour is REINFORCEMENT: the therapist NAME (text) is the authoritative identifier on every card, colour is secondary (never colour alone - the same rule as W5-25).
- **Same-hour overlap:** Fisiozero-style compact cards that keep the patient name legible when two or more appointments share an hour/column. Secondary participants (W4-19) render under the PRIMARY therapist column only - unchanged.
- **Standing:** QA with DISPOSABLE patients only, never Maria Joao Silva; reference therapist Tiago Reis. Display layer only - zero model change, zero change to the axes, booking, or the appointment count.

**Scope:** the agenda appointment card renders (a) the therapist name on every card, (b) a deterministic per-therapist colour meeting AA, (c) compact same-hour overlap keeping the patient name legible, and (d) corrected lifecycle visuals where strikethrough = cancelled (per W9-01 (b)). Migration-free, display layer only. An always-visible or otherwise discoverable cue for the card states (colour is never the only cue).

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; assert `origin/main` contains W9-04's merge; `git worktree add ../osteojp-w9-05-agenda-cards origin/main -b osteojp-w9-05-agenda-cards`; assert toplevel + clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Consume W9-01 (b):** read `docs/recon/W9-01-findings.md` section (b); confirm what strikethrough is currently bound to and the full card-state -> axis mapping; paste the citation.
3. **Therapist name + per-therapist colour:** render the therapist name on every card; assign a deterministic per-therapist colour from an AA-checked palette (reuse existing tints or extend UI-STYLE.md with a small AA-checked set; do not drift canonical hexes). Name is the authoritative identifier; colour reinforces.
4. **Same-hour overlap:** compact Fisiozero-style rendering that keeps the patient name legible for 2+ same-hour cards. Secondary participants stay under the primary column.
5. **Cancelled-vs-confirmed:** remap so **strikethrough = cancelled** (`status = cancelled`); confirmed/pending confirmation gets its own non-strikethrough cue per W9-01 (b). Display-only; axes untouched.
6. **Tests:** deterministic per-therapist colour (same id -> same token across renders) with an AA assertion; therapist name present on every card; patient name legible under same-hour overlap; a cancelled appointment renders strikethrough and a confirmed one does NOT; colour is never the only cue. **E2E:** the agenda renders names + per-therapist colours + a legible overlap + a struck-through cancelled card, on disposable fixtures (reference therapist Tiago Reis).
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`. JSON.parse both i18n files. `tokens.test.ts` green (canonical hexes unchanged). Confirm `git diff --name-only origin/main` shows ZERO migration + ZERO workflow files.
8. **OWNER VISUAL GATE:** push; paste the osteojp-platform PREVIEW URL + the agenda surface steps (a day with same-hour overlaps, multiple therapists, and a cancelled appointment); HALT for the owner to inspect before merging.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- **Therapist-identity PROOF:** the therapist name is on every card; per-therapist colour is deterministic and AA-checked; colour is never the only cue (name is text). Paste the test.
- **Overlap PROOF:** same-hour overlapping cards keep the patient name legible. Paste the test + a before/after description.
- **Lifecycle PROOF:** strikethrough = cancelled; a confirmed appointment is NOT struck through; the mapping matches W9-01 (b) and touches no axis/data. Paste the test.
- **Palette PROOF:** `tokens.test.ts` green (canonical hexes unchanged); any new tints are AA-checked + added to UI-STYLE.md. Paste it.
- **OWNER VISUAL GATE PROOF:** the preview URL + agenda steps pasted; the loop HALTED for owner merge (NOT self-merged).
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
The W9-01 (b) citation, the migration-free diff, the therapist-identity + overlap + lifecycle + palette proofs, suite counts, the PREVIEW URL + agenda steps, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main` (contains W9-04). **Migration-free:** display layer only; if a schema change surfaces, HALT (do not add a migration here).
- **The dual axes are LOCKED.** strikethrough = cancelled is a DISPLAY remap; never merge `status` and `confirmation_state`, never change stored data.
- **Colour is never the only cue.** The therapist name (text) is authoritative; per-therapist colour reinforces and must be AA-checked. Canonical hexes never drift (`tokens.test.ts` green); new tints go in UI-STYLE.md.
- **Display layer only.** No change to the grid, filters, blocked-time band, booking, appointment count, or secondary-participant column rules.
- pt-PT i18n (both files, JSON.parse both); no emoji; UI-STYLE.md + 55/25/20 equity + AA. **QA with disposable patients only, never Maria Joao Silva** (`triboimax635+maria@gmail.com`); reference therapist **Tiago Reis**. DB access only through `packages/db`. **Never force-push / `--admin`.** Plain hyphens only. **SYNTHETIC-DATA-ONLY for verify.**

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR `origin/main` does NOT contain W9-04's merge.
- Correcting the card visuals cleanly would require a schema change or an axis change (merging `status`/`confirmation_state`) - HALT (the axes are locked; a schema change converts to a follow-up).
- W9-01 (b) shows the current strikethrough binding is load-bearing for something other than display (e.g. a query depends on it) - HALT with the finding before remapping.
- A per-therapist colour that meets AA cannot be produced from the palette without drifting a canonical hex - HALT to QUESTIONS with a recommended default (never drift a canonical hex).

## Field 7. Report back
The W9-01 (b) citation, the migration-free diff, the therapist-identity + overlap + lifecycle + palette proofs, suite counts, the PREVIEW URL + agenda steps, PR number.

## Merge policy (embed, Wave 09 Correcoes CB)
- **W9-05 is the OWNER VISUAL GATE** (standing rule for visual-heavy loops since W7-03). All required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform, osteojp-portal) green, read from the checks API NOT the banner, is NECESSARY but NOT sufficient. GREEN pushes + pastes the osteojp-platform PREVIEW URL + the agenda surface steps, then HALTs; **the owner inspects the agenda on the preview URL and merges.** GREEN NEVER self-merges.
- **Runs after W9-04 merged**, fresh `origin/main`, never stacked. Workflow files NEVER touched. JSON.parse both i18n files in every gate. HALT-LOUD on scope/product/data/reality mismatch.
