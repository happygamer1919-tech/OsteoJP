# Loop W12-15 - BUILD Equipa overhaul (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, BUILD, GATED on W12-14 SPEC + the Q-W10-04-1 / Q-W7-01-2 rulings. OWNER-MERGE (migration + RLS tighten). OWNER VISUAL GATE surface. CYAN pre-merge audit MANDATORY (RLS/isolation).** Implements the Equipa overhaul per `docs/design/SPEC-equipa-overhaul.md`. SPLITS into sub-loops (location model + RLS; merged panel; schedule redesign; color storage) - one migration in flight, one PR in flight. Starts from **fresh `origin/main`**; never stacked.

## Preconditions (hard gate)
1. **W12-14 merged** + the SPEC accepted.
2. **Rulings present:** Q-W10-04-1 (reception-location model + per-therapist RLS tighten, one `0038`) + Q-W7-01-2 (orphaned-auth on delete). Absent a ruling, the affected sub-part HALTS.

## Field 1. Scope and ground truth

Build, per the spec + only within the ruled gates, as SPLIT sub-loops: (b/RLS) the reception-location model (`0038`: `users.location_id` or `staff_locations` junction) + the per-therapist `clinical_records` RLS tighten + the invite-with-location + the orphaned-auth fix; (c) the merged Equipa+Horarios per-member config panel; (d) the variable-schedule editing (multi-template-per-weekday per location + seasonal windows) within `availability_templates`; (e) the per-location therapist-color storage + editing (consumed by W12-21). Each sub-loop: one migration max, one PR, its RLS isolation test in-PR, CYAN pre-merge audit if it touches RLS/isolation.

Ground truth (from the W12-14 SPEC + recon; executor re-verifies, ZERO memory): the invite form lacks location; no staff<->location junction; staff-location derived from `availability_templates`; RLS TODO `0001_rls.sql:174-175`; `availability_templates` per-location/per-weekday variable but the UI surfaces one template per weekday; colors hardcoded (no storage). `deleteStaffMember` orphans the auth identity. Cloud REAL DATA ONLY.

**Scope:** the migration(s) the spec named (kept decoupled per the coupled-flags lesson) + the panel + the schedule editing + the color storage, behind their gates, with RLS isolation tests + CYAN audits where RLS is touched. One migration in flight; head advances by one per sub-loop; manual `drizzle-kit` direct apply (5432, cwd `packages/db`). Verify on local + Preview.

## Field 2. Ordered steps
1. **Precondition check** (W12-14 merged + rulings). **A0 isolation guard** off fresh `origin/main`; worktree; assert clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Split + sequence:** build the location model + RLS sub-loop FIRST (it unblocks invite-location, reception scoping, and the per-location color storage). The merged panel, schedule editing, and color storage follow as gated sub-loops. Record the split in DECISIONS + the board.
3. **(b/RLS) sub-loop:** migration `0038` (reception-location model, decoupled) + the per-therapist `clinical_records` RLS tighten (`EXISTS(... practitioner)` predicate) + the invite-with-location field + the orphaned-auth fix (adopt-on-re-invite per Q-W7-01-2); RLS isolation test in-PR (therapist sees only own patients; reception scoped to its location; owner/admin unchanged); CYAN pre-merge audit MANDATORY; manual live-apply journal.
4. **(c) merged panel:** the per-member config panel (working info + schedule + services + location + color) replacing the split Equipa/Horarios editing; keep the matrix server-enforced.
5. **(d) schedule editing:** multi-template-per-weekday per location + optional seasonal windows within `availability_templates` (migration only if the spec proved one is needed).
6. **(e) color storage:** the per-location color column/table + editing in the panel; consumed by the agenda + the legend (W12-21).
7. **Gates per sub-loop:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. RLS isolation), `pnpm build`, `pnpm test:e2e`; Preview smoke; `git diff --name-only origin/main` scoped.

## Field 3. Definition of done (machine-verifiable, per sub-loop)
- **Location+RLS PROOF:** `0038` applied (head +1); an RLS isolation test proves therapist-own-only + reception-location-scoped + owner/admin unchanged; CYAN CLEAN; manual live-apply journal. The invite form has a location field; the invitee lands with the per-funcao+location permission set; the orphaned-auth fix is tested (re-invite of a deleted email succeeds per the ruling).
- **Panel PROOF:** an e2e opens one member and edits working info + schedule + service + location + color from ONE panel; the matrix guards hold server-side.
- **Schedule PROOF:** an e2e edits two same-weekday templates at different locations for one therapist (previously un-surfaceable) + a seasonal window.
- **Color PROOF:** a therapist's per-location color is stored + editable + rendered (hand-off to W12-21 for the legend).
- **Gates green** incl. RLS isolation + Preview smoke, per sub-loop.

## Field 4. Verification (paste evidence)
Per sub-loop: the migration + isolation test + CYAN audit + journal (b/RLS), the panel e2e, the schedule e2e, the color proof, the Preview smoke, suite counts, the Preview URL + role steps, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **One migration in flight, one PR in flight**; build the location+RLS sub-loop first, the rest as gated followers.
- **Isolation must not regress:** the RLS tighten is defense-in-depth over the server-enforced matrix; reception is scoped, never widened; the tenant RLS stays fail-closed.
- **Every migration ships tenant_id + RLS + an isolation test in-PR + a CYAN pre-merge audit**; live-apply manual (direct 5432, cwd `packages/db`). Keep the migrations decoupled (coupled-flags lesson).
- **Orphaned-auth fix is audited** (adopt-on-re-invite, an audit row; never silently deletes a live auth identity in another tenant).
- Cloud REAL DATA ONLY; verify on local `127.0.0.1` + Preview; pt-PT + en both; no emoji; plain hyphens; no em/en dashes; colors via approved tokens (no raw hex) unless the color-storage sub-loop defines a per-location palette the owner approved. **Never force-push / `--admin`.** No PII/secret values in logs.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR W12-14 is not merged.
- The Q-W10-04-1 or Q-W7-01-2 ruling is missing - HALT the affected sub-part.
- Any RLS change lacks its isolation test, or the isolation model would regress/widen - HALT.
- A sub-loop cannot fit one migration / one PR - SPLIT further (do not stack).

## Field 7. Report back
Per sub-loop: the migration + isolation test + CYAN + journal, the panel/schedule/color e2es, the Preview smoke, suite counts, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-15 (and each sub-loop) is OWNER-MERGE.** Migration + RLS tighten + owner-visible panel = owner-merge mandatory; NOT `[SELF-MERGE-OK]`. Required checks (DB-gated tests incl. RLS isolation, Lint+typecheck+test, Playwright E2E) + all three Vercel deploys green (checks API not banner) NECESSARY; **CYAN pre-merge audit MANDATORY** for the RLS/isolation sub-loop; the owner merges (OWNER VISUAL GATE on the panel).
- **GATED on W12-14** + rulings. One migration in flight, one PR in flight, fresh `origin/main`, never stacked. Workflow files never touched. HALT-LOUD on any isolation regression / missing isolation test.
