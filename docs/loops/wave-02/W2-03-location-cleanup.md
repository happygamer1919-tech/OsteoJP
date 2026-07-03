# Loop W2-03 - Location data cleanup (live-DB data op)

GATE: PRECONDITION — W2-02 must be MERGED to main first (W2-02 excludes archived locations from selection; this loop archives rows, so the exclusion must already be live to avoid archived rows appearing in dropdowns mid-cleanup). PURPLE lane, live-DB data op (archive-only, no schema change, NO deletes ever). Confirm W2-02 is on main before dispatch.

## Field 1. Scope and ground truth
A data-only cleanup of the `locations` table on the dev/live database so the active set is exactly the two real OsteoJP clinics under the names the clinic chose, while preserving all FK history (no deletes). This loop changes ROWS, never schema. Ground truth is the live `locations` table read at recon time; on any mismatch with the expected shape below, HALT.

Expected pre-state (5 rows — confirm at recon, HALT if different):
- Fixtures: `LOC_LAV` (Linda-a-Velha), `LOC_CB` (Castelo Branco), `LOC_MTN` (Montemor-o-Novo).
- Manual rows created in-app: `OsteoJP (CB)` and `OsteoJP (LV)`.

Target post-state: exactly TWO active (non-archived) rows — the Castelo Branco and Linda-a-Velha clinics — named `OsteoJP (CB)` and `OsteoJP (LV)`, carried on the FIXTURE row ids (so existing appointment/record FKs stay valid). Everything else archived, nothing deleted.

## Field 2. Ordered steps
1. A0 isolation guard: `git worktree add ../osteojp-w2-loccleanup origin/main -b osteojp-w2-loccleanup`; assert toplevel ends in the worktree name; assert clean tree; confirm W2-02 is merged on main. HALT if any fails.
2. Read-only RECON, pasted BEFORE any write:
   - All `locations` rows: `id, name, archived` flag (and tenant_id).
   - Appointment count PER location id: `SELECT location_id, count(*) FROM appointments GROUP BY location_id;` (and any other FK references to `locations`, e.g. service_location_prices — enumerate them).
   - Confirm the 5 expected rows are present. HALT if the row set differs (extra/missing rows, unexpected names, or a manual row already archived in a way that breaks the plan).
3. Guard check (HALT condition): if EITHER manual row (`OsteoJP (CB)` / `OsteoJP (LV)`) carries ANY appointment or other FK reference, HALT and surface it — the plan assumes the manual rows are unreferenced (bookings went onto the fixtures). Do not proceed with archiving a referenced row without a ruling.
4. Action, ONLY if recon confirms the expected state and the guard passes (all archive/rename, NO deletes):
   - Archive both manual rows (`OsteoJP (CB)`, `OsteoJP (LV)`) and the Montemor fixture (`LOC_MTN`): set the archived flag true.
   - Rename fixture `LOC_CB` → `OsteoJP (CB)` and fixture `LOC_LAV` → `OsteoJP (LV)` (preserves FK history under the clinic's chosen names).
   - Result: active set is exactly the two renamed fixtures.
5. Paste the AFTER row states (id, name, archived) and re-run the recon read to confirm.

## Field 3. Definition of done (machine-verifiable)
- Before/after `locations` row states pasted (id, name, archived for all rows).
- Exactly two active rows post-op: `OsteoJP (CB)` and `OsteoJP (LV)`, on the fixture ids `LOC_CB` / `LOC_LAV`.
- Zero deletes: row count unchanged before vs after (all removals are archive-flag flips).
- Idempotence-as-zero-delta: a second run of the guarded script changes NOTHING (paste the zero-delta second-run output).
- Appointment-count-per-location recon pasted, showing neither archived manual row carried references (or a HALT record if one did).

## Field 4. Verification (paste evidence)
Recon (all rows + per-location appointment counts + other FK refs), the guard result, before/after row states, the two-active-rows confirmation, unchanged total row count (no deletes), and the zero-delta second run.

## Field 5. Restrictions and scope boundary
- `locations` table ONLY. NO schema changes, NO migrations, NO files under `packages/db/migrations` or `supabase/migrations`.
- NO deletes EVER — archive (flag flip) and rename only.
- Mechanism: a guarded script reusing the seed env loader and the `SEED_DEV_CONFIRM=jaxmkwoxjcgzkwxgbayx` opt-in pattern (the operator must set it to the ref parsed from `DATABASE_URL`). NEVER print credentials or env contents.
- Live-DB data op is owner-confirmable in spirit: the script HALTs on any recon mismatch rather than auto-resolving. Do not run against a target the guard does not confirm.
- Runs only after W2-02 is merged (archived rows must already be excluded from selection).

## Field 6. Halt loud if
- The `locations` row set does not match the expected 5 (extra/missing rows, unexpected names).
- Either manual row (`OsteoJP (CB)` / `OsteoJP (LV)`) carries any appointment or other FK reference.
- `SEED_DEV_CONFIRM` does not match the ref parsed from `DATABASE_URL` (guard refuses).
- The op would require a delete, a schema change, or W2-02 is not yet on main.

## Field 7. Report back
Recon (rows + per-location counts + FK refs), guard result, before/after states, two-active-rows proof, no-delete (row-count-equal) proof, zero-delta second run, script path. PURPLE lane: open a PR for the script + evidence and HALT for owner merge (live-DB data op — owner reviews the pasted before/after before the merge).
