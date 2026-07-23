# Loop W12-14 - SPEC Equipa overhaul + schedule-model redesign (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, SPEC-FIRST (largest, migration-gated at build). OWNER-MERGE (spec doc, no product code).** Authors `docs/design/SPEC-equipa-overhaul.md`: delete-member, invite-with-location + reception location model (Q-W10-04-1), a merged Equipa+Horarios per-member config panel, the variable-schedule redesign, and the per-location therapist-color model. Folds the standing "variable therapist schedules SPEC FIRST" + "invite location selector + reception location model" register items. NO product code, NO migration. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Produce a committed SPEC covering five threads as ONE coherent Equipa redesign, with the migration(s) + RLS changes the build will need, kept minimal and decoupled. NO build.

Ground truth (recon at authoring 2026-07-23, embed - the spec author verifies, ZERO memory):

- **(a) Delete team member - EXISTS.** `deleteStaffMember` (`apps/web/lib/admin/staff.ts:467-525`, action `actions.ts:36-50`, UI `StaffManageModal.tsx:196-214`) is password-gated, activity-guarded (refuses if any appointment/record/episode/note/audit/analytics reference), owner-protected, never self. **Open defect Q-W7-01-2:** it deletes only `public.users`, never the Supabase auth identity, so the platform-unique login is orphaned + re-invite fails (`QUESTIONS.md:657`, recommended default = adopt-on-re-invite). The spec addresses the orphan (not just the delete button).
- **(b) Invite + reception location model - location field ABSENT; junction ABSENT (Q-W10-04-1).** The invite form has only `fullName`, `email`, `role` (`StaffInviteForm.tsx:38-52`); no location. `users` has NO `location_id` and there is NO `staff_locations`/`user_locations` junction (`schema.ts:190-222`; the only `*_locations` table is `patient_locations`). Staff<->location is DERIVED from `availability_templates` (`therapist-locations.ts:20`), which exists only for bookable therapists, so reception has no derivable location. The deferred per-therapist `clinical_records` RLS tightening is the TODO at `0001_rls.sql:174-175` (SELECT currently granted tenant-wide to owner/admin/therapist). Q-W10-04-1 recommends ONE migration `0038` adding a reception->location model (`users.location_id` or a `staff_locations` junction) AND tightening the per-therapist RLS branch. The invitee lands with a pre-approved permission set per funcao + location.
- **(c) Merge Equipa + Horarios into a per-member config panel.** Today Equipa is `/admin/staff` (list + `StaffManageModal` editing profile/role/active/delete, `StaffManageModal.tsx`), and Horarios is a SEPARATE route `/admin/working-hours` (`TherapistScheduleCard.tsx`, deep-linked via `?t=<id>`). Color, location, and multi-service are NOT editable in the modal. The spec designs one per-member panel holding working info + schedule + colors + services + location + everything member-related.
- **(d) Variable-schedule redesign (the SPEC-FIRST largest item).** The model `availability_templates` (`schema.ts:631-674`) is ALREADY per-location + per-weekday variable (a therapist may work different hours at each clinic), with optional `valid_from`/`valid_until` seasonal windows. Gaps: the working-hours UI surfaces only ONE template per (therapist, weekday) (`working-hours/page.tsx:109-113` `firstByKey`), so a therapist working two locations on the same weekday is not fully editable; the seasonal window fields are not exposed. The redesign specifies multi-template-per-weekday editing (per location) + optional seasonal windows, within the existing model where possible (minimise migration).
- **(e) Per-location therapist-color model.** Colors are a hardcoded FNV-1a hash today (`therapist-color.ts`), NOT stored, NOT editable, NOT per-location. Rodica wants FIXED historical colors per therapist PER LOCATION (duplicates across locations accepted). The spec defines the storage: a color column keyed by (therapist, location) - naturally a column on the `staff_locations` junction from thread (b), or a dedicated `therapist_location_colors` table - editable in the per-member panel (thread c), consumed by the agenda + the legend (W12-21). This binds the color model to the location model, so the spec sequences (b) before (e)/W12-21.

- **Conflicts / dependencies to record:** this spec's migration (`0038` + possibly a color column) is the reception-location + RLS-tightening migration Q-W10-04-1 asked for; it MUST ship its RLS isolation test + a CYAN pre-merge audit at build (RLS surface). The color model depends on the location model. The build almost certainly SPLITS (location model + RLS; merged panel; schedule redesign; color storage) - one migration in flight, one PR in flight.

**Scope:** ONE committed doc `docs/design/SPEC-equipa-overhaul.md` covering the five threads + the minimal-migration plan (`0038` reception-location + RLS tighten; the color storage) + the build split + the invariants (isolation model, orphaned-auth fix, matrix server-enforced). NO code, NO migration. The only writes are the spec doc + any Q update (Q-W10-04-1 referenced/advanced, Q-W7-01-2 referenced).

## Field 2. Ordered steps
1. **A0 isolation guard** off fresh `origin/main`; worktree `../osteojp-w12-14-equipa-spec`; assert clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Verify the ground truth read-only:** confirm the invite fields, the absent junction, the derived location, the RLS TODO, the availability model + its UI single-template limit, the hardcoded color. Paste anchors.
3. **Author `docs/design/SPEC-equipa-overhaul.md`:** for each of (a)-(e), the target model + UI + the minimal migration/RLS delta; the reception-location model + the per-therapist RLS tighten as the Q-W10-04-1 `0038`; the color storage keyed by (therapist, location); the merged per-member panel; the schedule redesign within `availability_templates` where possible; the orphaned-auth fix (adopt-on-re-invite default); the build split (one migration / one PR each); the invariants (matrix server-enforced, isolation derived-then-tightened, CYAN + isolation test on the RLS migration).
4. **Advance the questions:** reference/advance Q-W10-04-1 (take the one-migration `0038` default) + Q-W7-01-2 (orphaned-auth default); register any new sub-question (e.g. color duplicates-across-locations confirmed accepted per Rodica).
5. **Gate (docs-only):** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` green; `git diff --name-only origin/main` shows ONLY `docs/`.

## Field 3. Definition of done (machine-verifiable)
- **Spec PROOF:** `docs/design/SPEC-equipa-overhaul.md` exists covering (a)-(e) with, for each, the model + UI + migration/RLS delta; the `0038` reception-location + RLS-tighten plan; the color storage keyed by (therapist, location); the merged panel; the schedule redesign; the build split. Paste the migration plan + the build split.
- **Q PROOF:** Q-W10-04-1 + Q-W7-01-2 referenced/advanced with the taken defaults; any new sub-question registered.
- **No-code PROOF:** `git diff --name-only origin/main` shows ONLY `docs/`. Paste it.
- **Gates green** (docs-only).

## Field 4. Verification (paste evidence)
The five-thread design, the `0038` migration + RLS plan, the color storage model, the merged-panel design, the schedule redesign, the build split, the Q advances, the no-code diff, gates green, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **SPEC ONLY - NO BUILD:** no product code, no migration; the doc adds design.
- **Minimise the migration:** reuse `availability_templates` for the schedule redesign where possible; add only the reception-location model + RLS tighten (`0038`) + the color storage the color thread needs; keep them decoupled (coupled-flags lesson).
- **The RLS tighten is defense-in-depth over the server-enforced matrix** - the spec keeps the matrix server-side authoritative + the tenant RLS fail-closed; it does not widen reception.
- **Orphaned-auth fix is specced, not hand-waved** (Q-W7-01-2 default = adopt-on-re-invite, audited).
- Plain hyphens; no emoji; no em/en dashes; pt-PT copy examples correct. **Never force-push / `--admin`.** No PII, no secret values.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails.
- The ground truth diverges from recon (e.g. a `staff_locations` junction already exists) - record it + adjust; HALT only if scope changes materially.
- The redesign cannot avoid widening reception access or relaxing the matrix - HALT to a Q; isolation must not regress.
- The color-per-location model cannot be expressed without the location model - sequence (b) first; do not invent a second location source.

## Field 7. Report back
The five-thread design, the `0038` migration + RLS plan, the color storage model, the build split, the Q advances, the no-code diff, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-14 is OWNER-MERGE (SPEC doc; touches the isolation model).** Docs/spec set product + security direction; required checks + all three Vercel deploys green (checks API not banner) necessary; the owner reviews + merges. NOT `[SELF-MERGE-OK]`.
- **SPEC-FIRST:** the W12-15 build is GATED on this spec merged + the Q-W10-04-1 / Q-W7-01-2 rulings. Fresh `origin/main`, one PR in flight, never stacked. Workflow files never touched. HALT-LOUD on any isolation regression.
