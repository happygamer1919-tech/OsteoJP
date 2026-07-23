# Loop W12-23 - Booking-form therapist dropdown filtered by location (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, FEATURE. OWNER VISUAL GATE. Migration-free (consumes the existing/derived location model).** The new-appointment form's therapist dropdown filters to therapists assigned to the selected location. Depends on the Equipa location-assignment DATA being correct. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Filter the therapist dropdown in the new-appointment form to the selected location's team, using the existing therapist->location source. Presentation + query scoping; no schema.

Ground truth (recon at authoring 2026-07-23, embed - executor verifies, ZERO memory):

- **Therapist->location is DERIVED from `availability_templates`** via `getTherapistLocationIds`/`listTherapistLocationAssignments` (`apps/web/lib/scheduling/therapist-locations.ts:20`); a therapist "belongs to" the locations it holds active availability at. (If W12-15 has shipped the `staff_locations` model, prefer it; otherwise the derived source is authoritative.)
- **The booking form + agenda drawer** pick a therapist; today the therapist list is not scoped to the chosen location. The filter uses the location the form already selects; when no location is chosen, the full list shows (or the form's default-location behaviour applies).
- **Dependency (DATA, not code):** the filter is only as correct as the Equipa location assignments - a CB therapist not assigned CB will not appear when CB is selected. This is the known owner/Rodica DATA task (BACKLOG Wave 11 note); this loop does NOT fix data, it consumes it. It overlaps the gated per-location booking-offering filter (out of scope here).
- **Portal parity caution:** the portal booking wizard consumes the same scheduling sources (`listOpenSlots`); this loop scopes the STAFF booking form's therapist dropdown and must not change the portal's therapist/slot behaviour.

**Scope:** the therapist dropdown in the staff new-appointment form (+ the agenda drawer if it shares the control) filters by the selected location via the derived (or `staff_locations`) source + tests. Migration-free; verify on local + Preview; no portal behaviour change.

## Field 2. Ordered steps
1. **A0 isolation guard** off fresh `origin/main`; worktree `../osteojp-w12-23-booking-dropdown`; assert clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Scope the dropdown:** filter the therapist options to `getTherapistLocationIds`/`staff_locations` for the selected location; when no location is chosen, keep the current full-list/default behaviour. Reuse the existing source; do not add a table.
3. **Empty-state:** if a location has no assigned therapists, show a clear empty state (not a silent blank) pointing to the Equipa assignment DATA task.
4. **Test:** an e2e selects a location and asserts only that location's therapists appear; a second location shows its own set; changing location re-filters.
5. **Portal-safety check:** confirm the portal wizard's therapist/slot behaviour is unchanged (guard/test).
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; `git diff --name-only origin/main` ZERO migration/workflow.

## Field 3. Definition of done (machine-verifiable)
- **Filter PROOF:** an e2e shows the therapist dropdown scoped to the selected location; re-filters on change. Paste it.
- **Empty-state PROOF:** a location with no assigned therapist shows the empty state, not a blank.
- **Portal PROOF:** the portal wizard therapist/slot behaviour unchanged (guard/test green).
- **No-schema PROOF:** `git diff --name-only origin/main` ZERO migration/workflow.
- **Gates green.**

## Field 4. Verification (paste evidence)
The filter e2e, the empty-state, the portal guard, the no-schema diff, suite counts, the Preview URL (owner selects each location + sees the scoped list), PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **Migration-free:** reuse the derived (or `staff_locations`) source; no schema.
- **Do NOT change portal behaviour** (shared scheduling sources) - scope only the staff booking form's therapist dropdown.
- **This consumes location DATA; it does not fix it** - a missing assignment is the owner/Rodica Equipa data task, surfaced via the empty state, not patched in code.
- Verify on local `127.0.0.1`; pt-PT + en both; no emoji; plain hyphens; no em/en dashes. **Never force-push / `--admin`.**

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails.
- Scoping the dropdown would change the portal wizard - HALT (out of scope).
- The filter needs a therapist->location source that does not exist (neither derived nor `staff_locations`) - HALT to a Q (recommended default: use the derived source; the `staff_locations` model is W12-15).

## Field 7. Report back
The filter e2e, the empty-state, the portal guard, the no-schema diff, suite counts, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-23 is OWNER VISUAL GATE (booking form is visual, migration-free).** Required checks + all three Vercel deploys green (checks API not banner) NECESSARY but not sufficient; GREEN pushes the Preview + the per-location scoped list and HALTs; owner confirms + merges. NOT `[SELF-MERGE-OK]`.
- Fresh `origin/main`, one PR in flight, never stacked. Workflow files never touched. HALT-LOUD on any portal behaviour change.
