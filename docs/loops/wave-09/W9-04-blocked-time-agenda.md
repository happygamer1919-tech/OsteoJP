# Loop W9-04 - Blocked time on agenda (Wave 09 Correcoes CB)

GATE: **Wave 09 Correcoes CB, migration-free, DISPLAY GAP.** Blocked therapist time must render visibly on the agenda with distinct non-bookable styling, so staff cannot double-book over it. Runs AFTER W9-03 merged and `origin/main` fast-forwarded. Starts from **fresh `origin/main`**; never stacked. **GREEN self-merge** (migration-free).

## Field 1. Scope and ground truth

Fix item 3 of the CB QA (`docs/qa/2026-07-16-castelo-branco-qa.md`): time a therapist has blocked is not rendered on the agenda, so it is invisible and bookable-over. After the fix, blocked time renders on the agenda in a distinct non-bookable style.

Ground truth (recon at authoring 2026-07-16, embed - executor runs with ZERO memory):
- **The block model already exists: `time_off` (migration 0006).** W5-12 (#527) confirmed this at recon (Q-W5-7: "`time_off` already exists and models both modes; migration 0034 UNNECESSARY") and built the therapist-blocks admin UI + integrated blocks into `getTherapistAvailability` / lote exclusion (warn-not-cancel, Q-W5-4). So blocks are ALREADY excluded from availability and lote; the gap is that they are not DRAWN on the agenda grid. `time_off (user_id, starts_at, ends_at)` is therapist-wide (no location_id; check `time_off_starts_before_ends`).
- **Agenda surface `apps/web/app/agenda/`.** The six-day Mon-Sat + 24h grid (W3-08), the toolbar filters (W4-17), and the location filter (W9-02) are UNCHANGED by this loop. This loop ADDS a blocked-time band to the grid, read from `time_off` for the visible range + the rendered therapists.
- **`getTherapistAvailability` (`apps/web/lib/scheduling/day-availability.ts`) already reads the block exclusion** used for booking; the agenda read should surface the same blocks as a rendered band (do not re-derive a second, divergent block source). Blocked time is NON-BOOKABLE: it renders distinctly from an appointment card and from free time, and it is not a clickable booking slot.
- **Relation to Q-V2W2-1 (blocked-time band):** the QUESTIONS shelf already notes a blocked-time band as an open UI item; this loop delivers it. Cancelled/confirmed card semantics are W9-05, not here.

**Scope:** blocked therapist time (`time_off`) renders on the agenda for the visible range + rendered therapists, in a distinct non-bookable style (not an appointment card, not a free slot), so staff see it and do not book over it. Migration-free (the model exists at 0006), display layer. No change to the block admin UI (W5-12), to `getTherapistAvailability`'s booking behaviour, or to lote exclusion.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; assert `origin/main` contains W9-03's merge; `git worktree add ../osteojp-w9-04-blocked-time origin/main -b osteojp-w9-04-blocked-time`; assert toplevel + clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **RECON:** confirm `time_off` shape + the existing read used by `getTherapistAvailability`; confirm how the agenda grid fetches its visible-range data. Paste findings. Reuse the existing block source; do not add a second one.
3. **Render blocked time:** draw `time_off` intervals on the agenda grid for the visible range + rendered therapists, in a distinct non-bookable style (per UI-STYLE.md; a muted/hatched band, not a StatusBadge card). Ensure a blocked band is not a clickable booking slot.
4. **Tests:** a unit/component test that a `time_off` interval renders as a blocked band in the visible range; a test that the band is non-bookable (no booking action fires on it); a no-regression test that `getTherapistAvailability` booking behaviour and lote exclusion are unchanged. **E2E:** a therapist with a block shows the blocked band on the agenda; a booking attempt does not target the band.
5. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`. JSON.parse both i18n files. Confirm `git diff --name-only origin/main` shows ZERO migration + ZERO workflow files.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- **Blocked-band PROOF:** a `time_off` interval renders on the agenda for the visible range + the rendered therapists, in a distinct non-bookable style. Paste the unit + E2E assertions.
- **Non-bookable PROOF:** the blocked band is not a clickable booking slot (no booking action fires on it). Paste the assertion.
- **No-regression PROOF:** `getTherapistAvailability` booking behaviour, lote exclusion (W5-12), and the block admin UI are unchanged (cite untouched files / passing existing tests).
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
The recon note, the migration-free diff, the blocked-band + non-bookable + no-regression proofs, the E2E, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main` (contains W9-03). **Migration-free:** the block model exists at 0006; if a schema change surfaces, HALT (do not add a migration here).
- **Reuse the existing `time_off` read** used by `getTherapistAvailability`; do not derive a second, divergent block source.
- **Display layer only.** No change to the W5-12 block admin UI, to booking availability behaviour, or to lote exclusion. Card lifecycle semantics (strikethrough = cancelled) are W9-05, not here.
- pt-PT i18n (both files, JSON.parse both); no emoji; UI-STYLE.md + 55/25/20 equity + AA. DB access only through `packages/db`. **Never force-push / `--admin`.** Plain hyphens only. **SYNTHETIC-DATA-ONLY for verify.**
- **Standing test-data rule (Wave 09):** never run destructive QA against **Maria Joao Silva** (`triboimax635+maria@gmail.com`); disposable test patients only; reference therapist **Tiago Reis**.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR `origin/main` does NOT contain W9-03's merge.
- Rendering blocked time cleanly needs a schema change (e.g. `time_off` cannot express a needed dimension) - HALT (do not add a migration here; convert to a follow-up).
- The recon finds `time_off` is NOT the block source that `getTherapistAvailability` uses (a divergent model) - HALT with the finding before building on the wrong source.

## Field 7. Report back
The recon note, the migration-free diff, the blocked-band + non-bookable + no-regression tests, the E2E, suite counts, PR number.

## Merge policy (embed, Wave 09 Correcoes CB)
- **W9-04 is GREEN self-merge (migration-free).** GREEN self-merge once ALL required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform, osteojp-portal) are green, read from the checks API NOT the banner. If a migration surfaces, HALT and convert to an OWNER-MERGE follow-up.
- **Runs after W9-03 merged**, fresh `origin/main`, never stacked. Workflow files NEVER touched. JSON.parse both i18n files in every gate. HALT-LOUD on scope/product/data/reality mismatch.
