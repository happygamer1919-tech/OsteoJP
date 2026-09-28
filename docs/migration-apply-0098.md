# 0098: apply CARE-02a v2, the care team reads the ficha and the registos, at the therapist's own clinics only

**Status: HELD. NOT PROMOTED, NOT APPLIED, NOT YET ISSUED FOR A SITTING.** One
migration, today `packages/db/migrations-pending/NEXT-AFTER-0097_care02a_care_team_reads.sql`
on the branch below, applied later by GREEN as
`packages/db/migrations/0098_care02a_care_team_reads.sql`, **after 0097**. Any `STOP:`
line, any `FAIL` verdict or any `ERROR` halts the sitting.

**This is v2 of the document, for v2 of the file.** v1 had no clinic limit and was
never applied anywhere but a throwaway. On 2026-09-27 the owner ruled the open
question v1 carried, "limit to their clinic only", and the file was rewritten to it
(its header, `NEXT-AFTER-0097_care02a_care_team_reads.sql:1-25`). Nothing below is
carried over from v1's numbers.

**This document is written before the promotion, on purpose.** The owner ruled on
2026-09-27 that 0097 and 0098 are "authored now" and held (`CLAUDE.md` on `origin/main`
at `b8c62fd5`, line 133); the lane that authored them never applies them, and GREEN
applies 0098 only after `0094`, `0095`, `0096` and `0097` are promoted, applied to
production and merged, in that order. **Which content each of those numbers means
changed the same night**: the owner's fourth renumbering made `0095` the conflict
check's patient name (#1438) and `0096` the grants revoke (#1397), the reverse of the
2026-09-22 order (`CLAUDE.md` at `b8c62fd5`, line 116). This document uses the new
order throughout. So three kinds of value live here:

- **pinned now**, because their bytes are final: the migration's sha256, the three
  check files, the two programs that run with production credentials, and the rule
  that picks the behaviour subjects (it is text in stage 1, so the sidecar pins it);
- **derived at the sitting, by machine**: 0097's sha256 and journal `when`, which the
  pre-check needs as `-v prev_hash` and `-v prev_when`, read off the branch by stage 1;
  and the behaviour check's patient and actors, **picked by GREEN in stage 1, READ
  ONLY, by that pinned rule**, and reused unchanged by stage 3;
- **filled at promotion, and refused by machine until then**: the PR number. It is a
  placeholder today (`NOT-YET-OPENED`), and every block STOPs on it before it touches
  git or a database. See "What the promotion fills".

**Written at the standard `docs/migration-apply-0093.md` set, section for section, in
the ALTER shape of `docs/migration-apply-0092.md`, plus one CREATE.** Every count below
is a structural count, a verdict profile, or a measurement on the synthetic B13a
rehearsal of 2026-09-27, quoted from its report. **No production figure appears here:
this lane had no production access, and the production READ ONLY section is written
before the document is issued.**

| Fact | Value |
|---|---|
| Card | `CARE-02a` |
| Ruling | Owner, 2026-09-27: "0097 and 0098 authored now", `0098` is CARE-02a, HELD (`CLAUDE.md` on `origin/main` at `b8c62fd5`, line 133). The acceptance is the owner's CHECK: `viewer_care_team_patient_ids()` joined into the `patients` and `clinical_records` therapist arms; the `patient_care_team` insert policy admits a therapist writing their own booking's row, and the select policy admits therapists reading their own list; `attachments`, `clinical_episodes` and `appointment_notes` stay as they are. **And the owner's ruling of the same day on the open question: "limit to their clinic only"** |
| Migration, today | `packages/db/migrations-pending/NEXT-AFTER-0097_care02a_care_team_reads.sql`, sha256 `fbf8cad1dc959a600b0e8b3ccffb7225e2295919e5dfe08432301faf6b5e9c45` |
| Migration, at the sitting | `packages/db/migrations/0098_care02a_care_team_reads.sql`, **bytes unchanged** (a promotion is a rename and nothing else, so the sha256 above is the hash drizzle records) |
| Journal | `idx 95`, tag `0098_care02a_care_team_reads`, `when` set at promotion and **strictly greater than 0097's**. The rehearsal used the synthetic `when` values `0097 1788501800000` and `0098 1788501900000`; stage 0 asserts the order, not those values |
| Must follow | `0097`, the index on `migration_staging_rows.imported_entity_id`, pending as `NEXT-AFTER-0096_migration_staging_imported_entity_idx.sql` (sha256 `198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0` as rehearsed). Before it: `0094` the users/tenants/roles split (#1459), `0095` the conflict check's patient name (#1438), `0096` the grants revoke (#1397), as the owner renumbered them on 2026-09-27 (`CLAUDE.md` at `b8c62fd5`, lines 116 and 134). Until that night the two middle numbers were the other way round, and the rehearsal base below applied them in that older order |
| Production journal at the sitting | **95 rows before, 96 after.** 91 once 0093 was applied (`docs/migration-apply-0093.md:7`), plus one row each for 0094 to 0097 |
| Branch | `care/0098-CARE-02a-care-team-reads`. PR **not yet opened** (`PR=NOT-YET-OPENED` in the blocks); it carries `held-for-apply` from the moment it opens |
| Before the sitting | See "Before the sitting": the queue ahead, the promotion, the SECURITY DEFINER count's GATE-CHANGE, the PR's checks, the issue of this document, and the owner being ready to merge promptly after the apply |
| This document | `docs/migration-apply-0098.md`, pinned by `docs/migration-apply-0098.sha256` and asserted in STAGE 0 and again in STAGE 1. The sidecar moves at promotion, when the placeholder is filled |
| Pre-check | `scripts/db/precheck-0098-care02a.sql`, READ ONLY, **20 verdicts**, sha256 `d429c81f75e4e54c27c8c21c9184cc80a2dd86e03b1da91024224dd6533bef70`. Takes `-v prev_hash` and `-v prev_when` |
| Post-check | `scripts/db/postcheck-0098-care02a.sql`, READ ONLY, **16 verdicts**, sha256 `01a1cd260fd3e1b391b85cfbce7c82ae04eafbc12c746e89e47f1aab51bae728`. Takes five carries |
| Behaviour check | `scripts/db/behaviour-care02a-readonly.sql`, READ ONLY, **32 arms**, up to five actors and one patient, sha256 `b7a53c223edd54af9ef0fca344e00b6c0e5eb4f4202a4752ccf8e7e4e8c75d51`. Run TWICE in this sitting, before the apply and after it, with the same subjects |
| Behaviour subjects | `-v patient_id`, `-v t1_id`, `-v t2_id`, `-v t3_id`, `-v t4_id`, `-v n_id`. **Picked by GREEN in stage 1, READ ONLY, by the rule the block carries (`PICK`)**: the lowest id that meets each slot. T4 and N are each picked, or passed as `none`, independently of the other (four shapes, each measured). The patient id is never printed and never committed (this repository is public). See "The behaviour subjects on production" |
| The two programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093`. Both byte-identical to `origin/main` at `b8c62fd5` and to the heads of the 0094 (#1459, `69ea425d`), 0095 (#1438, `67cdc97e`) and 0096 (#1397, `077ee449`) branches, read 2026-09-27 from the local remote-tracking refs; both pinned in every block that runs them |
| What it changes | ONE new function, `public.viewer_care_team_patient_ids_at_my_clinics()`, nullary, SECURITY DEFINER, STABLE, `search_path = public`, owned by `postgres`, EXECUTE for `authenticated` only; and FOUR `ALTER POLICY` statements, each restating the policy's current expression and adding one arm: `patients_select` USING, `clinical_records_select` USING, `patient_care_team_select` USING, `patient_care_team_insert` WITH CHECK. No policy is created or dropped; the policy count is flat on every table |
| What it never touches | every other policy (one md5 over all of them, a second over the eleven others on the three tables, a third over the thirteen on `attachments`, `clinical_episodes`, `appointment_notes`, `patient_note_revisions` and `guest_clinical_intakes`), every existing function (one md5 over every function in `public` but the new one), every existing grant (one md5 over every table, column and function ACL in `public` but the new function's). `viewer_care_team_patient_ids()`, `clinical_therapist_sees_patient()` and `clinical_admin_sees_patient()` are NOT edited, so no write widens |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its
own sha256: writing the value changes the value. So the digest lives beside it in
`docs/migration-apply-0098.sha256` and STAGE 0 checks it with `shasum -a 256 -c`.

**There is no `#` comment inside any block in this document, deliberately,** and every
parameter is braced, including before a colon, because the blocks are pasted into an
interactive zsh (`scripts/owner-blocks-survive-zsh.test.mjs` enforces the braces). No
backslash continuations, and no `!` except as the `test !` operator followed by a
space. Narration is `echo`.

**Each stage derives the head from `origin/care/0098-CARE-02a-care-team-reads`, not
`origin/main`, and survives that branch being deleted.** The PR is held until this
apply succeeds, so `origin/main` cannot contain the migration at the moment the apply
runs. On 2026-09-23 #1399 was merged before 0093's apply, the squash merge deleted its
branch, and every block of the 0093 document, which resolved `origin/<branch>` alone,
could not run. So every block here reads `origin/<branch>` when it exists and
otherwise `refs/pull/<PR>/head`, which a merge does not delete, and says which one it
read.

## The clinic limit and its location basis

**The ruling.** 0092 limited the care-team APPOINTMENT arm to the therapist's own
clinics: an appointment row carries `location_id`, so 0092 added
`location_id = ANY (viewer_location_ids())` to the row
(`packages/db/migrations/0092_care_team_location.sql:67`). The owner ruled on
2026-09-27 that the ficha and the registos stop at the clinic the same way.

**Why not 0092's shape.** `patients` carries only `primary_location_id`, and
`clinical_records` carries NO location at all, so neither row can be matched to a
clinic by a column of its own. **The limit is therefore decided per PATIENT**: a
care-team patient counts for a therapist when the patient is linked to one of the
therapist's clinics, and then the ficha and EVERY registo of that patient count,
including a registo written at another clinic; otherwise none of them do. That is the
granularity 0045 already gives admins on `clinical_records`
(`NEXT-AFTER-0097_care02a_care_team_reads.sql:78-87`).

**The basis, exactly.** A patient P is linked to a caller when an appointment of P
(`appointments.patient_id`, the FIRST slot) in the JWT tenant is at a location the
caller is installed at; or, ONLY when P has no appointment with a non-null location, P's
`primary_location_id` is such a location. That is `clinical_admin_sees_patient(p)`
(`packages/db/migrations/0045_clinical_records_location_rls.sql:120-159`), with the
caller's clinics read the way 0092 reads them, `viewer_location_ids()`
(`packages/db/migrations/0073_viewer_visible_patient_set.sql:143-154`). The two read the same rows: 0045 joins
`staff_locations` on `sl.user_id = auth.uid()` in the appointment's tenant, which is the
JWT tenant; `viewer_location_ids()` reads `sl.user_id = auth.uid()` and
`sl.tenant_id = jwt_tenant_id()`. A NULL location never matches, because
`x = ANY (array)` is never true for a NULL `x`, which is 0045's `IS NOT NULL` written as
membership (`NEXT-AFTER-0097_care02a_care_team_reads.sql:89-107`).

**The one real difference between 0045 and 0092 is the patient slot, and 0045's is
kept.** 0092's appointment arm follows `patient_2_id` too; 0045's admin basis does not.
The new helper follows 0045, the first slot only, in the appointment basis AND in the
fallback's "no located appointment" test, so that for every patient and every caller
its answer is exactly "on the live care team AND `clinical_admin_sees_patient(p)`". A
therapist then reads, through the team, no registo that an admin installed at the same
clinics cannot read. **The cost, stated because it is real:** a patient who is at
clinic A ONLY as the second participant of a shared booking, and whose own bookings are
at clinic B, is not linked to A. A's care-team therapist sees that shared booking (0092
follows both slots) but not the ficha or the registos. It is the narrower answer, never
the wider one (`NEXT-AFTER-0097_care02a_care_team_reads.sql:108-128`).

**The new helper, and why it is new.** `viewer_care_team_patient_ids_at_my_clinics()`
(`NEXT-AFTER-0097_care02a_care_team_reads.sql:302-348`) reads the team through 0091's
own `viewer_care_team_patient_ids()`, so "on the live care team" has one definition,
and keeps the patients linked on the basis above. It is nullary, so `(SELECT f())` is an
InitPlan evaluated once per statement (the 0073, 0074 and 0091 shape); SECURITY DEFINER,
because as the caller it would read `patient_care_team` through the very SELECT policy
that calls it; every table read inside it is tenant-filtered on `jwt_tenant_id()`
(`:224-245`). Three functions are deliberately NOT edited (`:167-192`):
`clinical_therapist_sees_patient` also feeds the INSERT, UPDATE and DELETE policies of
`clinical_records`, so a care-team disjunct there would hand every assigned therapist
UPDATE and DELETE on colleagues' registos; `viewer_care_team_patient_ids` is what 0092's
appointment arm calls, and the patient-level basis inside it would change 0092 too;
`clinical_admin_sees_patient` is correlated (one call per row), and the helper computes
the same basis once per statement instead.

**Where it goes.** The helper is the care-team disjunct of the therapist arm of
`patients_select` (R1, `:350-374`), of `clinical_records_select` (R2, `:376-397`, SELECT
only) and of `patient_care_team_select` (R4, `:421-437`, beside the own-row term).
`patient_care_team_insert` (R3, `:399-419`) is unchanged from v1: a therapist inserts
only their own booking's row (`user_id` and `assigned_by` are the caller, the patient is
one they have an appointment with), and it is not limited by clinic, because the booking
itself is the link.

**Two terms beyond the letter of the ruling** (`:195-221`). `patient_care_team_select`'s
own-row term (`user_id = auth.uid()`) is NOT limited by clinic: the CARE-02c writer
inserts with `ON CONFLICT ... DO NOTHING` and `RETURNING`, both of which check the new
row against the SELECT policy, and a therapist not yet on the team is in neither helper
while their own row is being written. Measured on the v1 rehearsal: refused without the
term, written with it. So a therapist on a patient's live team at another clinic (T4
below) reads 0 of the patient, 0 of its registos, 0 of the other members' team rows,
and exactly one row: their own. And `patient_care_team_insert`'s therapist arm requires
`assigned_by = auth.uid()`, which is what the writer already writes.

## Before the sitting

Checked by the operator before stage 0. None of these is a block.

1. **0094, 0095, 0096 and 0097 are applied to production and merged, in that order.**
   One migration is in flight at a time (`packages/db/migrations-pending/README.md`).
   The pre-check re-proves the end state by machine: `journal_rows_before` must read
   **95**, 0093 must be in the journal by hash (arm 10), and the newest journal row
   must be 0097's, by hash and `when` (arm 11).
2. **0098 is promoted on this branch**: the rename into `packages/db/migrations/`, its
   journal entry with a `when` above 0097's, the supabase mirror, the README's Promoted
   row, and `packages/db/tests/security-definer-owner.test.ts`'s `EXPECTED_FUNCTIONS`
   gaining the new helper (`NEXT-AFTER-0097_care02a_care_team_reads.sql:274-277`).
   Stage 0 proves the rename and the journal, and STOPs until they are there.
3. **The SECURITY DEFINER count moves 26 to 27, and half of that is a GATE-CHANGE.**
   `EXPECTED_COUNT` is `packages/db/scripts/check-security-definer-owner.mjs:117`, a
   frozen gate (`.github/gate-manifest.json:10`) that CI's DB-gated job runs against the
   seeded database (`.github/workflows/db-tests.yml:199`). It moves in a GATE-CHANGE the
   owner merges by hand, which may not carry the migration, so whichever of the two
   lands first reddens that step until the other lands. 0098 is the first held
   migration since the freeze to move this count; **the order is the owner's call**
   (`NEXT-AFTER-0097_care02a_care_team_reads.sql:278-285`), and the order this document
   follows is in "Order of merges".
4. **The PR reads all required checks green on the head being applied**, except, once
   it is promoted, the two count checks "Order of merges" names. Held, it stays
   green against main's migrations. **That is measured, not inferred** (review round 2):
   the without-0098 database of round 1 held 0094 to 0097, but CI's DB-gated job builds
   from `supabase/migrations`, main's 91 migrations only, and 0094 changes the `users`
   policies that `listCareTeam` reads through. So `b13a2_fix_ci` was built the way CI's
   `supabase db reset` builds its database, `supabase/migrations` alone then
   `supabase/seed.sql`, and the three suites 0098 flips read 67 of 67 and 17 of 17 there,
   asserting the pre-0098 profile, with `check-security-definer-owner.mjs` at 26, OK (see
   "The DB-gated suites"). That database is the rehearsal container, not CI's Supabase
   stack, so the PR's first CI run is still the check this item is read off. And it stays
   honest: every DB-gated arm 0098 flips
   reads the catalogue and asserts whichever answer the database owes, never skips, and
   says which in its title or its log
   (`apps/web/lib/patients/care-team-0098-state.ts:1-45`,
   `packages/db/tests/care-team-appointment-visibility.db.test.ts:79-167`, `:512-534`).
   Both packages ask the same two questions: does the helper exist AND do all three
   SELECT policies name it (anything in between THROWS as half applied), and does any
   file in `packages/db/migrations` define it. From the promotion commit on, CI applies
   0098 and those arms assert 0098's profile; a database missing 0098 while the
   repository has it promoted THROWS in both packages, so it cannot read as a pass.
   Measured on the rehearsal: see "The DB-gated suites".
5. **This document is issued for the sitting**: `PR` is filled, the production READ ONLY
   section is written, and the sidecar is regenerated. Stages 0 to 3 STOP on the
   placeholder.
6. **The owner's dispatch names `0098_care02a_care_team_reads` and a run window that
   falls outside both clinics' opening hours**, and GREEN is launched with
   `scripts/apply-lane/osteojp-apply-settings.json`. This document carries no date
   (`CLAUDE.md` on `origin/main` at `b8c62fd5`, line 132): stage 0 and stage 1 read the Lisbon clock,
   and stage 1 also reads the clinics' own hours from the database.
7. **The owner is ready to take `held-for-apply` off and merge the PR promptly after the
   apply** (`CLAUDE.md` on `origin/main` at `b8c62fd5`, line 135: those are the owner's two clicks).
   See "The apply window" next: it is why "promptly" is part of the sitting.

## Apply before merge, and merge promptly after: the apply window

**Merged before the apply, nothing breaks and nothing new works.** The app asks the
schema whether the helper exists (`to_regprocedure`, `apps/web/lib/patients/care-team-reads-gate.ts:55-99`)
and, without it, keeps the narrow read scope (`apps/web/lib/patients/scope.ts:103-123`),
so it never names a function that is not there. A therapist's own booking row is
refused by 0091's insert policy, a refusal the writer's savepoint confines to the
care-team write while the booking stands (`apps/web/lib/admin/care-team-auto.ts:27-33`,
`:68-70`). The head resolution above is what lets this document still run from the PR's
head in that case.

**Applied and not yet merged, registo writers gate on RLS alone. That is the apply
window, and it is why the merge follows the apply promptly.** On main today, several
registo writers read their source registo with no scope but RLS and then write where
their own policy would admit them anyway: a new version (`createAddendum`,
`apps/web/lib/clinical/records.ts:514` on `origin/main`; `clinical_records_insert`
admits any therapist filing in their own name), an annulment (`annulRecord`, `:672`;
`record_annulments` is tenant-only), an attachment on a draft
(`apps/web/lib/clinical/storage.ts:54` and `:115` on `origin/main`; `attachments` is
tenant-only). Before 0098, RLS let a therapist SELECT only the registos they authored or
of a patient they treat or created. **From the apply on, it also lets a care-team
therapist at the patient's clinic SELECT a colleague's registo, and each of those
writers widens with it** (the reasoning is `apps/web/lib/patients/scope.ts:132-140`, in
this PR). This PR's app half closes it: every such writer reads its source row under
`therapistRegistoWriteScope`, the pre-0098 reach (`scope.ts:125-148`). Until that code is
deployed, nothing but RLS stands there.

What bounds the window: main's registo list and registo page still read under the
narrow scope (`origin/main:apps/web/lib/clinical/records.ts:110` and `:171`), so those
screens do not offer a colleague's registo to a care-team therapist, and each writer
above takes a registo id as its input; and the sitting runs while both clinics are
closed. **The window closes when the production deployment of the merge commit is
live, not at the merge click** (a merge to main is a production deploy). The report of
the sitting names the apply time and the deploy time.

## Order of merges

**The owner ruled on 2026-09-27: "0098 app half as its own PR merging first."** CARE-02a
ships as two PRs, in this order:

1. **The app-half PR merges first**: branch `care/0098-app-half-care-team-reads`, the
   `apps/web` code and its tests, no migration. Tier B: armed at open once its REVIEWER
   returns PASS, and squash-merged on green.
2. **GREEN applies 0098 from this document**, after 0094 to 0097 are promoted, applied
   and merged ("Before the sitting").
3. **This PR merges after the apply**, held until then with `held-for-apply`.

**What merging the app half first changes for the sitting.** Measured on 2026-09-27 on a
throwaway built as CI's `supabase db reset` builds its database (`supabase/migrations` of
`origin/main` at `b8c62fd5` alone, then `supabase/seed.sql`): every `apps/web` DB-gated
suite passes on the app half, 401 of 401, and the two care-team suites print "0098 NOT
APPLIED ... This run proves nothing about 0098 itself". On production, from the app
half's deploy to the apply:

- **Reads keep the narrow scope.** The helper is asked about first and is absent, so no
  statement names it; "absent" is asked again each minute, so the apply widens the read
  scope within a minute of stage 1, with no redeploy.
- **A therapist's own booking tries its care-team row and is refused.** That write is not
  behind the helper question: 0091's insert policy refuses it, the writer's savepoint
  confines the refusal, the booking stands, and one line is logged per such booking
  ("care-team: the automatic care-team write failed and was rolled back to its
  savepoint; the booking itself is unaffected"). Expected until the apply; it stops there.
- **The apply window of the section above is closed before the apply.** That section was
  written when one PR carried both halves. With the app half deployed, every registo
  writer already reads its source under `therapistRegistoWriteScope` when 0098 lands.
  That holds only if the app half's production deployment is live, so the operator reads
  the commit status of the app half's merge commit on `main` before stage 0, and does not
  sit without it. "Merge promptly after" still holds for this PR: production must not run
  ahead of `main` for longer than the sitting.

**This branch keeps the app half's files, byte for byte.** Every file under `apps/` here
is identical to the app-half PR's head, so the two PRs cannot conflict: once the app half
merges and `main` is merged in here, those files carry the same change on both sides and
leave this PR's diff. Until then this branch passes on its own. If the app half changes in
review before it merges, the same bytes are copied here.

**The SECURITY DEFINER count: a GATE-CHANGE, merged together with this PR, just before
it.** Promoting 0098 raises the count of SECURITY DEFINER functions in `public` from 26
to 27. `EXPECTED_COUNT` is `packages/db/scripts/check-security-definer-owner.mjs:117`, a
frozen gate (`.github/gate-manifest.json:10`), so it moves only in a PR titled
`GATE-CHANGE` that changes the count and the manifest and nothing else, is never armed,
and is merged by the owner by hand. Two required checks read it: the DB-gated job's
count step (`.github/workflows/db-tests.yml:199`), which runs before every suite in that
job, and the unit run's `packages/db/tests/security-definer-owner.test.ts`, whose arms at
`:96` and `:207` hold `EXPECTED_FUNCTIONS` and the owner pins in `packages/db/migrations`
to `EXPECTED_COUNT`. Whichever of the two PRs lands alone reddens both checks, on `main`
and on every open PR, until the other lands. The order this document follows:

1. **This PR is promoted** (the rename, the journal, the mirror, `EXPECTED_FUNCTIONS`).
   From that commit it reads red on those two checks, on the count: the DB-gated job
   prints `expected exactly 26 SECURITY DEFINER function(s) in public, found 27` and then
   runs no suite, and the unit run fails the two count arms. **This qualifies "Before the
   sitting" item 4**: on the promoted head, "all required checks green" means every
   check but those two, each read off its log as a count failure and nothing else. The
   suites' evidence for that head is the unpromoted head's CI run (the pre-0098 profile)
   and the rehearsal (0098's).
2. **GREEN applies 0098**, stages 0 to 3.
3. **The owner merges the GATE-CHANGE** by hand. Its own run reads the same two checks
   red the other way round (26 found, 27 expected), by construction.
4. **`main` is merged into this PR** and every check runs again, green, the DB-gated
   suites asserting 0098's profile on CI's own database for the first time.
5. **The owner takes `held-for-apply` off and merges this PR.**

`main` reads red on the count from step 3 to step 5, one CI run. The other two orders are
refused. This PR first would merge a migration past a red required check whose job never
ran a suite on the promoted head. The GATE-CHANGE before the apply would keep `main` red
through the sitting, and for as long as a STOP holds it. **Step 3 merges a PR whose
required checks read red, and so does every other order**: whether branch protection lets
the owner do that is his setting, not read here.

## Undoing 0098: a new migration, policies first, the helper last

**It is not reversible by editing it.** Once applied, 0098's bytes are the hash drizzle's
journal holds, so an undo is a NEW numbered migration, ruled onto the Tier C list like
any other, rehearsed, and applied by GREEN; never a hand edit on production (the rule
`docs/migration-apply-0092.md:708-710` states for 0092). **It runs in two steps, in this
order, and the order is the safety.**

**Step 1: restore the four policy expressions, and leave the helper in place.** The undo
migration's `ALTER POLICY` statements restore each expression from the file 0098 read it
from (`NEXT-AFTER-0097_care02a_care_team_reads.sql:139-151`): `patients_select` from
`0074_confirm_writers_and_therapist_set.sql:222-242`, `clinical_records_select` from
`0045_clinical_records_location_rls.sql:221-240`, `patient_care_team_select` and
`patient_care_team_insert` from `0091_care_team.sql:108-124`. This document's pre-check
arms 1 to 4 pin exactly those four expressions by md5, so the undo's own post-check can
assert them. Step 1 does NOT drop `viewer_care_team_patient_ids_at_my_clinics()`.

**Why the helper must outlive the app half.** The app asks whether the helper exists and,
once the answer is "present", keeps it for the life of each server process and never
asks again (`apps/web/lib/patients/care-team-reads-gate.ts:46-51`, `:89-99`). From then
on every therapist READ of the ficha, the `/patients` list, the registos and Documentos
names the helper in its SQL (`apps/web/lib/patients/scope.ts:112-123`). Dropped under a
running deployment, each of those reads raises 42883 until every process has restarted.
With the policies restored and the helper still there, nothing errors: the app's read
scope still names the care-team patients, and on `patients` and `clinical_records` RLS
no longer admits them, so the ficha, the list and the registos show the pre-0098 answer.
Documentos is the one read RLS does not back (`attachments` is tenant-only, the N5
wave's): between step 1 and the app revert the Documentos reader still admits a team
patient at the therapist's clinic, exactly as it does while 0098 stands and no more, and
the screen does not reach it, because the ficha behind that tab now 404s. The app revert
closes it.

**Step 2: only after the app half is reverted AND that deployment is live**, a further
migration drops the helper with a plain `DROP FUNCTION`, never `CASCADE`. Measured on the
rehearsal (`b13a2_fix_s98`, inside a transaction rolled back): while any policy still
names the helper, the plain drop is refused ("cannot drop function ... because other
objects depend on it", naming `clinical_records_select`, `patients_select` and
`patient_care_team_select`), which is the check that step 1 really happened; `CASCADE`
drops those three SELECT policies with it, and a table with RLS enabled and no SELECT
policy returns nothing to any staff session. Step 2 also moves the SECURITY DEFINER
count back from 27 to 26, which is a GATE-CHANGE (see "Before the sitting", item 3).

**What step 1 costs.** A therapist's own booking row (B7) is refused again by 0091's
insert policy, and the writer's savepoint confines the refusal to the care-team write
while the booking stands (`apps/web/lib/admin/care-team-auto.ts:27-33`, `:68-70`): the
same state as merged-before-apply. The apply window's concern does not arise: RLS
narrows back, so no registo writer reaches further than it did before 0098.

## What the promotion fills

The lane that promotes 0098 fills these and regenerates the sidecar. GREEN fills
nothing: a GREEN session that meets a placeholder has been handed a document that is
not issued, and stops.

| Value | Where | Placeholder today | Filled with |
|---|---|---|---|
| `PR` | stages 0, 1, 2, 3 | `NOT-YET-OPENED` | the PR number, for the `refs/pull/<PR>/head` fallback |
| "Measured on production, READ ONLY" | the section of that name | NOT YET MEASURED | the pre-check and the stage 1 pick, both READ ONLY, run before issue |
| the sidecar | `docs/migration-apply-0098.sha256` | this revision's digest | the issued revision's digest |

Nothing else in the blocks changes at promotion. **The subjects are not filled in**: v1
of this document named them at promotion; v2 has GREEN pick them at the sitting by a rule
this document carries, so they cannot go stale between issue and sitting. If a pinned
check file, the migration or a pinned program changes before the sitting, its pin
changes with it and the rehearsal arms that read it are re-run.

## STAGE 0: verify the promotion, the number and the clock

**This stage PROVES the promotion; it never performs it.** It reads no database.

```
(
set -eo pipefail
SHA=fbf8cad1dc959a600b0e8b3ccffb7225e2295919e5dfe08432301faf6b5e9c45
BRANCH=care/0098-CARE-02a-care-team-reads
PR=NOT-YET-OPENED
MIG=packages/db/migrations/0098_care02a_care_team_reads.sql
PEND=packages/db/migrations-pending/NEXT-AFTER-0097_care02a_care_team_reads.sql
DOCPIN=docs/migration-apply-0098.sha256

echo "--- the Lisbon clock: a sitting runs only while both clinics are closed"
LT=$(TZ=Europe/Lisbon date +%H%M)
echo "${LT}" | grep -qE '^[0-9]{4}$' || { echo "STOP: the Lisbon clock did not read as HHMM"; exit 1; }
awk -v t="${LT}" 'BEGIN { if ((t + 0) < 800 || (t + 0) >= 2100) exit 0; exit 1 }' || { echo "STOP: it is ${LT} in Lisbon. This sitting runs only before 08:00 or from 21:00 Lisbon time, while both clinics are closed"; exit 1; }
echo "Lisbon ${LT}: outside 08:00 to 21:00"

echo "${PR}" | grep -qE '^[0-9]+$' || { echo "STOP: PR is still a placeholder. This document is not issued for a sitting: 0098 is HELD"; exit 1; }

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
git fetch origin --prune
if git rev-parse -q --verify refs/remotes/origin/${BRANCH} > /dev/null; then PIN=$(git rev-parse refs/remotes/origin/${BRANCH}); else echo "the branch is gone from origin: reading the head of PR ${PR}"; git fetch -q origin refs/pull/${PR}/head; PIN=$(git rev-parse FETCH_HEAD); fi
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
echo "running from ${PIN}"
git checkout -q --detach ${PIN}

test -f ${DOCPIN} || { echo "STOP: the document pin is not on disk"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one"; exit 1; }

test -f ${MIG} || { echo "STOP: 0098 is not on disk; the promotion is not on this branch, and 0098 is still HELD"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA}" ] || { echo "STOP: 0098 is not the approved body"; exit 1; }
test ! -f ${PEND} || { echo "STOP: the pending copy still exists, so the rename did not happen"; exit 1; }
N98=$(find packages/db/migrations -maxdepth 1 -name '0098_*.sql' | wc -l | tr -d ' ')
[ "${N98}" = 1 ] || { echo "STOP: ${N98} files claim migration number 0098, not 1"; exit 1; }
N97=$(find packages/db/migrations -maxdepth 1 -name '0097_*.sql' | wc -l | tr -d ' ')
[ "${N97}" = 1 ] || { echo "STOP: ${N97} files claim migration number 0097, not 1. 0098 follows exactly one 0097"; exit 1; }

node -e 'const e = require("./packages/db/migrations/meta/_journal.json").entries; const a = e[e.length - 2]; const b = e[e.length - 1]; console.log("journal: " + e.length + " entries, then idx " + a.idx + " " + a.tag + " when " + a.when + ", then idx " + b.idx + " " + b.tag + " when " + b.when); if (e.length === 96 && a.idx === 94 && /^0097_/.test(a.tag) && b.idx === 95 && b.tag === "0098_care02a_care_team_reads" && b.when > a.when) process.exit(0); console.log("STOP: the journal must end with 0097 at idx 94 and then 0098_care02a_care_team_reads at idx 95, 96 entries, with a strictly greater when"); process.exit(1)'

pnpm db:check-journal
echo "PROMOTION AND NUMBER VERIFIED"
)
```

**EXPECT: `PROMOTION AND NUMBER VERIFIED`.** Before it: `Lisbon <HHMM>: outside 08:00
to 21:00`; `running from <sha>`; `journal: 96 entries, then idx 94 0097_... when <W97>,
then idx 95 0098_care02a_care_team_reads when <W98>`; and `pnpm db:check-journal`
printing **96 `.sql` files match 96 journal entries** in order, `when` strictly
increasing, the supabase mirror matching by CONTENT. Stage 1 re-proves the migration
by sha256 through `verified-migrate.mjs`.

**The promoted file's own header will still read "RULED NUMBER 0098. NO NUMBER IN THIS
FILE NAME YET, BY CONSTRUCTION"** (`:13`). That is stale after the rename, and it stays
stale on purpose: a promotion does not touch one byte of the file, which is the only
reason the sha256 above can pin anything. Read the header as a record of when the file
was authored, and the README's Promoted table for where it sits.

**The clock.** Both clinics were ruled to 08:00 to 21:00 on every open day
(`docs/data-op-location-hours.md:18`, AGENDA-2100), so a Lisbon time before 08:00 or
from 21:00 is outside every ruled opening hour. The hours are data, not code: stage 1
reads `locations.opens_at` and `closes_at` READ ONLY right before the apply and STOPs
if any active clinic is open by its own row, so an hours change after that ruling is
caught there.

## What is new here, because 0098 is not shaped like 0093

0093 CREATED a table, so its pre-check proved things ABSENT and its post-check
asserted deltas. **0098 creates one function and alters four policies**: 0092's ALTER
shape four times over, and 0091's helper contract once.

- **The pre-check proves each of the four policies PRESENT and exactly as main's
  migrations leave it**, by the md5 of its rendered expression (arms 1 to 4:
  `patients_select` as `0074:222-242` leaves it, `clinical_records_select` as
  `0045:221-240`, the two care-team policies as `0091:108-124`). `ALTER POLICY ...
  USING` replaces whatever expression it finds, so a policy somebody edited by hand
  would be overwritten without a word, and one already carrying 0098's arm would mean
  0098 had run outside the journal. Both STOP here, before the apply.
- **It proves the new helper's name is FREE** (arm 13), because `CREATE OR REPLACE`
  would silently take over a same-named function somebody else made.
- **It pins the eleven OTHER policies on the three tables by one md5** (arm 5), because
  0098 relies on them NOT moving: the writes of `patients` and `clinical_records` and
  `patient_care_team_update` are what keep a care-team-only therapist writing nothing;
  and **the thirteen policies on the five tables 0098 leaves to the N5 wave** by another
  (arm 14).
- **It pins the five helpers** (arm 7): the three the new helper and the new arms call
  or reproduce, `viewer_care_team_patient_ids()`, `viewer_location_ids()` and
  `clinical_admin_sees_patient()`; the insert arm's `viewer_treated_patient_ids()`; and
  the one 0098 must NOT touch, `clinical_therapist_sees_patient()`.
- **The post-check asserts the new function exactly** (verdict 12: one of it, nullary,
  `uuid[]`, `sql`, DEFINER, STABLE, `search_path=public`, owner `postgres`, body by md5)
  **and its grants** (verdict 13: EXECUTE for `authenticated`, none for `anon`,
  `service_role`, `patient` or PUBLIC), each new policy expression by md5, the flat
  counts, and three "nothing else moved" md5s carried from the pre-check: every other
  policy, every other function, every other grant.
- **The behaviour check runs TWICE, as an A/B on production itself,** with the subjects
  stage 1 picks. Before the apply it must FAIL on exactly the arms that see what 0098
  opens; after it, the same file with the same subjects must read no FAIL.

There are **five** carries: `journal_rows_before`, `policies_before`,
`other_policies_md5`, `functions_md5`, `grants_md5`. No carry's name is a substring of
another's or of any other row's `check` column (read off the pre-check file,
`scripts/db/precheck-0098-care02a.sql:218-281`), because stage 2's `carry()` matches
column 1 with `index()`. The pre-check also takes two inputs that are not carries,
`prev_hash` and `prev_when`, and refuses to run without them (`:91-102`).

## The behaviour subjects on production

`scripts/db/behaviour-care02a-readonly.sql` takes six ids and picks none (`:21-61`).
**On production GREEN picks them, in stage 1, READ ONLY, by the rule stage 1 carries as
`PICK`, and GREEN chooses nothing itself**: for each slot the rule takes the LOWEST id
that meets it, so two sittings on the same data pick the same people. The rule is the
behaviour file's own slot definitions (`:27-50`, `:458-516`) written against the tables:

| Slot | The rule picks, in P's tenant | Asserted by |
|---|---|---|
| P | among live patients (`deleted_at` null) with at least two live care-team rows for which T1, T2 and T3 are all met, preferring in order a P that furnishes T4, then one that furnishes N, then the lowest id | S0 |
| T1 | an active therapist, not a shared resource, on P's live team, linked to P (0045's basis above), with no appointment with P in either slot, who did not create P | S1 |
| T2 | an active therapist, not a shared resource, with an appointment with P, who authored a registo of P, **on P's live team and linked to P** | S2, S0, and the profile (C2) |
| T3 | an active therapist, not a shared resource, not on P's live team, no appointment with P, did not create P, authored no registo of P | S3 |
| T4 | an active therapist, not a shared resource, on P's live team, **NOT linked to P**, no appointment with P, did not create P, authored no registo of P. **The clinic limit's own arm** | S4 |
| N | an active admin or receptionist, not a shared resource, on P's live team and linked to P. The arm that sees a care-team term moved outside the therapist role guard | S5 |

**T4 and N are picked independently** (review round 2). The rule of round 1 passed T4
only when the same patient also had an N, an admin or receptionist, on its live team.
A care-team row is written by the booking writer for the therapist a booking names, or
by owner or reception through the ficha's card, so a non-therapist on a team is the
exception, and the clinic limit's own arms would most likely have read VACUOUS at the
sitting even where a T4 existed. Now each slot is passed
when the chosen P furnishes it and `none` otherwise, and the rule prefers a P with a T4.
So the run has three, four or five actors, and the blocks accept exactly these four
shapes, each measured on the rehearsal (below):

| T4 | N | Actors | BEFORE | AFTER | VACUOUS, both times |
|---|---|---|---|---|---|
| picked | picked | 5 | `17 OK / 0 VACUOUS / 15 FAIL` | `32 OK / 0 VACUOUS / 0 FAIL` | none |
| picked | `none` | 4 | `16 OK / 2 VACUOUS / 14 FAIL` | `30 OK / 2 VACUOUS / 0 FAIL` | S5 N1 |
| `none` | picked | 4 | `16 OK / 4 VACUOUS / 12 FAIL` | `28 OK / 4 VACUOUS / 0 FAIL` | S4 P5 R4 C5 |
| `none` | `none` | 3 | `15 OK / 6 VACUOUS / 11 FAIL` | `26 OK / 6 VACUOUS / 0 FAIL` | S4 S5 P5 R4 C5 N1 |

A slot passed as `none` reads VACUOUS on its arms, never OK (`:51-55`). **When
production holds no T4 on the day, the clinic limit's own arms (S4 P5 R4 C5) are
rehearsal-only, and stage 1 says so by printing `T4 none`.** The limit is then carried
on production by P4 and C4 only if one of T1 to T3 happens to sit on a team at a clinic
its patient is not linked to (they compare each therapist's reads with the rule over
every team it is on), by H1 for P, by post-check verdicts 1 to 3 and 12 (the exact
expressions and the helper's body), and by the rehearsal's T4 arms below. The READ
ONLY run before issue records which shape production furnishes.

**T2 on P's live team is part of the rule, not an arm.** S2 does not require it. With
it, C2 has a population and reads FAIL before and OK after, and the profiles are the
rehearsed ones. Without it C2 reads VACUOUS (`:111-115`), which is none of the four
measured profiles.

**A missing subject is a FAIL, never a pass and never a silent skip.** Two ways:

- **The rule finds no P that furnishes T1, T2 and T3.** Stage 1 STOPs on
  `a MISSING SUBJECT` after the pre-check and before any behaviour run or apply. Nothing
  was applied. Report it; never pick by hand and never edit `PICK` at the sitting. (A
  pick that ERRORs halts the block the same way, with psql's own error.)
- **A subject is not what its slot says when the behaviour file reads it** (the data
  moved between the pick and the run, or the rule and the file disagree). Its S arm
  reads FAIL, and so does every arm after I1 (`:94-101`, `:694-696`), so the FAIL set
  differs from the rehearsed one and stage 1 halts **before anything is applied**. That
  is the point of running the instrument first.

**How the ids reach stage 3.** Stage 1 writes the one line it picked
(`<patient>|<T1>|<T2>|<T3>|<T4 or none>|<N or none>`) to `/tmp/0098-subjects.out`, under
`umask 077`, and prints only the five staff slots. Stage 3 reads that file, never picks
again, and first checks that stage 1's BEFORE transcript named exactly its actors. The
patient id never reaches a transcript: the behaviour file keeps it out by design
(`:208-215`), and so do the blocks.

**The ACTOR lines are checked by machine.** The file prints
`ACTOR id <uuid> | role <slug> | chosen passed in with -v <slot>_id` once per actor
before any verdict, and none for a slot passed as `none` (`:208-215`). Stages 1 and 3
require exactly the picked actors, in slot order, once each.

**OPEN ITEM: whether production holds a T1 at all is not measured.** A care-team row is
written by the CARE-02c booking writer, for a therapist the booking names, who then HAS
an appointment with the patient and so cannot be T1; or by owner or reception through
the ficha's care-team card. If no patient has an assigned-only therapist at their own
clinic on the day, the rule finds no P and stage 1 STOPs before anything is applied.
Making one is a production write through the app: the owner's or reception's click,
never this lane's and never GREEN's. The READ ONLY run before issue ("Measured on
production") answers this before a sitting is scheduled.

**The pick and the behaviour check read outside row level security for their
comparands.** Both set `row_security = off` for their unfiltered reads (the pick in its
block, the file at `:273`), so on a connection that does not bypass row level security
on these tables they ERROR rather than read a filtered count. On production the tables
are owned by `postgres` with RLS ENABLED, not FORCED (`docs/runbook-prod-migrations.md:104`,
`:157-160`), which is the case where they read. **No file that sets
`row_security = off` has run on production yet**; the READ ONLY run before issue is the
first measurement. If it errors at the sitting, stage 1 halts before the apply.

## HEAD CHECK: run this FIRST, and read it with your eyes

Paste this on its own, before stage 1, and again before stage 2. It writes nothing and
touches no database.

```
(
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
echo "head of the branch this document applies from (a failure below means the branch is gone, and the stages read refs/pull/<PR>/head):"
git rev-parse -q --verify refs/remotes/origin/care/0098-CARE-02a-care-team-reads || echo "the branch is gone from origin"
)
```

**Compare the sha it prints with the one STAGE 0 printed as `running from`.** That is
the comparand: stage 0 is where the promotion, the number, the sidecar and the journal
were verified.

**This branch carries the label `held-for-apply`,** so `.github/workflows/auto-update-prs.yml`
does not merge main into it, and the owner takes the label off (`CLAUDE.md` on
`origin/main` at `b8c62fd5`, line 135). A moved head still means opposite things depending on WHEN:

- **Before stage 1 has applied:** the sitting starts again from stage 0.
- **After stage 1 has applied: NEVER go back to stage 1.** Go on to stage 2 on the new
  head. Stage 2 asserts the migration, the post-check and the guard by sha256, so a
  merge of main that left those bytes alone changes nothing it reads, and one that
  changed them halts it. Both shas go on the SR-51 card.

**Two halts that case can produce, named so they are not improvised around.** Two
pinned files live on main, not only on this branch: `scripts/assert-production-target.mjs`
(pinned by stages 1, 2 and 3) and `packages/db/scripts/verified-migrate.mjs` (stage 1).
If a merge of main changes the guard after stage 1 has applied, stage 2 or stage 3
stops on `the target guard on disk is not the approved file`, with production already
applied. The applied-marker is good for **60 minutes**. Do not edit a pin and do not
re-run stage 1. Report it to the owner with both shas; the post-check and the
behaviour check are READ ONLY and can be re-issued against the new guard.

Stage 1 refuses to start while a fresh applied-marker exists, and it never touches the
previous transcripts until a new pre-check, a new pick AND a new before-run have passed.

## STAGE 1: the clock, pre-flight, pre-check, the pick, the instrument BEFORE, apply

```
(
set -eo pipefail
umask 077
SHA0098=fbf8cad1dc959a600b0e8b3ccffb7225e2295919e5dfe08432301faf6b5e9c45
SHAPRE=d429c81f75e4e54c27c8c21c9184cc80a2dd86e03b1da91024224dd6533bef70
SHABEHAVIOUR=b7a53c223edd54af9ef0fca344e00b6c0e5eb4f4202a4752ccf8e7e4e8c75d51
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
BRANCH=care/0098-CARE-02a-care-team-reads
PR=NOT-YET-OPENED
U='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
PICK="with cand as (select ct.tenant_id, ct.patient_id from public.patient_care_team ct join public.patients p on p.id = ct.patient_id and p.tenant_id = ct.tenant_id and p.deleted_at is null where ct.removed_at is null group by ct.tenant_id, ct.patient_id having count(*) >= 2), f as (select c.patient_id as pid, u.id::text as uid, r.slug, exists (select 1 from public.patient_care_team t where t.tenant_id = c.tenant_id and t.patient_id = c.patient_id and t.user_id = u.id and t.removed_at is null) as on_team, exists (select 1 from public.appointments a where a.tenant_id = c.tenant_id and (a.patient_id = c.patient_id or a.patient_2_id = c.patient_id) and (a.practitioner_id = u.id or a.practitioner_2_id = u.id)) as treats, exists (select 1 from public.patients p where p.id = c.patient_id and p.created_by = u.id) as created, (select count(*) from public.clinical_records cr where cr.tenant_id = c.tenant_id and cr.patient_id = c.patient_id and cr.practitioner_id = u.id) as authored, (exists (select 1 from public.appointments a join public.staff_locations s on s.location_id = a.location_id and s.tenant_id = a.tenant_id and s.user_id = u.id where a.tenant_id = c.tenant_id and a.patient_id = c.patient_id) or (not exists (select 1 from public.appointments a where a.tenant_id = c.tenant_id and a.patient_id = c.patient_id and a.location_id is not null) and exists (select 1 from public.patients p join public.staff_locations s on s.location_id = p.primary_location_id and s.tenant_id = p.tenant_id and s.user_id = u.id where p.id = c.patient_id and p.tenant_id = c.tenant_id))) as linked from cand c join public.users u on u.tenant_id = c.tenant_id and u.is_active and not u.is_shared_resource join public.roles r on r.id = u.role_id), s as (select pid, min(uid) filter (where slug = 'therapist' and on_team and linked and not treats and not created) as t1, min(uid) filter (where slug = 'therapist' and treats and authored > 0 and on_team and linked) as t2, min(uid) filter (where slug = 'therapist' and not on_team and not treats and not created and authored = 0) as t3, min(uid) filter (where slug = 'therapist' and on_team and not linked and not treats and not created and authored = 0) as t4, min(uid) filter (where slug in ('admin', 'reception') and on_team and linked) as n from f group by pid) select pid::text || '|' || t1 || '|' || t2 || '|' || t3 || '|' || coalesce(t4, 'none') || '|' || coalesce(n, 'none') from s where t1 is not null and t2 is not null and t3 is not null order by (t4 is not null) desc, (n is not null) desc, pid limit 1"

echo "--- the Lisbon clock, before anything else"
LT=$(TZ=Europe/Lisbon date +%H%M)
echo "${LT}" | grep -qE '^[0-9]{4}$' || { echo "STOP: the Lisbon clock did not read as HHMM"; exit 1; }
awk -v t="${LT}" 'BEGIN { if ((t + 0) < 800 || (t + 0) >= 2100) exit 0; exit 1 }' || { echo "STOP: it is ${LT} in Lisbon. This sitting runs only before 08:00 or from 21:00 Lisbon time, while both clinics are closed"; exit 1; }
echo "Lisbon ${LT}: outside 08:00 to 21:00"

echo "--- the value the promotion fills. A placeholder means this document is not issued: 0098 is HELD"
echo "${PR}" | grep -qE '^[0-9]+$' || { echo "STOP: PR is still a placeholder. This document is not issued for a sitting"; exit 1; }

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/0098-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 ALREADY APPLIED in this sitting. Do not run it again. Go to stage 2"; exit 1; }
rm -f /tmp/0098-precheck.new /tmp/0098-subjects.new /tmp/0098-behaviour-before.new

echo "--- ASSERTION 1, THE HEAD. The sha printed as applying from MUST equal the one the HEAD CHECK showed."
git fetch origin --prune

echo "--- pre-flight: the tree holds nothing but the checkout"
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
if git rev-parse -q --verify refs/remotes/origin/${BRANCH} > /dev/null; then PIN=$(git rev-parse refs/remotes/origin/${BRANCH}); else echo "the branch is gone from origin: reading the head of PR ${PR}"; git fetch -q origin refs/pull/${PR}/head; PIN=$(git rev-parse FETCH_HEAD); fi
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
echo "applying from ${PIN}"

echo "--- SR-58: this stage checks out its own ref and proves the files"
git checkout -q --detach ${PIN}
test -f docs/migration-apply-0098.sha256 || { echo "STOP: the document pin is not on disk"; exit 1; }
shasum -a 256 -c docs/migration-apply-0098.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f packages/db/migrations/0098_care02a_care_team_reads.sql || { echo "STOP: 0098 is not on disk"; exit 1; }
test -f scripts/db/precheck-0098-care02a.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/behaviour-care02a-readonly.sql || { echo "STOP: the behaviour check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
N98=$(find packages/db/migrations -maxdepth 1 -name '0098_*.sql' | wc -l | tr -d ' ')
[ "${N98}" = 1 ] || { echo "STOP: ${N98} files claim migration number 0098, not 1"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0098_care02a_care_team_reads.sql | cut -d' ' -f1)" = "${SHA0098}" ] || { echo "STOP: 0098 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0098-care02a.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-care02a-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- 0097 as this branch carries it: the pre-check's prev_hash and prev_when, read here and never typed"
N97=$(find packages/db/migrations -maxdepth 1 -name '0097_*.sql' | wc -l | tr -d ' ')
[ "${N97}" = 1 ] || { echo "STOP: ${N97} files claim migration number 0097, not 1"; exit 1; }
F97=$(find packages/db/migrations -maxdepth 1 -name '0097_*.sql')
PREVHASH=$(shasum -a 256 ${F97} | cut -d' ' -f1)
PREVWHEN=$(node -e 'const e = require("./packages/db/migrations/meta/_journal.json").entries.filter((x) => /^0097_/.test(x.tag)); process.stdout.write(e.length === 1 ? String(e[0].when) : "")')
echo "${PREVHASH}" | grep -qE '^[0-9a-f]{64}$' || { echo "STOP: 0097's sha256 did not read"; exit 1; }
echo "${PREVWHEN}" | grep -qE '^[0-9]{13}$' || { echo "STOP: 0097's journal when did not read as exactly one 13-digit value"; exit 1; }
echo "0097: ${F97}, sha256 ${PREVHASH}, journal when ${PREVWHEN}"

echo "--- the production target, asserted by the guard, not by the prompt"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the clinics' own hours, READ ONLY: no active clinic may be open now"
CL=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) filter (where is_active and (now() at time zone 'Europe/Lisbon')::time >= opens_at and (now() at time zone 'Europe/Lisbon')::time < closes_at) || ' of ' || count(*) filter (where is_active) from public.locations" | tail -1)
echo "active clinics open now by their own hours: ${CL}"
awk -v s="${CL}" 'BEGIN { n = split(s, a, " "); if (n == 3 && a[1] == "0" && a[2] == "of" && (a[3] + 0) >= 1) exit 0; exit 1 }' || { echo "STOP: a clinic is open now by its own hours, or no active clinic was read [${CL}]. The sitting waits until both are closed"; exit 1; }

echo "--- the pre-check. READ ONLY. Its transcript IS the carry, so it is kept"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v prev_hash=${PREVHASH} -v prev_when=${PREVWHEN} -f scripts/db/precheck-0098-care02a.sql 2>&1 | tee /tmp/0098-precheck.new
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0098-precheck.new && { echo "STOP: a pre-check verdict read FAIL. Nothing was applied and no earlier transcript was touched"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0098-precheck.new || true)
[ "${OKS}" = 20 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 20"; exit 1; }

echo "--- the behaviour subjects, picked READ ONLY by the rule in PICK: the lowest id that meets each slot. GREEN chooses nothing and substitutes nothing"
SUBJ=$(psql "${DATABASE_URL_DIRECT}" -X -q -At -v ON_ERROR_STOP=1 -c "begin read only" -c "set local row_security = off" -c "${PICK}" | tail -1)
[ -n "${SUBJ}" ] || { echo "STOP: a MISSING SUBJECT. No live patient furnishes T1, T2 and T3 by the rule in PICK. Nothing was applied. Report it; never pick by hand"; exit 1; }
echo "${SUBJ}" | grep -qxE "${U}[|]${U}[|]${U}[|]${U}[|](${U}|none)[|](${U}|none)" || { echo "STOP: the pick did not read as one patient and five slots"; exit 1; }
PATIENT=$(echo "${SUBJ}" | cut -d'|' -f1)
T1=$(echo "${SUBJ}" | cut -d'|' -f2)
T2=$(echo "${SUBJ}" | cut -d'|' -f3)
T3=$(echo "${SUBJ}" | cut -d'|' -f4)
T4=$(echo "${SUBJ}" | cut -d'|' -f5)
N=$(echo "${SUBJ}" | cut -d'|' -f6)
echo "${SUBJ}" > /tmp/0098-subjects.new
echo "subjects picked: T1 ${T1}, T2 ${T2}, T3 ${T3}, T4 ${T4}, N ${N}, and one patient (used, never printed)"
if [ "${T4}" = none ]; then K4=0; else K4=1; fi
if [ "${N}" = none ]; then KN=0; else KN=1; fi
case "${K4}${KN}" in 11) XBEFORE="17 OK / 0 VACUOUS / 15 FAIL"; XFAIL="C1 C2 C3 C4 C5 H1 N1 P1 P4 P5 R1 R4 W5 W6 W8 "; XVAC=""; XACTORS="${T1} ${T2} ${T3} ${T4} ${N} ";; 10) XBEFORE="16 OK / 2 VACUOUS / 14 FAIL"; XFAIL="C1 C2 C3 C4 C5 H1 P1 P4 P5 R1 R4 W5 W6 W8 "; XVAC="N1 S5 "; XACTORS="${T1} ${T2} ${T3} ${T4} ";; 01) XBEFORE="16 OK / 4 VACUOUS / 12 FAIL"; XFAIL="C1 C2 C3 C4 H1 N1 P1 P4 R1 W5 W6 W8 "; XVAC="C5 P5 R4 S4 "; XACTORS="${T1} ${T2} ${T3} ${N} ";; 00) XBEFORE="15 OK / 6 VACUOUS / 11 FAIL"; XFAIL="C1 C2 C3 C4 H1 P1 P4 R1 W5 W6 W8 "; XVAC="C5 N1 P5 R4 S4 S5 "; XACTORS="${T1} ${T2} ${T3} ";; esac
echo "subject shape ${K4}${KN} (T4 then N, 1 picked, 0 none): expected BEFORE ${XBEFORE}"

echo "--- the behaviour check BEFORE the apply. READ ONLY. It must see what 0098 opens, and nothing else"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v patient_id=${PATIENT} -v t1_id=${T1} -v t2_id=${T2} -v t3_id=${T3} -v t4_id=${T4} -v n_id=${N} -f scripts/db/behaviour-care02a-readonly.sql 2>&1 | tee /tmp/0098-behaviour-before.new
grep -qE '^[[:space:]]*99[[:space:]]*\|' /tmp/0098-behaviour-before.new || { echo "STOP: the behaviour check printed no SUMMARY row before the apply"; exit 1; }
ACTORS=$(grep -E '^ACTOR id ' /tmp/0098-behaviour-before.new | awk '{print $3}' | tr '\n' ' ' || true)
[ "${ACTORS}" = "${XACTORS}" ] || { echo "STOP: the ACTOR lines must name the picked actors in slot order, once each [${XACTORS}]. They named [${ACTORS}]"; exit 1; }
FAILSET=$(grep -E '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0098-behaviour-before.new | sed -E 's/^[[:space:]]*[0-9]+[[:space:]]*\|[[:space:]]*([A-Z0-9]+)\..*/\1/' | LC_ALL=C sort | tr '\n' ' ' || true)
[ "${FAILSET}" = "${XFAIL}" ] || { echo "STOP: before the apply the behaviour check must FAIL on exactly [${XFAIL}]. It failed on [${FAILSET}]"; exit 1; }
VACSET=$(grep -E '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0098-behaviour-before.new | sed -E 's/^[[:space:]]*[0-9]+[[:space:]]*\|[[:space:]]*([A-Z0-9]+)\..*/\1/' | LC_ALL=C sort | tr '\n' ' ' || true)
[ "${VACSET}" = "${XVAC}" ] || { echo "STOP: before the apply the VACUOUS arms must be exactly [${XVAC}]. They were [${VACSET}]"; exit 1; }
PROFILE=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0098-behaviour-before.new | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
[ "${PROFILE}" = "${XBEFORE}" ] || { echo "STOP: before the apply the profile must read ${XBEFORE}. It read ${PROFILE}"; exit 1; }
echo "the instrument sees what 0098 opens: ${PROFILE}, failing on ${FAILSET}"

echo "--- only now, with a passing pre-check, a full pick and a discriminating instrument in hand, does the previous sitting's state go"
rm -f /tmp/0098-postcheck.out /tmp/0098-behaviour-after.out /tmp/0098-applied.ok /tmp/0098-subjects.out
mv /tmp/0098-precheck.new /tmp/0098-precheck.out
mv /tmp/0098-subjects.new /tmp/0098-subjects.out
mv /tmp/0098-behaviour-before.new /tmp/0098-behaviour-before.out

echo "--- the apply. It is the only writing command in this document"
node packages/db/scripts/verified-migrate.mjs --tag 0098_care02a_care_team_reads --sha256 ${SHA0098} --expect-pending 1
touch /tmp/0098-applied.ok
)
```

**EXPECT, and these are what stage 1 is read for:**

- **the clock line and `active clinics open now by their own hours: 0 of <n>`**, `n` at
  least 1. A zero with no clinic behind it would be vacuous, so the block requires both;
- **the pre-check prints `20` OK verdicts and no FAIL**, with `journal_rows_before` 95
  and arm 11 naming 0097's sha256 and `when` as the line above it printed them;
- **`subjects picked: T1 <id>, T2 <id>, T3 <id>, T4 <id or none>, N <id or none>`**, and
  no patient id anywhere; then `subject shape <T4><N> ...`, `11`, `10`, `01` or `00`;
- **the behaviour check BEFORE, exactly as the shape requires:**
  - `11`, five actors: `17 OK / 0 VACUOUS / 15 FAIL`, failing on exactly
    `C1 C2 C3 C4 C5 H1 N1 P1 P4 P5 R1 R4 W5 W6 W8`, nothing VACUOUS;
  - `10`, T4 and no N: `16 OK / 2 VACUOUS / 14 FAIL`, failing on exactly
    `C1 C2 C3 C4 C5 H1 P1 P4 P5 R1 R4 W5 W6 W8`, VACUOUS on exactly `N1 S5`;
  - `01`, N and no T4: `16 OK / 4 VACUOUS / 12 FAIL`, failing on exactly
    `C1 C2 C3 C4 H1 N1 P1 P4 R1 W5 W6 W8`, VACUOUS on exactly `C5 P5 R4 S4`;
  - `00`, three actors: `15 OK / 6 VACUOUS / 11 FAIL`, failing on exactly
    `C1 C2 C3 C4 H1 P1 P4 R1 W5 W6 W8`, VACUOUS on exactly `C5 N1 P5 R4 S4 S5`.

  Those FAILs are correct and required: they are the arms that see what 0098 opens, and H1
  among them, because the helper does not exist yet. The subject arms S0 to S3 and the
  instrument I1 must be among the OKs, and are: a FAIL on any of them changes the set,
  and the block halts with nothing applied;
- **`pending    1  [0098_care02a_care_team_reads]`.** Exactly one.

It then prints `journal    95 -> 96  (delta 1)` and
`0098_care02a_care_team_reads present by sha256: yes`. Stage 2 re-reads both from the
database rather than trusting this line.

`verified-migrate.mjs` exits **2** on a bad invocation or a missing environment
variable; **3** BEFORE drizzle runs on a missing file, a wrong sha256, a tag missing
from `_journal.json`, an already-applied migration or a pending count that is not 1,
and AFTER drizzle has run on a journal that moved by the wrong amount or moved without
the approved sha256; **4** if drizzle itself failed or on any thrown error; **5** if
drizzle reports success and the journal did not move. Exit 3 can therefore follow a
committed apply too: the rule below covers every non-zero exit after the banner.

**Exit 4 does not always mean nothing was applied.** `verified-migrate.mjs` also exits
4 on ANY thrown error, including its own journal read AFTER drizzle has committed. So:
**if stage 1 ended non-zero after the `drizzle-kit migrate` banner had printed, do not
paste stage 1 again.** Run, READ ONLY,
`cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply && node --env-file=/Users/ivan/osteojp-secrets/new-prod.env packages/db/scripts/read-applied-migrations.mjs`.
If it lists 0098 as APPLIED, production is applied and no marker exists, so stage 2
will refuse: stop and ask the owner to rule. **If it lists 0098 as NOT APPLIED,
nothing changed:** drizzle applies the file's statements and the journal row in ONE
transaction (measured for 0092 by refusing a statement part way,
`docs/migration-apply-0092.md`). 0098 is nine statements, each ended by
`--> statement-breakpoint`, the last one included, which is how 0092's file ended too.
Stop and report the exit code and the drizzle output. Do not re-run stage 1 on your
own.

## STAGE 2: post-check, carries derived from stage 1

```
(
set -eo pipefail
SHA0098=fbf8cad1dc959a600b0e8b3ccffb7225e2295919e5dfe08432301faf6b5e9c45
SHAPOST=01a1cd260fd3e1b391b85cfbce7c82ae04eafbc12c746e89e47f1aab51bae728
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
BRANCH=care/0098-CARE-02a-care-team-reads
PR=NOT-YET-OPENED

echo "${PR}" | grep -qE '^[0-9]+$' || { echo "STOP: PR is still a placeholder. This document is not issued for a sitting"; exit 1; }
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply

echo "--- ASSERTION 1, THE HEAD. Record the sha printed as checking from beside the one stage 1 applied from. If it has MOVED, carry on: never go back to stage 1 after an apply. Everything this stage reads is asserted by sha256 below."
git fetch origin --prune

echo "--- SR-58 again. This stage inherits nothing from stage 1"
if git rev-parse -q --verify refs/remotes/origin/${BRANCH} > /dev/null; then PIN=$(git rev-parse refs/remotes/origin/${BRANCH}); else echo "the branch is gone from origin: reading the head of PR ${PR}"; git fetch -q origin refs/pull/${PR}/head; PIN=$(git rev-parse FETCH_HEAD); fi
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
echo "checking from ${PIN}"
git checkout -q --detach ${PIN}
test -f packages/db/migrations/0098_care02a_care_team_reads.sql || { echo "STOP: 0098 is not on disk"; exit 1; }
test -f scripts/db/postcheck-0098-care02a.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0098_care02a_care_team_reads.sql | cut -d' ' -f1)" = "${SHA0098}" ] || { echo "STOP: 0098 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0098-care02a.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0098-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not complete an apply in this sitting"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0098-precheck.out || { echo "STOP: stage 1's transcript is missing; re-run stage 1"; exit 1; }
[ -n "$(find /tmp/0098-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0098-precheck.out; }
J=$(carry journal_rows_before)
P=$(carry policies_before)
O=$(carry other_policies_md5)
F=$(carry functions_md5)
G=$(carry grants_md5)
[ -n "${J}" ] && [ -n "${P}" ] && [ -n "${O}" ] && [ -n "${F}" ] && [ -n "${G}" ] || { echo "STOP: a carry did not parse out of the transcript"; exit 1; }
[ "${J}" = 95 ] || { echo "STOP: the carried journal_rows_before reads ${J}, not 95"; exit 1; }
echo "carries from this run: journal_before=${J} policies_before=${P} other_policies_md5=${O} functions_md5=${F} grants_md5=${G}"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0098-postcheck.out
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v policies_before="${P}" -v other_policies_md5="${O}" -v functions_md5="${F}" -v grants_md5="${G}" -v journal_rows_before="${J}" -c "begin read only" -f scripts/db/postcheck-0098-care02a.sql -c "rollback" 2>&1 | tee /tmp/0098-postcheck.out
N1213=$(grep -cE '^[[:space:]]*1[23]\. .*\|[[:space:]]*OK[[:space:]]*$' /tmp/0098-postcheck.out || true)
[ "${N1213}" = 2 ] || { echo "STOP: post-check 12 or 13 is not OK: the new helper's security, owner, body or EXECUTE is not what 0098 writes, and every therapist's read of patients now calls it. Do NOT run stage 3. Report to the owner now"; exit 1; }
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0098-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0098-postcheck.out || true)
[ "${OKS}" = 16 ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not 16"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0098 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations")
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0098}'")
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0098 is in the journal ${HN} times, not once"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0098 present by hash"

echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;"

echo "0098 APPLIED. 20/20 pre-check OK, 16/16 post-check OK, journal ${J} to ${JA}."
)
```

**EXPECT:** the carry line reads `journal_before=95`; the post-check prints `16` OK
verdicts and no FAIL, 12 and 13 among them; the journal reads `95` before and `96`
after, with 0098's sha256 in it **exactly once**; the final line reads exactly
`0098 APPLIED. 20/20 pre-check OK, 16/16 post-check OK, journal 95 to 96.`

**Verdicts 12 and 13 are read first, with their own STOP, because they are the crash
guard.** Stage 3 acts as `authenticated`, and so does every therapist's next page load:
each read of `patients` now calls the new helper. On the rehearsal image a live call to a
function the caller cannot execute, or to a helper that is SECURITY INVOKER, crashes the
backend and drops every connection on the server; that is why the rehearsal never ran a
session as `authenticated` before 12, 13 and a catalogue guard read SAFE, and why
mutations H21 and H22 below were judged by the post-check alone. If 12 or 13 is not OK,
production already carries a helper every therapist read calls: that is a report to the
owner at once, not a stage 3.

## STAGE 3: the behaviour check AFTER the apply. READ ONLY

Same file, the SAME subjects stage 1 picked and wrote down, so the two transcripts are
an A/B on the database itself. This stage never picks.

```
(
set -eo pipefail
umask 077
SHABEHAVIOUR=b7a53c223edd54af9ef0fca344e00b6c0e5eb4f4202a4752ccf8e7e4e8c75d51
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
BRANCH=care/0098-CARE-02a-care-team-reads
PR=NOT-YET-OPENED
U='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

echo "${PR}" | grep -qE '^[0-9]+$' || { echo "STOP: PR is still a placeholder. This document is not issued for a sitting"; exit 1; }

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
if git rev-parse -q --verify refs/remotes/origin/${BRANCH} > /dev/null; then PIN=$(git rev-parse refs/remotes/origin/${BRANCH}); else echo "the branch is gone from origin: reading the head of PR ${PR}"; git fetch -q origin refs/pull/${PR}/head; PIN=$(git rev-parse FETCH_HEAD); fi
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
echo "checking from ${PIN}"
git checkout -q --detach ${PIN}
test -f scripts/db/behaviour-care02a-readonly.sql || { echo "STOP: the behaviour check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-care02a-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- the subjects are stage 1's, read back and never picked again"
test -f /tmp/0098-behaviour-before.out || { echo "STOP: stage 1's BEFORE transcript is missing, so there is nothing to compare against"; exit 1; }
test -f /tmp/0098-subjects.out || { echo "STOP: stage 1's subjects file is missing. Never pick again after the apply: report it"; exit 1; }
[ "$(wc -l < /tmp/0098-subjects.out | tr -d ' ')" = 1 ] || { echo "STOP: the subjects file must hold exactly one line"; exit 1; }
SUBJ=$(head -1 /tmp/0098-subjects.out)
echo "${SUBJ}" | grep -qxE "${U}[|]${U}[|]${U}[|]${U}[|](${U}|none)[|](${U}|none)" || { echo "STOP: the subjects file does not read as one patient and five slots"; exit 1; }
PATIENT=$(echo "${SUBJ}" | cut -d'|' -f1)
T1=$(echo "${SUBJ}" | cut -d'|' -f2)
T2=$(echo "${SUBJ}" | cut -d'|' -f3)
T3=$(echo "${SUBJ}" | cut -d'|' -f4)
T4=$(echo "${SUBJ}" | cut -d'|' -f5)
N=$(echo "${SUBJ}" | cut -d'|' -f6)
if [ "${T4}" = none ]; then K4=0; else K4=1; fi
if [ "${N}" = none ]; then KN=0; else KN=1; fi
case "${K4}${KN}" in 11) XBEFORE="17 OK / 0 VACUOUS / 15 FAIL"; XAFTER="32 OK / 0 VACUOUS / 0 FAIL"; XVAC=""; XACTORS="${T1} ${T2} ${T3} ${T4} ${N} ";; 10) XBEFORE="16 OK / 2 VACUOUS / 14 FAIL"; XAFTER="30 OK / 2 VACUOUS / 0 FAIL"; XVAC="N1 S5 "; XACTORS="${T1} ${T2} ${T3} ${T4} ";; 01) XBEFORE="16 OK / 4 VACUOUS / 12 FAIL"; XAFTER="28 OK / 4 VACUOUS / 0 FAIL"; XVAC="C5 P5 R4 S4 "; XACTORS="${T1} ${T2} ${T3} ${N} ";; 00) XBEFORE="15 OK / 6 VACUOUS / 11 FAIL"; XAFTER="26 OK / 6 VACUOUS / 0 FAIL"; XVAC="C5 N1 P5 R4 S4 S5 "; XACTORS="${T1} ${T2} ${T3} ";; esac
BACTORS=$(grep -E '^ACTOR id ' /tmp/0098-behaviour-before.out | awk '{print $3}' | tr '\n' ' ' || true)
[ "${BACTORS}" = "${XACTORS}" ] || { echo "STOP: stage 1's BEFORE transcript and its subjects file do not name the same actors [${BACTORS}] [${XACTORS}]"; exit 1; }
echo "subjects from stage 1: T1 ${T1}, T2 ${T2}, T3 ${T3}, T4 ${T4}, N ${N}, and one patient (used, never printed)"

echo "--- the crash guard: stage 2's post-check of this sitting, 16 OK with 12 and 13 among them, before any session acts as authenticated"
test -f /tmp/0098-postcheck.out || { echo "STOP: stage 2's post-check transcript is missing. Run stage 2 first"; exit 1; }
[ /tmp/0098-postcheck.out -nt /tmp/0098-behaviour-before.out ] || { echo "STOP: the post-check transcript is older than stage 1's BEFORE run, so it is not this sitting's"; exit 1; }
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0098-postcheck.out && { echo "STOP: stage 2's post-check read FAIL. Do not run the behaviour check"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0098-postcheck.out || true)
[ "${OKS}" = 16 ] || { echo "STOP: stage 2's post-check printed ${OKS} OK verdicts, not 16"; exit 1; }
N1213=$(grep -cE '^[[:space:]]*1[23]\. .*\|[[:space:]]*OK[[:space:]]*$' /tmp/0098-postcheck.out || true)
[ "${N1213}" = 2 ] || { echo "STOP: post-check 12 and 13 are not both OK. Do not run the behaviour check"; exit 1; }

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs
rm -f /tmp/0098-behaviour-after.out
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v patient_id=${PATIENT} -v t1_id=${T1} -v t2_id=${T2} -v t3_id=${T3} -v t4_id=${T4} -v n_id=${N} -f scripts/db/behaviour-care02a-readonly.sql 2>&1 | tee /tmp/0098-behaviour-after.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0098-behaviour-after.out && { echo "STOP: a behaviour verdict read FAIL after the apply"; exit 1; }
grep -qE '^[[:space:]]*99[[:space:]]*\|' /tmp/0098-behaviour-after.out || { echo "STOP: the behaviour check printed no SUMMARY row, so the transcript is truncated"; exit 1; }
ACTORS=$(grep -E '^ACTOR id ' /tmp/0098-behaviour-after.out | awk '{print $3}' | tr '\n' ' ' || true)
[ "${ACTORS}" = "${XACTORS}" ] || { echo "STOP: the ACTOR lines must name stage 1's actors in slot order, once each [${XACTORS}]. They named [${ACTORS}]"; exit 1; }
VACSET=$(grep -E '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0098-behaviour-after.out | sed -E 's/^[[:space:]]*[0-9]+[[:space:]]*\|[[:space:]]*([A-Z0-9]+)\..*/\1/' | LC_ALL=C sort | tr '\n' ' ' || true)
[ "${VACSET}" = "${XVAC}" ] || { echo "STOP: after the apply the VACUOUS arms must be exactly [${XVAC}]. They were [${VACSET}]"; exit 1; }
BEFORE=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0098-behaviour-before.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
AFTER=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0098-behaviour-after.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
[ "${BEFORE}" = "${XBEFORE}" ] || { echo "STOP: stage 1's BEFORE transcript does not read ${XBEFORE}. It read ${BEFORE}"; exit 1; }
[ "${AFTER}" = "${XAFTER}" ] || { echo "STOP: after the apply the profile must read ${XAFTER}. It read ${AFTER}"; exit 1; }
echo "CARE-02a BEHAVES AS RULED AT THE RLS LAYER. before ${BEFORE}, after ${AFTER}. The writes in action are proven by the rehearsal, not by this READ ONLY transcript."
)
```

**EXPECT: no FAIL, a SUMMARY row, the ACTOR lines naming stage 1's actors, and the
profile EXACTLY the one stage 1's shape requires**, which the block asserts, against the
matching BEFORE: `32 OK / 0 VACUOUS / 0 FAIL` for `11`; `30 OK / 2 VACUOUS / 0 FAIL`,
VACUOUS on exactly `N1 S5`, for `10`; `28 OK / 4 VACUOUS / 0 FAIL`, VACUOUS on exactly
`C5 P5 R4 S4`, for `01`; `26 OK / 6 VACUOUS / 0 FAIL`, VACUOUS on exactly
`C5 N1 P5 R4 S4 S5`, for `00`. The final line
reads `CARE-02a BEHAVES AS RULED AT THE RLS LAYER. before <BEFORE>, after <AFTER>. ...`.

**If stage 3 STOPs, production is already applied.** Do not re-run stage 1, do not
pick again, and do not substitute a subject: report the transcript to the owner. The
post-check of stage 2 is what proves the catalogue; stage 3 proves the behaviour, and a
subject whose data moved between the stages reads FAIL there by design.

**A re-run later is not a regression test.** The file reads whatever the clinic has
done since: T1 booked with P, T2 removed from the team, P soft-deleted. Any of those
moves a subject arm to FAIL on a correct database. It is an assertion about the
sitting.

## What every verdict must read

**Pre-check, 20 rows, all `OK`** (`scripts/db/precheck-0098-care02a.sql:218-281`):

- 0 the transaction is READ ONLY;
- 1 `patients_select` is `FOR SELECT`, PERMISSIVE, `TO authenticated`, USING md5
  `30d5b2b6dd3e7154ec2b8475961bf296` (0074's expression);
- 2 `clinical_records_select`, the same, md5 `8e124591c1b4e454358c38f1e5b18846`
  (0045's);
- 3 `patient_care_team_select`, the same, md5 `64384f7e1ce17e8da4fd1c0ecad3eb5b`
  (0091's owner-or-reception expression);
- 4 `patient_care_team_insert`, `FOR INSERT`, WITH CHECK md5
  `64384f7e1ce17e8da4fd1c0ecad3eb5b` (the same text as 3, as 0091 wrote it);
- 5 the eleven other policies on the three tables, one md5
  `85981c6894a92530edca6f8eeb634c69`;
- 6 per table: `clinical_records=5,patient_care_team=3,patients=7`, none RESTRICTIVE;
- 7 the five helpers: SECURITY DEFINER, STABLE, `search_path=public`, owned by
  `postgres`, EXECUTE to `authenticated`, bodies md5 `278de3a836486f3950e9513baf5429b3`
  (`clinical_admin_sees_patient`), `9d9e8a5a8ee79ce1c1fe04830d7c9186`
  (`clinical_therapist_sees_patient`), `88b26a83d4c94fe7e5acbf906c2d4b4e`
  (`viewer_care_team_patient_ids`), `1238f35e2142dbb260a0c7acda4f48ef`
  (`viewer_location_ids`), `c6bb997dced200956d7b5d1c49427dfa`
  (`viewer_treated_patient_ids`);
- 8 row level security ENABLED on the three tables;
- 9 0098 absent from the journal by hash; 10 0093 present by hash;
- 11 the newest journal row is 0097's, by hash and `when`, with no tie at that `when`;
- `journal_rows_before` **95**; `policies_before` (the rehearsal read **100**);
  `other_policies_md5` (rehearsal `776dfb6285cfe69342269a8647360dd4`);
  `functions_md5` (rehearsal `1ee1bb23afbb5b0cd795caf10f940bf8`); `grants_md5`
  (rehearsal `4230defc1e016a39c61c131b9f17ae54`). Only the first is asserted as a
  number; the other four are carried, and production's values are whatever this
  sitting reads;
- 12 `public.jwt_tenant_id`, `public.jwt_role` and `auth.uid` exist;
- 13 no function in `public` is called `viewer_care_team_patient_ids_at_my_clinics`;
- 14 the thirteen policies on `appointment_notes` (4), `attachments` (2),
  `clinical_episodes` (2), `guest_clinical_intakes` (2) and `patient_note_revisions`
  (3), one md5 `50438a565df1b37cbadbb32b896876eb`.

**Post-check, 16 rows, all `OK`** (`scripts/db/postcheck-0098-care02a.sql:217-296`):

1. `patients_select` USING md5 `de612f10145303302884747fa10b6c66`, command, PERMISSIVE
   and roles unchanged;
2. `clinical_records_select` USING md5 `976ba6f105c2bc373f0ec3c4a2ffb342`;
3. `patient_care_team_select` USING md5 `6a84c4ab560d81fabf3424b6f75dbd04`;
4. `patient_care_team_insert` WITH CHECK md5 `93edfcb33192ef57568c0970a5283a4d`;
5. the eleven other policies on the three tables still `85981c6894a92530edca6f8eeb634c69`:
   no write policy of `patients` or `clinical_records` moved, and not
   `patient_care_team_update`;
6. per table still 5, 3 and 7, none RESTRICTIVE;
7. the policy count in the database equals `policies_before`;
8. every OTHER policy in the database still hashes to `other_policies_md5`;
9. the thirteen policies on the five tables still `50438a565df1b37cbadbb32b896876eb`;
10. every function in `public` but the new one still hashes to `functions_md5`, and the
    five helpers are still as pre-check arm 7 pinned them;
11. every table, column and function grant in `public`, the new function's own ACL
    aside, still hashes to `grants_md5`;
12. the new helper exists ONCE: nullary, `uuid[]`, `sql`, SECURITY DEFINER, STABLE,
    `search_path=public`, owner `postgres`, body md5 `9539ec380f391d56af0d89c7998156db`;
13. EXECUTE on it for `authenticated` and for none of `anon`, `service_role`,
    `patient` or PUBLIC (the positive control sits in the same row, so a function
    nobody may execute cannot pass);
14. row level security still ENABLED on the three tables;
15. 0098 is in the journal by hash, it is the newest row, and the journal moved by
    exactly one;
16. exactly three policies in the database name the new helper, and they are
    `clinical_records_select`, `patient_care_team_select` and `patients_select`.

A LIKE would pass `... OR true`; an md5 does not. Verdicts 1 to 4 and 12 are how the
post-check catches a mutation the behaviour check cannot see (see "What the behaviour
check does not measure"). With 10 and 12 together, the SECURITY DEFINER count in
`public` moved by exactly one.

**Behaviour check, 32 arms** (`scripts/db/behaviour-care02a-readonly.sql:117-191`,
the verdicts at `:704-932`). BEFORE and AFTER as the B13a v2 rehearsal read them on its
synthetic fixture with five actors, N a receptionist; production's observed counts
differ, the verdicts must not.

| Arm | What it proves | BEFORE | AFTER |
|---|---|---|---|
| 0 | the transaction is READ ONLY and REPEATABLE READ | OK | OK |
| S0 | P live, a registo of P by T2, the actors distinct | OK | OK |
| S1 | T1: active therapist on P's live team, linked to P, no appointment with P, did not create P | OK | OK |
| S2 | T2: active therapist with an appointment with P | OK | OK |
| S3 | T3: not on P's team, no appointment, did not create P, authored none of P's registos | OK | OK |
| S4 | T4: on P's live team, NOT linked to P, no appointment, did not create, authored none | OK | OK |
| S5 | N: active admin or receptionist on P's live team, linked to P | OK | OK |
| I1 | each session is its actor; 0091's and 0074's helpers place P as the tables do; 0045's `clinical_admin_sees_patient` agrees with "linked" | OK | OK |
| H1 | 0098's helper names P for each actor exactly when on P's live team AND linked | **FAIL**, helper absent | OK, T1 true, T2 true, T3 false, T4 false, N true |
| P1 | patients: T1 reads P. **The ficha** | **FAIL**, 0 read | OK, 1 read |
| P2 | patients: T2 reads P, the control for P3 | OK | OK |
| P3 | patients: T3 does not read P | OK | OK |
| P4 | patients: every therapist reads EXACTLY its tenant's patients it created, treated, or is on the live team of AND linked to | **FAIL**, T1 0 / T2 1 / T3 2 / T4 0 | OK, T1 2 / T2 1 / T3 2 / T4 2 |
| P5 | patients: T4 does not read P. **The clinic limit** | **FAIL**, 0, control 0 | OK, 0, control 1 |
| R1 | registos: T1 reads T2's registo and every registo of P. **The registos** | **FAIL**, 0 of 2 | OK, 2 of 2 |
| R2 | registos: T2 reads them all, the control for R3 | OK | OK |
| R3 | registos: T3 reads none of P's | OK | OK |
| R4 | registos: T4 reads none of P's. **The clinic limit** | **FAIL**, 0 of 2, control 0 | OK, 0 of 2, control 2 |
| C1 | care team: T1 reads every row of P's team | **FAIL**, 0 of 6 | OK, 6 of 6 |
| C2 | care team: T2 reads every row of P's team (on it and linked) | **FAIL**, 0 | OK, 6 |
| C3 | care team: T3 reads only its own rows of P; control C1 | **FAIL**, 0 | OK, 1 (T3's removed row) |
| C4 | care team: every therapist reads EXACTLY its own rows and the rows of the teams it is on and linked to | **FAIL**, T1 0 / T2 0 / T3 0 / T4 0 | OK, T1 11 / T2 6 / T3 2 / T4 4 |
| C5 | care team: T4 reads its own row of P and none of the other members'. **The clinic limit** | **FAIL**, read 0 (own 1) | OK, read 1 (own 1), others 0 |
| N1 | N reads of P, its registos and its team exactly what its own role admits | **FAIL**, control not met | OK, reception: P 1, registos 0, team 6 (as admin: P 1, registos 2, team 0) |
| W1 | registos: T1 writes nothing of T2's (UPDATE, DELETE, INSERT of that row) | OK | OK |
| W2 | CONTROL: T2 admitted for its own registo by the same three expressions | OK | OK |
| W3 | registos: T3 and T4 write nothing of T2's | OK | OK |
| W4 | patients UPDATE and DELETE of P: T1, T3, T4 none, T2 both | OK | OK |
| W5 | care team: own row for P in the writer's shape (INSERT check and SELECT on the new row): T1, T3, T4 refused, T2 admitted | **FAIL**, T2 0 (select 0) | OK, T2 1 (select 1) |
| W6 | care team: a row for another user, and an own row under a tenant that does not exist, refused for every therapist; control W5's T2 | **FAIL**, 0s, control 0 | OK, 0s, control 1 |
| W7 | care team UPDATE of P's rows: none for any therapist | OK | OK |
| W8 | care team: an own row whose `assigned_by` is another user or NULL, refused for every therapist, T2 included; control W5's T2 | **FAIL**, 0s, control 0 | OK, 0s, control 1 |
| SUMMARY | five actors | **17 OK / 0 VACUOUS / 15 FAIL** | **32 OK / 0 VACUOUS / 0 FAIL** |
| SUMMARY | T4 picked, N passed as `none` (S5 N1 VACUOUS) | **16 OK / 2 VACUOUS / 14 FAIL** | **30 OK / 2 VACUOUS / 0 FAIL** |
| SUMMARY | N picked, T4 passed as `none` (S4 P5 R4 C5 VACUOUS) | **16 OK / 4 VACUOUS / 12 FAIL** | **28 OK / 4 VACUOUS / 0 FAIL** |
| SUMMARY | T4 and N passed as `none` (S4 S5 P5 R4 C5 N1 VACUOUS) | **15 OK / 6 VACUOUS / 11 FAIL** | **26 OK / 6 VACUOUS / 0 FAIL** |

W1, W3 and W4 are the "no write widens" arms: 0098 adds a SELECT arm to
`clinical_records` only and does not touch `clinical_therapist_sees_patient` or any
write policy, and all three read the same before and after. **How a READ ONLY file
measures a write**: it cannot run one, so it reads from `pg_policy` the expression
Postgres applies to the command for `authenticated` and evaluates it with the actor's
claims set over the subject rows and over candidate new rows (`:73-89`). Every zero a
write arm asserts has a control in the same run that must read 1 through the same
machinery (W2, W4's T2, W5's T2).

### What the behaviour check does not measure

Stated so a green stage 3 is not read as covering it. Each item names what does.

- **The insert policy's therapist role guard** (`jwt_role() = 'therapist'` in the
  therapist arm of `patient_care_team_insert`,
  `NEXT-AFTER-0097_care02a_care_team_reads.sql:413`). Mutation CI07 removes it and
  survives every behaviour arm and every in-action arm. Its effect is real: a bookable
  admin who treats a patient then writes their own care-team row ("written 1" with CI07,
  "refused 42501" with the real file, the rehearsal's `probe-admin-own-row.sql`). **In
  the repository a DB-gated arm now fails on it**: an admin who treats P, the premise
  asserted, writes their own row assigned by themselves and must be refused
  (`apps/web/lib/patients/care-team-reads.db.test.ts:460-485`), so CI refuses a file
  without the guard. **On production it is held by post-check verdict 4 alone, the md5
  of the WITH CHECK.**
- **The care-team term moved outside the therapist role guard on `patients_select`**
  (PS05). No staff role can see it: an admin or receptionist linked to P already reads P
  through their own location arm (0073's `viewer_visible_patient_ids()` is a superset of
  the helper's basis, `packages/db/migrations/0073_viewer_visible_patient_set.sql:198-230`),
  and the owner reads everything (`:47-50`); those four are every staff role
  (`packages/auth/permissions.ts:10`), and the portal's `patient` role is not
  `authenticated`. No DB-gated arm can see it for the same reason: it is equivalent on
  every data, a known gap held by post-check verdict 1 alone. The same
  move on `clinical_records_select` and `patient_care_team_select` IS seen, by N1 (CR05
  with N a receptionist, CS07, CS08 and CS09 with N an admin), but only when the pick
  found an N.
- **The helper's shape where the data cannot tell** (H05, H11, H12, H14, H25: equivalent
  on tenant-consistent data or on a NOT NULL column; H19 VOLATILE; H20 no `search_path`;
  H21 SECURITY INVOKER and H22 no EXECUTE for `authenticated`, which no session may
  exercise; H24 `anon` granted EXECUTE). Post-check verdicts 12 and 13.
- **The second-slot and fallback-gate mutations of the basis** (H04, H07, H09): in this
  check, only P4 and C4 see them (H07 by P4 alone), and H09 only with the rehearsal's
  extension row. On production, P4 and C4 see them only if some team the actors are on
  has that shape; post-check verdict 12 (the body's md5) catches all three. **In the
  repository each now has a DB-gated arm of its own** (patients Y2 and X2,
  `apps/web/lib/patients/care-team-reads.db.test.ts:691-711`, the fixture at `:155-170`),
  so CI refuses a file with any of the three.
- **The SELECT policy's own-row term as the thing that lets a therapist's FIRST booking
  row through.** When T2 is already on P's team, W5's SELECT half is admitted by the team
  term as well (`:193-198`). The rehearsal's IA2b and IA12 prove the term in action.
- **The other tables** (`attachments`, `clinical_episodes`, `appointment_notes`,
  `patient_note_revisions`, `guest_clinical_intakes`): 0098 does not touch them;
  pre-check 14 and post-check 9 pin their thirteen policies.
- **A patient linked to the actor's clinic only as the SECOND participant of an
  appointment**: 0098 does not count that link, by design (the basis above), and no
  subject needs it (`:204-206`).

### Which acceptance check this sitting discharges, and which it does not

| Acceptance check | Discharged by | Layer |
|---|---|---|
| V1: one new nullary SECURITY DEFINER STABLE helper, `search_path = public`, owner `postgres`, EXECUTE for `authenticated` only, on 0045's location basis with `viewer_location_ids()` | post-check 12, 13, 16; behaviour H1, I1 | the catalogue, and the helper called as each actor |
| V2: `patients_select` and `clinical_records_select` use the new helper, every other byte unchanged, the count flat; a care-team therapist with no link to the patient reads 0 of it and of its registos | pre-check 1, 2, 5, 6; post-check 1, 2, 5, 6, 7; behaviour P1 to P5, R1 to R4 (P5 and R4 only when the pick finds a T4; otherwise rehearsal-only) | the catalogue, and RLS as real staff |
| V3: the insert policy unchanged from v1; `patient_care_team_select` uses the new helper, the own-row term kept | post-check 3, 4; behaviour C1 to C5, W5 to W8; **in action by the rehearsal only** (IA2b, IA3 to IA6, IA12); the role guard by post-check 4 alone on production (in CI, also by the apps/web B3 admin arm) | RLS |
| V4: no policy on the five other tables changes; the new helper's body, owner, volatility, security and grants; no other function changed | pre-check 13, 14; post-check 8 to 13 | the catalogue |
| V5, V7: the app's read scope, the registo write scope, B7 and B8, the DB-gated arms | **NOT DISCHARGED BY THIS DOCUMENT.** They ship when the PR merges, after the apply; the screen check is the owner's. The suites are measured on the rehearsal below | the route, and the test database |
| V6: the behaviour check with T1 to T4 and N, ACTOR, VACUOUS contract | this sitting, stages 1 and 3 | RLS |
| V9: the clinic limit, the basis, the helper, the T4 arm, the order after 0097, the apply window | this document | |

**The md5 pins depend on how the session renders an expression.** Pre-check arms 1 to 7
and 14 and post-check verdicts 1 to 6, 9, 10 and 12 compare md5s of `pg_get_expr(...)`
or of a body, and the rendering prints `jwt_tenant_id()` without its schema only when
`public` is on the session's `search_path`. The expected values were read on a rehearsal
database built from main's 91 migrations and the held 0094 to 0097. If production
rendered differently, pre-check arms 1 to 5 would FAIL and stage 1 would halt
**before** the apply, which is the safe direction. The evidence that production renders
the same way is the READ ONLY pre-check before issue: 20 OK there means it does. The
stage blocks set no `search_path`, so the sitting connects exactly as that read did.

## Measured on production, READ ONLY

**NOT YET MEASURED.** This lane had no production access, by its dispatch. Before the
document is issued, and never as part of a sitting, the pre-check and the pick of stage 1
are run READ ONLY against production (both write nothing; the pick with
`row_security = off`, so this is also the first read of that kind there), and this section
records:

- the pre-check, with 0097's sha256 and `when` as production holds them: must read
  **20 OK, 0 FAIL**, `journal_rows_before` 95; record the five carries;
- the pick: whether it found a patient at all (the OPEN ITEM on T1 above), and which of
  the four shapes (`11`, `10`, `01`, `00`); **whether it found a T4, because without one
  the clinic limit's own arms are rehearsal-only**; the five staff slots and their roles and flags, **never
  the patient id**.

Nothing recorded here is a count of patients, clinics or registos.

## Rehearsed on 2026-09-27 (B13a v2) on a throwaway, synthetic data only

**Where it ran.** A throwaway Postgres on `127.0.0.1:55522`. `b13a_base` is `origin/main`'s
91 migrations at `e674100b` plus the pending 0094 (#1459, branch head `69ea425d`, sha256
`439cb53eab62803026a74e1148dbe3f5af1b7f95f0fc8e486d55eb7d62836a6c`), then the grants
revoke (#1397, `077ee449`, `fbc5e5458bb6ec3be6a5f2aeb558638b53ce2c49d5d58eca3a576cd231b0163b`),
then the conflict check's names (#1438, `67cdc97e`,
`cfdfffff71a6c847a791ce17c71bbc6e05b75a367e9c8f03dfcb0cfc638f5806`): 94 journal rows, and
it was used as a template only and never modified. **That is the 2026-09-22 order**, in
which the grants revoke was `0095` and the conflict check `0096`; the owner's renumbering
of 2026-09-27 swapped them. Review round 2 measured the ruled order too, and every pin
reads the same (below, "The held queue in the ruled order"). 0097 (sha256
`198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0`, the worktree copy
byte-identical) and its journal row (`when` 1788501800000) made `b13a2_pre98`, 95 rows,
the template every 0098 copy started from. `origin/main` has since moved to `b8c62fd5`;
the commits in between (#1461, #1445, #1462, #1463, #1466) change no migration: measured,
`supabase/migrations`, `packages/db/migrations` and `supabase/seed.sql` are identical at
`e674100b` and `b8c62fd5`.

**The rehearsal adaptation, stated because it is a difference.** Each file was applied
with `psql -1 -f` and its journal row written in the same transaction, the way drizzle
does it (hash the sha256 of the file, `created_at` the `when`). **`verified-migrate.mjs`
and `drizzle-kit migrate` did not run, and neither did stages 0 to 3 as whole blocks:**
they need a promoted branch. That run, on a throwaway at production's position, is owed
at promotion, before the document is issued. What was run from this document's own text
is below, under "The blocks' own lines".

**Re-run after review round 1, the same day.** The review changed no byte of the
migration, the pre-check, the post-check, the fixture or the in-action arms. It changed
the behaviour check's banner line only (`behaviour-care02a-readonly.sql:268`, "up to six
actors" to five, the slot count; new sha256 `b7a53c22...`, pinned above), and it added
DB-gated arms (apps/web B3 and B9) and tightened the packages/db probe. So every step
that reads those files was run again on fresh `b13a2_fix_*` databases built the same
way from `b13a_base` (`b13a-fix/logs/run98.log`, `suites.log`, `sweep.log`): the main
run below, on `b13a2_fix_final` and on the plain fixture, printed every profile and
count in the table below identically, 20 OK, 16 OK, 17/0/15 and 32/0/0 with five
actors, 15/6/11 and 26/6/0 with `none`, 31 OK in action both times, and a second apply
that changed nothing (policies md5 `743cf5a18897ab8f09c2f5345f26281b` over 100, the same;
the public functions md5 differs per database because it includes each function's oid,
and the new helper's oid is assigned at apply). The suites and the sweep are the tables
further down, re-measured. Every `b13a2_fix_*` database was dropped after, each exit 0.

**Re-run after review round 2, the same night.** Round 2 changed 0098's header comment
only: lines 14 to 18 named the 2026-09-22 queue (the grants revoke at `0095`, the
conflict check at `0096`) and lines 272 and 273 cited "0096's section 6"; both now follow
the owner's fourth renumbering. The line count is unchanged (437), and every line that
differs is a comment line; lines 296 to 437, the statements, are byte-identical to round
1's. The sha256 moved from `387cd030...` to `fbf8cad1...`, and with it the pre-check's and
the post-check's pins (so their own sha256s moved, to `deef1cd2...` and `01a1cd26...`),
the README row and every pin above. Round 2 also made T4 and N independent in `PICK` and
in stages 1 and 3. So everything that reads those files ran again on fresh `b13a2_fix_*`
databases built the same way from `b13a_base` (`b13a-fix2/logs/run98.log`, `suites.log`,
`docblocks/logs/arms.log`): the main run on `b13a2_fix_final` and on the plain fixture
printed every profile and count in the table below identically, now in SIX subject
shapes (the two new ones are the rows marked round 2); 31 OK in action before and after;
a second apply that changed nothing (policies md5 `743cf5a18897ab8f09c2f5345f26281b` over
100, the same; the functions md5, oid-dependent, identical before and after on each
database); post-check 16 OK after it. The mutation sweep was not re-run: it applies
mutated copies of the statements, which are byte-identical, and judges them with the
post-check, whose verdicts compare the catalogue, not the file's hash, except verdict 15,
which every mutation row read with the real 0098 hash in its journal row.

**Re-run after review round 3**, 2026-09-28 00:34 UTC. Round 3 changed one comment line
of the pre-check, `precheck-0098-care02a.sql:65`, which gave the thirteen policies'
per-table counts in the wrong order for the tables it lists ("4, 2, 2, 2 and 3"; in that
order they are 2, 2, 4, 3 and 2, as arm 14 itself reads them). The line count is
unchanged (283). Its sha256 moved from `deef1cd2...` to `d429c81f...`, and with it the
pin in the facts table and stage 1's `SHAPRE`; the migration, the post-check and the
behaviour check did not change. Reverting that one line gives back round 2's bytes
exactly (`deef1cd2...`), so it is the only change. On fresh `b13a2_fix_r3_*` databases
built the same way from `b13a_base` (`b13a-fix3/logs/run98.log`), the pre-check read 20
OK, 0 FAIL, arm 14 observing `appointment_notes=4,attachments=2,clinical_episodes=2,guest_clinical_intakes=2,patient_note_revisions=3`,
with the same five carries as the table below. Its output was byte-identical to the
round 2 bytes' output on the same database and to round 2's transcript. Fed those
carries, the post-check after the apply read 16 OK, and the behaviour check after it read
`32 OK / 0 VACUOUS / 0 FAIL` with five actors. The six doc-block arms ran again (below,
"The blocks' own lines"). Every `b13a2_fix_r3_*` and `b13a2_fix_doc3_*` database was
dropped after, each exit 0.

**The fixture, all synthetic** (`care02a-fixture-v2.sql`, sha256
`f249300ed99d0f7301f36114d2ed54aeb5ec447e22d977cc2f90a31f54f75a60`). Tenant A with two
clinics, LocA and LocB: owner, reception, admin; therapists T1, T2, T3 and a spare at
LocA; T4 at LocB ONLY; NR a second receptionist and NA a second admin at LocA, both on
P's team. P: primary LocA, T2 has an appointment at LocA and two registos; live team T1,
T2, T4, NR, NA; T3 holds a removed row. Further patients for the basis cases, each with
T1 on its live team: Y (primary LocA, no appointment: linked by the fallback), Z (primary
LocB, no appointment: not linked), X2 (primary LocA, an appointment at LocB: not linked,
the fallback applies only without a located appointment), Y2 (primary LocB, only the
second participant of an appointment at LocA: not linked to T1 on the first-slot basis).
W: primary LocB, T4 on its live team (T4's positive). Tenant B: its own staff, patient,
team row and registo. **Plus one row** (`care02a-fixture-v2-ext.sql`): T4 on Y2's live
team, the only row that tells a fallback following the second slot apart (finding 2).

**The main run, `b13a2_final`** (`logs/run98.log`, every exit 0):

| Step | Result |
|---|---|
| pre-check (`prev_hash` 0097's sha256, `prev_when` 1788501800000) | 20 OK, 0 FAIL. Carries `policies_before` 100, `other_policies_md5` `776dfb6285cfe69342269a8647360dd4`, `functions_md5` `1ee1bb23afbb5b0cd795caf10f940bf8`, `grants_md5` `4230defc1e016a39c61c131b9f17ae54`, `journal_rows_before` 95 |
| fixture, then the one-row extension | exit 0 |
| behaviour BEFORE, N as reception (NR) | `17 OK / 0 VACUOUS / 15 FAIL`, failing on H1 P1 P4 P5 R1 R4 C1 C2 C3 C4 C5 N1 W5 W6 W8; 5 ACTOR lines |
| behaviour BEFORE, N as admin (NA) | the same profile |
| behaviour BEFORE, T4 and N passed as `none` | `15 OK / 6 VACUOUS / 11 FAIL`, failing on H1 P1 P4 R1 C1 C2 C3 C4 W5 W6 W8, VACUOUS on S4 S5 P5 R4 C5 N1; 3 ACTOR lines |
| behaviour BEFORE, T4 and N passed as `none` (round 2) | `16 OK / 2 VACUOUS / 14 FAIL`, failing on H1 P1 P4 P5 R1 R4 C1 C2 C3 C4 C5 W5 W6 W8, VACUOUS on S5 N1; 4 ACTOR lines, slots t1 t2 t3 t4 |
| behaviour BEFORE, N (NR, and again NA) and T4 passed as `none` (round 2) | `16 OK / 4 VACUOUS / 12 FAIL` each, failing on H1 P1 P4 R1 C1 C2 C3 C4 N1 W5 W6 W8, VACUOUS on S4 P5 R4 C5; 4 ACTOR lines, slots t1 t2 t3 n |
| in-action BEFORE | 31 OK / 0 FAIL |
| apply #1 | 0098 and its journal row in one transaction (`when` 1788501900000) |
| post-check | 16 OK, 0 FAIL, **read before any session ran as `authenticated`**, with verdicts 12 and 13 and a catalogue guard (`guard()` in `lib.zsh`): SAFE |
| behaviour AFTER, NR and NA | `32 OK / 0 VACUOUS / 0 FAIL` each |
| behaviour AFTER, `none` | `26 OK / 6 VACUOUS / 0 FAIL` |
| behaviour AFTER, T4 and N `none` (round 2) | `30 OK / 2 VACUOUS / 0 FAIL`, VACUOUS on S5 N1 |
| behaviour AFTER, N (NR, and again NA) and T4 `none` (round 2) | `28 OK / 4 VACUOUS / 0 FAIL` each, VACUOUS on S4 P5 R4 C5 |
| in-action AFTER | 31 OK / 0 FAIL |
| apply #2 | **changes nothing.** Before and after: policies md5 `743cf5a18897ab8f09c2f5345f26281b` over 100, public functions md5 `eb497432dd38e2418af395f91b0e5bbf` over 288 (ACLs and comments included), journal 96. The post-check still reads 16 OK and the behaviour check 32/0/0 |

The whole run was repeated on `b13a2_plain` (the v2 fixture without the extension row):
every profile came out identical, so the behaviour file's header profiles
(`behaviour-care02a-readonly.sql:103-110`) reproduce exactly. **The server did not
crash**: its last recovery is still the SQL agent's, at 21:00:32 UTC.

**The held queue in the ruled order** (review round 2, `b13a-fix2/logs/suites.log`).
`b13a_base` applied the grants revoke before the conflict check's names, the 2026-09-22
order; the owner's order since 2026-09-27 is the reverse. So `b13a2_fix_neworder` was
built from scratch: main's 91 migrations from `packages/db/migrations` in journal order
with their journal rows (`b13a2_fix_main91`, the same recipe as `b13a_base`), then 0094,
then `0095` the conflict check's names, then `0096` the grants revoke, then 0097, each
file byte-identical to its branch head. Its pre-check read **20 OK** with every row but
the journal's identical to `b13a2_fix_pre98`'s, carries included: `policies_before` 100,
`other_policies_md5` `776dfb6285cfe69342269a8647360dd4`, `functions_md5`
`1ee1bb23afbb5b0cd795caf10f940bf8`, `grants_md5` `4230defc1e016a39c61c131b9f17ae54`, 26
SECURITY DEFINER functions. Then the fixture, the behaviour check BEFORE
(`17 OK / 0 VACUOUS / 15 FAIL`, the same FAIL set), 0098, the post-check **16 OK**, the
guard SAFE, the behaviour check AFTER `32 OK / 0 VACUOUS / 0 FAIL` and in action 31 OK /
0 FAIL. The order of the two middle migrations does not move anything 0098 pins or
reads, measured rather than argued: the grants revoke touches table ACLs, the conflict
check touches functions and keeps the SECURITY DEFINER count at 26, and every pre-check
row and carry, which hash every policy, every function and every ACL in `public`, comes
out the same either way.

**The clinic limit's own arm, T4** (on P's team, installed at the other clinic only),
after 0098: 0 of P, 0 of P's 2 registos, 0 of the other members' team rows, and 1 row:
its own. "0 team rows" is impossible by construction: the own-row term the writer needs
(V3) keeps a therapist's own rows readable.

**The writes in action, which no READ ONLY check can show** (`care02a-inaction-v2.sql`,
phase-aware; the refusals are a plain INSERT, so each measures the insert policy alone;
every arm inside a transaction that is rolled back):

| Arm | BEFORE | AFTER |
|---|---|---|
| IA1 T1 reads T2's registo | 0 | 1 |
| IA1 T1's UPDATE and DELETE of it | 0 and 0 | 0 and 0 |
| IA1 control: T2's UPDATE of its own registo | 1 | 1 |
| IA2b a spare therapist books V, then writes its own row through the writer's `ON CONFLICT ... RETURNING` shape. The own-row SELECT term working | refused 42501 | written 1 |
| IA12 T4 books V at its own clinic and writes its row | refused | written 1 |
| IA8 T4 reads P, and P's registos | 0, 0 | 0, 0 |
| IA8 T4 reads P's team rows | 0 | 1 (its own only) |
| IA8 T4 reads the other members' rows | 0 | 0 |
| IA9 T4 reads W, W's registo, W's team (a team at its own clinic) | 0 / 0 / 0 | 1 / 1 / 1 |
| IA10 T4's UPDATE or DELETE of any registo | 0 | 0 |
| IA11 NR reads P, and P's registos | 1, 0 | 1, 0 |
| IA11 NA reads P's team, and P's registos | 0, 2 | 0, 2 |
| IA5 an own row with `assigned_by` reception; IA5n with `assigned_by` NULL; IA3 a row for another user; IA4 an own row for P, whom it does not treat; IA6 admin writes a row | refused 42501 each | refused 42501 each |
| IA6 admin reads care-team rows | 0 | 0 |
| IA7 reception writes a row | written 1 | written 1 |
| IA7 reception reads its tenant's rows | 15, the table count | 17, the table count |

The negative arm: the AFTER expectations run on a database without 0098 read
24 OK / 7 FAIL, failing on IA1, IA2b, IA8, IA9 three times and IA12.

**The DB-gated suites and the flip mechanism**, as re-measured after review round 1
(`b13a-fix/logs/suites.log`) and again after round 2 (`b13a-fix2/logs/suites.log`);
serial, verbose, 30 s test and 60 s hook timeouts; the databases are `b13a2_fix_*` copies
of `b13a2_fix_pre98`, the same main plus 0094 to 0097, except `ci`:

| Database | apps/web (care-team-reads, care-team-booking) | packages/db (care-team-appointment-visibility) | What the suites printed |
|---|---|---|---|
| `s98`, with 0098 | exit 0, 67 of 67 | exit 0, 17 of 17 | "0098 APPLIED ... all 3 SELECT policies name it"; the packages/db arm titled "0098 APPLIED: a THERAPIST sees exactly their OWN row..." |
| `sno98`, without | exit 0, 67 of 67, 0 skipped | exit 0, 17 of 17 | "0098 NOT APPLIED ... This run proves nothing about 0098 itself", as a log line and as a test annotation; packages/db: "0098 NOT APPLIED on this database: a THERAPIST sees NOTHING..." |
| `shalf`, the helper only, no policy altered | exit 1: 2 files failed, 67 skipped, "0098 IS HALF APPLIED ... 0 of 3 SELECT policies name it" | exit 1: 1 file failed, no tests run, "0098 is half there: helper true, 0 of 3 SELECT policies name it" | |
| `shalf4`, the helper and `patient_care_team_select` only | exit 1: 2 files failed, 67 skipped, "... 1 of 3 SELECT policies name it (patient_care_team.patient_care_team_select)" | exit 1: 1 file failed, no tests run, "0098 is half there: helper true, 1 of 3 SELECT policies name it". **Before review round 1 the packages/db probe read only this policy and counted this database as applied, 17 of 17** | |
| a scratch copy of `packages/db` with 0098 renamed into its `migrations/`, the promotion simulated outside the worktree | | on `sno98`: exit 1, 1 file failed, "0098 IS PROMOTED (0098_care02a_care_team_reads.sql defines ...) BUT THIS DATABASE DOES NOT HAVE IT"; on `s98`: exit 0, 17 of 17 | |
| `ci` (round 2): WHAT CI BUILDS. Built from `template0` with the auth schema, then `supabase/migrations` alone, 91 files in name order, each in its own transaction, then `supabase/seed.sql`; no held migration and no drizzle journal, as `supabase db reset` leaves it. 26 SECURITY DEFINER functions, 95 policies | exit 0, 67 of 67, 0 skipped | exit 0, 17 of 17 | "0098 NOT APPLIED ... and not promoted: the "0098:" arms asserted the PRE-0098 profile. This run proves nothing about 0098 itself", as on `sno98`; packages/db: "0098 NOT APPLIED on this database: a THERAPIST sees NOTHING...". `check-security-definer-owner.mjs` against it: "26 SECURITY DEFINER function(s) in public. OK: all 26 owned by postgres" |

**CI's two whole steps on the CI build, and why their first reading is not a finding.**
Run as CI runs them (the whole `packages/db` suite; `vitest run .db.test.ts` in
`apps/web`; files in parallel, vitest's default 5 s test timeout) on `b13a2_fix_ci`:
packages/db 1329 passed, 3 files failed; apps/web 303 passed and 46 failed in 19 files,
44 of the 46 "Test timed out in 5000ms" and the other two cleanup errors after one. The
19 apps/web files and the 3 packages/db files were re-run serially with the timeouts
above on a fresh copy built the same way (`b13a2_fix_ci2`, `b13a-fix2/logs/rerun-ci.log`):
apps/web 197 of 197; packages/db 32 of 35, the three failures all in
`storage-bucket-scope.db.test.ts`, `schema "storage" does not exist`: this container is
plain Postgres with an auth schema copied in, not the Supabase image, and this PR touches
no storage policy or that file. The parallel failures were this container under load.

The unit tests of the state module and the read gate (`care-team-0098-state.test.ts`,
`care-team-reads-gate.test.ts`): exit 0, 13 of 13; they hold the apps/web "promoted but
not applied" case, and the scratch copy above measured the packages/db one.
`scripts/behaviour-checks-print-actor.test.mjs`: 14 of 14. The four apps/web arms review
round 1 added (the admin's own row in B3; the slot rule, the fallback gate and its
first-slot test in B9) are why 63 became 67; the packages/db count is unchanged, its
"cannot assign themselves" arm renamed and narrowed to the one condition its title names
(the therapist does not treat the patient; the row names them as assigner). An earlier
suite run by the app lane used an older 0098 (sha256 beginning `13e8857d`); on round 1's
`387cd030...` the counts above were re-measured, with 0098 and without, and on round 2's
`fbf8cad1...` again: `s98` and `sno98` read 67 of 67 and 17 of 17 each, printing the same
lines. `shalf` and `shalf4` were not rebuilt: they apply statements extracted from the
file, and the statements did not change.

**The mutation sweep: 53 mutations**, re-run in full after review round 1
(`b13a-fix/sweep/results.txt`), each on a fresh copy of `b13a2_fix_pre98` with the
fixture and the extension row, the mutated file applied with the real 0098 hash in its
journal row (so the post-check judges the catalogue), then in order: post-check, crash
guard, behaviour as NR, behaviour as NA, in-action (AFTER expectations), the apps/web
suites, the packages/db suite, drop. The unmodified file ran first (M00) and last (M00b),
both fully green. "Crash guard" means the mutation was never run as `authenticated`,
because a live call to a helper the caller cannot execute, or to an INVOKER helper,
crashes this server; only the post-check ran. "HALF" means the suite went red as half
applied (apps/web: 67 skipped, 2 files failed, exit 1; packages/db: 1 file failed, no
tests run, exit 1). The apps/web column counts failed tests and names the groups they
sit in (B1 to B9 of `care-team-reads.db.test.ts`, "booking" for
`care-team-booking.db.test.ts`). The post-check, behaviour and in-action columns read
exactly as round 2's sweep did, mutation for mutation, which is what an unchanged
migration, fixture and instrument owe; the suite columns moved because the suites did.

| id | mutation | post-check | behaviour NR / NA | in-action | apps/web | packages/db | verdict |
|---|---|---|---|---|---|---|---|
| H01 | clinic limit removed | 12 | H1 P4 P5 R4 C4 C5 / same | IA8 | 7 (B9) | 1 | KILLED |
| H02 | basis: location conjunct dropped | 12 | H1 P4 P5 R4 C4 C5 / same | IA8 | 5 (B9) | ok | KILLED |
| H03 | basis: patient correlation dropped | 12 | the same six | IA8 | 7 (B9) | ok | KILLED |
| H04 | basis follows the second slot | 12 | P4 C4 / same | ok | 1 (B9) | ok | KILLED |
| H05 | basis: tenant filter dropped | 12 | ok | ok | ok | ok | post-check only (equivalent on tenant-consistent data) |
| H06 | fallback removed | 12 | P4 C4 | ok | 4 (B9) | ok | KILLED |
| H07 | fallback gate removed | 12 | P4 | ok | 1 (B9) | ok | KILLED |
| H08 | fallback gate inverted | 12 | P4 C4 | ok | 5 (B9) | ok | KILLED |
| H09 | fallback gate follows the second slot | 12 | P4 C4 (with the extension row; the plain fixture reads 32/0/0) | ok | 1 (B9) | ok | KILLED |
| H10 | fallback gate: patient correlation dropped | 12 | P4 C4 | ok | 4 (B9) | ok | KILLED |
| H11 | fallback gate: tenant filter dropped | 12 | ok | ok | ok | ok | post-check only (equivalent) |
| H12 | fallback gate: `IS NOT NULL` dropped | 12 | ok | ok | ok | ok | post-check only (equivalent: `location_id` is NOT NULL) |
| H13 | fallback: `p.id` correlation dropped | 12 | P4 C4 | ok | 3 (B9) | ok | KILLED |
| H14 | fallback: patient tenant filter dropped | 12 | ok | ok | ok | ok | post-check only (equivalent) |
| H15 | fallback: primary-location conjunct dropped | 12 | P4 C4 | ok | 3 (B9) | 1 | KILLED |
| H16 | basis OR fallback made AND | 12 | H1 P1 P4 P5 R1 R4 C1 to C5 N1 | IA1 IA9 | 17 (B1 B2 B4 B6 B8 B9 booking) | ok | KILLED |
| H17 | team source swapped to the treated helper | 12 | H1 P1 P4 P5 R1 R4 C1 C3 C4 C5 N1 | IA1 IA9 | 17 (B1 B2 B4 B6 B8 B9) | ok | KILLED |
| H18 | team source swapped to `viewer_visible_patient_ids` | 12 | H1 P3 P4 R3 C3 C4 | ok | 8 (B1 B2 B4 B6 booking) | ok | KILLED |
| H19 | VOLATILE | 12 | ok | ok | ok | ok | post-check only |
| H20 | `search_path` removed | 12 | ok | ok | ok | ok | post-check only |
| H21 | SECURITY INVOKER | 12 | crash guard | crash guard | crash guard | crash guard | post-check only, by design |
| H22 | `GRANT EXECUTE TO authenticated` removed | 13 | crash guard | crash guard | crash guard | crash guard | post-check only, by design |
| H23 | the REVOKE leaves `anon` out | none | ok | ok | ok | ok | SURVIVED (finding 4) |
| H24 | `anon` granted EXECUTE | 13 | ok | ok | ok | ok | post-check only |
| H25 | DISTINCT dropped | 12 | ok | ok | ok | ok | post-check only (equivalent) |
| PS01 | `patients_select` therapist literal broken | 1 | P1 to P5 | IA9 | 16 (B1 B6 B9) | ok | KILLED |
| PS02 | care disjunct dropped | 1 16 | P1 P4 P5 | IA9 | HALF | HALF | KILLED |
| PS03 | swapped to 0091's unlimited helper (v1) | 1 16 | P4 P5 | IA8 | HALF | HALF | KILLED |
| PS04 | swapped to the treated helper | 1 16 | P1 P4 P5 | IA9 | HALF | HALF | KILLED |
| PS05 | care term outside the therapist guard | 1 | ok | ok | ok | ok | post-check only (equivalent for every staff role, behaviour file `:47-50`) |
| PS06 | treated OR care made AND | 1 | P1 P4 P5 | IA9 | 16 (B1 B6 B9) | ok | KILLED |
| CR01 | `clinical_records_select` therapist literal broken | 2 | R1 to R4 N1 / R1 to R4 | IA1 IA9 | 6 (B2 B6 B9) | ok | KILLED |
| CR02 | care disjunct dropped | 2 16 | R1 R4 N1 / R1 R4 | IA1 IA9 | HALF | HALF | KILLED |
| CR03 | swapped to the unlimited helper (v1) | 2 16 | R4 | IA8 | HALF | HALF | KILLED |
| CR04 | swapped to the treated helper | 2 16 | R1 R4 N1 / R1 R4 | IA1 IA9 | HALF | HALF | KILLED |
| CR05 | care term outside the guard | 2 | N1 / ok | IA11 | ok | ok | KILLED (N as reception, IA11) |
| CR06 | sees OR care made AND | 2 | R1 R4 N1 / R1 R4 | IA1 IA9 | 3 (B2 B6 B9) | ok | KILLED |
| CI01 | insert therapist literal broken | 4 | W5 W6 W8 | IA2b IA12 | 4 (B3 booking) | ok | KILLED |
| CI02 | `user_id = uid` dropped | 4 | W6 | IA3 | 1 (B3) | ok | KILLED |
| CI03 | `assigned_by = uid` dropped | 4 | W8 | IA2b IA5 IA5n | 1 (B3) | ok | KILLED |
| CI04 | treated check dropped | 4 | W5 | IA4 | 1 (B3) | 1 | KILLED |
| CI05 | treated swapped to 0091's care helper | 4 | W5 | IA2b IA12 | 4 (B3 booking) | 1 | KILLED |
| CI06 | treated swapped to the new clinic helper | 4 16 | W5 | IA2b IA12 | 4 (B3 booking) | ok | KILLED |
| CI07 | insert therapist role guard removed | 4 | ok | ok | 1 (B3) | ok | KILLED (apps/web B3 only, the arm review round 1 added) |
| CS01 | `care_team_select` therapist literal broken | 3 | C1 to C5 W5 / plus N1 | IA2b IA8 IA9 IA12 | 8 (B4 B8 B9 booking) | 1 | KILLED |
| CS02 | own-row term dropped | 3 | C3 C4 C5 | IA2b IA8 IA12 | 3 (booking) | 1 | KILLED |
| CS03 | care term dropped | 3 16 | C1 to C5 / plus N1 | ok | HALF | HALF | KILLED |
| CS04 | swapped to the unlimited helper (v1) | 3 16 | C4 C5 | IA8 | HALF | HALF | KILLED |
| CS05 | swapped to the treated helper | 3 16 | C1 C3 C4 C5 / plus N1 | ok | HALF | HALF | KILLED |
| CS06 | own OR care made AND | 3 | C1 to C5 / plus N1 | IA2b IA8 IA12 | 8 (B4 B8 B9 booking) | 1 | KILLED |
| CS07 | care term outside the guard | 3 | ok / N1 | IA11 | ok | ok | KILLED (N as admin, IA11) |
| CS08 | own-row term outside the guard | 3 | ok / N1 | IA11 | ok (a) | ok | KILLED (N as admin, IA11) |
| CS09 | select role guard removed | 3 | ok / N1 | IA11 | ok | ok | KILLED (N as admin, IA11) |

(a) Five sweep runs of the apps/web suites hit the container stalling (connection or 30 s
test timeouts: H04, PS01, CR01, CR06, CS08). Each was rerun twice on a fresh copy,
suites only (`b13a-fix/logs/confirm.log`), and the table carries the reruns, which agreed
with each other: H04 1 failed (B9), PS01 16, CR01 6, CR06 3, and CS08 67 of 67. CS08's
sweep failures were all timeouts, so it is not counted as an apps/web kill, as in round 2.

**Totals: 41 killed** by the behaviour check, the in-action arms or the suites (round 2
read 40; CI07 is the one that moved); **9 by the post-check alone** (H05 H11 H12 H14 H19
H20 H24 H25 PS05, every one equivalent on the data or invisible to any session); **2
judged by the post-check only, by design** (H21 by verdict 12, H22 by verdict 13); **1
survived everything**, H23, a gap in the rehearsal base and not in 0098. **What the
DB-gated suites still miss**, so CI would not refuse it: the equivalents and by-design
rows above, and four killed rows, CR05, CS07, CS08 and CS09, each a term moved outside a
role guard on `clinical_records_select` or `patient_care_team_select`. Only a
non-therapist on the team shows those, and no suite fixture has one; the behaviour
check's N1 and the in-action IA11 catch them (finding 8). The behaviour check alone
still misses CI07, which is why post-check verdicts 1 to 4, 12 and 13 are exact, and
why stage 2 is not optional after a green stage 3.

**Findings the rehearsal left for the lead, each with where it now stands after review
round 1:**

1. **CI07 survived every test except the post-check. Fixed in the repository**: the
   apps/web B3 arm where an admin who treats P writes their own row, assigned by
   themselves, and is refused (`care-team-reads.db.test.ts:460-485`); CI07 fails it, M00
   passes it. The behaviour check and the in-action arms still do not see CI07, so on
   production post-check verdict 4 is still its only guard.
2. **H09 was caught only with one extra fixture row** (T4 on Y2's team), which lived in
   the rehearsal's scratch fixture and not in the repository. **Fixed in the
   repository**: the apps/web B9 arm on Y2 (T4 reads Y2 through Y2's primary clinic)
   fails on H09 with no extension row.
3. **The DB-gated suites did not check the slot rule or the fallback gate** (H04, H07,
   H09). **Fixed**: one B9 arm each (`care-team-reads.db.test.ts:691-711`), each killed
   in the re-run sweep and in its confirmation.
4. **The rehearsal base cannot test one grant.** It has no default privileges, so
   `REVOKE ALL FROM PUBLIC` alone already removes `anon`'s EXECUTE, and H23 is invisible
   there. On production, Supabase grants `anon` EXECUTE by default
   (`NEXT-AFTER-0097_care02a_care_team_reads.sql:234-238`), so post-check verdict 13
   catches it there.
5. **Half applied, measured**: on a database with only the helper, both apps/web files
   fail in `beforeAll`, all 67 tests show as skipped, and the run exits 1. **Round 2's
   packages/db probe read only `patient_care_team_select`**, so the helper plus that one
   policy counted as applied there: measured on `b13a2_fix_shalf4`, 17 of 17. **Fixed**:
   the packages/db probe now asks what the apps/web one asks, all three SELECT policies
   and the promotion, and on the same database it fails the file (exit 1). The promoted
   case was measured on a scratch copy of `packages/db` (the table above), not in the
   worktree.
6. **The app lane's earlier suite counts were on an older 0098**; re-measured on the
   final file, above.
7. **PS05 is equivalent for every staff role** (see "What the behaviour check does not
   measure"): no session and no DB-gated arm can tell it apart, and post-check verdict 1
   alone holds it. A known gap, listed in the PR as known.
8. **No DB-gated arm has a non-therapist on a team**, so CR05, CS07, CS08 and CS09 pass
   both suites (the table above). The behaviour check's N1 (when the pick finds an N) and
   the in-action IA11 kill all four, and post-check verdicts 2 and 3 pin both
   expressions. Not fixed in this round: an arm with a receptionist and an admin put on
   P's team for the arm alone would close it. Listed in the PR as known.

**No refusals, no git operations, no worktree file edited** by the rehearsal. Its input
hashes were identical at start and end (`worktree-hashes-start.txt`).

**The databases.** Kept: `b13a2_final` (main plus 0094 to 0098, 96 journal rows, newest
0098 by hash, the fixture and the extension row, 15 care-team rows across the two
synthetic tenants; post-check 16 OK, behaviour 32/0/0). Its journal row for 0098 holds
round 1's hash, `387cd030...`: the statements it applied are the ones this revision
carries, and round 2's own run used fresh databases. Every other `b13a2_` database the
rehearsal created was dropped, each with exit 0, and so was every `b13a2_fix_*` database
review rounds 1 and 2 created (round 2: `b13a-fix2/created-dbs.txt` and
`dropped-dbs.txt`). `b13a_base` still reads 94 rows.

### The blocks' own lines, run from this document's text

The stages cannot run whole before promotion, but their database half can, and it was
extracted from this file by a script, not retyped: from stage 1, everything from the
clinic-hours read to the last `mv` (the hours, the pre-check and its count, the pick,
its parse, the BEFORE run and every assertion on it); from stage 2, everything from the
applied-marker check to the final line; from stage 3, everything from reading the
subjects back to the final line. Between stages 1 and 2, `psql -1` applied 0098 and its
journal row (`when` 1788501900000) and the marker was touched, standing in for
`verified-migrate.mjs`. The substitutions, counted: `/tmp/` to a scratch directory
(stage 1's segment 20, stage 2's 9, stage 3's 19), the env line to a throwaway URL (0, 1,
1), the target guard's invocation to an `echo` (0, 1, 1); nothing else, and the script
refused to run a segment that still named the secrets directory, the guard,
`verified-migrate` or the apply worktree. All five blocks pass `zsh -n`. Each database
was created by this lane from `b13a_base` with 0097 and its journal row, the v2 fixture
and the extension row, run under `zsh -f` from the 0098 worktree, and dropped after, each
drop exit 0. The rehearsal's catalogue guard read SAFE before each passing arm's stage 3
segment; in the EXECUTE-revoked arm stage 3 ran unguarded on purpose, to show that its
own checks stop it before any session.

| Arm | Exit (stage 1, 2, 3) | What it printed |
|---|---|---|
| the fixture as rehearsed | 0, 0, 0 | `active clinics open now by their own hours: 0 of 3`; the pick named T1, T2, T3, T4 and N exactly as the rehearsal did, N the receptionist; `17 OK / 0 VACUOUS / 15 FAIL, failing on C1 C2 C3 C4 C5 H1 N1 P1 P4 P5 R1 R4 W5 W6 W8`; carries as the main run's; `0098 APPLIED. 20/20 pre-check OK, 16/16 post-check OK, journal 95 to 96.`; `before 17 OK / 0 VACUOUS / 15 FAIL, after 32 OK / 0 VACUOUS / 0 FAIL` |
| T4's, NR's and NA's rows on P's team marked removed, so the pick finds no T4 or N | 0, 0, 0 | `T4 none, N none`; `15 OK / 6 VACUOUS / 11 FAIL, failing on C1 C2 C3 C4 H1 P1 P4 R1 W5 W6 W8`; `0098 APPLIED. 20/20 ...`; `before 15 OK / 6 VACUOUS / 11 FAIL, after 26 OK / 6 VACUOUS / 0 FAIL` |
| round 2, shape `10`: NR's and NA's rows on P's team marked removed, so the pick finds T4 and no N | 0, 0, 0 | `T4 c02a...e7, N none`; `subject shape 10`; `16 OK / 2 VACUOUS / 14 FAIL, failing on C1 C2 C3 C4 C5 H1 P1 P4 P5 R1 R4 W5 W6 W8`; `0098 APPLIED. 20/20 ...`; `before 16 OK / 2 VACUOUS / 14 FAIL, after 30 OK / 2 VACUOUS / 0 FAIL` |
| round 2, shape `01`: T4's row on P's team marked removed, so the pick finds N and no T4 | 0, 0, 0 | `T4 none, N c02a...e8` (the receptionist); `subject shape 01`; `16 OK / 4 VACUOUS / 12 FAIL, failing on C1 C2 C3 C4 H1 N1 P1 P4 R1 W5 W6 W8`; `0098 APPLIED. 20/20 ...`; `before 16 OK / 4 VACUOUS / 12 FAIL, after 28 OK / 4 VACUOUS / 0 FAIL` |
| round 2: shape `11` at stage 1, then the subjects file's N rewritten to `none` before stage 3 | 0, 0, 1 | stage 3: `STOP: stage 1's BEFORE transcript and its subjects file do not name the same actors`, naming five and four; no session acted |
| T1's row on P's team marked removed: no patient furnishes T1 | 1 | `STOP: a MISSING SUBJECT. No live patient furnishes T1, T2 and T3 by the rule in PICK.` Journal 95, helper absent, only `0098-precheck.new` written |
| stage 1 on the database already applied, marker absent | 1 | `STOP: a pre-check verdict read FAIL`, on 1, 2, 3, 4, 9, 11, `journal_rows_before` and 13; no transcript moved, journal 96, nothing re-applied |
| stage 3 with stage 2's transcript removed | 1 | `STOP: stage 2's post-check transcript is missing`; no ACTOR line, so no session acted |
| stage 3 with the subjects file's T1 and T3 swapped | 1 | `STOP: stage 1's BEFORE transcript and its subjects file do not name the same actors`; no session acted |
| EXECUTE on the helper revoked from `authenticated` after the apply (H22's catalogue) | stage 2: 1; stage 3: 1 | stage 2: post-check 13 FAIL and `STOP: post-check 12 or 13 is not OK ... Do NOT run stage 3`; stage 3: `STOP: stage 2's post-check read FAIL`, no ACTOR line, so nothing ran as `authenticated` |

**The patient id reached no transcript**: 0 matches in every segment's output and in
every BEFORE and AFTER transcript, on both passing arms. The subjects file was mode 600.
**The server did not crash** during these runs: its auxiliary processes still date from
the 21:00:32 UTC recovery.

**Re-run after review round 1**, because the behaviour check's bytes changed (its banner
line) and stages 1 and 3 pin and run it: both passing arms again, extracted from this
revision of the document by the same script, on fresh `b13a2_fix_doc_run` and
`b13a2_fix_doc_none` (`b13a-fix/docblocks/logs/run.log`, `none.log`), each dropped after.
Every exit 0, and every line printed as in the first two rows above: the pick, `17 OK / 0
VACUOUS / 15 FAIL` then `32 OK / 0 VACUOUS / 0 FAIL` with five actors, `15 OK / 6 VACUOUS
/ 11 FAIL` then `26 OK / 6 VACUOUS / 0 FAIL` with `none`, `20/20 pre-check OK, 16/16
post-check OK, journal 95 to 96`. The `SHABEHAVIOUR` pin and its check, extracted from
stages 1 and 3 and run in the worktree: exit 0 each. The patient id again reached only
the mode-600 subjects file. The server's auxiliary processes still date from the
21:00:32 UTC recovery.

**Re-run after review round 2**, because the migration's sha256 moved (and with it the
pre-check's and post-check's), `PICK` and the shape logic of stages 1 and 3 changed:
extracted from this revision by the same script (`b13a-fix2/docblocks`), all five
blocks pass `zsh -n`, and six arms ran on fresh `b13a2_fix_doc2_*` databases, each
dropped after (`b13a-fix2/docblocks/logs/arms.log`): the four shapes `11`, `10`, `01` and
`00`, every exit 0 and every profile as the table in "The behaviour subjects on
production" states, each stage 3 ending `CARE-02a BEHAVES AS RULED AT THE RLS LAYER`;
the missing T1, exit 1 at `a MISSING SUBJECT` with the journal at 95 and the helper
absent; and the reshaped subjects file, exit 1 at stage 3 with no session acting. Every
sha256 pin in the five blocks and in the facts table, 15 in all, was checked against the
worktree file it names: 15 match. The patient id reached only the mode-600 subjects
files. The server's auxiliary processes still date from the 21:00:32 UTC recovery.

**Re-run after review round 3**, 2026-09-28 00:35 UTC, because the pre-check's sha256
moved (a comment line, `precheck-0098-care02a.sql:65`) and stage 1 pins it as `SHAPRE`:
extracted from this revision by the same script (`b13a-fix3/docblocks`), all five
blocks pass `zsh -n`, and the same six arms ran on fresh `b13a2_fix_doc3_*` databases,
each dropped after (`b13a-fix3/docblocks/logs/arms.log`), every line printed as in round
2: the four shapes exit 0 with `after 32 OK / 0 VACUOUS / 0 FAIL`, `30 / 2 / 0`,
`28 / 4 / 0` and `26 / 6 / 0`, each stage 2 `20/20 pre-check OK, 16/16 post-check OK,
journal 95 to 96`; the missing T1 exit 1 with the journal at 95 and the helper absent;
the reshaped subjects file exit 1 at stage 3 with no session acting. The segments start
after stage 1's pin checks, so the `SHAPRE` pin and its check were extracted from stage 1
and run on their own (`b13a-fix3/docblocks/logs/pins.log`): exit 0 in the worktree, and
exit 1 with `STOP: the pre-check on disk is not the approved file` in a scratch tree
holding round 2's pre-check. Every sha256 pin in the five blocks (11) and in the facts
table (7) was checked against the worktree file it names: 18 of 18 match. The patient id
reached only the mode-600 subjects files. The server's auxiliary processes still date
from the 21:00:32 UTC recovery.
