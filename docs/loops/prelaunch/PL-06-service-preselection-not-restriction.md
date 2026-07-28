# Loop PL-06 - Therapist service mapping is a PRESELECTION, never a RESTRICTION (Pre-Launch, owner ruling 2026-07-28)

GATE: **Pre-Launch, RULING. OWNER-GATED at two points before any build** - (1) the
corrected bookability signal (Field 6, the PL-05 predicate consequence) and (2)
whether it needs a schema change (PL-06b). Authored by GREEN from Ivan's ruling;
HALTS for the owner gate before building. Splits **PL-06a** (UI/logic,
non-migration) and, only if a flag is chosen, **PL-06b** (migration, owner-gated).
Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

**Owner ruling (verbatim intent, Ivan 2026-07-28):** the per-therapist service
assignment in Equipa is a PRESELECTION, never a RESTRICTION. A therapist whose
primary service is NESA must still be bookable for any other active service when
the clinic needs it. All active services stay available to all therapists in the
booking form. The Equipa assignment only decides what is preselected by default.

Ground truth (recon 2026-07-28, from merged `origin/main`; executor RE-VERIFIES,
zero memory):

- **The ONE narrowing site is the booking service Select.** `getTherapistServices`
  (`apps/web/lib/scheduling/actions.ts:227-244`) returns the therapist's mapped
  service ids via `getTherapistServiceIds` (`therapist-services.ts:17-38`); its
  header comment (SPEC-appointments 6) says the drawer "filters the service Select
  to their mapped service(s) and preselects when there is exactly one." **That
  FILTER is what the ruling forbids** - the drawer must show ALL active services
  and only PRESELECT the primary.
- **No server-side rejection of a therapist+service pair exists.** Grep of
  `scheduling/actions.ts` + `apps/api` found no validation that rejects a
  therapist+service combination. So the mapping never validates today - it only
  narrows the UI list. Confirm on-branch; if any reject path is found, it is in
  scope (remove it).
- **A "primary service" designation already exists** (`admin/therapist-primary-
  service.ts`, W3-04 / the equipa-primary-service flow), so preselection has a
  data source WITHOUT a new column - the primary drives the default, the form
  shows all active services.
- **2c CORRECTED (BLOCKER 1, 2026-07-28) - the column EXISTS but booking IGNORES
  it, so PL-06a has NO location clause.** `services.location_id` exists
  (`schema.ts:262`, null = all locations) BUT the booking service query does NOT
  filter on it: `data.ts:271-278` filters ONLY `eq(services.isActive, true)`, and
  no drawer filters services by location (verified on merged main). So services
  are ALREADY tenant-wide in the booking form - there is no enforced location
  constraint to preserve. **PL-06a therefore only removes the therapist coupling
  (`getTherapistServices` filter); it leaves the service query untouched and adds
  NO location clause.** Consequence: **CB-NESA DISSOLVES** - it was a
  therapist-mapping artifact, since booking never scoped services by location.
  SEPARATE latent finding (NOT PL-06's fix): `services.location_id` is unenforced
  in booking; a service intended location-scoped is not honoured - a future loop
  if per-location service availability is wanted. `NESA.location_id` on prod
  (BLOCKER 1b, owner-run read sha256 c6540cc6) is captured for the record but does
  not change the booking outcome. (My earlier "keep the location filter" claim was
  wrong; there is no location filter in booking to keep.)

**Scope (PL-06a, non-migration):** the booking drawer service Select stops
filtering by the therapist's mapping and instead lists ALL active services
(tenant-wide, as the booking query already is - NO location clause, see 2c),
preselecting the therapist's primary; remove any therapist+service reject path if
found; Marcações create/edit, batch scheduling ("Agendar lote"), and portal
booking made consistent (portal is out-of-V1 but must not keep the old filter).
ZERO migration in PL-06a.

## Field 6-consequence (TASK 2d) - PL-05 bookability signal RULED: Option 2 (is_bookable flag).

PL-05's merged predicate (`therapist-bookable.ts:36-38`) is
`roleSlug === "therapist" || serviceCount > 0`. Under this ruling, `serviceCount`
means PRESELECTION, not bookability - so the second arm no longer means what the
product says, AND (independently) it currently DROPS JP on prod (role != therapist,
zero mappings -> both arms false -> JP OUT of the Terapeuta dropdown = a live
defect, see the CYAN disclosure 20260728). The bookability signal is replaced.

**RULED by Ivan 2026-07-28: Option 2 - an `is_bookable` flag (PL-06b migration).**
Rationale (for holding the line downstream): role governs AUTHORISATION, mapping
governs DEFAULT PRESELECTION, the flag governs DROPDOWN PRESENCE - three concerns,
three signals, no overloading. Role sets are hand-curated and rot at every hire,
the exact failure that produced the JP defect. Option 1 (role set) is REJECTED.
The two options considered were:

- **Option 1 - explicit role set (non-migration, PL-06a).** Bookable = role in an
  explicit practitioner set. PROBLEM: JP (practising) and Ivan M (operator) are
  BOTH role=owner on prod, so role alone cannot separate them - this needs a
  per-user allowlist or a role change for JP, which is fragile. Keeps it
  migration-free but hand-curated.
- **Option 2 - explicit `is_bookable` (or `is_practitioner`) flag (MIGRATION,
  PL-06b).** A boolean on `users` (or `staff_locations`) that admins set in Equipa,
  decoupled from role AND from service mappings. Cleanly separates "appears in the
  Terapeuta dropdown" from "what preselects" and from "role". Owner-gated migration
  + a one-checkbox Equipa control. RECOMMENDED as the durable answer; it is the
  only signal that survives dual-role practitioners without hand-curation.

**HALT for Ivan to choose Option 1 or 2.** If Option 2, PL-06b is a separate
owner-gated migration loop; never compose it into PL-06a. Until Ivan rules, the
JP-out defect is open and the JP mapping script stays frozen (mapping-to-all is
the wrong shape regardless).

## Field 2. Ordered steps (PL-06a, AFTER the owner gate)
1. A0 isolation guard off fresh `origin/main`; worktree `../osteojp-pl-06a-preselection`; assert clean tree + HEAD == tip.
2. Reproduce: pick a therapist with a NESA primary in Nova marcação; confirm the service Select today is FILTERED to their mapping (the defect).
3. Change the drawer to list ALL active services for the selected LOCATION (keep the `services.location_id`/pack `locationId` location filter), preselecting the therapist's primary; do NOT filter by therapist mapping.
4. Remove any therapist+service reject path found in step-1 recon (none expected).
5. Apply the owner-chosen bookability signal (Option 1 or 2) to `therapist-bookable.ts` so JP is back IN; re-point the PL-05 unit test to the real signal (drop the fabricated mapped-owner fixture).
6. Make Marcações edit + batch + portal consistent.
7. Gates: lint, typecheck, test, build, test:e2e; scoped diff (PL-06a: no migration).

## Field 3. Definition of done (machine-verifiable)
- **Positive:** an e2e/test creates an appointment for a therapist whose primary is NESA, changes the service to a DIFFERENT active service, saves, re-reads the saved service. FAILS on pre-fix (the different service is not offered / is filtered out).
- **Negative:** an assertion that NO code path rejects a therapist+service pair (the reject, if any, is gone; server accepts any active+location-valid service for any bookable therapist).
- **JP PROOF:** with the owner-chosen signal, the bookable set INCLUDES a role!=therapist practitioner with zero mappings (the JP case) and still EXCLUDES the operator owner + admin. Red-then-green as on PL-01/PL-05.
- **Location PROOF:** a service scoped to one location is still NOT offered at another location (the 2c constraint held).
- **No-schema PROOF (PL-06a):** `git diff --name-only origin/main` shows zero migration; if Option 2 was chosen, that column is PL-06b, a separate PR.
- Gates green (i18n parity if any label).

## Field 4. Verification (paste evidence)
The pre/post service list for a NESA-primary therapist, the change-service-and-reread e2e, the no-reject negative assertion, the JP in/out red-then-green, the location-scoping proof, the no-schema diff, suite counts, Preview URL, PR number.

## Field 5. Restrictions and scope boundary
- A0 worktree isolation off fresh `origin/main`. **PL-06a is migration-free**; any flag is PL-06b (owner-gated).
- **Location scoping is UNENFORCED in booking (2c / BLOCKER 1)** - the service query ignores `services.location_id`, so there is NO location filter to keep or flatten. PL-06a removes ONLY the therapist coupling. Per-location service availability, if ever wanted, is a separate loop - do not add it here.
- Server booking guards unchanged except the removal of a therapist+service reject if one exists. Permission matrix untouched.
- Verify on local `127.0.0.1` synthetic data; cloud REAL DATA ONLY. pt-PT; both i18n files parse; no emoji; plain hyphens; no em/en dashes; no new hex. Never force-push / `--admin`.

## Field 6. Halt loud if
- The A0 guard fails.
- **BLOCKER 1 + BLOCKER 2 must be stated as fact before PL-06a builds** (owner directive 2026-07-28). BLOCKER 1 RESOLVED: booking ignores `location_id`, no location clause, CB-NESA dissolves. BLOCKER 2 (JP prod role) + the backfill id-map are pending the attested read (sha256 c6540cc6); do not build until both land.
- Recon finds a therapist+service REJECT path with a data dependency (e.g. an invoice/pack constraint) that makes removing it unsafe - HALT with the finding.
- Signal RULED Option 2 -> PL-06b IS a migration -> apply-before-merge, owner runs it; never compose into PL-06a. The backfill id-map must be attested + owner-approved before staging.

## Field 7. Report back
The recon of narrowing/reject sites, the owner's signal ruling, the change-service e2e + JP red-then-green + location proof + no-reject assertion, the no-schema diff (PL-06a), suite counts, PR number(s).

## PL-06b build spec (migration, owner-gated, RULED Option 2)
- **Column:** `is_bookable boolean not null` on the staff row (`users`, tenant-scoped). The flag governs Terapeuta-dropdown presence, independent of role and of service mappings.
- **Predicate replaced:** `therapist-bookable.ts:36-38` bookability becomes `row.isBookable` - BOTH current arms (`roleSlug==='therapist'` and `serviceCount>0`) REMOVED; `data.ts` selects the flag instead of role + serviceCount.
- **Equipa control:** an `is_bookable` checkbox in the Gerir modal alongside location + colour (users:manage-gated, audited), mirroring the W12-40 controls.
- **Backfill (ATTESTED id-map, owner-approved BEFORE staging):** every current role=therapist -> true; JP -> true; Ivan M -> false; Lurdes -> false; reception -> false. An explicit `{user_id: bool}` map DERIVED FROM THE ATTESTED PROD READ (sha256 c6540cc6), never fuzzy-matched (Tiago Grilo nearly overwrote Tiago Reis). GREEN hands the id-map to Ivan; Ivan confirms each value; THEN the migration is staged.
- **Apply-before-merge:** CYAN CLEAR -> Ivan applies -> journal pasted -> merge. ONE migration in flight; nothing queues behind it until it lands. Migration number = next free after 0045 (check the journal on-branch, never reuse). RLS/isolation assertion in the same PR.

## TEST FIXTURE RULE (permanent, adopted 2026-07-28 - applies to PL-06 and every loop after)
A test fixture that NAMES A REAL PERSON must be DERIVED FROM AN ATTESTED PROD READ-ONLY SNAPSHOT, or it must not name them (use an anonymous synthetic row). The PL-05 inclusion test passed on a FABRICATED mapped-owner "JP" (serviceCount 3) that did not match JP's real unmapped row - an invented fixture for a real row produces GREEN CI on a live defect. Named-real = attested; unattested = anonymous only.

## Merge policy (embed, Pre-Launch)
- **PL-06a is OWNER VISUAL GATE** (booking-form behaviour is visual, migration-free): checks + three Vercel deploys green NECESSARY not sufficient; GREEN pushes the Preview + role steps and HALTs; owner books a NESA-primary therapist for a different service and confirms it saves. GREEN does NOT self-merge.
- **PL-06b (if any) is OWNER-MERGE, apply-before-merge** (migration). One migration in flight. Workflow files never touched. HALT-LOUD on the signal ruling and on any reject-path data dependency.
