# 0096: apply CARE-02a v2, the care team reads the ficha and the registos, at the therapist's own clinics only

**Status: PROMOTED ON #1471's HELD BRANCH, NOT APPLIED.** One migration,
`packages/db/migrations/0096_care02a_care_team_reads.sql`, applied by GREEN from the HELD
head of PR #1471, before #1471 merges. Six blocks, each pasted whole, on its own and in
order: stage 0 (the promotion, the files and the held head it runs from), GREEN's CLOCK
CHECK (in the dispatch, not here), stage 1 (the HEAD CHECK, the pre-check, the pick, the
behaviour check BEFORE, the apply), stage 2 (the post-check), stage 3 (the behaviour check
AFTER) and the closing journal read.

**THE ORDER, ruled by the owner and the lead on 2026-09-30. Nothing runs out of it:**

1. **PROMOTE.** The commit that carries this document renames the file into
   `packages/db/migrations/0096_care02a_care_team_reads.sql`, bytes unchanged, and adds
   its journal entry (`idx 93`, `when 1788501700000`) and its supabase mirror.
2. **APPLY.** GREEN applies 0096 to production from #1471's HELD head, by this document,
   in the run window GREEN's dispatch names. #1471 cannot merge before the count
   GATE-CHANGE, and the GATE-CHANGE cannot merge before the apply, so the apply runs from
   the held head. **The owner does NOT merge #1471 before the apply.**
3. **COUNT GATE-CHANGE.** The owner merges #1500, which moves `EXPECTED_COUNT` from 26 to
   27, by hand, after GREEN's report says 0096 is applied.
4. **MAIN INTO #1471.** SOLO merges `main` into #1471 (`git merge --no-edit origin/main`,
   never a rebase), and every check runs again.
5. **#1471 MERGES.** The owner takes `held-for-apply` off and merges it.

One rule governs every halt, in these words here and in GREEN's dispatch:

THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any
STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and
nothing continues to the next block. After stage 1 has committed, a post-commit STOP
still stops the sitting: the write stands, and stages 2 and 3 (READ ONLY) run only on the
owner's or the lead's word. The only onward path from stage 1 to stage 2 is exit 0
with the line "0096 APPLIED. Paste stage 2 now." No block, and no dispatch
step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:
no closing read and no journal read. Whether and when a halted sitting starts again
is the lead's call, never the runner's.

**That is the halt rule of `docs/migration-apply-0095.md`, word for word, with its
migration number changed and no other change.**

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings, on
the owner's dispatch naming this migration by filename (`CLAUDE.md`, "Who applies
migrations"). The lane that wrote this document never runs it.

**THE FIFTH RENUMBERING, and why the file says 0098 inside.** The owner and the lead ruled
on 2026-09-30: "renumber (option 1). CARE-02a 0096 (#1471), registo write policies 0097
(#1475), staging index 0098 (#1469), grants revoke 0099 (#1397), SAT-01 from 0100. Apply
order equals file order from now; the lead rules apply order only in number order or after
a renumber." And: "Tonight's sitting is 0096 at journal idx 93; its count GATE-CHANGE (26
to 27) keeps the documented order: promote, apply, count GATE-CHANGE, main into #1471,
#1471." This document was `docs/migration-apply-0098.md` until that ruling; it assumed the
staging index (then `0097`) before it and journal `idx 95`, and both are superseded. 0096
follows 0095, which production has carried since 2026-09-29. The branch keeps its old name,
`care/0098-CARE-02a-care-team-reads`.

| Fact | Value |
|---|---|
| Card | `CARE-02a` |
| Ruling | Owner, 2026-09-27: CARE-02a authored and HELD on the Tier C list. The acceptance is the owner's CHECK: `viewer_care_team_patient_ids()` joined into the `patients` and `clinical_records` therapist arms; the `patient_care_team` insert policy admits a therapist writing their own booking's row, and the select policy admits therapists reading their own list; `attachments`, `clinical_episodes` and `appointment_notes` stay as they are. **And the owner's ruling of the same day on the open question: "limit to their clinic only".** Numbered `0098` that day; renumbered `0096` by the owner and the lead on 2026-09-30 (the fifth renumbering, quoted above) |
| Migration | `packages/db/migrations/0096_care02a_care_team_reads.sql`, sha256 `fbf8cad1dc959a600b0e8b3ccffb7225e2295919e5dfe08432301faf6b5e9c45` |
| Promoted from | `packages/db/migrations-pending/NEXT-AFTER-0097_care02a_care_team_reads.sql`, **bytes unchanged** (`git mv`, 100% similarity): the pending file's sha256 is the promoted file's, and the hash drizzle records |
| Journal | `idx 93`, `when 1788501700000`, tag `0096_care02a_care_team_reads`; `when` strictly above 0095's `1788501600000`, and 0095's entry (`idx 92`) directly before it |
| Mirror | `supabase/migrations/0096_care02a_care_team_reads.sql`, written by `scripts/sync-supabase-migrations.mjs` with its fixed header; checked by content by `scripts/check-journal.mjs`, which stage 0 runs with `node` directly, after asserting its sha256 |
| Must follow | `0095_conflict_name_visibility`, sha256 `cfdfffff71a6c847a791ce17c71bbc6e05b75a367e9c8f03dfcb0cfc638f5806`, journal `when 1788501600000`: merged in #1438 and APPLIED to production on 2026-09-29 (journal 92 to 93). Stage 1 pins both values, checks them against 0095's file and journal entry on the held head, and passes them to the pre-check, whose arm 11 proves on production that the newest journal row is 0095's by hash and `when` |
| Production journal at the sitting | **93 rows before, 94 after.** 0000 to 0095 are applied; the journal holds fewer rows than there are file numbers, as it always has, and `check-journal.mjs` reconciles files with journal entries, not with numbers |
| PR | #1471, branch `care/0098-CARE-02a-care-team-reads` (the branch keeps its old number; the migration is `0096`), labelled `held-for-apply`, never armed, unmerged until after the apply and the count GATE-CHANGE |
| Runs from | #1471's HELD head. Stage 0 resolves `refs/pull/1471/head` and the held branch, requires them to be the same commit, checks it out DETACHED and records its sha in `/tmp/0096-held.sha`; every later stage uses that recorded sha, never a fresh fetch, and stage 1 HALTS if the head has moved since (the HEAD CHECK) |
| The count GATE-CHANGE | #1500, branch `sec/0096-secdef-count-27`: `EXPECTED_COUNT` 26 to 27 in `packages/db/scripts/check-security-definer-owner.mjs`, and that one pin in `.github/gate-manifest.json`. Labelled `held-for-apply`, never armed, merged by the owner by hand after the apply |
| This document | `docs/migration-apply-0096.md`, pinned by `docs/migration-apply-0096.sha256` and asserted by every stage; GREEN's dispatch pins its sha256 on its own and checks it by machine twice: on the held head BEFORE YOU START resolves, and at the sha stage 0 recorded, in the CLOCK CHECK before stage 1 |
| Pre-check | `scripts/db/precheck-0096-care02a.sql`, READ ONLY, **20 verdicts**, sha256 `7fc2085e9318b36610bd9ce1c3f0d504fe3013930985951b41457fc34e938b02`. Takes `-v prev_hash` and `-v prev_when` |
| Post-check | `scripts/db/postcheck-0096-care02a.sql`, READ ONLY, **16 verdicts**, sha256 `acd879888c4643057c48ff1a926aca5e5a634dec258093052c03c5fa482ecda1`. Takes five carries |
| Behaviour check | `scripts/db/behaviour-care02a-readonly.sql`, READ ONLY, **32 arms**, up to five actors and one patient, sha256 `7698cabc62e9501d680738e8e27cf2e979d3d1adeed72b646daa12d1031e0644`. Run TWICE in this sitting, before the apply and after it, with the same subjects |
| Behaviour subjects | `-v patient_id`, `-v t1_id`, `-v t2_id`, `-v t3_id`, `-v t4_id`, `-v n_id`. **Picked by GREEN in stage 1, READ ONLY, by the rule the block carries (`PICK`)**: the lowest id that meets each slot. T4 and N are each picked, or passed as `none`, independently of the other (four shapes, each measured). The patient id is never printed and never committed (this repository is public). See "The behaviour subjects on production" |
| The programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093`; `packages/db/scripts/read-applied-migrations.mjs` (the closing read), sha256 `867e2823130b1ec1a9f7790522968924ecd872452c48322884c3e22efb5704d1`. All three byte-identical to `origin/main` at `453cf2c4` and to 0095's pins, and pinned in every block that runs them |
| The program that runs without credentials | `scripts/check-journal.mjs`, run by stage 0 only, sha256 `7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59`, byte-identical to `origin/main` at `453cf2c4`. It imports nothing but `node:` builtins, so its pin covers everything it runs |
| Not pinned, and why | what the pinned programs load in turn: drizzle-kit and the rest of `node_modules`, and `packages/db/drizzle.config.ts`, which drizzle-kit loads through `verified-migrate.mjs` (0094 and 0095 did not pin them either). Their tree is fixed instead: GREEN's BEFORE YOU START requires #1471's head to BE the sha its dispatch names, and the CLOCK CHECK and the HEAD CHECK halt on any other head before the apply |
| Run window | named by GREEN's dispatch, never here: its CLOCK CHECK records it in `/tmp/0096-window.ok` with the sha stage 0 recorded, as three Lisbon times `YYYYMMDDHHMM` (opens, the last minute stage 1 may start, ends). Stage 1 refuses to start outside it and checks again just before the apply; stages 2, 3 and the closing read refuse at or after its end. Stage 0 removes the record, so only a CLOCK CHECK pasted after stage 0 can write it |
| What it changes | ONE new function, `public.viewer_care_team_patient_ids_at_my_clinics()`, nullary, SECURITY DEFINER, STABLE, `search_path = public`, owned by `postgres`, EXECUTE for `authenticated` only; and FOUR `ALTER POLICY` statements, each restating the policy's current expression and adding one arm: `patients_select` USING, `clinical_records_select` USING, `patient_care_team_select` USING, `patient_care_team_insert` WITH CHECK. No policy is created or dropped; the policy count is flat on every table. The SECURITY DEFINER count in `public` moves 26 to 27 |
| What it never touches | every other policy (one md5 over all of them, a second over the eleven others on the three tables, a third over the thirteen on `attachments`, `clinical_episodes`, `appointment_notes`, `patient_note_revisions` and `guest_clinical_intakes`), every existing function (one md5 over every function in `public` but the new one), every existing grant (one md5 over every table, column and function ACL in `public` but the new function's). `viewer_care_team_patient_ids()`, `clinical_therapist_sees_patient()` and `clinical_admin_sees_patient()` are NOT edited, so no write widens |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its own
sha256, so the digest lives in `docs/migration-apply-0096.sha256` and every stage checks it
with `shasum -a 256 -c` before it trusts a pin written here. The sidecar sits on the same
head as the document, so a head that moved to a new document and a new sidecar together
would pass that check. **The sidecar alone does not close that, and the HEAD CHECK alone
does not either:** the HEAD CHECK compares #1471's head with the sha stage 0 recorded, so it
cannot see a head that moved BEFORE stage 0 fetched. GREEN's dispatch closes it by machine.
It pins this document's sha256 and #1471's head on its own; its BEFORE YOU START checks both
and records that head; and its CLOCK CHECK, pasted between stage 0 and stage 1, halts before
the apply unless stage 0 recorded that same head and the document at the recorded sha still
hashes to the pin. From stage 0 on, the HEAD CHECK halts on any moved head before the apply.

**There is no `#` line inside any block,** every parameter a colon follows is braced, there
are no backslash continuations and no `!` except `test !`. The blocks are pasted into zsh
(`scripts/owner-blocks-survive-zsh.test.mjs` reads this document by its number). Narration
is `echo`.

**The promoted file's own header, and its helper's COMMENT, still read "0098".** The header
says "RULED NUMBER 0098" and "It must follow 0097", and cites the 2026-09-27 queue
(`packages/db/migrations/0096_care02a_care_team_reads.sql:13-20`); the `COMMENT ON FUNCTION`
text production will carry begins "CARE-02a (0098)" (`:340-341`). That is stale, and it is
left stale on purpose: a promotion does not touch one byte of the file, which is the only
reason the sha256 above can pin anything. Read the header as a record of when the file was
authored, and `packages/db/migrations-pending/README.md`'s Promoted table for where it sits.
No check reads the COMMENT. The two apps/web modules that ask whether the helper exists are
named for the authoring number too (`apps/web/lib/patients/care-team-0098-state.ts`), and
the DB-gated tests of both packages title their arms "0098 APPLIED" and "0098 NOT APPLIED":
the app half is on `main` byte for byte, and this PR does not touch it.

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
(`0096_care02a_care_team_reads.sql:78-87`).

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
membership (`0096_care02a_care_team_reads.sql:89-107`).

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
the wider one (`0096_care02a_care_team_reads.sql:108-128`).

**The new helper, and why it is new.** `viewer_care_team_patient_ids_at_my_clinics()`
(`0096_care02a_care_team_reads.sql:302-348`) reads the team through 0091's
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

Checked by the operator before GREEN's BEFORE YOU START. None of these is a block.

1. **0094 and 0095 are applied to production and merged.** 0094 was applied on 2026-09-29
   at 00:27 Lisbon (journal 91 to 92) and merged in #1459; 0095 on 2026-09-29 at 13:09
   Lisbon (journal 92 to 93) and merged in #1438. Production's journal reads **93**, and
   GREEN's BEFORE YOU START refuses any other count. The pre-check re-proves it by machine:
   `journal_rows_before` must read **93**, 0093 must be in the journal by hash (arm 10),
   and the newest journal row must be 0095's, by hash and `when` (arm 11).
2. **0096 is promoted on #1471's branch** (the commit that carries this document): the
   rename, its journal entry, the supabase mirror and the README's Promoted row. Stage 0
   proves the rename, the journal and the mirror, and STOPs without them.
   `packages/db/tests/security-definer-owner.test.ts` needs no edit: since #1491 it derives
   the SECURITY DEFINER set from `packages/db/migrations`, so the new helper joins it by the
   rename.
3. **The count GATE-CHANGE, #1500, is open, labelled `held-for-apply` and unmerged.** It
   merges only after the apply ("Order of merges").
4. **#1471's required checks on the promoted head read green except the count.** Two
   required checks read the SECURITY DEFINER count, and on the promoted head both read red
   on it, by construction, until #1500 lands: the DB-gated job's count step
   (`.github/workflows/db-tests.yml:199`) prints `expected exactly 26 SECURITY DEFINER
   function(s) in public, found 27` and runs no suite after it, and
   `Lint + typecheck + test` fails the count arms of
   `packages/db/tests/security-definer-owner.test.ts` (the set derived from the
   migrations holds 27, the frozen constant 26). Every other required check reads green,
   and `held-for-apply-blocks-merge` reads red while the label is on, which is its job.
   Each red is read off its log as the count and nothing else. The DB-gated suites'
   evidence for this PR is its last run before the promotion (the pre-0096 profile,
   green) and the rehearsal (0096's profile); CI's own database asserts 0096's profile
   for the first time at step 4 of the order.
5. **The held head is frozen for the sitting.** From GREEN's BEFORE YOU START until GREEN's
   report, nothing is pushed to #1471 and nothing is merged to `main`, and no PR is armed
   for auto-merge. SOLO fills the held head's sha into the dispatch at the sitting, after
   checking that no push has moved it.
6. **The app half is live.** #1470 merged to `main` as `7633ff64` on 2026-09-28, and every
   production deployment of `main` since carries it ("The app half is already live" below).
7. **GREEN's dispatch names `0096_care02a_care_team_reads` and a run window that falls
   outside both clinics' opening hours,** and GREEN is launched with
   `scripts/apply-lane/osteojp-apply-settings.json`. This document carries no date: the
   dispatch names the window and its CLOCK CHECK records it, and stage 1 also reads the
   clinics' own hours from the database.

## The app half is already live, so the apply opens nothing unguarded

**The owner ruled on 2026-09-27: "0098 app half as its own PR merging first."** It did:
#1470, `7633ff64`, on 2026-09-28, the `apps/web` code and its tests and no migration. Every
file under `apps/` on this branch is byte-identical to `main`'s, so the two cannot conflict.
On production, from that deploy to the apply:

- **Reads keep the narrow scope.** The app asks the schema whether the helper exists
  (`to_regprocedure`, `apps/web/lib/patients/care-team-reads-gate.ts:55-99`) and, without
  it, keeps the narrow read scope (`apps/web/lib/patients/scope.ts:103-123`), so no
  statement names a function that is not there. "Absent" is asked again each minute, so the
  apply widens the read scope within a minute of stage 1, with no redeploy.
- **A therapist's own booking tries its care-team row and is refused.** That write is not
  behind the helper question: 0091's insert policy refuses it, the writer's savepoint
  confines the refusal (`apps/web/lib/admin/care-team-auto.ts:27-33`, `:68-70`), the
  booking stands, and one line is logged per such booking ("care-team: the automatic
  care-team write failed and was rolled back to its savepoint; the booking itself is
  unaffected"). Expected until the apply; it stops there.
- **No registo writer widens with the apply.** Several registo writers read their source
  registo with no scope but RLS and then write where their own policy would admit them
  anyway: a new version (`createAddendum`), an annulment (`annulRecord`), an attachment on
  a draft (`apps/web/lib/clinical/storage.ts`). From the apply on, RLS lets a care-team
  therapist at the patient's clinic SELECT a colleague's registo. The app half closed that
  before it could open: every such writer reads its source row under
  `therapistRegistoWriteScope`, the pre-0096 reach (the reasoning is
  `apps/web/lib/patients/scope.ts:132-140`, the scope `:125-148`).

**Between the apply and #1471's merge, production runs one migration ahead of `main`.**
`main` has no `0096` file until step 5 of the order, so a journal read against `main` names
one row with no matching file, and the daily `prod-drift-check` reports it; that report is
correct and informational. That is the state the ruled order accepts, for as short a time
as steps 3 to 5 take after GREEN's report.

## Order of merges

**The order is the ruling's, at the top of this document: promote, apply, count
GATE-CHANGE, main into #1471, #1471.** Why two PRs and why this order:

- **The SECURITY DEFINER count is a frozen gate.** Promoting 0096 raises the count of
  SECURITY DEFINER functions in `public` from 26 to 27. `EXPECTED_COUNT` is
  `packages/db/scripts/check-security-definer-owner.mjs:117`, pinned by
  `.github/gate-manifest.json:46`, so it moves only in a PR titled `GATE-CHANGE` that
  changes nothing but gate files and the manifest (rule C of
  `scripts/assert-gates-unchanged.mjs`), is never armed and is merged by the owner by hand:
  #1500. That PR cannot carry the migration, so the two land separately.
- **Two required checks read it, and whichever PR lands alone reddens both.** The DB-gated
  job's count step (`.github/workflows/db-tests.yml:199`) runs before every suite in that
  job; the unit run's `packages/db/tests/security-definer-owner.test.ts` derives the set
  from `packages/db/migrations` and pins it to `EXPECTED_COUNT`. On #1471's promoted head
  they read 27 against 26; on #1500 alone, 26 against 27. **Together they are green**:
  measured locally on #1471's promoted tree with #1500's constant in place,
  `security-definer-owner.test.ts` 28 of 28, its negative arms (a wrong owner, a realistic
  owner split, one function missing, one more than expected) each still failing the checker
  as they must.
- **`main` reads red on the count from step 3 to step 5, one CI run.** The other two orders
  are refused. #1471 first would merge a migration past a red required check whose job
  never ran a suite on the promoted head. #1500 before the apply would keep `main` red
  through the sitting, and for as long as a STOP holds it. **Step 3 merges a PR whose
  required checks read red, and so does every other order**: whether branch protection lets
  the owner do that is his setting, not read here.
- **Step 4 is where CI first asserts 0096's profile on its own database.** Every DB-gated
  arm 0096 flips reads the catalogue and asserts whichever answer the database owes, never
  skips, and says which in its title or its log
  (`apps/web/lib/patients/care-team-0098-state.ts:1-45`,
  `packages/db/tests/care-team-appointment-visibility.db.test.ts:79-167`, `:512-534`); a
  database missing 0096 while the repository has it promoted THROWS in both packages, so it
  cannot read as a pass.

## Undoing 0096: a new migration, policies first, the helper last

**It is not reversible by editing it.** Once applied, 0096's bytes are the hash drizzle's
journal holds, so an undo is a NEW numbered migration, ruled onto the Tier C list like
any other, rehearsed, and applied by GREEN; never a hand edit on production (the rule
`docs/migration-apply-0092.md:708-710` states for 0092). **It runs in two steps, in this
order, and the order is the safety.**

**Step 1: restore the four policy expressions, and leave the helper in place.** The undo
migration's `ALTER POLICY` statements restore each expression from the file 0096 read it
from (`0096_care02a_care_team_reads.sql:139-151`): `patients_select` from
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
no longer admits them, so the ficha, the list and the registos show the pre-0096 answer.
Documentos is the one read RLS does not back (`attachments` is tenant-only, the N5
wave's): between step 1 and the app revert the Documentos reader still admits a team
patient at the therapist's clinic, exactly as it does while 0096 stands and no more, and
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
count back from 27 to 26, which is a GATE-CHANGE (see "Order of merges").

**What step 1 costs.** A therapist's own booking row (B7) is refused again by 0091's
insert policy, and the writer's savepoint confines the refusal to the care-team write
while the booking stands (`apps/web/lib/admin/care-team-auto.ts:27-33`, `:68-70`): the
same state as merged-before-apply. The apply window's concern does not arise: RLS
narrows back, so no registo writer reaches further than it did before 0096.

## The promotion, and what these pins are for

**Every pin in this document is for the PROMOTED file on #1471's held head.** The promotion
is one commit on `care/0098-CARE-02a-care-team-reads`, made after `origin/main` was merged
in (so that 0095's file and journal entry are there to follow), and kept separate from that
merge:

1. `git mv packages/db/migrations-pending/NEXT-AFTER-0097_care02a_care_team_reads.sql packages/db/migrations/0096_care02a_care_team_reads.sql`,
   100% similarity; the body's sha256 is `fbf8cad1...9c45` before and after;
2. one journal entry appended to `packages/db/migrations/meta/_journal.json`:
   `{"idx":93,"version":"7","when":1788501700000,"tag":"0096_care02a_care_team_reads","breakpoints":true}`,
   directly after 0095's `idx 92`, `when 1788501600000`;
3. the mirror, by `node scripts/sync-supabase-migrations.mjs`, which writes
   `supabase/migrations/0096_care02a_care_team_reads.sql` with its fixed header;
4. the pending README's row moved to its Promoted table, and its queue paragraph brought to
   the fifth renumbering;
5. the three check files brought to the new number: `precheck-0098-care02a.sql` and
   `postcheck-0098-care02a.sql` renamed to `0096` names, and every "0098" in their labels
   and comments, and in `behaviour-care02a-readonly.sql`'s, changed to "0096". **One
   predicate moved, and only one:** the pre-check's `journal_rows_before` expects **93**
   (was 95), and its arm 11 names 0095 as the newest row. Every md5 pin, every other
   literal and every verdict's logic is unchanged ("What changed at the renumbering",
   below, lists it byte by byte);
6. this document, renamed from `docs/migration-apply-0098.md`, and its sidecar with it.

`node scripts/check-journal.mjs` then reads `94 .sql files match 94 journal entries`.

**Exactly one `packages/db/migrations/0096_*.sql` may exist, and no `0097_*.sql`; if
anything else is ever found, STOP.** The number is the apply authorisation (`CLAUDE.md`,
the binding table under "SOLO's record", and the fifth renumbering above): `0097` is the
registo write policies (#1475), `0098` the staging index (#1469), `0099` the grants revoke
(#1397). `0097` is not promoted until 0096 is applied to production, so the journal on the
held head ends at 0096 and `verified-migrate.mjs` finds exactly one pending migration.

**What was a placeholder and is now filled:** the PR number, `1471`. **What is not filled:**
the section "Measured on production, READ ONLY". No READ ONLY run preceded this sitting, so
stage 1 is the first measurement, and everything it learns is learned before the apply (see
that section).

## The HEAD CHECK, and running from the held head

The migration runs from #1471's HELD head, before #1471 merges, and nothing is pushed to
#1471 or merged to `main` for the sitting. No block reads `main`, and there is no separate
HEAD CHECK to paste: the machine runs it inside the blocks.

- **Stage 0** refuses once stage 1 has applied, checks that the apply worktree is clean,
  removes the previous held-sha and run window records, fetches, resolves
  `refs/pull/1471/head` and `origin/care/0098-CARE-02a-care-team-reads`, and STOPs if the
  branch is gone (#1471 may have merged before the apply, against the order) or if the two
  are not the same commit. It checks that sha out DETACHED, verifies the sidecar, the
  promotion, the journal, the mirror and every pin (check-journal's before it runs it), and
  only then records the sha in `/tmp/0096-held.sha` and prints `running from the held head
  of PR 1471 <sha>`.
- **The run window is checked by machine in every block from stage 1 on,** from the record
  GREEN's CLOCK CHECK writes after stage 0. Stage 1 refuses to start before the window opens
  or after the last minute it may start, and checks again just before the apply; stages 2
  and 3 and the closing read refuse at or after the window's end. A missing record, or one
  written for another sha, is a `STOP:` in each.
- **Stage 1 begins with the HEAD CHECK:** read the recorded sha, fetch, resolve #1471's head
  and the held branch again, print them with the worktree's HEAD, and HALT on any
  difference with `STOP: the head of PR 1471 moved since stage 0, the freeze was broken.`
  (or the branch's or the worktree's own STOP). It runs before the environment is loaded and
  before psql, so a halt there has touched no database and applied nothing. Every file it
  runs is then asserted by sha256 before it runs any.
- **After stage 1 has applied: NEVER run stage 0 or 1 again.** Each refuses once the applied
  marker `/tmp/0096-applied.ok` exists, and `verified-migrate.mjs` refuses an
  already-applied migration regardless (exit 3).
- **Stages 2 and 3 and the closing read are READ ONLY** and run from the recorded sha
  whatever #1471 has done since: each prints whether its head moved, with both shas, and
  never stops on it. Every file they run is asserted by sha256 at that sha, so a merge of
  `main` into #1471 after the apply changes nothing they read.
- **A moved head before the apply ends the sitting.** Nothing is applied, every sha goes in
  the report, and whether and when to start again is the lead's call.
- **If `/tmp/0096-held.sha` is gone,** stages 1 to 3 stop, and the lead rules.

## STAGE 0: the promotion, the files and the recorded held head

**This stage PROVES the promotion; it never performs it.** It reads no database.

```
(
set -eo pipefail
PR=1471
BRANCH=care/0098-CARE-02a-care-team-reads
DOCPIN=docs/migration-apply-0096.sha256
MIG=packages/db/migrations/0096_care02a_care_team_reads.sql
PEND=packages/db/migrations-pending/NEXT-AFTER-0097_care02a_care_team_reads.sql
MIRROR=supabase/migrations/0096_care02a_care_team_reads.sql
PREV=packages/db/migrations/0095_conflict_name_visibility.sql
SHA0096=fbf8cad1dc959a600b0e8b3ccffb7225e2295919e5dfe08432301faf6b5e9c45
SHAPREV=cfdfffff71a6c847a791ce17c71bbc6e05b75a367e9c8f03dfcb0cfc638f5806
SHAPRE=7fc2085e9318b36610bd9ce1c3f0d504fe3013930985951b41457fc34e938b02
SHAPOST=acd879888c4643057c48ff1a926aca5e5a634dec258093052c03c5fa482ecda1
SHABEHAVIOUR=7698cabc62e9501d680738e8e27cf2e979d3d1adeed72b646daa12d1031e0644
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
SHAREADER=867e2823130b1ec1a9f7790522968924ecd872452c48322884c3e22efb5704d1
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/0096-applied.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 1 has ALREADY APPLIED 0096 in this sitting. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stages 2 and 3 (READ ONLY) run only on the owner's or the lead's word"; exit 1; }
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/0096-held.sha /tmp/0096-window.ok
git fetch origin --prune
git fetch -q origin refs/pull/${PR}/head
HELD=$(git rev-parse FETCH_HEAD)
BR=$(git rev-parse -q --verify refs/remotes/origin/${BRANCH} || true)
echo "PR ${PR} head:      ${HELD}"
echo "held branch head: ${BR}"
[ -n "${BR}" ] || { echo "STOP: the held branch ${BRANCH} is gone from origin, so PR ${PR} may have merged before the apply, against the documented order. Nothing was checked out. The lead rules"; exit 1; }
[ "${BR}" = "${HELD}" ] || { echo "STOP: the held branch and the head of PR ${PR} are not the same commit. Nothing was checked out"; exit 1; }
[ "$(git cat-file -t ${HELD})" = commit ] || { echo "STOP: ${HELD} does not resolve to a commit"; exit 1; }
git checkout -q --detach ${HELD}
[ "$(git rev-parse HEAD)" = "${HELD}" ] || { echo "STOP: the checkout did not land on ${HELD}"; exit 1; }

test -f ${DOCPIN} || { echo "STOP: the document pin is not on disk at the held head"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0096 is not on disk at the held head, so the promotion is not there"; exit 1; }
test ! -f ${PEND} || { echo "STOP: the pending copy still exists, so the rename did not happen"; exit 1; }
test -f ${MIRROR} || { echo "STOP: the supabase mirror of 0096 is not on disk"; exit 1; }
N96=$(find packages/db/migrations -maxdepth 1 -name '0096_*.sql' | wc -l | tr -d ' ')
[ "${N96}" = 1 ] || { echo "STOP: ${N96} files claim migration number 0096, not 1"; exit 1; }
N97=$(find packages/db/migrations -maxdepth 1 -name '0097_*.sql' | wc -l | tr -d ' ')
[ "${N97}" = 0 ] || { echo "STOP: ${N97} files claim migration number 0097, and 0097 is not promoted until 0096 is applied"; exit 1; }
test -f ${PREV} || { echo "STOP: 0095 is not on disk at the held head"; exit 1; }
test -f scripts/db/precheck-0096-care02a.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/postcheck-0096-care02a.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f scripts/db/behaviour-care02a-readonly.sql || { echo "STOP: the behaviour check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f packages/db/scripts/read-applied-migrations.mjs || { echo "STOP: the migration reader is not on disk"; exit 1; }
test -f scripts/check-journal.mjs || { echo "STOP: check-journal is not on disk"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0096}" ] || { echo "STOP: 0096 on disk is not the approved body"; exit 1; }
[ "$(shasum -a 256 ${PREV} | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0095 on disk is not the file production applied"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0096-care02a.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0096-care02a.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-care02a-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/read-applied-migrations.mjs | cut -d' ' -f1)" = "${SHAREADER}" ] || { echo "STOP: the migration reader on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/check-journal.mjs | cut -d' ' -f1)" = "${SHACJ}" ] || { echo "STOP: check-journal on disk is not the approved file"; exit 1; }

node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const e=j.entries[j.entries.length-1];const p=j.entries[j.entries.length-2];console.log('newest journal entry: idx '+e.idx+', when '+e.when+', tag '+e.tag+', of '+j.entries.length+'; before it idx '+p.idx+', when '+p.when+', tag '+p.tag);process.exit(j.entries.length===94&&e.idx===93&&e.when===1788501700000&&e.tag==='0096_care02a_care_team_reads'&&p.idx===92&&p.when===1788501600000&&p.tag==='0095_conflict_name_visibility'?0:1)" || { echo "STOP: the journal does not end idx 92 0095 (when 1788501600000) then idx 93 0096 (when 1788501700000), of 94"; exit 1; }
node scripts/check-journal.mjs 2>&1 | tee /tmp/0096-check-journal.out
grep -qF '94 .sql files match 94 journal entries' /tmp/0096-check-journal.out || { echo "STOP: check-journal did not reconcile 94 files with 94 journal entries"; exit 1; }

echo "${HELD}" > /tmp/0096-held.sha
echo "running from the held head of PR ${PR} ${HELD}, DETACHED, recorded in /tmp/0096-held.sha"
echo "0096 PROMOTION, NUMBER AND FILES VERIFIED ON THE HELD HEAD"
)
```

**EXPECT: `PR 1471 head: <sha>` and `held branch head: <sha>`, the same sha twice; the
sidecar line `docs/migration-apply-0096.md: OK`; then
`newest journal entry: idx 93, when 1788501700000, tag 0096_care02a_care_team_reads, of 94; before it idx 92, when 1788501600000, tag 0095_conflict_name_visibility`;
then check-journal's line `... 94 .sql files match 94 journal entries in order ... the supabase mirror matches by CONTENT.`;
then `running from the held head of PR 1471 <sha>, DETACHED, recorded in /tmp/0096-held.sha`,
then `0096 PROMOTION, NUMBER AND FILES VERIFIED ON THE HELD HEAD`. Exit 0.** git's fetch
lines may print between them. It reads no database and prints no count of anything in it.
The sha it records is the one every later stage runs from, and GREEN's CLOCK CHECK, next,
halts unless it is the sha the dispatch names.

**The clock.** Both clinics were ruled to 08:00 to 21:00 on every open day
(`docs/data-op-location-hours.md:18`, AGENDA-2100), and the owner's rule of 2026-09-27 runs
a sitting only while the clinics are closed, so GREEN's dispatch names a window outside
08:00 to 21:00 Lisbon and its CLOCK CHECK records it. The hours are data, not code: stage 1
also reads `locations.opens_at` and `closes_at` READ ONLY right before the pre-check and
STOPs if any active clinic is open by its own row, so an hours change after that ruling is
caught there.

## What is new here, because 0096 is not shaped like 0093

0093 CREATED a table, so its pre-check proved things ABSENT and its post-check
asserted deltas. **0096 creates one function and alters four policies**: 0092's ALTER
shape four times over, and 0091's helper contract once.

- **The pre-check proves each of the four policies PRESENT and exactly as main's
  migrations leave it**, by the md5 of its rendered expression (arms 1 to 4:
  `patients_select` as `0074:222-242` leaves it, `clinical_records_select` as
  `0045:221-240`, the two care-team policies as `0091:108-124`). `ALTER POLICY ...
  USING` replaces whatever expression it finds, so a policy somebody edited by hand
  would be overwritten without a word, and one already carrying 0096's arm would mean
  0096 had run outside the journal. Both STOP here, before the apply.
- **It proves the new helper's name is FREE** (arm 13), because `CREATE OR REPLACE`
  would silently take over a same-named function somebody else made.
- **It pins the eleven OTHER policies on the three tables by one md5** (arm 5), because
  0096 relies on them NOT moving: the writes of `patients` and `clinical_records` and
  `patient_care_team_update` are what keep a care-team-only therapist writing nothing;
  and **the thirteen policies on the five tables 0096 leaves to the N5 wave** by another
  (arm 14).
- **It pins the five helpers** (arm 7): the three the new helper and the new arms call
  or reproduce, `viewer_care_team_patient_ids()`, `viewer_location_ids()` and
  `clinical_admin_sees_patient()`; the insert arm's `viewer_treated_patient_ids()`; and
  the one 0096 must NOT touch, `clinical_therapist_sees_patient()`.
- **The post-check asserts the new function exactly** (verdict 12: one of it, nullary,
  `uuid[]`, `sql`, DEFINER, STABLE, `search_path=public`, owner `postgres`, body by md5)
  **and its grants** (verdict 13: EXECUTE for `authenticated`, none for `anon`,
  `service_role`, `patient` or PUBLIC), each new policy expression by md5, the flat
  counts, and three "nothing else moved" md5s carried from the pre-check: every other
  policy, every other function, every other grant.
- **The behaviour check runs TWICE, as an A/B on production itself,** with the subjects
  stage 1 picks. Before the apply it must FAIL on exactly the arms that see what 0096
  opens; after it, the same file with the same subjects must read no FAIL.

There are **five** carries: `journal_rows_before`, `policies_before`,
`other_policies_md5`, `functions_md5`, `grants_md5`. No carry's name is a substring of
another's or of any other row's `check` column (read off the pre-check file,
`scripts/db/precheck-0096-care02a.sql:222-285`), because stage 2's `carry()` matches
column 1 with `index()`. The pre-check also takes two inputs that are not carries,
`prev_hash` and `prev_when`, and refuses to run without them (`:95-106`).

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
expressions and the helper's body), and by the rehearsal's T4 arms below. Stage 1
prints which shape production furnishes, before the apply.

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
(`<patient>|<T1>|<T2>|<T3>|<T4 or none>|<N or none>`) to `/tmp/0096-subjects.out`, under
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
never this lane's and never GREEN's. No READ ONLY run answered it before this sitting
("Measured on production"), so stage 1 answers it, READ ONLY and before the apply: without a
T1 it STOPs with nothing applied.

**The pick and the behaviour check read outside row level security for their
comparands.** Both set `row_security = off` for their unfiltered reads (the pick in its
block, the file at `:273`), so on a connection that does not bypass row level security
on these tables they ERROR rather than read a filtered count. On production the tables
are owned by `postgres` with RLS ENABLED, not FORCED (`docs/runbook-prod-migrations.md:104`,
`:157-160`), which is the case where they read. **No file that sets
`row_security = off` has run on production yet**; stage 1 of this sitting is the first
measurement, and if it errors, stage 1 halts before the apply.

## STAGE 1: the HEAD CHECK, the pre-check, the pick, the instrument BEFORE, the apply

```
(
set -eo pipefail
umask 077
PR=1471
BRANCH=care/0098-CARE-02a-care-team-reads
SHA0096=fbf8cad1dc959a600b0e8b3ccffb7225e2295919e5dfe08432301faf6b5e9c45
SHAPREV=cfdfffff71a6c847a791ce17c71bbc6e05b75a367e9c8f03dfcb0cfc638f5806
PREVWHEN=1788501600000
SHAPRE=7fc2085e9318b36610bd9ce1c3f0d504fe3013930985951b41457fc34e938b02
SHABEHAVIOUR=7698cabc62e9501d680738e8e27cf2e979d3d1adeed72b646daa12d1031e0644
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
U='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
PICK="with cand as (select ct.tenant_id, ct.patient_id from public.patient_care_team ct join public.patients p on p.id = ct.patient_id and p.tenant_id = ct.tenant_id and p.deleted_at is null where ct.removed_at is null group by ct.tenant_id, ct.patient_id having count(*) >= 2), f as (select c.patient_id as pid, u.id::text as uid, r.slug, exists (select 1 from public.patient_care_team t where t.tenant_id = c.tenant_id and t.patient_id = c.patient_id and t.user_id = u.id and t.removed_at is null) as on_team, exists (select 1 from public.appointments a where a.tenant_id = c.tenant_id and (a.patient_id = c.patient_id or a.patient_2_id = c.patient_id) and (a.practitioner_id = u.id or a.practitioner_2_id = u.id)) as treats, exists (select 1 from public.patients p where p.id = c.patient_id and p.created_by = u.id) as created, (select count(*) from public.clinical_records cr where cr.tenant_id = c.tenant_id and cr.patient_id = c.patient_id and cr.practitioner_id = u.id) as authored, (exists (select 1 from public.appointments a join public.staff_locations s on s.location_id = a.location_id and s.tenant_id = a.tenant_id and s.user_id = u.id where a.tenant_id = c.tenant_id and a.patient_id = c.patient_id) or (not exists (select 1 from public.appointments a where a.tenant_id = c.tenant_id and a.patient_id = c.patient_id and a.location_id is not null) and exists (select 1 from public.patients p join public.staff_locations s on s.location_id = p.primary_location_id and s.tenant_id = p.tenant_id and s.user_id = u.id where p.id = c.patient_id and p.tenant_id = c.tenant_id))) as linked from cand c join public.users u on u.tenant_id = c.tenant_id and u.is_active and not u.is_shared_resource join public.roles r on r.id = u.role_id), s as (select pid, min(uid) filter (where slug = 'therapist' and on_team and linked and not treats and not created) as t1, min(uid) filter (where slug = 'therapist' and treats and authored > 0 and on_team and linked) as t2, min(uid) filter (where slug = 'therapist' and not on_team and not treats and not created and authored = 0) as t3, min(uid) filter (where slug = 'therapist' and on_team and not linked and not treats and not created and authored = 0) as t4, min(uid) filter (where slug in ('admin', 'reception') and on_team and linked) as n from f group by pid) select pid::text || '|' || t1 || '|' || t2 || '|' || t3 || '|' || coalesce(t4, 'none') || '|' || coalesce(n, 'none') from s where t1 is not null and t2 is not null and t3 is not null order by (t4 is not null) desc, (n is not null) desc, pid limit 1"

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/0096-applied.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 1 has ALREADY APPLIED 0096 in this sitting. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stages 2 and 3 (READ ONLY) run only on the owner's or the lead's word"; exit 1; }
rm -f /tmp/0096-precheck.new /tmp/0096-subjects.new /tmp/0096-behaviour-before.new
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: the head of PR 1471, the held branch and this worktree must all still be the sha stage 0 recorded."
test -f /tmp/0096-held.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/0096-held.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
git fetch -q origin refs/pull/${PR}/head
NOW=$(git rev-parse FETCH_HEAD)
BR=$(git rev-parse -q --verify refs/remotes/origin/${BRANCH} || true)
WT=$(git rev-parse HEAD)
echo "recorded by stage 0: ${REC}"
echo "PR ${PR} head now:    ${NOW}"
echo "held branch now:     ${BR}"
echo "worktree HEAD now:   ${WT}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: the head of PR ${PR} moved since stage 0, the freeze was broken. The sitting halts and nothing is applied. Report the shas above"; exit 1; }
[ "${BR}" = "${REC}" ] || { echo "STOP: the held branch is not the sha stage 0 recorded: it moved, or it is gone. The sitting halts and nothing is applied. Report the shas above"; exit 1; }
[ "${WT}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the sha stage 0 recorded. The sitting halts and nothing is applied. Report the shas above"; exit 1; }
shasum -a 256 -c docs/migration-apply-0096.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f packages/db/migrations/0096_care02a_care_team_reads.sql || { echo "STOP: 0096 is not on disk"; exit 1; }
test -f packages/db/migrations/0095_conflict_name_visibility.sql || { echo "STOP: 0095 is not on disk"; exit 1; }
test -f scripts/db/precheck-0096-care02a.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/behaviour-care02a-readonly.sql || { echo "STOP: the behaviour check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
N96=$(find packages/db/migrations -maxdepth 1 -name '0096_*.sql' | wc -l | tr -d ' ')
[ "${N96}" = 1 ] || { echo "STOP: ${N96} files claim migration number 0096, not 1"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0096_care02a_care_team_reads.sql | cut -d' ' -f1)" = "${SHA0096}" ] || { echo "STOP: 0096 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0095_conflict_name_visibility.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0095 on disk is not the file production applied"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0096-care02a.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-care02a-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- 0095, the migration 0096 follows: its sha256 and journal when, pinned here, checked against this head, and passed to the pre-check. Never typed"
PW=$(node -e 'const e = require("./packages/db/migrations/meta/_journal.json").entries.filter((x) => x.tag === "0095_conflict_name_visibility"); process.stdout.write(e.length === 1 ? String(e[0].when) : "")')
[ "${PW}" = "${PREVWHEN}" ] || { echo "STOP: 0095's journal when on this head reads [${PW}], not ${PREVWHEN}"; exit 1; }
echo "0095: sha256 ${SHAPREV}, journal when ${PREVWHEN}"

echo "--- THE RUN WINDOW: GREEN's dispatch names it and its CLOCK CHECK recorded it. Stage 1 starts inside it or not at all"
test -f /tmp/0096-window.ok || { echo "STOP: the dispatch's CLOCK CHECK recorded no run window after this sitting's stage 0. Nothing was applied"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0096-window.ok)
WOPEN=$(cut -d' ' -f2 /tmp/0096-window.ok)
WSTART=$(cut -d' ' -f3 /tmp/0096-window.ok)
WEND=$(cut -d' ' -f4 /tmp/0096-window.ok)
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for ${WREC}, not for the sha stage 0 recorded. Nothing was applied"; exit 1; }
echo "${WOPEN} ${WSTART} ${WEND}" | grep -qxE '[0-9]{12} [0-9]{12} [0-9]{12}' || { echo "STOP: the recorded run window did not parse. Nothing was applied"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: opens ${WOPEN}, stage 1 starts by ${WSTART}, everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -ge "${WOPEN}" ] || { echo "STOP: Lisbon ${NOWL} is before the run window opens at ${WOPEN}. Nothing was applied"; exit 1; }
[ "${NOWL}" -le "${WSTART}" ] || { echo "STOP: Lisbon ${NOWL} is past ${WSTART}, the last minute the run window lets stage 1 start. Nothing was applied"; exit 1; }

echo "--- the production target, asserted by the guard, not by the prompt"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the clinics' own hours, READ ONLY: no active clinic may be open now"
CL=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) filter (where is_active and (now() at time zone 'Europe/Lisbon')::time >= opens_at and (now() at time zone 'Europe/Lisbon')::time < closes_at) || ' of ' || count(*) filter (where is_active) from public.locations" | tail -1)
echo "active clinics open now by their own hours: ${CL}"
awk -v s="${CL}" 'BEGIN { n = split(s, a, " "); if (n == 3 && a[1] == "0" && a[2] == "of" && (a[3] + 0) >= 1) exit 0; exit 1 }' || { echo "STOP: a clinic is open now by its own hours, or no active clinic was read [${CL}]. The sitting waits until both are closed"; exit 1; }

echo "--- the pre-check. READ ONLY. Its transcript IS the carry, so it is kept"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v prev_hash=${SHAPREV} -v prev_when=${PREVWHEN} -f scripts/db/precheck-0096-care02a.sql 2>&1 | tee /tmp/0096-precheck.new
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0096-precheck.new && { echo "STOP: a pre-check verdict read FAIL. Nothing was applied and no earlier transcript was touched"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0096-precheck.new || true)
[ "${OKS}" = 20 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 20. Nothing was applied"; exit 1; }

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
echo "${SUBJ}" > /tmp/0096-subjects.new
echo "subjects picked: T1 ${T1}, T2 ${T2}, T3 ${T3}, T4 ${T4}, N ${N}, and one patient (used, never printed)"
if [ "${T4}" = none ]; then K4=0; else K4=1; fi
if [ "${N}" = none ]; then KN=0; else KN=1; fi
case "${K4}${KN}" in 11) XBEFORE="17 OK / 0 VACUOUS / 15 FAIL"; XFAIL="C1 C2 C3 C4 C5 H1 N1 P1 P4 P5 R1 R4 W5 W6 W8 "; XVAC=""; XACTORS="${T1} ${T2} ${T3} ${T4} ${N} ";; 10) XBEFORE="16 OK / 2 VACUOUS / 14 FAIL"; XFAIL="C1 C2 C3 C4 C5 H1 P1 P4 P5 R1 R4 W5 W6 W8 "; XVAC="N1 S5 "; XACTORS="${T1} ${T2} ${T3} ${T4} ";; 01) XBEFORE="16 OK / 4 VACUOUS / 12 FAIL"; XFAIL="C1 C2 C3 C4 H1 N1 P1 P4 R1 W5 W6 W8 "; XVAC="C5 P5 R4 S4 "; XACTORS="${T1} ${T2} ${T3} ${N} ";; 00) XBEFORE="15 OK / 6 VACUOUS / 11 FAIL"; XFAIL="C1 C2 C3 C4 H1 P1 P4 R1 W5 W6 W8 "; XVAC="C5 N1 P5 R4 S4 S5 "; XACTORS="${T1} ${T2} ${T3} ";; esac
echo "subject shape ${K4}${KN} (T4 then N, 1 picked, 0 none): expected BEFORE ${XBEFORE}"

echo "--- the behaviour check BEFORE the apply. READ ONLY. It must see what 0096 opens, and nothing else"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v patient_id=${PATIENT} -v t1_id=${T1} -v t2_id=${T2} -v t3_id=${T3} -v t4_id=${T4} -v n_id=${N} -f scripts/db/behaviour-care02a-readonly.sql 2>&1 | tee /tmp/0096-behaviour-before.new
grep -qE '^[[:space:]]*99[[:space:]]*\|' /tmp/0096-behaviour-before.new || { echo "STOP: the behaviour check printed no SUMMARY row before the apply"; exit 1; }
ACTORS=$(grep -E '^ACTOR id ' /tmp/0096-behaviour-before.new | awk '{print $3}' | tr '\n' ' ' || true)
[ "${ACTORS}" = "${XACTORS}" ] || { echo "STOP: the ACTOR lines must name the picked actors in slot order, once each [${XACTORS}]. They named [${ACTORS}]"; exit 1; }
FAILSET=$(grep -E '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0096-behaviour-before.new | sed -E 's/^[[:space:]]*[0-9]+[[:space:]]*\|[[:space:]]*([A-Z0-9]+)\..*/\1/' | LC_ALL=C sort | tr '\n' ' ' || true)
[ "${FAILSET}" = "${XFAIL}" ] || { echo "STOP: before the apply the behaviour check must FAIL on exactly [${XFAIL}]. It failed on [${FAILSET}]"; exit 1; }
VACSET=$(grep -E '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0096-behaviour-before.new | sed -E 's/^[[:space:]]*[0-9]+[[:space:]]*\|[[:space:]]*([A-Z0-9]+)\..*/\1/' | LC_ALL=C sort | tr '\n' ' ' || true)
[ "${VACSET}" = "${XVAC}" ] || { echo "STOP: before the apply the VACUOUS arms must be exactly [${XVAC}]. They were [${VACSET}]"; exit 1; }
PROFILE=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0096-behaviour-before.new | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
[ "${PROFILE}" = "${XBEFORE}" ] || { echo "STOP: before the apply the profile must read ${XBEFORE}. It read ${PROFILE}"; exit 1; }
echo "the instrument sees what 0096 opens: ${PROFILE}, failing on ${FAILSET}"

NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, again before the apply: now ${NOWL}, stage 1 starts by ${WSTART}"
[ "${NOWL}" -le "${WSTART}" ] || { echo "STOP: Lisbon ${NOWL} is past ${WSTART} after the pre-check, the pick and the BEFORE run, so the apply does not start. Nothing was applied"; exit 1; }

echo "--- only now, with a passing pre-check, a full pick and a discriminating instrument in hand, does the previous sitting's state go"
rm -f /tmp/0096-postcheck.out /tmp/0096-stage2.ok /tmp/0096-behaviour-after.out /tmp/0096-stage3.ok /tmp/0096-journal-after.out /tmp/0096-apply.out /tmp/0096-applied.ok /tmp/0096-subjects.out
mv /tmp/0096-precheck.new /tmp/0096-precheck.out
mv /tmp/0096-subjects.new /tmp/0096-subjects.out
mv /tmp/0096-behaviour-before.new /tmp/0096-behaviour-before.out

echo "--- the apply. It is the only writing command in this document. Its full output is teed to /tmp/0096-apply.out"
node packages/db/scripts/verified-migrate.mjs --tag 0096_care02a_care_team_reads --sha256 ${SHA0096} --expect-pending 1 2>&1 | tee /tmp/0096-apply.out
touch /tmp/0096-applied.ok
echo "0096 APPLIED. Paste stage 2 now."
)
```

**EXPECT, and these are what stage 1 is read for:**

- **`--- THE HEAD CHECK`, then `recorded by stage 0: <sha>`, `PR 1471 head now: <sha>`,
  `held branch now: <sha>` and `worktree HEAD now: <sha>`, the same sha four times** (the
  block halts otherwise, before the environment is loaded), then
  `docs/migration-apply-0096.md: OK`;
- **`0095: sha256 cfdfffff71a6c847a791ce17c71bbc6e05b75a367e9c8f03dfcb0cfc638f5806, journal when 1788501600000`;**
- **`run window, Lisbon YYYYMMDDHHMM: opens <t>, stage 1 starts by <t>, everything ends before <t>; now <t>`,**
  with now inside it (the block halts otherwise), then the target guard;
- **the clinics line, `active clinics open now by their own hours: 0 of <n>`**, `n` at
  least 1. A zero with no clinic behind it would be vacuous, so the block requires both;
- **the pre-check prints `20` OK verdicts and no FAIL**, with `journal_rows_before` 93 and
  arm 11 naming 0095's sha256 and `when` exactly as the `0095:` line printed them;
- **`subjects picked: T1 <id>, T2 <id>, T3 <id>, T4 <id or none>, N <id or none>`**, and no
  patient id anywhere; then `subject shape <T4><N> ...`, `11`, `10`, `01` or `00`;
- **the behaviour check BEFORE, exactly as the shape requires:**
  - `11`, five actors: `17 OK / 0 VACUOUS / 15 FAIL`, failing on exactly
    `C1 C2 C3 C4 C5 H1 N1 P1 P4 P5 R1 R4 W5 W6 W8`, nothing VACUOUS;
  - `10`, T4 and no N: `16 OK / 2 VACUOUS / 14 FAIL`, failing on exactly
    `C1 C2 C3 C4 C5 H1 P1 P4 P5 R1 R4 W5 W6 W8`, VACUOUS on exactly `N1 S5`;
  - `01`, N and no T4: `16 OK / 4 VACUOUS / 12 FAIL`, failing on exactly
    `C1 C2 C3 C4 H1 N1 P1 P4 R1 W5 W6 W8`, VACUOUS on exactly `C5 P5 R4 S4`;
  - `00`, three actors: `15 OK / 6 VACUOUS / 11 FAIL`, failing on exactly
    `C1 C2 C3 C4 H1 P1 P4 R1 W5 W6 W8`, VACUOUS on exactly `C5 N1 P5 R4 S4 S5`.

  Those FAILs are correct and required: they are the arms that see what 0096 opens, and H1
  among them, because the helper does not exist yet. The subject arms S0 to S3 and the
  instrument I1 must be among the OKs, and are: a FAIL on any of them changes the set, and
  the block halts with nothing applied;
- **`run window, again before the apply: now <t>, stage 1 starts by <t>`,** now no later
  than that minute (the block halts otherwise);
- **verified-migrate, teed whole to `/tmp/0096-apply.out`:**
  `file       0096_care02a_care_team_reads.sql present, sha256 matches`,
  `journal    93 row(s) applied, last when=1788501600000`,
  `pending    1  [0096_care02a_care_team_reads]` (exactly one), the drizzle-kit banner with
  its stdout, stderr and exit, then `journal    93 -> 94  (delta 1)`,
  `0096_care02a_care_team_reads present by sha256: yes`,
  `OK: the journal moved by exactly the pending count and carries the approved sha256.`;
- **the last line, exactly, `0096 APPLIED. Paste stage 2 now.`** Stage 2 re-reads the
  journal from the database rather than trusting these lines.

`verified-migrate.mjs` exits **2** on a bad invocation or a missing environment variable;
**3** BEFORE drizzle runs on a missing file, a wrong sha256, a tag missing from
`_journal.json`, an already-applied migration or a pending count that is not 1, and AFTER
drizzle has run on a journal that moved by the wrong amount or moved without the approved
sha256; **4** if drizzle itself failed or on any thrown error; **5** if drizzle reports
success and the journal did not move. Exit 3 can therefore follow a committed apply too.
The `tee` keeps that exit: the block runs with `pipefail`, so the stage exits with
verified-migrate's own code.

**Exit 4 does not always mean nothing was applied.** `verified-migrate.mjs` also exits 4 on
ANY thrown error, including its own journal read AFTER drizzle has committed. drizzle applies
the file's statements and the journal row in ONE transaction (measured for 0092 by refusing
a statement part way, `docs/migration-apply-0092.md`; 0096 is nine statements, each ended by
`--> statement-breakpoint`, the last one included), so the migration is either wholly
applied or not at all. **If stage 1 ended non-zero after the `--- drizzle-kit migrate ---`
banner had printed, the halt rule governs: GREEN pastes nothing else, not stage 1 again and
not the journal read, and reports the exit code and the whole output** (`/tmp/0096-apply.out`
holds it). The read that answers whether 0096 is applied is
`packages/db/scripts/read-applied-migrations.mjs`, READ ONLY, and it runs only on the
owner's or the lead's word. No marker exists after such a halt, so stage 2 refuses until the
lead rules.

**An exit 4 whose captured drizzle output is a pnpm error, not drizzle's, means drizzle
never ran.** `verified-migrate.mjs` reaches drizzle through `pnpm --filter @osteojp/db exec`,
and pnpm checks the installed dependencies first; in a clone whose `node_modules` does not
match its lockfile it tries to reinstall and, with no terminal, aborts
(`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). The block then prints
`journal    93 -> 93  (delta 0)`: nothing was applied. The halt rule governs it all the same.

**Every `STOP:` this block prints before the `--- the apply` line means nothing was
applied,** the HEAD CHECK's, the run window's, the clinics', the pre-check's, the missing
subject's and the BEFORE profile's included, and the previous sitting's transcripts are
untouched: the failed run's output stays in the `.new` files.

## STAGE 2: the post-check, carries from stage 1. READ ONLY

```
(
set -eo pipefail
PR=1471
SHA0096=fbf8cad1dc959a600b0e8b3ccffb7225e2295919e5dfe08432301faf6b5e9c45
SHAPOST=acd879888c4643057c48ff1a926aca5e5a634dec258093052c03c5fa482ecda1
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

rm -f /tmp/0096-stage2.ok
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
test -f /tmp/0096-held.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 2 runs only from the recorded sha. The lead rules"; exit 1; }
REC=$(cat /tmp/0096-held.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
git fetch -q origin refs/pull/${PR}/head
NOW=$(git rev-parse FETCH_HEAD)
echo "checking from the recorded sha ${REC}"
echo "PR ${PR} head now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "the held head has not moved since stage 0"; else echo "THE HELD HEAD MOVED since stage 0: recorded ${REC}, PR ${PR} head now ${NOW}. Stage 2 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC}
shasum -a 256 -c docs/migration-apply-0096.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f packages/db/migrations/0096_care02a_care_team_reads.sql || { echo "STOP: 0096 is not on disk"; exit 1; }
test -f scripts/db/postcheck-0096-care02a.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0096_care02a_care_team_reads.sql | cut -d' ' -f1)" = "${SHA0096}" ] || { echo "STOP: 0096 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0096-care02a.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0096-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not complete an apply in this sitting, or completed it over an hour ago"; exit 1; }

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/0096-window.ok || { echo "STOP: no run window is recorded for this sitting. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0096-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0096-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0096-precheck.out || { echo "STOP: stage 1's transcript is missing; re-run stage 1"; exit 1; }
[ -n "$(find /tmp/0096-precheck.out -mmin -90)" ] || { echo "STOP: stage 1's pre-check transcript is over 90 minutes old; it is not this sitting's"; exit 1; }
carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0096-precheck.out; }
J=$(carry journal_rows_before)
P=$(carry policies_before)
O=$(carry other_policies_md5)
F=$(carry functions_md5)
G=$(carry grants_md5)
[ -n "${J}" ] && [ -n "${P}" ] && [ -n "${O}" ] && [ -n "${F}" ] && [ -n "${G}" ] || { echo "STOP: a carry did not parse out of the transcript"; exit 1; }
[ "${J}" = 93 ] || { echo "STOP: the carried journal_rows_before reads ${J}, not 93"; exit 1; }
echo "carries from this run: journal_before=${J} policies_before=${P} other_policies_md5=${O} functions_md5=${F} grants_md5=${G}"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0096-postcheck.out
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v policies_before="${P}" -v other_policies_md5="${O}" -v functions_md5="${F}" -v grants_md5="${G}" -v journal_rows_before="${J}" -c "begin read only" -f scripts/db/postcheck-0096-care02a.sql -c "rollback" 2>&1 | tee /tmp/0096-postcheck.out
N1213=$(grep -cE '^[[:space:]]*1[23]\. .*\|[[:space:]]*OK[[:space:]]*$' /tmp/0096-postcheck.out || true)
[ "${N1213}" = 2 ] || { echo "STOP: post-check 12 or 13 is not OK: the new helper's security, owner, body or EXECUTE is not what 0096 writes, and every therapist's read of patients now calls it. Do NOT run stage 3. Report to the owner now"; exit 1; }
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0096-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0096-postcheck.out || true)
[ "${OKS}" = 16 ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not 16"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0096 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations")
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0096}'")
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0096 is in the journal ${HN} times, not once"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0096 present by hash"

echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;"

echo "${REC}" > /tmp/0096-stage2.ok
echo "0096 POST-CHECK PASSED. 20/20 pre-check OK, 16/16 post-check OK, journal ${J} to ${JA}. Paste stage 3 now."
)
```

**EXPECT:** `checking from the recorded sha <sha>` and whether the held head moved;
`docs/migration-apply-0096.md: OK`; `run window, Lisbon YYYYMMDDHHMM: everything ends before <t>; now <t>`,
with now before the end (the block halts otherwise, and the write stands); the carry line
reads `journal_before=93`; the target guard; the post-check prints `16` OK verdicts and no
FAIL, 12 and 13 among them; the journal reads `93` before and `94` after, with 0096's
sha256 in it **exactly once**; the last three journal rows, 0096's sha256 newest; the last
line reads exactly
`0096 POST-CHECK PASSED. 20/20 pre-check OK, 16/16 post-check OK, journal 93 to 94. Paste stage 3 now.`
A missing carry makes the post-check itself STOP with psql exit 3 before any verdict.

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

Same file, the SAME subjects stage 1 picked and wrote down, so the two transcripts are an
A/B on the database itself. This stage never picks.

```
(
set -eo pipefail
umask 077
PR=1471
SHABEHAVIOUR=7698cabc62e9501d680738e8e27cf2e979d3d1adeed72b646daa12d1031e0644
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
U='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

rm -f /tmp/0096-stage3.ok
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
test -f /tmp/0096-held.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 3 runs only from the recorded sha. The lead rules"; exit 1; }
REC=$(cat /tmp/0096-held.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
git fetch -q origin refs/pull/${PR}/head
NOW=$(git rev-parse FETCH_HEAD)
echo "verifying from the recorded sha ${REC}"
echo "PR ${PR} head now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "the held head has not moved since stage 0"; else echo "THE HELD HEAD MOVED since stage 0: recorded ${REC}, PR ${PR} head now ${NOW}. Stage 3 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC}
shasum -a 256 -c docs/migration-apply-0096.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f scripts/db/behaviour-care02a-readonly.sql || { echo "STOP: the behaviour check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-care02a-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- stage 2 must have PASSED on the recorded sha, after this sitting's apply"
test -f /tmp/0096-applied.ok || { echo "STOP: stage 1 left no applied marker. Stage 3 has not run"; exit 1; }
test -f /tmp/0096-stage2.ok || { echo "STOP: stage 2 left no pass mark, so it did not pass. Stage 3 has not run"; exit 1; }
[ "$(cat /tmp/0096-stage2.ok)" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. Stage 3 has not run"; exit 1; }
[ -n "$(find /tmp/0096-stage2.ok -newer /tmp/0096-applied.ok)" ] || { echo "STOP: stage 2's pass mark is older than the apply. Stage 3 has not run"; exit 1; }

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/0096-window.ok || { echo "STOP: no run window is recorded for this sitting. The write stands; stage 3 runs only on the owner's or the lead's word"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0096-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. The write stands; stage 3 runs only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0096-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. The write stands; stage 3 runs only on the owner's or the lead's word"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. The write stands; stage 3 runs only on the owner's or the lead's word"; exit 1; }

echo "--- the subjects are stage 1's, read back and never picked again"
test -f /tmp/0096-behaviour-before.out || { echo "STOP: stage 1's BEFORE transcript is missing, so there is nothing to compare against"; exit 1; }
test -f /tmp/0096-subjects.out || { echo "STOP: stage 1's subjects file is missing. Never pick again after the apply: report it"; exit 1; }
[ "$(wc -l < /tmp/0096-subjects.out | tr -d ' ')" = 1 ] || { echo "STOP: the subjects file must hold exactly one line"; exit 1; }
SUBJ=$(head -1 /tmp/0096-subjects.out)
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
BACTORS=$(grep -E '^ACTOR id ' /tmp/0096-behaviour-before.out | awk '{print $3}' | tr '\n' ' ' || true)
[ "${BACTORS}" = "${XACTORS}" ] || { echo "STOP: stage 1's BEFORE transcript and its subjects file do not name the same actors [${BACTORS}] [${XACTORS}]"; exit 1; }
echo "subjects from stage 1: T1 ${T1}, T2 ${T2}, T3 ${T3}, T4 ${T4}, N ${N}, and one patient (used, never printed)"

echo "--- the crash guard: stage 2's post-check of this sitting, 16 OK with 12 and 13 among them, before any session acts as authenticated"
test -f /tmp/0096-postcheck.out || { echo "STOP: stage 2's post-check transcript is missing. Run stage 2 first"; exit 1; }
[ /tmp/0096-postcheck.out -nt /tmp/0096-behaviour-before.out ] || { echo "STOP: the post-check transcript is older than stage 1's BEFORE run, so it is not this sitting's"; exit 1; }
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0096-postcheck.out && { echo "STOP: stage 2's post-check read FAIL. Do not run the behaviour check"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0096-postcheck.out || true)
[ "${OKS}" = 16 ] || { echo "STOP: stage 2's post-check printed ${OKS} OK verdicts, not 16"; exit 1; }
N1213=$(grep -cE '^[[:space:]]*1[23]\. .*\|[[:space:]]*OK[[:space:]]*$' /tmp/0096-postcheck.out || true)
[ "${N1213}" = 2 ] || { echo "STOP: post-check 12 and 13 are not both OK. Do not run the behaviour check"; exit 1; }

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs
rm -f /tmp/0096-behaviour-after.out
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v patient_id=${PATIENT} -v t1_id=${T1} -v t2_id=${T2} -v t3_id=${T3} -v t4_id=${T4} -v n_id=${N} -f scripts/db/behaviour-care02a-readonly.sql 2>&1 | tee /tmp/0096-behaviour-after.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0096-behaviour-after.out && { echo "STOP: a behaviour verdict read FAIL after the apply"; exit 1; }
grep -qE '^[[:space:]]*99[[:space:]]*\|' /tmp/0096-behaviour-after.out || { echo "STOP: the behaviour check printed no SUMMARY row, so the transcript is truncated"; exit 1; }
ACTORS=$(grep -E '^ACTOR id ' /tmp/0096-behaviour-after.out | awk '{print $3}' | tr '\n' ' ' || true)
[ "${ACTORS}" = "${XACTORS}" ] || { echo "STOP: the ACTOR lines must name stage 1's actors in slot order, once each [${XACTORS}]. They named [${ACTORS}]"; exit 1; }
VACSET=$(grep -E '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0096-behaviour-after.out | sed -E 's/^[[:space:]]*[0-9]+[[:space:]]*\|[[:space:]]*([A-Z0-9]+)\..*/\1/' | LC_ALL=C sort | tr '\n' ' ' || true)
[ "${VACSET}" = "${XVAC}" ] || { echo "STOP: after the apply the VACUOUS arms must be exactly [${XVAC}]. They were [${VACSET}]"; exit 1; }
BEFORE=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0096-behaviour-before.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
AFTER=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0096-behaviour-after.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
[ "${BEFORE}" = "${XBEFORE}" ] || { echo "STOP: stage 1's BEFORE transcript does not read ${XBEFORE}. It read ${BEFORE}"; exit 1; }
[ "${AFTER}" = "${XAFTER}" ] || { echo "STOP: after the apply the profile must read ${XAFTER}. It read ${AFTER}"; exit 1; }
echo "${REC}" > /tmp/0096-stage3.ok
echo "0096 VERIFIED. CARE-02a BEHAVES AS RULED AT THE RLS LAYER. before ${BEFORE}, after ${AFTER}. The writes in action are proven by the rehearsal, not by this READ ONLY transcript."
)
```

**EXPECT: `verifying from the recorded sha <sha>` and whether the held head moved, then a
halt unless stage 1's applied marker exists and stage 2's pass mark names the recorded sha
and is newer than that marker (so a stage 3 pasted after a stage 2 that halted stops here,
before any connection); the run window line with now before its end; the subjects line;
the crash guard read off stage 2's transcript; then for the run: no FAIL, a SUMMARY row, the
ACTOR lines naming stage 1's actors, and the profile EXACTLY the one stage 1's shape
requires**, which the block asserts, against the matching BEFORE:
`32 OK / 0 VACUOUS / 0 FAIL` for `11`; `30 OK / 2 VACUOUS / 0 FAIL`, VACUOUS on exactly
`N1 S5`, for `10`; `28 OK / 4 VACUOUS / 0 FAIL`, VACUOUS on exactly `C5 P5 R4 S4`, for
`01`; `26 OK / 6 VACUOUS / 0 FAIL`, VACUOUS on exactly `C5 N1 P5 R4 S4 S5`, for `00`. The
last line reads
`0096 VERIFIED. CARE-02a BEHAVES AS RULED AT THE RLS LAYER. before <BEFORE>, after <AFTER>. ...`.
Only a pass writes `/tmp/0096-stage3.ok`, the recorded sha, just before the last line; the
block removes it before anything else, so a stage 3 that stops leaves no mark, and the
closing read runs only on it.

**If stage 3 STOPs, production is already applied.** Do not re-run stage 1, do not pick
again, and do not substitute a subject: report the transcript to the owner. The post-check
of stage 2 is what proves the catalogue; stage 3 proves the behaviour, and a subject whose
data moved between the stages reads FAIL there by design.

**A re-run later is not a regression test.** The file reads whatever the clinic has done
since: T1 booked with P, T2 removed from the team, P soft-deleted. Any of those moves a
subject arm to FAIL on a correct database. It is an assertion about the sitting.

## THE CLOSING JOURNAL READ. READ ONLY

Paste this on its own, and **only** after stage 3 exited 0 with its last line
`0096 VERIFIED. CARE-02a BEHAVES AS RULED AT THE RLS LAYER. ...`. Before the read runs it
checks by machine that the worktree is on the sha stage 0 recorded, that stage 1 applied,
that stage 2 and the last paste of stage 3 passed on that sha after the apply, that the
Lisbon clock is before the end of the run window recorded for that sha, and that the reader
is the pinned file. A check that fails prints a `STOP:` line and exits 1, and the read does
not run.

```
(
set -eo pipefail
SHAREADER=867e2823130b1ec1a9f7790522968924ecd872452c48322884c3e22efb5704d1
READER=packages/db/scripts/read-applied-migrations.mjs
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
test -f /tmp/0096-held.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The journal read has not run"; exit 1; }
REC=$(cat /tmp/0096-held.sha)
[ "$(git rev-parse HEAD)" = "${REC}" ] || { echo "STOP: the apply worktree is not on the sha stage 0 recorded. The journal read has not run"; exit 1; }
test -f /tmp/0096-applied.ok || { echo "STOP: stage 1 left no applied marker. The journal read has not run"; exit 1; }
test -f /tmp/0096-stage2.ok || { echo "STOP: stage 2 left no pass mark. The journal read has not run"; exit 1; }
[ "$(cat /tmp/0096-stage2.ok)" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. The journal read has not run"; exit 1; }
test -f /tmp/0096-stage3.ok || { echo "STOP: stage 3 left no pass mark, so its last paste did not pass. The journal read has not run"; exit 1; }
[ "$(cat /tmp/0096-stage3.ok)" = "${REC}" ] || { echo "STOP: stage 3's pass mark does not name the sha stage 0 recorded. The journal read has not run"; exit 1; }
[ -n "$(find /tmp/0096-stage3.ok -newer /tmp/0096-applied.ok)" ] || { echo "STOP: stage 3's pass mark is older than the apply. The journal read has not run"; exit 1; }
test -f /tmp/0096-window.ok || { echo "STOP: no run window is recorded for this sitting. The journal read has not run"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0096-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. The journal read has not run"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0096-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. The journal read has not run"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. The journal read has not run"; exit 1; }
RW=$(shasum -a 256 ${READER} | cut -d' ' -f1)
echo "reader: ${RW} (at the recorded sha ${REC})"
[ "${RW}" = "${SHAREADER}" ] || { echo "STOP: the migration reader at the recorded sha is not the pinned file. The journal read has not run"; exit 1; }
node --env-file=/Users/ivan/osteojp-secrets/new-prod.env ${READER} 2>&1 | tee /tmp/0096-journal-after.out
grep -qx 'journal rows on production: 94' /tmp/0096-journal-after.out || { echo "STOP: the journal read after the apply does not say 94"; exit 1; }
grep -qE '^[[:space:]]*APPLIED[[:space:]]+0096_care02a_care_team_reads[.]sql$' /tmp/0096-journal-after.out || { echo "STOP: the journal read does not list 0096 as APPLIED"; exit 1; }
grep -qx 'pending on this ref: 0' /tmp/0096-journal-after.out || { echo "STOP: the journal read finds a migration pending on the recorded sha"; exit 1; }
grep -qx 'journal rows with no matching file on this ref: 0' /tmp/0096-journal-after.out || { echo "STOP: the journal holds a row with no matching file on the recorded sha"; exit 1; }
echo "CLOSING READ: the journal reads 94, 0096 is APPLIED, and nothing is pending on the recorded sha."
)
```

**EXPECT:** the run window line with now before its end, the reader's sha256 line, then the
read printed IN FULL through `tee`: `journal rows on production: 94`, every migration file on
the recorded sha listed `APPLIED`, 0096 last, `pending on this ref: 0`,
`journal rows with no matching file on this ref: 0`, and the last line, exactly,
`CLOSING READ: the journal reads 94, 0096 is APPLIED, and nothing is pending on the recorded sha.`
After any halt at any stage it is not pasted: the halt rule says no journal read runs after
a halt, and the block stops on its own when a pass mark is missing.

## What every verdict must read

**Pre-check, 20 rows, all `OK`** (`scripts/db/precheck-0096-care02a.sql:222-285`):

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
- 9 0096 absent from the journal by hash; 10 0093 present by hash;
- 11 the newest journal row is 0095's, by hash and `when`, with no tie at that `when`;
- `journal_rows_before` **93**; `policies_before` (the rehearsal read **100**);
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

**Post-check, 16 rows, all `OK`** (`scripts/db/postcheck-0096-care02a.sql:220-299`):

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
15. 0096 is in the journal by hash, it is the newest row, and the journal moved by
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
| H1 | 0096's helper names P for each actor exactly when on P's live team AND linked | **FAIL**, helper absent | OK, T1 true, T2 true, T3 false, T4 false, N true |
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

W1, W3 and W4 are the "no write widens" arms: 0096 adds a SELECT arm to
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
  `0096_care02a_care_team_reads.sql:413`). Mutation CI07 removes it and
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
  `patient_note_revisions`, `guest_clinical_intakes`): 0096 does not touch them;
  pre-check 14 and post-check 9 pin their thirteen policies.
- **A patient linked to the actor's clinic only as the SECOND participant of an
  appointment**: 0096 does not count that link, by design (the basis above), and no
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
| V9: the clinic limit, the basis, the helper, the T4 arm, the order after 0095, the apply window | this document | |

**The md5 pins depend on how the session renders an expression.** Pre-check arms 1 to 7
and 14 and post-check verdicts 1 to 6, 9, 10 and 12 compare md5s of `pg_get_expr(...)`
or of a body, and the rendering prints `jwt_tenant_id()` without its schema only when
`public` is on the session's `search_path`. The expected values were read on a rehearsal
database built from main's 91 migrations and the then held 0094 to 0097 (0094 and 0095
as production now carries them, plus the grants revoke and the staging index, which
production does not carry and which touch no policy, no function body and no pinned
value). If production rendered differently, pre-check arms 1 to 5 would FAIL and stage 1
would halt **before** the apply, which is the safe direction. The evidence that production
renders the same way is this sitting's own pre-check, READ ONLY and before the apply: 20 OK
there means it does. The stage blocks set no `search_path`.

## Measured on production, READ ONLY

**NOT MEASURED BEFORE THIS SITTING.** No READ ONLY run of the pre-check or of the pick
preceded it: this document was renumbered and issued for the sitting of 2026-09-30 by that
day's ruling. **Stage 1 is therefore the first measurement, and everything in it up to the
apply is READ ONLY**: the clinics' hours, the pre-check, the pick and the behaviour check
BEFORE all run before `verified-migrate.mjs`, and each STOPs with nothing applied on a FAIL,
a missing subject or a profile other than the rehearsed one. Three things the sitting learns
for the first time, each a STOP before the apply if it comes out wrong:

- whether production renders the four policy expressions, the eleven others and the
  thirteen on the five N5 tables as the rehearsal did (pre-check arms 1 to 5 and 14);
- whether the pick finds a patient with a T1 at all (the OPEN ITEM above), and which of the
  four shapes; **without a T4 the clinic limit's own arms are rehearsal-only on
  production**;
- whether `row_security = off` reads on the connection GREEN uses (the pick and the
  behaviour check both set it).

GREEN's report records the shape, the five staff slots (never the patient id) and the five
carries. Nothing recorded is a count of patients, clinics or registos.

## Rehearsed on 2026-09-27 (B13a v2) on a throwaway, synthetic data only

**READ THIS SECTION AS A RECORD, IN THE NUMBERS OF ITS DAY.** It ran before the fifth
renumbering, when this migration was `0098`, the staging index stood before it as `0097`,
and the rehearsal base carried main's 91 migrations plus the then held 0094 to 0097: so its
journal counts read 95 before and 96 after, its `when` values are the synthetic
`0097 1788501800000` and `0098 1788501900000`, and its file names and pins are the `0098`
ones of that day. **In every line below, `0098` is today's 0096, and `0097` is the staging
index, today's `0098`.** Nothing in it was re-run after the renumbering; what changed since,
and what that leaves unmeasured, is the subsection "What changed at the renumbering" at the
end.

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

### What changed at the renumbering, and what was re-run (2026-09-30)

**The migration: no byte.** Its sha256 is `fbf8cad1...9c45` before and after the `git mv`.

**The check files, byte by byte outside their `--` comments:**

- **pre-check**, `precheck-0098-care02a.sql` renamed `precheck-0096-care02a.sql`, sha256
  `d429c81f...` to `7fc2085e...`: its two refusal messages name 0095 instead of 0097; its
  banner and the labels of arms 7, 9 and 11 name 0096 and 0095; the column alias `has_0098`
  reads `has_0096`; and **one predicate: `journal_rows_before` expects 93, not 95.**
- **post-check**, `postcheck-0098-care02a.sql` renamed `postcheck-0096-care02a.sql`, sha256
  `01a1cd26...` to `acd87988...`: its banner, the labels of verdicts 1 to 4, 12, 15 and 16,
  the alias, and verdict 15's observed and expected text (`is 0096` on both sides). No
  predicate and no pinned md5 moved.
- **behaviour check**, same name, sha256 `b7a53c22...` to `7698cabc...`: all 21 of its
  "0098"s read "0096", among them its banner and H1's label; 936 lines before and after, no
  predicate moved.

**The blocks** were rebuilt on `docs/migration-apply-0095.md`'s pattern: stage 0 records
#1471's held head; the HEAD CHECK is inside stage 1 and halts on a moved head; the run window
comes from GREEN's CLOCK CHECK record; `prev_hash` and `prev_when` are pinned (0095 is
applied and final) and checked against the head; the apply is teed to `/tmp/0096-apply.out`;
stages 2 and 3 leave pass marks; the closing journal read is new; the journal is 93 before
and 94 after. The fixed 08:00 to 21:00 clock line of the old stages 0 and 1 gives way to the
window record; the clinics' own-hours read stays. The pick, the shape logic, the BEFORE and
AFTER assertions and the post-check's crash guard are the old blocks' lines, with only
`/tmp/0098-` read as `/tmp/0096-` and the labels.

**Re-run on 2026-09-30 from 02:00 Lisbon, on a throwaway at production's position.**
Container `c96-reh`, the Supabase image `public.ecr.aws/supabase/postgres:17.6.1.165` on
`127.0.0.1:55622`. `c96_base` was built from `template0` with the image's auth schema copied
in and two stand-ins: `auth.jwt()`, which this image lacks, and `auth.uid()` in GoTrue's
current form, which reads `request.jwt.claims` (the image's own reads only
`request.jwt.claim.sub`, and the behaviour check's identity arm refused it, correctly). Then
`packages/db/migrations` 0000 to 0095 in journal order, 93 files, each in one transaction
with its drizzle journal row (the file's sha256, its `when`). No grants revoke and no staging
index, which is production's shape:

- the renumbered pre-check, `prev_hash` 0095's sha256, `prev_when` 1788501600000: **20 OK,
  0 FAIL**, `journal_rows_before` 93, and the same four carries the 2026-09-27 rehearsal
  read (`policies_before` 100, `776dfb62...`, `1ee1bb23...`, `4230defc...`), with 26
  SECURITY DEFINER functions. So every pin holds without the grants revoke and the staging
  index, measured rather than argued;
- 0096 and its journal row in one transaction, then the renumbered post-check fed those
  carries: **16 OK, 0 FAIL**, 12 and 13 among them, verdict 15 reading
  `1 by hash, newest is 0096, journal 94`; 27 SECURITY DEFINER functions;
- the negative control, the pre-check again on the applied database: FAIL on 1, 2, 3, 4, 9,
  11, `journal_rows_before` and 13;
- **the six doc-block arms**, each on a fresh copy with the v2 fixture and its extension row,
  extracted from this document's text by a script: stage 1 from the clinics' hours read to
  the last `mv`; the apply stood in by `psql -1` with the journal row (`when`
  1788501700000) and the marker touched; stage 2 from the applied-marker check to its last
  line; a catalogue guard; stage 3 from the stage 2 pass-mark check to its last line. The
  substitutions: `/tmp/` to a scratch directory, the env line to the throwaway's URL, the
  target guard to an `echo`, a run window record written for the scratch run; nothing else.
  - shapes `11`, `10`, `01` and `00`: every segment exit 0, `0 of 3` clinics open, the pick
    as rehearsed, BEFORE `17 OK / 0 VACUOUS / 15 FAIL`, `16 / 2 / 14`, `16 / 4 / 12` and
    `15 / 6 / 11` on exactly the FAIL and VACUOUS sets stage 1 asserts, stage 2's
    `0096 POST-CHECK PASSED. 20/20 pre-check OK, 16/16 post-check OK, journal 93 to 94.`,
    the guard SAFE, and stage 3's `after 32 OK / 0 VACUOUS / 0 FAIL`, `30 / 2 / 0`,
    `28 / 4 / 0` and `26 / 6 / 0`;
  - T1's row on P removed: exit 1 at `STOP: a MISSING SUBJECT`, the journal at 93, the
    helper absent, only the `.new` pre-check transcript written;
  - shape `11`, then the subjects file's N rewritten to `none` before stage 3: exit 1 at
    `STOP: stage 1's BEFORE transcript and its subjects file do not name the same actors`,
    no session acted.

  The patient id reached only the mode-600 subjects files.
- **statically:** every block passes `zsh -n`; `scripts/owner-blocks-survive-zsh.test.mjs`
  5 of 5; every sha256 pin in the blocks and in the facts table matches the file it names.
  And the parts of every block that come before any database, run in a scratch clone of
  this revision against a stand-in origin that carried it as `refs/pull/1471/head` and as
  the held branch, with `/tmp/0096-` and the apply worktree's path pointed into a scratch
  directory: stage 0 exit 0, printing every EXPECT line; then, with a run window record
  written as the CLOCK CHECK writes it, stage 1 through its window check, stage 2 through
  its window check, stage 3 through its pass-mark and window checks (it then stopped, as it
  must, on the BEFORE transcript the scratch run never wrote), and the closing read through
  its reader pin. **The negative arms, each exit 1 on its own `STOP:`
  line before any database:** #1471's head moved after stage 0; the held branch moved; no
  window record; a record for another sha; before the window opens; past its last start
  minute; stage 2 at the window's end; stage 0 with a fresh applied marker; stage 0 with
  the held branch deleted. That run was on this revision before this paragraph's results
  were written in, which is the only difference.

**Not re-run:** `verified-migrate.mjs` and `drizzle-kit migrate` (the apply is stood in by
`psql -1`, as in every rehearsal of this file); the in-action arms and the mutation sweep (no
byte they read moved: the migration and the fixture are the same, and the sweep judges the
catalogue with the post-check, whose predicates did not change); the DB-gated suites, which
CI runs on its own database at step 4 of the order. Every database this re-run created was
dropped after it, and the container removed.
