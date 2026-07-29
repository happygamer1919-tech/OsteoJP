# Loop PL-09 - Role + location access model (owner ruling 2026-07-29)

GATE: **Owner-approved APPROACH (2026-07-29): proper phased build, staged and
ENABLED AFTER the acceptance test - never a broad RLS flip mid-test.** Each phase
is its own PR; RLS phases are apply-before-merge with isolation tests. Starts from
fresh `origin/main`.

## Field 1. Target model (owner, verbatim intent)

AUTHORITATIVE breakdown, owner 2026-07-29 (supersedes earlier drafts):

- **Therapist** - can ONLY access information about their OWN clients; can ONLY
  see their OWN agenda.
- **Reception** - sees ALL therapists and ALL clients, but ONLY from their
  location (a CB receptionist sees only CB therapists/clients; never another
  location). PLUS reception EDITS the team schedule (horarios/availability) for
  therapists AT THEIR LOCATION - they own scheduling. (New write capability,
  location-scoped.)
- **Admin** - almost owner but LIMITED to their location: sees KPI + statistics +
  agenda + all therapists + all clients, ONLY for their location (a CB admin sees
  only CB). Admin panel available but limited to their location's actions.
- **Owner** - FULL access everywhere on everything.

"Assigned location" = the location(s) a user holds in `staff_locations` (0038).
In practice one per reception/admin; the scope is the assignment SET (multi-safe).

## Field 2. Current state (recon 2026-07-29, code-grounded)

- Permission layer (`packages/auth`) is ROLE-ONLY; there is NO location dimension,
  no location JWT claim (0002 stamps tenant_id + user_role only), and NO viewer
  location-resolver. `RequestContext = { tenantId, role, userId }`.
- The ONLY table with location RLS today is **clinical_records (0045)** - and it
  ALREADY matches the target for all four roles (therapist own-patients, admin
  strict single-location READ + write removed, reception denied, owner all).
- Everything else is TENANT-ONLY at RLS and mostly tenant-wide at the app layer:
  - Appointments: `listAppointments` has no viewer-location filter; appointments
    RLS is tenant-only. Therapist "own calendar" is a PAGE-LEVEL lock only
    (`agenda/page.tsx`), not RLS. -> reception/admin see ALL locations' agendas.
  - Patients: `therapistPatientScope` narrows therapists app-side only; admin +
    reception get NO scope -> all tenant patients. patients RLS tenant-only.
  - Statistics/KPI: owner-only capability; admin has none. Tenant-wide.
  - Admin panel: reachable by owner+admin; all actions tenant-wide, capability-
    gated only. `listStaff` returns all tenant staff.
- Two divergent "assigned location" sources: the agenda therapist filter derives
  from `availability_templates` (0006); clinical RLS uses `staff_locations` (0038).
  Target standardizes on `staff_locations`.

## Field 3. Gap (reception + admin see MORE than target = real access gaps)

- RECEPTION: appointments + patients tenant-wide (should be their location). Their
  `staff_locations` assignment is currently unused by any read.
- ADMIN: patients + appointments tenant-wide (clinical is already scoped); admin
  panel not location-limited (any admin manages any clinic; `staff_locations`
  write is owner/admin tenant-wide). [stats: HELD.]
- THERAPIST: own-scope is app-layer only for appointments/patients (RLS tenant-
  only) - defense-in-depth gap. Secondary-practitioner appts excluded from own
  agenda (minor).
- OWNER: fully matches, no change.
- FOUNDATION MISSING: no `resolveViewerLocationIds(ctx)`; must be built first.

## Field 4. Phased plan (each phase = its own PR)

- **Phase 0 - foundation (no behavior change).** `resolveViewerLocationIds(ctx)`
  reads the caller's `staff_locations` ids (RLS-scoped). Standardize the agenda
  therapist filter onto `staff_locations` (or document the reconcile). DB-gated
  test. Mergeable anytime.
- **Phase 1 - app-layer scoping (no migration).** For reception + admin, scope
  `listAppointments` (WHERE location_id IN viewer locations), `listPatients` /
  `searchPatients`, and default the agenda location + therapist dropdown to the
  viewer's assignment. Owner/therapist unchanged. Behavior change -> ENABLE AFTER
  the test.
- **Phase 2 - RLS defense-in-depth (MIGRATION, apply-before-merge).** New RLS on
  `appointments` and `patients`: therapist own (mirror `clinical_therapist_sees_
  patient`), admin + reception their-location (mirror `clinical_admin_sees_
  patient`), owner all. Isolation test in the SAME PR for every predicate. This is
  the true security layer; app-layer Phase 1 becomes defense-in-depth over it.
- **Phase 3 - admin statistics (CONFIRMED owner 2026-07-29).** Grant admin
  `statistics:read` + location-scope the stat/KPI aggregates to the admin's
  `staff_locations`. Owner keeps all-locations statistics.
- **Phase 4 - admin panel location-limit.** Scope admin-panel reads + writes
  (`staff.ts`, `services.ts`, and `staff_locations` writes) to the admin's
  location(s): an admin manages only their clinic's staff/services. May need an
  RLS tightening on `staff_locations` writes (currently owner/admin tenant-wide).
- **Phase 5 - reception schedule editing (NEW, owner 2026-07-29).** Reception owns
  scheduling: grant reception a working-hours-manage capability, SCOPED to
  therapists at their location, and expose the Horarios editor
  (`saveTherapistScheduleAction`, `availability_templates` + `time_off`) to
  reception for their-location therapists only. Currently working-hours is admin/
  therapist-only; reception has no such capability. App-layer scope + capability
  grant; RLS follow-up on `availability_templates`/`time_off` (currently tenant-
  only) to enforce the location + role bound.

## Field 5. Definition of done (per phase)

- Phase 0: resolver returns exactly the caller's `staff_locations` ids; DB-gated
  test proves cross-tenant isolation + correct set. No behavior change (grep: no
  consumer wired yet, or wired behind unchanged output for owner/therapist).
- Phase 1: e2e/unit - a reception/admin at location A does NOT see location B's
  appointments/patients; owner still sees all; therapist unchanged. Red-then-green.
- Phase 2: RLS isolation matrix per role x table (appointments, patients): the
  role-switched `authenticated` connection sees only its allowed rows; owner/
  BYPASSRLS negative control; cross-location denied; cross-tenant denied.
- Phase 4: an admin at A cannot read/write staff or services scoped to B; owner
  unchanged.

## Field 6. Restrictions

- **NEVER flip a broad RLS change during the live acceptance test** (owner ruling).
  RLS phases are apply-before-merge: CYAN CLEAR -> Ivan applies -> journal +
  independent read -> merge. One migration in flight at a time.
- Clinical_records (0045) is DONE - do not touch it.
- Follow the 0045 pattern: SECURITY DEFINER, STABLE, search_path=public helpers
  that tenant-filter on `jwt_tenant_id()` and resolve the viewer via `auth.uid()`
  against `staff_locations` (no JWT location claim needed).
- Verify on local 127.0.0.1; pt-PT; both i18n files parse; plain hyphens.

## Decisions (owner 2026-07-29)

- APPROACH: proper phased build, ENABLE after the acceptance test. (Not rushed.)
- Admin panel LIMITED to their location: YES.
- Admin statistics/KPI: CONFIRMED (owner 2026-07-29) - admins track statistics
  but ONLY for their location; owner keeps all-locations. Phase 3 builds.
- Scope basis = `staff_locations` (0038), the assignment SET (multi-location safe).
