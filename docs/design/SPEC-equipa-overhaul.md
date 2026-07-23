# SPEC - Equipa overhaul + schedule-model redesign

Status: **DESIGN source of truth (W12-14, the largest spec). No product code, no migration.** Gates the W12-15 build. Five threads as ONE coherent Equipa redesign: delete-member + orphaned-auth, invite-with-location + reception location model + per-therapist RLS tighten, a merged per-member config panel, the variable-schedule redesign, and per-location therapist colours. The migration is kept minimal and the threads decoupled (coupled-flags lesson). Touches the isolation model - security-critical; the RLS tighten is defense-in-depth over the server-enforced matrix and must not widen access.

## Thread (a) - Delete team member + orphaned-auth fix (Q-W7-01-2)

**Exists, one defect.** `deleteStaffMember` (`apps/web/lib/admin/staff.ts:467-525`) is password-gated, activity-guarded (refuses on any appointment/record/episode/note/audit/analytics reference), owner-protected, never-self. But it deletes only `public.users` (`staff.ts:515`) and "never touches auth" (`:402`), so the platform-unique Supabase **auth identity is orphaned** and a re-invite to the same email fails.

**Target (Q-W7-01-2 default = adopt-on-re-invite):** the delete stays public.users-only (no destructive auth deletion), and the INVITE flow, when it meets an existing orphaned auth identity for the email, ADOPTS it (re-links a fresh public.users row to the existing auth user) instead of failing. Audited. Alternative (hard-delete the auth identity in the same tx) is rejected: auth deletion is destructive + owner-gated, and adopt-on-re-invite is reversible. No migration; a change to the invite/provision path + the delete leaving auth intact by design.

## Thread (b) - Invite-with-location + reception location model + per-therapist RLS tighten (Q-W10-04-1, migration 0038) - THE security core

**Ground truth:** the invite form has only `fullName`, `email`, `role` (`StaffInviteForm.tsx:38-52`); no location. `users` has NO `location_id`; there is NO `staff_locations`/`user_locations` junction (verified: the only `*_locations` tables are `locations` + `patient_locations`). Staff<->location is DERIVED from `availability_templates` (`therapist-locations.ts`), which exists only for bookable therapists - so RECEPTION has no derivable location. The per-therapist `clinical_records` RLS tighten is the standing TODO at `0001_rls.sql` (therapist currently reads ALL in-tenant clinical_records; "tighten to patients-they-treat once user_locations / appointment scoping exists"; reception DENIED).

**Target model (migration `0038`, the one Q-W10-04-1 asked for):**
1. **`staff_locations` junction** (`id`, `tenant_id`, `user_id`, `location_id`, unique on `(tenant_id, user_id, location_id)`), many-to-many so a staff member (reception OR therapist) can belong to multiple clinics. This gives reception an explicit location scope that does not exist today. `tenant_id` + RLS policy + isolation test in-PR.
2. **Invite gains a location selector** (multi-select over the tenant's active locations). The invitee lands with a pre-approved permission set per funcao + their `staff_locations`. Reception is scoped to its assigned location(s); therapist location comes from `staff_locations` (with `availability_templates` still the source of BOOKABLE hours).
3. **Per-therapist RLS tighten:** the therapist `clinical_records` SELECT branch tightens from "all in-tenant" to "patients they treat", derived from the therapist's own appointments (and, where relevant, their `staff_locations`). Defense-in-depth over the server matrix; **reception stays DENIED (never widened)**; the tenant RLS stays fail-closed. This is the deferred `0001_rls.sql` TODO, now buildable because appointment/location scoping exists.

**Invariant:** the permission matrix (CLAUDE.md) stays server-side authoritative; RLS is defense-in-depth; isolation is DERIVED then TIGHTENED, never loosened. The W10-04 isolation model (scope from real assignments) becomes only as correct as the `staff_locations` data - so W12-40 (team data bulk) + the Equipa data entry feed it.

## Thread (c) - Merged Equipa + Horarios per-member config panel

**Ground truth:** Equipa is `/admin/staff` (list + `StaffManageModal` editing profile/role/active/delete); Horarios is a SEPARATE route `/admin/working-hours` (deep-linked `?t=<id>`). Colour, location, and multi-service are NOT editable in the modal.

**Target:** ONE per-member config panel (a dedicated route or an expanded modal off `/admin/staff`) holding EVERYTHING member-related: profile + role + active/delete (thread a) + `staff_locations` (thread b) + schedule (thread d) + per-location colour (thread e) + services (`therapist_services`). The `/admin/working-hours` schedule editing folds into this panel (the route may stay as a deep-link target for back-compat). No new data model beyond threads (b)/(e); this is a UI consolidation over existing + new-from-(b)/(e) relations.

## Thread (d) - Variable-schedule redesign (the SPEC-first largest item, minimise migration)

**Ground truth:** `availability_templates` is ALREADY per-user + per-location (`location_id` NOT NULL) + per-weekday (0-6) + optional `valid_from`/`valid_until` seasonal windows + a dedupe unique constraint. The MODEL already supports a therapist working different hours at each clinic and multiple blocks per weekday. The GAP is UI-only: `working-hours/page.tsx` surfaces only ONE template per (therapist, weekday) via `firstByKey`, and the seasonal window fields are not exposed.

**Target (NO or minimal migration - reuse the existing model):**
- Edit MULTIPLE templates per (therapist, weekday), each with its own `location_id` and start/end (so two-location-same-weekday is fully editable).
- Expose the optional `valid_from`/`valid_until` seasonal window per template (NULL = open-ended).
- Keep the dedupe constraint + the weekday/start<end checks. Booking + the agenda grid already read the model; only the editor changes.

If a genuine model gap surfaces (e.g. break/split within a block that the row model cannot express), register it - do NOT expand scope silently; the default is UI-over-existing-model.

## Thread (e) - Per-location therapist-colour storage

**Ground truth:** colours are a hardcoded FNV-1a hash over the therapist id (`therapist-color.ts:53,68-70`, `THERAPIST_COLORS` palette) - NOT stored, NOT editable, NOT per-location.

**Target (depends on thread b - sequence b first):** store a colour keyed by (therapist, location). Recommended: a `color` column on the `staff_locations` junction from thread (b) (the junction is already keyed by (user, location)); the alternative is a dedicated `therapist_location_colors` table if the owner wants colours decoupled from membership. Editable in the per-member panel (thread c); consumed by the agenda face + the per-location legend (W12-21). **Duplicates across locations accepted** (Rodica: a therapist may reuse a colour at a different clinic) - registered as a confirmed sub-decision. Fallback to the FNV-1a hash when no stored colour exists (so nothing breaks pre-seed). This binds the colour model to the location model.

## Migration + build plan (W12-15)

**Migration `0038` (one migration in flight; CYAN pre-merge audit; RLS isolation test in-PR):**
- `staff_locations` junction (thread b) + its RLS policy + isolation test.
- The per-therapist `clinical_records` RLS tighten (thread b) - the deferred `0001_rls.sql` TODO.
- The colour storage (thread e): a `color` column on `staff_locations` (or the dedicated table) - MAY ship in the same `0038` or a follow-up, kept decoupled from the RLS change so a colour tweak never touches the isolation surface.
- Threads (a) orphaned-auth, (c) merged panel, (d) schedule editor are code/UI-only (no migration).

**Build split (one PR each, never stacked):**
1. `0038` `staff_locations` + reception-location + per-therapist RLS tighten (build FIRST; OWNER-MERGE; CYAN mandatory; isolation test). Isolation must not regress.
2. The merged per-member panel (c).
3. The schedule editor redesign (d).
4. The colour storage + editor (e) - feeds W12-21.
5. The orphaned-auth adopt-on-re-invite (a).

## Invariants

- Permission matrix stays SERVER-ENFORCED authoritative; RLS is defense-in-depth, fail-closed; isolation derived-then-tightened, NEVER widened; reception clinical_records read stays DENIED.
- Every new/changed table: `tenant_id`, an RLS policy, and an isolation test in the same PR (CLAUDE.md). CYAN pre-merge audit for the RLS migration.
- Orphaned-auth fix specced (adopt-on-re-invite, audited), not hand-waved. Auth identity is never destructively deleted by the app.
- Colours degrade gracefully to the FNV-1a hash pre-seed.

## Questions advanced / registered

- **Q-W10-04-1** (reception-location model + per-therapist RLS tighten): take the ONE-migration `0038` default (a `staff_locations` junction + the RLS tighten) - this spec is that design. Owner confirms `staff_locations` (many-to-many) vs a single `users.location_id`; recommended default is the junction (reception/therapist can span clinics).
- **Q-W7-01-2** (orphaned-auth-on-delete): take the adopt-on-re-invite default (audited); auth never hard-deleted by the app.
- **Q-W12-08 (new, sub-decision):** per-location therapist colours may DUPLICATE across locations (Rodica accepts) and are stored on `staff_locations` (recommended) vs a dedicated table. Default: stored on `staff_locations`, duplicates allowed, FNV-1a fallback. Confirm.

## Cross-references

- `packages/db/src/schema.ts:228-330,507-530,631-674` - locations, patient_locations, availability_templates.
- `packages/db/migrations/0001_rls.sql` - the per-therapist RLS TODO this spec resolves.
- `apps/web/lib/admin/staff.ts:467-525` - deleteStaffMember (thread a).
- `apps/web/lib/scheduling/therapist-color.ts` - the hardcoded colours (thread e).
- W12-15 build (gated on this spec + Q-W10-04-1 / Q-W7-01-2 rulings); W12-21 (colours + legend) consumes thread (e); W12-40 (team data bulk) feeds the `staff_locations` data.
