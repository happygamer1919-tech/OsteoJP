# Loop PL-05 - Terapeuta dropdown lists all staff, not bookable therapists (Pre-Launch, Claude-found 2026-07-27)

GATE: **Pre-Launch, DEFECT, booking Terapeuta dropdown scope. OWNER VISUAL GATE,
migration-free.** Claude-found, NOT reported by Rodica. The Terapeuta dropdown
reads all staff, so "Ivan M" (owner) and "Lurdes Cruz" (admin) are selectable as
therapists. **Recon found the exact filter line and a subtlety: the filter must
NOT be a naive role=therapist, because the owner JP is a practicing clinician** -
"bookable" is a practitioner signal, not a raw role. Starts from **fresh
`origin/main`**; never stacked.

## Field 1. Scope and ground truth

Claude-found from the same PL-04 screenshot: the Terapeuta dropdown shows "Ivan M"
(owner) and "Lurdes Cruz" (admin) as selectable options. The dropdown reads all
in-tenant staff instead of only bookable therapists.

Ground truth (recon at authoring 2026-07-27, embed - executor RE-VERIFIES
read-only, ZERO memory):

- **The bug is one filter line:** `apps/web/lib/scheduling/data.ts:242-248`
  (`fetchStableAgendaRef` therapist query) uses
  `.where(and(eq(users.isActive, true), ne(roles.slug, "reception")))`. It
  excludes ONLY `reception` - so `owner` (Ivan M) and `admin` (Lurdes Cruz) pass
  through. This is the single role filter to correct.
- **Consumers:** `getAgendaOptions` (`data.ts:311-339`) -> `options.therapists` /
  `options.allTherapists`; the booking drawer
  (`apps/web/app/agenda/appointment-drawer.tsx:37` imports
  `therapistOptionsForBooking`; `therapistPool = options.allTherapists ??
  options.therapists` `:478`; final `therapistOptions` `:484-491`).
- **The W12-23 location narrowing does NOT help here:**
  `therapist-location-filter.ts` (`filterTherapistsByLocation` `:48-55`,
  `therapistOptionsForBooking` `:64-74`) filters by ASSIGNED LOCATION, not role -
  so a location-assigned owner/admin still appears. Ivan M and Lurdes appear
  because they have `staff_locations` membership, not because they are bookable.
- **Role enum values:** `owner | admin | therapist | reception` (`roles.slug`
  comment `schema.ts:179`; canonical `packages/auth/permissions.ts:10`
  `ROLES = ["owner","admin","therapist","reception"]`). Note: `reception`, not
  `receptionist`.
- **The subtlety - "bookable" is NOT raw role.** The owner JP (54d486e0) is a
  practicing osteopath who takes appointments; the owner Ivan M is the
  developer/operator who does not. Both are `role=owner`. So a naive
  `eq(roles.slug,"therapist")` would WRONGLY drop JP. The distinguishing signal is
  the therapist->service mapping **`therapistServices`** (`schema.ts:449-475`):
  practitioners (therapists + JP) carry service mappings; Ivan M and Lurdes do not.
  The briefing's phrasing "owner and admin-ONLY rows are absent" points at the same
  thing: exclude non-practitioners, keep dual-role practitioners.

**Recommended fix shape:** source the Terapeuta dropdown from bookable
practitioners = `role = 'therapist'` OR (has >= 1 `therapist_services` mapping),
still `is_active` and tenant-scoped, then apply the existing W12-23 location
narrowing. This keeps JP (owner-practitioner) and drops Ivan M (owner, no
mappings) + Lurdes (admin, no mappings) + reception. If the exact "bookable"
definition is contested (e.g. a real practitioner has no `therapist_services` row
either), HALT to a question rather than guessing (Field 6).

**Scope:** the therapist-source filter in `data.ts:242-248` (+ any mirror in
`getAgendaOptions`) + tests asserting owner/admin-only rows are absent and a known
practicing owner is kept. ZERO migration, ZERO workflow.

## Field 2. Ordered steps
1. **A0 isolation guard** off fresh `origin/main`; worktree `../osteojp-pl-05-terapeuta-scope`; assert clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Reproduce** on local synthetic data: seed an owner (no service mappings), an admin, a reception, and therapists (with mappings) + one owner-practitioner (with mappings, the JP analogue); open the booking Terapeuta dropdown; confirm the owner + admin appear today.
3. **Fix `data.ts:242-248`:** filter the therapist source to bookable practitioners (`role='therapist'` OR has a `therapist_services` mapping), `is_active`, tenant-scoped; keep the W12-23 location narrowing downstream. Do not relax any server-side booking guard.
4. **Test:** assert the dropdown source EXCLUDES the owner-only + admin-only + reception rows, INCLUDES therapists AND the owner-practitioner (JP analogue), and the option count equals the expected bookable set. This test must FAIL on pre-fix code (owner/admin present).
5. **i18n:** none expected (no new label); if any, both files parse.
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; scoped diff (no migration/workflow).

## Field 3. Definition of done (machine-verifiable)
- **Exclusion PROOF:** a test asserts the Terapeuta dropdown source contains NO
  owner-only ("Ivan M") and NO admin-only ("Lurdes Cruz") row (and no reception).
  FAILS on pre-fix code. Paste both runs.
- **Inclusion PROOF:** the same test asserts a practicing owner (has
  `therapist_services`, the JP analogue) IS kept - the fix did not over-filter.
  Paste it.
- **Count PROOF:** the option count equals the expected bookable set on the seed.
  Paste the assertion.
- **No-schema PROOF:** `git diff --name-only origin/main` ZERO migration/workflow.
- **Gates green.**

## Field 4. Verification (paste evidence)
The pre/post dropdown contents, the exclusion + inclusion + count assertions
(failing-then-passing), the no-schema diff, suite counts, the Preview URL (owner
opens booking, confirms Ivan M + Lurdes are gone but real therapists + practicing
owner remain), PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **Migration-free:** a query
  filter change only; no schema, no column.
- **Do not over-filter.** A practicing owner (JP) MUST remain bookable; the signal
  is `therapist_services`, not raw role. Assert inclusion, not just exclusion.
- **Server booking guards unchanged** - this narrows a UI option source; it never
  relaxes who may be booked server-side.
- Verify on local `127.0.0.1` synthetic data; cloud REAL DATA ONLY. No emoji;
  plain hyphens; no em/en dashes; no new hex. Never force-push / `--admin`.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails.
- The "bookable" definition is ambiguous on real data - e.g. a genuine practitioner
  carries NO `therapist_services` mapping (so the OR-clause would drop them), or a
  non-practitioner DOES carry one - HALT to a Q with the recommended default
  (`role='therapist'` OR has-mapping) rather than guessing and dropping a real
  therapist.
- The prod roster's owner/admin/therapist assignment cannot be confirmed
  (which is a CYAN read-only check, see PL-04 + the handoff C-1 correction) and the
  fix would risk dropping a real bookable person - HALT and request the CYAN
  role/mapping inventory first.

## Field 7. Report back
The pre/post dropdown contents, the exclusion + inclusion + count assertions, the
no-schema diff, suite counts, PR number - and, if the definition halt fired, the
finding + recommended default.

## Merge policy (embed, Pre-Launch)
- **PL-05 is OWNER VISUAL GATE (booking dropdown is visual, migration-free).**
  Required checks + all three Vercel deploys green (checks API not banner)
  NECESSARY but not sufficient; GREEN pushes the Preview and HALTs; owner opens
  booking and confirms the dropdown scope. GREEN does NOT self-merge. Fresh
  `origin/main`, one PR in flight, never stacked. Workflow files never touched.
  HALT-LOUD on the bookable-definition ambiguity.
