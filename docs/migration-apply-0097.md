# 0097: apply the registo write policies, the clinical_records write policies follow the permission matrix

**Status: PROMOTED ON #1475's HELD BRANCH (journal idx 94), ISSUED FOR THE SITTING OF
2026-09-30 (PR=1475), NOT APPLIED.** One migration,
`packages/db/migrations/0097_clinical_records_write_matrix.sql` (until the promotion
`packages/db/migrations-pending/NEXT-AFTER-0096_clinical_records_write_matrix.sql`), applied by
GREEN from #1475's held head, **after 0096**, which production carries since 2026-09-30. Any `STOP:`
line, any `FAIL` verdict or any `ERROR` halts the sitting.

**What it makes true, in one sentence: the clinical_records write policies follow the
permission matrix. A therapist edits and deletes only their own unsigned registos, and files
registos only in their own name for a patient they treat or created.** The permission matrix
in `CLAUDE.md` gives a therapist "Edit clinical records: own, until locked"; after 0097 the
three write policies of `clinical_records` say exactly that, and the immutability trigger,
untouched, still refuses every change to a locked or signed registo.

**THIS IS 0097 BY THE FIFTH RENUMBERING, AND IT WAS 0099.** The owner ruled the registo
write fix onto the Tier C list on 2026-09-27 as `0099` ("0099 registo fix, SAT-01 from
0100."). On 2026-09-30 the owner and the lead renumbered the held queue, in their words:
"renumber (option 1). CARE-02a 0096 (#1471), registo write policies 0097 (#1475), staging
index 0098 (#1469), grants revoke 0099 (#1397), SAT-01 from 0100. Apply order equals file
order from now; the lead rules apply order only in number order or after a renumber." This
document was `docs/migration-apply-0099.md` until then. The binding table is in `CLAUDE.md`
under "SOLO's record". GREEN applies 0097 only after `0096` (CARE-02a, #1471) is promoted,
applied to production and merged, in 0096's own documented order; `0094` and `0095` were
applied on 2026-09-29 and are merged.

**This document is written before the promotion, on purpose.** The lane that authored it
never applies it. So three kinds of value live here:

- **pinned now**, because their bytes are final: the migration's sha256, the three check
  files, the two programs that run with production credentials, the reader the closing read
  runs, and the rule that picks the behaviour subjects (it is text in stage 1, so the sidecar
  pins it);
- **derived at the sitting, by machine**: 0096's sha256 and journal `when`, which the
  pre-check needs as `-v prev_hash` and `-v prev_when`, read off the branch by stage 1; the
  head stage 0 checked out, which it records for every later stage; the run window, which the
  dispatch's CLOCK CHECK records; and the behaviour check's patient and actors, **picked by
  GREEN in stage 1, READ ONLY, by that pinned rule**, and reused unchanged by stage 3;
- **filled at issue, and refused by machine until then**: the PR number (`PR=NOT-YET-ISSUED`
  in stages 0 to 3, each of which STOPs on it before it touches git or a database). The
  closing read carries no PR: it runs only on the head record stage 0 writes and the marks
  stages 1 to 3 write, and each of those stages STOPs on the placeholder before it writes
  one. The PR is #1475; the placeholder is the guard that this document has not been issued.
  See "What the issue fills".

**Written at the standard of `docs/migration-apply-0093.md`, section for section, in the
ALTER shape of `docs/migration-apply-0092.md`, with CARE-02a's one-CREATE shape, and with
0095's run-window record, pass marks and closing read.** Every count below is a structural
count, a verdict profile, or a measurement on a synthetic rehearsal (the fifth, on
2026-09-30, in the ruled order; and the four of 2026-09-27, in that day's order). **No
production figure of 0097's appears here: this lane had no production access, and by the
owner's ruling of 2026-09-30 no separate READ ONLY run preceded the issue (see "Measured on
production, READ ONLY"). Stage 1 is the first production measurement.** The one production
figure quoted, in the "Issued" section, is 0096's own verdict profile from GREEN's report.

**This document describes the database as it is with 0097.** Stage 1 runs the behaviour
check before the apply only in its subjects-only mode (the subjects and the instrument, no
write arm). `scripts/registo-writes-0097.test.mjs` holds this document, the behaviour check and
the DB-gated suite to that.

| Fact | Value |
|---|---|
| Ruling | Owner, 2026-09-27: "0099 registo fix, SAT-01 from 0100.", Tier C, HELD. Renumbered `0097` by the owner and the lead on 2026-09-30 (above). The acceptance: the therapist arm of `clinical_records_update` USING and `clinical_records_delete` is `practitioner_id = auth.uid()` only; the therapist arm of `clinical_records_insert` is `practitioner_id = auth.uid() AND clinical_therapist_sees_patient(patient_id)`; the owner arms and every other policy byte-identical; the policy count flat; the immutability trigger untouched; every app writer verified against the new arms, and a narrow path designed for any legitimate writer they would break. **Owner rulings on the PR (Q1 to Q5, below): Q1 (a) the claim function, Q2 (b) the app half first as its own PR, Q3 proceed only when the at-risk draft count reads 0, Q4 (a) UPDATE's WITH CHECK is the INSERT's arm, Q5 (c) the patient page's controls in a follow-up** |
| Migration, promoted | `packages/db/migrations/0097_clinical_records_write_matrix.sql` (was `packages/db/migrations-pending/NEXT-AFTER-0096_clinical_records_write_matrix.sql` until the promotion of 2026-09-30), sha256 `076481bf1599975e3b1bc25b4f9363901c2c7269df32ec2ef781cb19ba1dc318` (renamed from `NEXT-AFTER-0098_...` on 2026-09-30; bytes unchanged) |
| Migration, at the sitting | `packages/db/migrations/0097_clinical_records_write_matrix.sql`, **bytes unchanged** (a promotion is a rename and nothing else, so the sha256 above is the hash drizzle records) |
| Journal | `idx 94`, tag `0097_clinical_records_write_matrix`, `when` set at promotion and **strictly greater than 0096's** (0096 is expected at `idx 93`, `when 1788501700000`). The rehearsal used `0096 1788501700000` and `0097 1788501800000`; stage 0 asserts the order, not those values |
| Must follow | `0096`, CARE-02a (#1471), promoted on #1471's head `1d9ae1ab` as `packages/db/migrations/0096_care02a_care_team_reads.sql`, journal `idx 93`, `when 1788501700000`, sha256 `fbf8cad1dc959a600b0e8b3ccffb7225e2295919e5dfe08432301faf6b5e9c45` (read 2026-09-30). The same bytes the rehearsal applied: it read them pending, as `NEXT-AFTER-0095_care02a_care_team_reads.sql`, from #1471's earlier head `6fb88730`. Before it: `0095` the conflict check's patient name, applied 2026-09-29 |
| Comes before | `0098` the staging index (#1469) and `0099` the grants revoke (#1397). Neither is in production at this sitting, and this document reads neither |
| Production journal at the sitting | **94 rows before, 95 after.** 93 on 2026-09-30 (0000 to 0095, the numbering has gaps; 0095 applied 2026-09-29 13:09 Lisbon), plus one row for 0096 |
| Branch | `db/0099-registo-write-matrix`, PR **#1475**, `held-for-apply` from the moment it opened. The branch name carries the old number and is not renamed: a new branch name would be a new PR |
| This document | `docs/migration-apply-0097.md`, pinned by `docs/migration-apply-0097.sha256` and asserted in STAGE 0 and again in STAGE 1. The sidecar moves at issue, when the placeholder is filled |
| Pre-check | `scripts/db/precheck-0097-registo-writes.sql`, READ ONLY, **20 verdicts** (verdict 13 is Q3's gate with its control), sha256 `7ab316aed3130ea7b45c3546e65f447b2952d22a4a329bbe0150b02d36b7f164`. Takes `-v prev_hash` and `-v prev_when` |
| Post-check | `scripts/db/postcheck-0097-registo-writes.sql`, READ ONLY, **15 verdicts**, sha256 `296b9a09f00e22c70a98496c7c89bec80d4d955d61eb34492b1e90ee21ad053b`. Takes five carries |
| Behaviour check | `scripts/db/behaviour-registo-writes-readonly.sql`, READ ONLY, **20 arms**, three actors and one patient, sha256 `20c1b13f3ef9c5ba63b301b0dc2d9d7f138ef5a8dd31b296aba166f315765908`. Run TWICE in this sitting with the same subjects: before the apply in its subjects-only mode (`-v subjects_only=on`: arm 0, S0 to S3 and I1), after it with every arm |
| Behaviour subjects | `-v patient_id`, `-v t1_id`, `-v t2_id`, `-v t3_id`. **Picked by GREEN in stage 1, READ ONLY, by the rule the block carries (`PICK`)**: the lowest id that meets each slot. The patient id is never printed and never committed (this repository is public). See "The behaviour subjects on production" |
| The programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093`; `packages/db/scripts/read-applied-migrations.mjs` (the closing read), sha256 `867e2823130b1ec1a9f7790522968924ecd872452c48322884c3e22efb5704d1`. All three byte-identical to `origin/main` at `453cf2c4`, read 2026-09-30, and pinned in every block that runs them. **The ruling of 2026-09-30 moves `verified-migrate.mjs` only after 0096 and 0097 are applied** (a lock and statement timeout on its drizzle spawn, a Tier B PR whose sha is pinned in later documents only), so this pin holds for this sitting |
| What it changes | THREE `ALTER POLICY` statements, each restating 0045's expression with the therapist arm replaced: `clinical_records_insert` WITH CHECK and `clinical_records_update` WITH CHECK (the author, for a patient they treat or created), `clinical_records_update` USING and `clinical_records_delete` USING (the author). And ONE new function, `public.claim_ai_draft_authorship(uuid)`: SECURITY DEFINER, VOLATILE, `search_path = public`, owned by `postgres`, EXECUTE for `authenticated` only. No policy is created or dropped; the policy count is flat |
| What it never touches | every other policy (one md5 over all of them, and a second over the two read policies of `clinical_records`), every existing function (one md5 over every function in `public` but the new one; `clinical_therapist_sees_patient` pinned on its own), every existing grant, and the immutability trigger `clinical_records_enforce_immutability` with its function (pinned by shape and body md5 before and after) |
| The app half | **Its own PR, #1501, merged to main before the sitting (Q2 (b))**, and not part of #1475: the review claim of an AI draft calls the new function first, where it exists (`to_regprocedure`), and a therapist's AI review queue holds only drafts with no author or their own (`apps/web/lib/clinical/review.ts`); a save, sign, finalize or delete that touched no row is named `not_author` for a therapist who is not the author (`zeroRowRefusal`, `apps/web/lib/clinical/records.ts`); the two INSERT writers and the patient-submission claim ask the patient test first and refuse cleanly; the record page offers a therapist Save and Sign only on a draft they authored of a patient they treat or created, and New version only for such a patient. Safe on a database without 0097. Stage 0 STOPs on a head that does not carry it |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its own
sha256: writing the value changes the value. So the digest lives beside it in
`docs/migration-apply-0097.sha256` and STAGE 0 checks it with `shasum -a 256 -c`.

**There is no `#` comment inside any block in this document, deliberately,** and every
parameter is braced, including before a colon, because the blocks are pasted into an
interactive zsh (`scripts/owner-blocks-survive-zsh.test.mjs` enforces the braces). No
backslash continuations, and no `!` except as the `test !` operator followed by a space.
Narration is `echo`.

**Each stage runs from the head stage 0 recorded, on `db/0099-registo-write-matrix`, not
`origin/main`, and survives that branch being deleted.** By 0096's documented order the PR
is held until this apply succeeds (promote, apply, count GATE-CHANGE, main in, merge), so
`origin/main` cannot contain the migration at the moment the apply runs. Stage 0 reads
`origin/<branch>` when it exists and otherwise `refs/pull/<PR>/head`, which a merge does not
delete, says which one it read, and records the sha in `/tmp/0097-head.sha`. Stage 1 refuses
to apply if the branch has moved since; stages 2 and 3 and the closing read check out the
recorded sha and only report a moved branch.

## The migration file's own header names its old number, on purpose

The promoted file will read, in its header, "0099: THE clinical_records WRITE POLICIES FOLLOW
THE PERMISSION MATRIX", "RULED NUMBER 0099. NO NUMBER IN THIS FILE NAME YET, BY
CONSTRUCTION", "It must follow 0098 (CARE-02a)" and the queue of 2026-09-27; section 2 says
"0098 alters clinical_records_select"; section 6 says the SECURITY DEFINER count moves "27 ->
28 (26 on main, 27 once 0098 is promoted)" and that
`packages/db/tests/security-definer-owner.test.ts`'s `EXPECTED_FUNCTIONS` "gains" the new
function; the header also says the body is final "but for one open owner question, Q4". And
the function's own `COMMENT`, which the migration writes into the production catalogue,
opens "0099, owner ruling 2026-09-27.". **All of it is stale since 2026-09-30, or since Q4
was ruled (a), and all of it stays: a rename changes no byte, and the sha256 above is what
every pin in this document, its checks and its test points at.** Read the header as a
record of when the file was authored, and this document for where it sits now: 0097, after
0096 (which is CARE-02a), with Q4 ruled as built. `EXPECTED_FUNCTIONS` is no longer a hand
list since #1491: it is read from the migrations, so it picks the function up in the
promotion commit by itself, and only `EXPECTED_COUNT` moves by hand (see "The SECURITY
DEFINER count").

## What 0097 makes true

For the role `therapist`, and for no other role:

- **W1, `clinical_records_insert` (WITH CHECK)**: the new row is in the caller's own name
  (`practitioner_id = auth.uid()`) AND its patient is one the caller treats or created
  (`clinical_therapist_sees_patient(patient_id)`, 0045). An addendum (a new version that
  supersedes a signed registo) is an INSERT like any other, so it is filed the same way.
- **W2, `clinical_records_update`**: USING, the caller is the registo's author; WITH CHECK,
  the new row is still the caller's own AND its patient is one the caller treats or created,
  W1's test. So authorship never moves by an UPDATE, and every row a therapist writes, by
  INSERT or by UPDATE, meets the same rule (Q4, ruled (a)).
- **W3, `clinical_records_delete` (USING)**: the caller is the author.

"Unsigned" is not in the policies and does not need to be: the BEFORE UPDATE OR DELETE
trigger `clinical_records_enforce_immutability` (0001, re-parent-aware since 0005) refuses
every change to a locked or signed registo, and 0097 does not touch it. The owner arm of all
three policies is 0045's, byte for byte: an owner writes any registo of the tenant, as
before. Admin and reception match no write arm, as before. The SELECT policies are not
touched (`0097_clinical_records_write_matrix.sql:32-64`, the statements at
`:281-378`).

## Every app writer, read against the new arms

First read on `origin/main` at `e0e75cfe`, after #1464 (`7b8e49b1`), which made each UPDATE
below read back the rows it touched; **every line number below re-read on `origin/main` at
`453cf2c4` on 2026-09-30**, where the statements cited are unchanged and the lines in
`records.ts`, `review.ts` and the patient page have moved (listPatients also gained
CARE-02a's comment). These are main's lines before the app half: #1501 moves them again.
Every staff writer runs under `withTenantContext` (`packages/db/src/client.ts:146-158`: `SET
LOCAL ROLE authenticated` and the JWT claims), so the policies apply to it. The same list,
with the reasoning, is section 3 of the migration (`:99-179`), which cites the lines as they
were at `e0e75cfe` and keeps them, because they are the migration's bytes.

| Writer | Where (main) | Write | After 0097 |
|---|---|---|---|
| createDraftRecord | `apps/web/lib/clinical/records.ts:465-476` | INSERT, `practitioner_id = ctx.userId`, patient from the new-registo picker, which offers a therapist only patients they treat or created (`:395-409`, `therapistPatientScope`, the same test as `clinical_therapist_sees_patient`) | ADMITTED (W1). Any other patient (a posted id, or one whose last appointment with the caller was deleted since the page rendered) is refused by the app half as `not_found` before the INSERT, not as a raw 42501 |
| updateRecordData | `records.ts:544-552` | UPDATE of the registo being edited. Main reads back the rows it touched and refuses 0 as `not_found`, with no audit row | ADMITTED for its author while they treat or created the patient; 0 rows for anyone else (W2), which the app half names `not_author`. An author who no longer treats or created the patient is refused by WITH CHECK (Q4) |
| createAddendum | `records.ts:590-603` | INSERT in the caller's name for the superseded registo's patient | ADMITTED (W1) for a therapist who treats or created that patient, whoever wrote the registo being superseded. Anyone else is refused by the app half as `not_found` before the INSERT, and the record page shows it; the owner files any |
| signAndLockRecord | `records.ts:650-664` | UPDATE status to signed. Main reads back and reports 0 rows as `stale` | ADMITTED for the author, with the same patient test as the save; 0 rows for anyone else (W2), which main would report as `stale` ("changed in the meantime") and the app half names `not_author` |
| hardDeleteClinicalRecord | `records.ts:729-733` | DELETE of a draft. Main refuses 0 rows as `not_found` | ADMITTED for the author; 0 rows for any other therapist, including on an AI draft nobody has claimed, which the app half names `not_author`. The owner deletes any draft, as before. The patient page still offers a therapist Eliminar on every draft (below and Q5); a therapist discards an AI draft nobody has claimed by claiming it first |
| claimReviewItem, patient submission | `apps/web/lib/clinical/review.ts:286-296` | INSERT in the claimer's name (`:292`) for the submission's patient; the queue offers a therapist only patients they treat or created (`:86-90`) | ADMITTED (W1). A posted submission id for any other patient is refused by the app half as `not_found` before the INSERT, as createDraftRecord refuses one |
| claimReviewItem, AI draft | `review.ts:230-245` | UPDATE of a draft the ingestion endpoint wrote WITHOUT an author (`apps/web/lib/ingestion/store.ts:78-93` sets no `practitioner_id`) | **WOULD BREAK**: no therapist is its author, so the claim reads 0 rows and ends in `not_under_review`. **Measured**: `origin/main`'s own `packages/db/tests/review-finalize-rls.test.ts` fails 4 of its 11 arms on a database with 0097 (the four AI arms, "expected +0 to be 1"). The narrow path is the next section |
| listReviewQueue, AI rows | `review.ts:86-110` | a read, not a write | The app half shows a therapist an AI draft only while it has no author or when they are its author: a draft another therapist has taken is theirs, and a claim of it would end in `not_under_review` |
| editReviewNarrative, saveReviewFicha, finalizeReview | `review.ts:380-387`, `:482-489`, `:553-572` and `:586-595` | UPDATEs of a claimed draft. Main reads back and reports 0 rows as `finalized` (the two saves) or `stale` (finalize) | After the claim the claimer IS the author, so ADMITTED for the claimer; 0 rows for anyone else, which the app half names `not_author` |
| The consultation actions | `apps/web/app/consultation/actions.ts`: `createStubPatient` (`:58`), the recording consent's audit row (`:156`), `persistConsultation` (`:381`) | a stub patient, an audit row, and the `consultations` row, which `apps/web/lib/consultation/consultation-store.ts:96-193` writes on `getDbAdmin()`; none of them writes `clinical_records` (the AI draft a recording leads to arrives through the ingestion endpoint, the next row) | NOT UNDER THESE POLICIES |
| AI ingestion | `apps/web/lib/ingestion/store.ts:77-93` | INSERT on `getDbAdmin()` (BYPASSRLS), the sanctioned service_role path | NOT UNDER THESE POLICIES |
| merge_patients | `packages/db/migrations/0005_patient_merge_multilocation.sql:117-120`, owner `postgres` since `0060:90` | re-points `patient_id` as its SECURITY DEFINER owner | NOT UNDER THESE POLICIES |
| The Fisiozero importer | `packages/db/src/migration/upsert.ts:620-625`, `:934-937`, with OWNER claims (`packages/db/scripts/import-core.ts:336`) | INSERT of imported registos, which keep the original therapist as author | ADMITTED by the owner arm, unchanged; the imported registo's author edits it as its author |
| Development seed | `packages/db/seed/episodes-dev.ts:303` | not production | not applicable |


**The app half is its own PR, #1501, and it merges to main first (owner ruling Q2 (b)).**
It was part of #1475 until 2026-09-30 and moved off byte for byte, except its comments, which
named the old number, and three new unit arms. `review.ts` asks `to_regprocedure` for the claim function
inside the claim's own transaction and calls it, right before the claim's UPDATE, only when it
exists (`takeAiDraftAuthorship`); it filters a therapist's AI queue to drafts with no author or
their own. **On a database without 0097 the claim issues one probe and then exactly the UPDATE
it issued before** (`apps/web/lib/clinical/review.write-guards.test.ts`, the arms "function
ABSENT", "function PRESENT" and the owner's control; four mutations of the probe path, four
killed). #1475 carries the migration, its checks, this document, the DB-gated suites and the
static test, and nothing under `apps/`. Stage 0 STOPs on a head whose `review.ts` does not
probe for the function, and `scripts/registo-writes-0097.test.mjs` refuses a promotion without
the app half on the branch.

**The 0-row codes, chosen on purpose.** Main turns a write that touched no row into a refusal
with no audit row, and names every such refusal a lost race (`stale`, `finalized` or
`not_found`). With 0097, row level security returns 0 rows to a therapist who is not the
author, and "changed in the meantime" would then be the wrong reason. The app half tells the
two apart from the row the writer read first, in the same transaction (`zeroRowRefusal`,
`records.ts`): a therapist who is not the author gets `not_author`; the author, and the owner,
whose arm admits every registo, lost a race and get main's code unchanged. The code only
names a refusal that already happened: it never turns a refusal into a write or a write into
a refusal, with or without 0097. `not_author` reaches the screen as a generic error:
`clinical.error` or `review.error` on the record and review pages, `errors.generic` on the
patient page. On the record page only a page rendered before an authorship change, or a
hand-built request, reaches it, because that page no longer offers the control that would meet
it (below).

**The patient page is not gated by the app half, and meets it (Q5, ruled (c): a follow-up Tier
B PR merged after the apply).** Its Registos clínicos tab
(`apps/web/app/patients/[id]/page.tsx:740-752`) offers anyone with `clinical_records:author`,
the owner and a therapist, Eliminar on every draft (`record-lifecycle-actions.tsx:80`) and Nova
versão (adenda) on every finalized registo. With 0097, a therapist's Eliminar on a draft they
did not author, a colleague's or an AI draft nobody has claimed, deletes nothing and ends in
`errors.generic`; a therapist's Nova versão for a patient they neither treat nor created (a
care-team reader since 0096) files nothing and ends on the record page with `clinical.error`
(the filing refusals, below). **From the apply on, a therapist discards an AI draft nobody has
claimed by claiming it first** (Assumir in Revisão Consulta makes them its author, through the
claim function) and then using Eliminar; the owner deletes it directly, as before. The e2e
fixture that deletes an AI draft as the therapist (`AI_DELETE_DRAFT`, W6-01a,
`apps/web/e2e/clinical.spec.ts:165-189`) is seeded, by the app half, with the e2e therapist as
its author, the shape a claim leaves (`apps/web/e2e/seed/seed-e2e.mjs`, `ensureAiDeleteDraft`),
so it deletes as its author on a database with or without 0097.

**The filing refusals.** `createDraftRecord`, `createAddendum` and the patient-submission claim
ask the patient test for a therapist before the INSERT (`assertTherapistMayFileFor`, the same
test as `therapistPatientScope`) and throw `not_found` outside it; `versionRecordAction` keeps
the refusal on the record page.

**The record page offers only what would succeed.** For a therapist, Save and Sign only on a
draft they authored, of a patient they treat or created (W2 on both sides), and New version
only for a patient they treat or created (W1), asked through `mayFileRegistoFor` (one read),
ANDed with CARE-02a's own write gate. The owner and the admin see what they saw before, and the
attachments keep their own gate: 0097 changes no attachment rule. **This is the one change the
app half shows before the sitting**, and it is the permission matrix's own rule.

**Every one of those is pinned by a unit test that goes red when it is deleted**
(`apps/web/lib/clinical/records.write-guards.test.ts`, `review.write-guards.test.ts`,
`apps/web/app/clinical/[id]/page-write-controls.test.tsx`; twenty mutations of the app half,
twenty red, on 2026-09-27; four more on the claim probe, four red, on 2026-09-30). Main's own
`sign-guard.test.ts` names its rows' author, the signer, so its race arms still read `stale`.
No other writer changes.

## The review claim of an AI draft: the one path the new arms would break, and its narrow path

An AI-ingested draft has no author until a human takes it: the ingestion endpoint does not
know which therapist will review it. The review claim is where a therapist takes it, and an
UPDATE policy that admits only the author cannot admit that first UPDATE, because USING reads
the OLD row, whose `practitioner_id` is NULL.

`public.claim_ai_draft_authorship(p_record_id uuid)` makes the caller the author of ONE such
draft and does nothing else (`0097_clinical_records_write_matrix.sql:182-230`,
the function at `:340-378`). It sets `practitioner_id` to `auth.uid()` only when ALL hold: the
row is in the caller's JWT tenant; the caller's role is therapist; `source = 'ai_ingested'`,
`status = 'draft'` and `ai_review_state = 'pending_review'`; `practitioner_id IS NULL` (an
existing author is never replaced, so clinical authorship never moves); and
`clinical_therapist_sees_patient(patient_id)` (W1's test, so a claim files nothing W1 would
refuse as an INSERT). It returns true when it assigned the row and false otherwise, and never
raises for a row it will not assign. The app calls it in the claim's own transaction, so a
failure of the claim's UPDATE rolls the assignment back with it; the UPDATE then runs under
W2 as the author, moves `ai_review_state` as before, and every later edit and the finalize
are the author's. The owner needs no claim and gets no authorship: the owner arm admits every
registo, and the function assigns nobody but a therapist.

**Called on its own**, outside the app's claim, the function makes the caller the author and
leaves the draft `pending_review`. That state is accepted, and it is safe: the draft is then
the caller's like any other; the app's queue shows an AI draft to a therapist only while it
has no author or when they are its author (`listReviewQueue`, the app half), so it leaves every
other therapist's queue; the author's own claim then proceeds as the author (the function
answers false, the UPDATE is admitted by W2); another therapist's claim of it ends in
`not_under_review`, as every claim of a draft with another author does. Measured: in-action
IA15 (the assignment, then the claim as the author) and IA18, the DB-gated arm "never
replaces an author", and the queue filter's unit test.

**Why a SECURITY DEFINER function and not an app change alone:** as the caller it would meet
W2 and change nothing. It is the narrowest writer that can make this one assignment: one
column, one direction (NULL to the caller), one state. It is owned by `postgres`,
`search_path` pinned, EXECUTE for `authenticated` only (revoked from PUBLIC, `anon` and
`service_role` by name, because Supabase's default privileges grant the named roles), and it
reads and writes only the caller's JWT tenant. The immutability trigger still fires on its
UPDATE and passes it, because the row is a draft.

## Owner rulings (recorded on #1475)

The question block this PR was held with, and the answers. Q4 was ruled on 2026-09-28 and
recorded on 2026-09-29; Q1, Q2, Q3 and Q5 stand as the PR's defaults, by the same record.

- **Q1, the claim path: (a), the SECURITY DEFINER claim function**, which makes the claiming
  therapist the AI draft's author. After the claim the draft is theirs like any other, and a
  colleague does not edit it. A direct call outside the app's claim leaves an authored draft
  pending review, which is accepted (see the section above). Cost: the SECURITY DEFINER count
  moves 27 to 28, a GATE-CHANGE (below). The other options were a narrow extra UPDATE arm for
  an unauthored AI draft (no gate change, but the draft stays shared by every treating
  therapist until it is signed, which is not "own"), and no claim path (only the owner reviews
  AI drafts).
- **Q2, the order the app half ships in: (b), the app half first, in its own Tier B PR,
  merged before the sitting.** It is safe on a database without 0097: the claim asks
  `to_regprocedure` first and calls nothing that is not there; the 0-row codes rename only a
  refusal main already makes, and never turn a refusal into a write or the reverse; the queue
  filter changes nothing while no AI draft has an author; and the two INSERT writers and the
  patient-submission claim refuse only what the permission matrix already refuses. One change
  shows before the sitting: the record page stops offering a therapist Save and Sign on a
  draft they did not write, and New version for a patient they neither treat nor created,
  which is the permission matrix's own rule. It closes the apply window instead of bounding
  it.
- **Q3, drafts in flight: proceed only when the at-risk draft count reads 0**; otherwise the
  owner finishes those drafts (or rules) before the sitting. The pre-check's verdict 13 is
  that gate, with its control, and stage 1 STOPs on anything but OK, before the pick and with
  nothing applied. A draft is at risk when no therapist could write it after 0097: an AI draft
  already in review with no author, any other draft with no author but an AI draft still
  pending review (claimable), and an authored draft whose author is neither an active owner of
  the tenant nor an active therapist of the tenant who treats or created the patient (a
  deactivated therapist or owner, a non-therapist such as an admin named on an imported draft,
  or a therapist with no appointment with the patient who did not create them). A draft in an
  active owner's name is not at risk: the owner arm, which 0097 leaves alone, still admits its
  author. **The table records a draft's author, not who last typed into it**, so "its current
  writer" is read as its author, the only therapist the permission matrix and 0097 admit. The
  counts are read by machine, never assumed: stage 1's verdict 13 reads them before the pick
  and before the apply, and STOPs with nothing applied unless they are 0. A READ ONLY run of
  the pre-check before issue was planned to read them first, so that the owner had time to
  finish those drafts. **By the owner's ruling of 2026-09-30 it did not run** (see "Measured
  on production, READ ONLY"): the sitting is where they are learned, and verdict 13 is what
  keeps that safe.
- **Q4, the new-row check of UPDATE: (a), as built.** USING the author; WITH CHECK the author
  AND `clinical_therapist_sees_patient(patient_id)`, W1's arm, so every row a therapist writes,
  by INSERT or by UPDATE, meets the ruled sentence. Cost: an author who no longer treats or
  created the patient (every appointment with them deleted) can still delete their draft but
  can no longer save or sign it; the owner can. Q3's count holds those drafts, and in-action
  IA31 and a DB-gated arm measure the rule. The migration's body was final on this ruling; its
  header still calls Q4 open (see above).
- **Q5, the patient page's registo controls: (c), gated as the record page is, in a follow-up
  Tier B PR merged after the apply.** From the apply on the patient page then offers a
  therapist only what succeeds, and the AI-draft discard is not hidden before the claim can
  make a therapist the draft's author.

## Before the sitting

Checked by the operator and the lead before stage 0. None of these is a block.

1. **0096 is promoted, applied to production and merged, in its documented order**: promote,
   apply, its count GATE-CHANGE (26 to 27), main into #1471, #1471. One migration is in
   flight at a time (`packages/db/migrations-pending/README.md`). The pre-check re-proves the
   end state by machine: `journal_rows_before` must read **94**, 0095 must be in the journal by
   hash (verdict 9), and the newest journal row must be 0096's, by hash and `when` (verdict 10).
2. **The app half, #1501, is merged to main and its production deployment is live**
   (Q2 (b)). Read the commit status of its merge commit on `main` (the Vercel `osteojp-platform`
   status) before stage 0; do not sit without it, because a therapist's claim of an AI draft
   needs the function call from the moment 0097 is applied. Stage 0 checks the branch by
   machine; the deployment is read by the lead.
3. **0097 is promoted on this branch, after main (with 0096 and the app half) is merged in**:
   the rename into `packages/db/migrations/`, its journal entry at `idx 94` with a `when` above
   0096's, the supabase mirror (`node scripts/sync-supabase-migrations.mjs`), and the README's
   Promoted row. `packages/db/tests/security-definer-owner.test.ts` needs no edit: it reads the
   definer set from the migrations. Stage 0 proves the rename, the journal and the app half, and
   STOPs until they are there.
4. **The SECURITY DEFINER count moves 27 to 28, a GATE-CHANGE, in the order below.**
5. **The PR's checks are read on the promoted head**, with the one qualification the order
   below makes: every required check green but the two that read the count, each read off its
   log as a count failure and nothing else.
6. **This document is issued for the sitting**: `PR` is filled with `1475`, the production
   READ ONLY section records the owner's ruling of 2026-09-30 that no separate READ ONLY run
   precedes this sitting (Q3 is first read by stage 1's verdict 13, which STOPs before the
   pick with nothing applied unless it reads 0), and the sidecar is regenerated. **Done on
   2026-09-30; see "Issued".** Before the issue, stages 0 to 3 STOPped on the placeholder. The closing read carries none: it runs
   only on the head record stage 0 writes and the marks stages 1 to 3 write, and each of those
   stages STOPs on the placeholder before it writes one, so while the placeholder stands the
   closing read has none of this sitting's records to run on, and STOPs.
7. **The owner's dispatch names `0097_clinical_records_write_matrix` and a run window that
   falls outside both clinics' opening hours**, and GREEN is launched with
   `scripts/apply-lane/osteojp-apply-settings.json`. This document carries no run window; its
   one date is the override day `20260930`, in stages 0 and 1. The dispatch's CLOCK CHECK
   records the window in `/tmp/0097-window.ok`, every stage reads it, stages 0 and 1 also read
   the Lisbon clock against 08:00 and 21:00, and stage 1 reads the clinics' own hours from the
   database. **On 2026-09-30 only, the owner's override** (under "The clock" below) lets
   the window fall inside the clinics' hours: stages 0 and 1 print an `OVERRIDE:` line for
   the clock, and stage 1 one for an open clinic, and continue. On every other day both STOP
   as before.
8. **The owner is ready to merge the count GATE-CHANGE and then #1475 promptly after the
   apply**, in the order below.

## The SECURITY DEFINER count: a GATE-CHANGE, and the order it keeps

Promoting 0097 raises the count of SECURITY DEFINER functions in `public` from 27 (after
0096) to 28. Measured on the rehearsal: 26 on main's 93 migrations, 27 with 0096, 28 with
0097. `EXPECTED_COUNT` is `packages/db/scripts/check-security-definer-owner.mjs:117`, a
frozen gate (`.github/gate-manifest.json`), so it moves only in a PR titled `GATE-CHANGE`
that changes the count and the manifest and nothing else, is never armed, and is merged by
the owner by hand. Two required checks read it: the DB-gated job's count step
(`.github/workflows/db-tests.yml`), which runs before every suite in that job, and the unit
run's `packages/db/tests/security-definer-owner.test.ts`, whose arms hold the definer set
read from the migrations and the owner pins to `EXPECTED_COUNT`. Whichever of the two lands
alone reddens both checks, on `main` and on every open PR, until the other lands. **The order
is 0096's, which the ruling of 2026-09-30 keeps: promote, apply, count GATE-CHANGE, main in,
merge.**

1. **This PR is promoted** (after main is merged in: the rename, the journal, the mirror).
   From that commit it reads red on those two checks, on the count: the DB-gated job prints
   `expected exactly 27 SECURITY DEFINER function(s) in public, found 28` and then runs no
   suite, and the unit run fails the count arms.
2. **GREEN applies 0097**, stages 0 to 3 and the closing read.
3. **The owner merges the GATE-CHANGE** (`EXPECTED_COUNT` 27 to 28) by hand. Its own run
   reads the same two checks red the other way round, by construction.
4. **`main` is merged into this PR** and every check runs again, green, the DB-gated suites
   asserting 0097's arms on CI's own database for the first time.
5. **The owner takes `held-for-apply` off and merges this PR.**

`main` reads red on the count from step 3 to step 5, one CI run. The other two orders are
refused: this PR first would merge a migration past a red required check whose job never
ran a suite on the promoted head, and the GATE-CHANGE before the apply would keep `main` red
through the sitting, and for as long as a STOP holds it.

**Before the promotion this PR's DB-gated job is red on its skip-guard, and that is
expected.** `packages/db/tests/clinical-records-write-matrix.db.test.ts` skips its 10 arms that
need 0097 on a database without it, and `.github/scripts/assert-rls-executed.mjs` (a frozen
gate) refuses a suite with skipped arms that is not on `PERMITTED_SKIPS`. From the promotion,
CI's database is built with 0097 and all 21 arms run. An entry in `PERMITTED_SKIPS` would be a
GATE-CHANGE for a PR that is held anyway; none is proposed.

## Apply before merge, and merge promptly after: the apply window

**The app half is merged and deployed before the apply, so nothing in the app reads wrong on
either side of it.** Before the apply, the claim asks the schema whether the function exists
and calls nothing that is not there; the 0-row codes rename only a refusal main already makes;
the queue filter changes nothing while no AI draft has an author, which without the function
is always; the two INSERT writers and the patient-submission claim refuse only a patient
outside the permission matrix's own scope; and the record page stops offering a therapist the
writes the matrix does not give them. From the apply on, the same code calls the function on
every claim (it is asked on every claim, not cached), and every refusal carries its true name.

**What stays open between the apply and the merge of #1475 is only that production is ahead
of `main`**: the migration is applied and its file is not yet on `main`. Main's CI does not
build 0097 until #1475 merges, so a PR merged in between is tested against a database without
it. The count GATE-CHANGE and the merge follow the apply at once (steps 3 to 5 above), and the
sitting runs while both clinics are closed (on 2026-09-30, by the owner's override, while they
may be open).

## Undoing 0097: a new migration

**It is not reversible by editing it.** Once applied, 0097's bytes are the hash drizzle's
journal holds, so an undo is a NEW numbered migration, ruled onto the Tier C list like any
other, rehearsed, and applied by GREEN; never a hand edit on production.

**One step is enough, and the function may stay.** The undo's `ALTER POLICY` statements
restore the three expressions from `0045_clinical_records_location_rls.sql:252-316`; this
document's pre-check verdicts 1 to 3 pin exactly those expressions by md5 (`a8e4b05e...`), so
the undo's own post-check can assert them. The claim function does not have to be dropped: the
app asks for it on every claim (no cache), and the claim runs with it or without it. Dropping
it later is a plain `DROP FUNCTION` that moves the SECURITY DEFINER count back from 28 to 27,
which is a GATE-CHANGE. **Authors the function assigned while 0097 stood stay assigned**: they
are the therapists who claimed and signed those drafts, and the undo does not move clinical
authorship.

## What the issue fills

The lane that issues 0097 (after the promotion) fills these and regenerates the sidecar. GREEN
fills nothing: a GREEN session that meets a placeholder has been handed a document that is not
issued, and stops.

| Value | Where | Placeholder before issue | Filled with |
|---|---|---|---|
| `PR` | stages 0, 1, 2, 3 | `NOT-YET-ISSUED` | `1475`, for the `refs/pull/<PR>/head` fallback |
| "Measured on production, READ ONLY" | the section of that name | NOT YET MEASURED | planned: the pre-check and the stage 1 pick, both READ ONLY, run before issue. **Filled instead with the owner's ruling of 2026-09-30** that no separate READ ONLY run precedes this sitting |
| the sidecar | `docs/migration-apply-0097.sha256` | this revision's digest | the issued revision's digest |
| the dispatch | `/Users/ivan/osteojp-handover/green-dispatch-0097.txt` | this revision's digest, the one line `HELD='NOT-FILLED'` in BEFORE YOU START, and the NOT READY paragraph at its top | the issued digest in WHAT IS BEING APPLIED, both DOCSHA lines, the EXPECT lines and the sidecar line; the promoted head's sha in the `HELD=` line; and the NOT READY paragraph deleted |

Nothing else in the blocks changes at issue. If a pinned check file, the migration or a
pinned program changes before the sitting, its pin changes with it and the rehearsal arms
that read it are re-run.

## The order of the blocks, and the records they leave

Paste each block exactly as printed, whole, and on its own, in this order: **STAGE 0**, the
dispatch's **CLOCK CHECK**, **STAGE 1**, **STAGE 2**, **STAGE 3**, **THE CLOSING READ**. The
dispatch adds a BEFORE YOU START read at the front and the CLOCK CHECK between stage 0 and
stage 1; neither is in this document, because the window is a date the dispatch names.

| Record | Written by | Holds | Read by |
|---|---|---|---|
| `/tmp/0097-head.sha` | stage 0, on a pass | the head stage 0 checked out | the CLOCK CHECK, stages 1, 2, 3, the closing read |
| `/tmp/0097-window.ok` | the dispatch's CLOCK CHECK | `<head> <opens> <stage 1 starts by> <everything ends before>`, Lisbon `YYYYMMDDHHMM` | stages 1, 2, 3, the closing read |
| `/tmp/0097-applied.ok` | stage 1, after the apply exited 0 | nothing (a marker) | stages 0 and 1 refuse on it; 2, 3 and the closing read require it |
| `/tmp/0097-apply.out` | stage 1 | `verified-migrate.mjs`'s whole output, through `tee` | the report |
| `/tmp/0097-stage2.ok`, `/tmp/0097-stage3.ok` | stages 2 and 3, on a pass only | the recorded head | stage 3; the closing read |

A STOP before the apply leaves nothing applied. After the apply, a STOP stops the sitting and
the write stands; the READ ONLY stages then run only on the owner's or the lead's word.

## STAGE 0: verify the promotion, the number, the app half and the clock

**This stage PROVES the promotion; it never performs it.** It reads no database.

```
(
set -eo pipefail
SHA=076481bf1599975e3b1bc25b4f9363901c2c7269df32ec2ef781cb19ba1dc318
BRANCH=db/0099-registo-write-matrix
PR=1475
MIG=packages/db/migrations/0097_clinical_records_write_matrix.sql
PEND=packages/db/migrations-pending/NEXT-AFTER-0096_clinical_records_write_matrix.sql
DOCPIN=docs/migration-apply-0097.sha256

echo "--- the Lisbon clock: a sitting runs only while both clinics are closed"
LT=$(TZ=Europe/Lisbon date +%H%M)
echo "${LT}" | grep -qE '^[0-9]{4}$' || { echo "STOP: the Lisbon clock did not read as HHMM"; exit 1; }
TODAYL=$(TZ=Europe/Lisbon date '+%Y%m%d')
if awk -v t="${LT}" 'BEGIN { if ((t + 0) < 800 || (t + 0) >= 2100) exit 0; exit 1 }'; then
  echo "Lisbon ${LT}: outside 08:00 to 21:00"
elif [ "${TODAYL}" = "20260930" ]; then
  echo "OVERRIDE: Lisbon ${LT} is inside 08:00 to 21:00; the owner's override of 2026-09-30 13:13 Lisbon (\"despite the current clinic schedule, we are doing it now\") lets this sitting run on 20260930 only"
else
  echo "STOP: it is ${LT} in Lisbon. This sitting runs only before 08:00 or from 21:00 Lisbon time, while both clinics are closed"; exit 1
fi

echo "${PR}" | grep -qE '^[0-9]+$' || { echo "STOP: PR is still a placeholder. This document is not issued for a sitting: 0097 is HELD"; exit 1; }
test ! -f /tmp/0097-applied.ok || { echo "STOP: /tmp/0097-applied.ok exists, so stage 1 has applied 0097 on this machine. Never paste stage 0 or stage 1 again: go to stage 2, or report"; exit 1; }
rm -f /tmp/0097-head.sha /tmp/0097-window.ok

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

test -f ${MIG} || { echo "STOP: 0097 is not on disk; the promotion is not on this branch, and 0097 is still HELD"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA}" ] || { echo "STOP: 0097 is not the approved body"; exit 1; }
test ! -f ${PEND} || { echo "STOP: the pending copy still exists, so the rename did not happen"; exit 1; }
N97=$(find packages/db/migrations -maxdepth 1 -name '0097_*.sql' | wc -l | tr -d ' ')
[ "${N97}" = 1 ] || { echo "STOP: ${N97} files claim migration number 0097, not 1"; exit 1; }
N96=$(find packages/db/migrations -maxdepth 1 -name '0096_*.sql' | wc -l | tr -d ' ')
[ "${N96}" = 1 ] || { echo "STOP: ${N96} files claim migration number 0096, not 1. 0097 follows exactly one 0096"; exit 1; }

node -e 'const e = require("./packages/db/migrations/meta/_journal.json").entries; const a = e[e.length - 2]; const b = e[e.length - 1]; console.log("journal: " + e.length + " entries, then idx " + a.idx + " " + a.tag + " when " + a.when + ", then idx " + b.idx + " " + b.tag + " when " + b.when); if (e.length === 95 && a.idx === 93 && /^0096_/.test(a.tag) && b.idx === 94 && b.tag === "0097_clinical_records_write_matrix" && b.when > a.when) process.exit(0); console.log("STOP: the journal must end with 0096 at idx 93 and then 0097_clinical_records_write_matrix at idx 94, 95 entries, with a strictly greater when"); process.exit(1)'

echo "--- the app half (owner ruling Q2 (b)) is on this head"
grep -qF "to_regprocedure('public.claim_ai_draft_authorship(uuid)')" apps/web/lib/clinical/review.ts || { echo "STOP: the app half (Q2 (b)) is not on this head: apps/web/lib/clinical/review.ts does not probe for the claim function. The app half merges to main first, and main is merged in here before the promotion"; exit 1; }
echo "the app half's claim probe is on this head"

pnpm db:check-journal
echo "${PIN}" > /tmp/0097-head.sha
echo "head recorded in /tmp/0097-head.sha: ${PIN}"
echo "PROMOTION AND NUMBER VERIFIED"
)
```

**EXPECT: `PROMOTION AND NUMBER VERIFIED`.** Before it: `Lisbon <HHMM>: outside 08:00 to
21:00` (on 2026-09-30 only, it may instead be the override line `OVERRIDE: Lisbon <HHMM> is
inside 08:00 to 21:00; ...`); `running from <sha>`; `docs/migration-apply-0097.md: OK`; `journal: 95 entries, then
idx 93 0096_... when <W96>, then idx 94 0097_clinical_records_write_matrix when <W97>`; `the
app half's claim probe is on this head`; `pnpm db:check-journal` printing **95 `.sql` files
match 95 journal entries** in order, `when` strictly increasing, the supabase mirror matching
by CONTENT; and `head recorded in /tmp/0097-head.sha: <sha>`, the `running from` sha. Stage 1
re-proves the migration by sha256 through `verified-migrate.mjs`.

**The promoted file's own header will still read "RULED NUMBER 0099. NO NUMBER IN THIS FILE
NAME YET, BY CONSTRUCTION"** (`:13`). That is stale after the rename, and it stays stale on
purpose: see "The migration file's own header names its old number, on purpose".

**The clock.** Both clinics were ruled to 08:00 to 21:00 on every open day
(`docs/data-op-location-hours.md:18`, AGENDA-2100), so a Lisbon time before 08:00 or from 21:00
is outside every ruled opening hour. The hours are data, not code: stage 1 reads
`locations.opens_at` and `closes_at` READ ONLY right before the apply and STOPs if any active
clinic is open by its own row (on 2026-09-30 only, it prints the override line below instead).
The dated window is the dispatch's, recorded by its CLOCK
CHECK in `/tmp/0097-window.ok` for the head stage 0 recorded; stage 1 refuses without it.

**THE OWNER'S OVERRIDE OF 2026-09-30.** At 13:13 Lisbon the owner ruled the applies of 0096
to 0099 to run that day "despite the current clinic schedule, we are doing it now". GREEN, reading 0096's document, stopped before BEFORE YOU START because its clinic check
would STOP; nothing had run against production. He then ruled "amend". Two checks here read
the clinics' hours, and both still read and print them:
- **the Lisbon clock**, in stages 0 and 1, against 08:00 to 21:00. On 2026-09-30 ONLY (the
  Lisbon date read by machine), a time inside those hours prints an `OVERRIDE:` line quoting
  him, and the block continues.
- **the clinics' own rows**, in stage 1 (`OVERRIDE_DAY=20260930`). On that date only, an open
  clinic prints an `OVERRIDE:` line quoting him, and the block continues.

On every other day both STOP exactly as before. A read that finds no active clinic, a count
not written as a plain integer (no sign, no leading zero, nothing after it), or more open
clinics than active ones, STOPs on every day. The dispatch's dated window is
unchanged in kind: its CLOCK CHECK still records it, and every stage still reads it.

## What is new here, because 0097 is not shaped like 0093

0093 CREATED a table. **0097 alters three policies and creates one function**: 0092's ALTER
shape three times over, and CARE-02a's one-CREATE shape once.

- **The pre-check proves each of the three policies PRESENT and exactly as 0045 left it**, by
  the md5 of its rendered expression (verdicts 1 to 3; all three render the same text,
  `a8e4b05ed583e82dbb0b136d5ff4a627`). `ALTER POLICY ... USING` replaces whatever expression
  it finds, so a policy somebody edited by hand would be overwritten without a word, and one
  already carrying 0097's arm would mean 0097 had run outside the journal. Both STOP here,
  before the apply.
- **It pins the two read policies of `clinical_records`** (verdict 4, as 0096 and 0010 leave
  them), **the immutability trigger and its function** (verdict 5, BEFORE UPDATE OR DELETE FOR
  EACH ROW, every column, no WHEN, enabled, body md5), **and
  `clinical_therapist_sees_patient`** (verdict 6), because 0097 relies on each of them NOT
  moving.
- **It proves the new function's name is FREE** (verdict 12), because `CREATE OR REPLACE` would
  silently take over a same-named function somebody else made.
- **It gates Q3 (verdict 13), with a control.** One classification reads every unsigned
  registo and, in the same row set, six planted rows that never touch a table: three that must
  read at risk and three that must not (the lowest-id active owner as author; the lowest-id
  active therapist with an appointment with a live patient, as that patient's author; an AI
  draft pending review with no author). OK only when the real drafts read at risk 0 AND the six
  read exactly their classes. The transaction sets `row_security = off` before its first read,
  so a session that does not bypass row level security ERRORs rather than reads a filtered 0.
  The profile row `draft_profile` prints the four counts, so a refusal says which kind is in
  the way.
- **The post-check asserts each new expression by md5 (verdicts 1 to 3; UPDATE's WITH CHECK
  renders exactly as INSERT's), the function exactly
  (verdict 11: `(uuid)`, `boolean`, `plpgsql`, DEFINER, VOLATILE, `search_path=public`, owner
  `postgres`, body md5) and its grants (verdict 12: EXECUTE for `authenticated`, none for
  `anon`, `service_role`, `patient` or PUBLIC)**, the flat counts, and three "nothing else
  moved" md5s carried from the pre-check: every other policy, every other function, every
  other grant.
- **The behaviour check runs TWICE, with the subjects stage 1 picks.** Before the apply, in
  its subjects-only mode: arm 0, the subjects S0 to S3 and the instrument I1 must read
  `6 OK / 0 VACUOUS / 0 FAIL`, so a subject that is not what its slot says halts the sitting
  before anything is applied; no write arm is printed. After the apply, every arm, and the
  same file with the same subjects must read no FAIL.

There are **six** carries: `journal_rows_before`, `policies_before`, `other_policies_md5`,
`functions_md5`, `grants_md5`, and the profile `draft_profile`, which stage 1 prints and
stage 2 does not pass on. No carry's name is a substring of another's or of any other row's
`check` column, because stage 2's `carry()` matches column 1 with `index()`. The pre-check
also takes two inputs that are not carries, `prev_hash` and `prev_when`, and refuses to run
without them.

## The behaviour subjects on production

`scripts/db/behaviour-registo-writes-readonly.sql` takes four ids and picks none. **On
production GREEN picks them, in stage 1, READ ONLY, by the rule stage 1 carries as `PICK`,
and GREEN chooses nothing itself**: for each slot the rule takes the LOWEST id that meets it,
so two sittings on the same data pick the same people. The rule is the behaviour file's own
slot definitions written against the tables:

| Slot | The rule picks, in P's tenant | Asserted by |
|---|---|---|
| P | the lowest id among live patients with an unsigned registo whose author is an active therapist (not a shared resource) who treats or created P, for which T2 and T3 below exist; a P with an unclaimed AI draft is preferred | S0 |
| T1 | the lowest-id such author of an unsigned registo of P | S1 |
| T2 | the lowest-id active therapist, not a shared resource, other than T1, with an appointment with P in either slot | S2 |
| T3 | the lowest-id active therapist, not a shared resource, other than T1, with no appointment with P, who did not create P, authored no registo of P, is not on P's care team (no live `patient_care_team` row for P: after 0096 a care-team member at one of their own clinics reads P's registos, and T3 is the actor who reads none), and treats or created at least one live patient (so arm N3 has its subject) | S3, N3 |

**Two shapes, and the blocks accept only those.** Before the apply, both read
`6 OK / 0 VACUOUS / 0 FAIL` in the subjects-only mode. After it, when P has an unclaimed AI
draft the run reads `20 OK / 0 VACUOUS / 0 FAIL`; when it has none, arm A1 reads VACUOUS:
`19 OK / 1 VACUOUS / 0 FAIL`. Both were measured on the rehearsal. The pick says which shape
it found (`ai` or `noai`), and a behaviour run that disagrees with it changes the profile, so
the block halts.

**A missing subject is a FAIL, never a pass and never a silent skip.** If the rule finds no P,
stage 1 STOPs on `a MISSING SUBJECT` after the pre-check and before any behaviour run or
apply; nothing was applied. If a subject is not what its slot says when the behaviour file
reads it, its S arm reads FAIL, the subjects-only run does not read `6 OK / 0 VACUOUS /
0 FAIL`, and stage 1 halts **before anything is applied**. Measured: a care-team member
passed as T3 reads S3 FAIL.

**How the ids reach stage 3.** Stage 1 writes the one line it picked
(`<patient>|<T1>|<T2>|<T3>|<ai or noai>`) to `/tmp/0097-subjects.out`, under `umask 077`,
and prints only the three staff ids. Stage 3 reads that file, never picks again, and first
checks that stage 1's BEFORE transcript named exactly its actors. The patient id never
reaches a transcript.

**The pre-check, the pick and the behaviour check read outside row level security for their
comparands.** Each sets `row_security = off` for its unfiltered reads, so on a connection that
does not bypass row level security it ERRORs rather than reads a filtered count. On production
the connection is `postgres`, which bypasses it (as on the rehearsal image, where `postgres` is
not a superuser and holds BYPASSRLS), and the tables are owned by `postgres` with RLS ENABLED,
not FORCED. 0094's behaviour check set `row_security = off` on production on 2026-09-29 and
read. By the owner's ruling of 2026-09-30 no READ ONLY run preceded the issue (see "Measured
on production, READ ONLY"), so the first production measurement of the pre-check and the pick
is stage 1's, and the behaviour check's is stage 1's subjects-only run.

## STAGE 1: the head, the window, pre-flight, pre-check (Q3), the pick, the subjects BEFORE, apply

```
(
set -eo pipefail
umask 077
SHA0097=076481bf1599975e3b1bc25b4f9363901c2c7269df32ec2ef781cb19ba1dc318
SHAPRE=7ab316aed3130ea7b45c3546e65f447b2952d22a4a329bbe0150b02d36b7f164
SHABEHAVIOUR=20c1b13f3ef9c5ba63b301b0dc2d9d7f138ef5a8dd31b296aba166f315765908
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
BRANCH=db/0099-registo-write-matrix
PR=1475
U='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
PICK="with t as (select u.id, u.tenant_id from public.users u join public.roles r on r.id = u.role_id and r.slug = 'therapist' where u.is_active and not u.is_shared_resource), f as (select distinct c.tenant_id, c.patient_id as pid, c.practitioner_id as t1 from public.clinical_records c join public.patients p on p.id = c.patient_id and p.tenant_id = c.tenant_id and p.deleted_at is null join t on t.id = c.practitioner_id and t.tenant_id = c.tenant_id where c.status = 'draft' and (p.created_by = c.practitioner_id or exists (select 1 from public.appointments a where a.tenant_id = c.tenant_id and (a.patient_id = c.patient_id or a.patient_2_id = c.patient_id) and (a.practitioner_id = c.practitioner_id or a.practitioner_2_id = c.practitioner_id)))), s as (select f.pid, f.t1::text as t1, (select min(x.id::text) from t x where x.tenant_id = f.tenant_id and x.id <> f.t1 and exists (select 1 from public.appointments a where a.tenant_id = f.tenant_id and (a.patient_id = f.pid or a.patient_2_id = f.pid) and (a.practitioner_id = x.id or a.practitioner_2_id = x.id))) as t2, (select min(y.id::text) from t y where y.tenant_id = f.tenant_id and y.id <> f.t1 and not exists (select 1 from public.appointments a where a.tenant_id = f.tenant_id and (a.patient_id = f.pid or a.patient_2_id = f.pid) and (a.practitioner_id = y.id or a.practitioner_2_id = y.id)) and not exists (select 1 from public.patients p where p.id = f.pid and p.created_by = y.id) and not exists (select 1 from public.clinical_records c where c.tenant_id = f.tenant_id and c.patient_id = f.pid and c.practitioner_id = y.id) and not exists (select 1 from public.patient_care_team ct where ct.tenant_id = f.tenant_id and ct.patient_id = f.pid and ct.user_id = y.id and ct.removed_at is null) and (exists (select 1 from public.patients q where q.tenant_id = f.tenant_id and q.deleted_at is null and q.created_by = y.id) or exists (select 1 from public.appointments a join public.patients q on q.id in (a.patient_id, a.patient_2_id) and q.tenant_id = a.tenant_id and q.deleted_at is null where a.tenant_id = f.tenant_id and (a.practitioner_id = y.id or a.practitioner_2_id = y.id)))) as t3, exists (select 1 from public.clinical_records c where c.tenant_id = f.tenant_id and c.patient_id = f.pid and c.source = 'ai_ingested' and c.status = 'draft' and c.ai_review_state = 'pending_review' and c.practitioner_id is null) as has_ai from f) select pid::text || '|' || t1 || '|' || t2 || '|' || t3 || '|' || case when has_ai then 'ai' else 'noai' end from s where t2 is not null and t3 is not null order by has_ai desc, pid, t1 limit 1"

echo "--- the Lisbon clock, before anything else"
LT=$(TZ=Europe/Lisbon date +%H%M)
echo "${LT}" | grep -qE '^[0-9]{4}$' || { echo "STOP: the Lisbon clock did not read as HHMM"; exit 1; }
TODAYL=$(TZ=Europe/Lisbon date '+%Y%m%d')
if awk -v t="${LT}" 'BEGIN { if ((t + 0) < 800 || (t + 0) >= 2100) exit 0; exit 1 }'; then
  echo "Lisbon ${LT}: outside 08:00 to 21:00"
elif [ "${TODAYL}" = "20260930" ]; then
  echo "OVERRIDE: Lisbon ${LT} is inside 08:00 to 21:00; the owner's override of 2026-09-30 13:13 Lisbon (\"despite the current clinic schedule, we are doing it now\") lets this sitting run on 20260930 only"
else
  echo "STOP: it is ${LT} in Lisbon. This sitting runs only before 08:00 or from 21:00 Lisbon time, while both clinics are closed"; exit 1
fi

echo "--- the value the issue fills. A placeholder means this document is not issued: 0097 is HELD"
echo "${PR}" | grep -qE '^[0-9]+$' || { echo "STOP: PR is still a placeholder. This document is not issued for a sitting"; exit 1; }

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
test ! -f /tmp/0097-applied.ok || { echo "STOP: stage 1 ALREADY APPLIED on this machine. Do not run it again. Go to stage 2"; exit 1; }
rm -f /tmp/0097-precheck.new /tmp/0097-subjects.new /tmp/0097-behaviour-before.new

echo "--- THE HEAD: the branch must still be where stage 0 recorded it"
test -f /tmp/0097-head.sha || { echo "STOP: stage 0 recorded no head in this sitting. Nothing was applied"; exit 1; }
REC=$(cat /tmp/0097-head.sha)
git fetch origin --prune
if git rev-parse -q --verify refs/remotes/origin/${BRANCH} > /dev/null; then NOW=$(git rev-parse refs/remotes/origin/${BRANCH}); else echo "the branch is gone from origin: reading the head of PR ${PR}"; git fetch -q origin refs/pull/${PR}/head; NOW=$(git rev-parse FETCH_HEAD); fi
echo "recorded by stage 0: ${REC}"
echo "branch head now:     ${NOW}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: the branch moved since stage 0. Nothing was applied. Start again from stage 0"; exit 1; }

echo "--- THE RUN WINDOW: the dispatch's CLOCK CHECK recorded it for this head"
test -f /tmp/0097-window.ok || { echo "STOP: no run window is recorded for this sitting. Nothing was applied"; exit 1; }
[ -n "$(find /tmp/0097-window.ok -mmin -120)" ] || { echo "STOP: the run window record is over two hours old. Nothing was applied"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0097-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another head. Nothing was applied"; exit 1; }
WOPEN=$(cut -d' ' -f2 /tmp/0097-window.ok)
WSTART=$(cut -d' ' -f3 /tmp/0097-window.ok)
WEND=$(cut -d' ' -f4 /tmp/0097-window.ok)
echo "${WOPEN} ${WSTART} ${WEND}" | grep -qxE '[0-9]{12} [0-9]{12} [0-9]{12}' || { echo "STOP: the recorded run window did not parse. Nothing was applied"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: opens ${WOPEN}, stage 1 starts by ${WSTART}, everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -ge "${WOPEN}" ] && [ "${NOWL}" -le "${WSTART}" ] || { echo "STOP: Lisbon ${NOWL} is outside the minutes stage 1 may start in. Nothing was applied"; exit 1; }

echo "--- pre-flight: the tree holds nothing but the checkout"
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: ${REC} does not resolve to a commit"; exit 1; }
echo "applying from ${REC}"

echo "--- SR-58: this stage checks out its own ref and proves the files"
git checkout -q --detach ${REC}
test -f docs/migration-apply-0097.sha256 || { echo "STOP: the document pin is not on disk"; exit 1; }
shasum -a 256 -c docs/migration-apply-0097.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f packages/db/migrations/0097_clinical_records_write_matrix.sql || { echo "STOP: 0097 is not on disk"; exit 1; }
test -f scripts/db/precheck-0097-registo-writes.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/behaviour-registo-writes-readonly.sql || { echo "STOP: the behaviour check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
N97=$(find packages/db/migrations -maxdepth 1 -name '0097_*.sql' | wc -l | tr -d ' ')
[ "${N97}" = 1 ] || { echo "STOP: ${N97} files claim migration number 0097, not 1"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0097_clinical_records_write_matrix.sql | cut -d' ' -f1)" = "${SHA0097}" ] || { echo "STOP: 0097 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0097-registo-writes.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-registo-writes-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- 0096 as this branch carries it: the pre-check's prev_hash and prev_when, read here and never typed"
N96=$(find packages/db/migrations -maxdepth 1 -name '0096_*.sql' | wc -l | tr -d ' ')
[ "${N96}" = 1 ] || { echo "STOP: ${N96} files claim migration number 0096, not 1"; exit 1; }
F96=$(find packages/db/migrations -maxdepth 1 -name '0096_*.sql')
PREVHASH=$(shasum -a 256 ${F96} | cut -d' ' -f1)
PREVWHEN=$(node -e 'const e = require("./packages/db/migrations/meta/_journal.json").entries.filter((x) => /^0096_/.test(x.tag)); process.stdout.write(e.length === 1 ? String(e[0].when) : "")')
echo "${PREVHASH}" | grep -qE '^[0-9a-f]{64}$' || { echo "STOP: 0096's sha256 did not read"; exit 1; }
echo "${PREVWHEN}" | grep -qE '^[0-9]{13}$' || { echo "STOP: 0096's journal when did not read as exactly one 13-digit value"; exit 1; }
echo "0096: ${F96}, sha256 ${PREVHASH}, journal when ${PREVWHEN}"

echo "--- the production target, asserted by the guard, not by the prompt"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the clinics' own hours, READ ONLY: no active clinic may be open now (on 2026-09-30 only, the owner's override lets the sitting run while one is)"
CL=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) filter (where is_active and (now() at time zone 'Europe/Lisbon')::time >= opens_at and (now() at time zone 'Europe/Lisbon')::time < closes_at) || ' of ' || count(*) filter (where is_active) from public.locations" | tail -1)
echo "active clinics open now by their own hours: ${CL}"
OVERRIDE_DAY=20260930
TODAYL=$(TZ=Europe/Lisbon date '+%Y%m%d')
if awk -v s="${CL}" 'BEGIN { n = split(s, a, " "); if (n == 3 && a[1] == "0" && a[2] == "of" && a[3] ~ /^[1-9][0-9]*$/) exit 0; exit 1 }'; then
  echo "clinics: every active clinic is closed by its own hours"
elif [ "${TODAYL}" = "${OVERRIDE_DAY}" ] && awk -v s="${CL}" 'BEGIN { n = split(s, a, " "); if (n == 3 && a[1] ~ /^[1-9][0-9]*$/ && a[2] == "of" && a[3] ~ /^[1-9][0-9]*$/ && (a[1] + 0) <= (a[3] + 0)) exit 0; exit 1 }'; then
  echo "OVERRIDE: ${CL} active clinics open now by their own hours; the owner's override of 2026-09-30 13:13 Lisbon (\"despite the current clinic schedule, we are doing it now\") lets this sitting run on ${OVERRIDE_DAY} only"
else
  echo "STOP: a clinic is open now by its own hours, or no active clinic was read [${CL}]. The sitting waits until both are closed"; exit 1
fi

echo "--- the pre-check. READ ONLY. Its transcript IS the carry, so it is kept"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v prev_hash=${PREVHASH} -v prev_when=${PREVWHEN} -f scripts/db/precheck-0097-registo-writes.sql 2>&1 | tee /tmp/0097-precheck.new
UD=$(awk -F'|' 'index($1,"draft_profile")>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0097-precheck.new)
echo "draft profile (Q3): ${UD}"
Q3=$(grep -E '^[[:space:]]*13\. Q3:' /tmp/0097-precheck.new || true)
echo "${Q3}" | grep -qE '\|[[:space:]]*OK[[:space:]]*$' || { echo "STOP: Q3, the at-risk draft count, did not read 0 with its control holding [${UD}]. By the owner's ruling the sitting proceeds only at 0: the owner finishes those drafts, or rules, first. Nothing was applied"; exit 1; }
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0097-precheck.new && { echo "STOP: a pre-check verdict read FAIL. Nothing was applied and no earlier transcript was touched"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0097-precheck.new || true)
[ "${OKS}" = 20 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 20"; exit 1; }

echo "--- the behaviour subjects, picked READ ONLY by the rule in PICK: the lowest id that meets each slot. GREEN chooses nothing and substitutes nothing"
SUBJ=$(psql "${DATABASE_URL_DIRECT}" -X -q -At -v ON_ERROR_STOP=1 -c "begin read only" -c "set local row_security = off" -c "${PICK}" | tail -1)
[ -n "${SUBJ}" ] || { echo "STOP: a MISSING SUBJECT. No live patient furnishes T1, T2 and T3 by the rule in PICK. Nothing was applied. Report it; never pick by hand"; exit 1; }
echo "${SUBJ}" | grep -qxE "${U}[|]${U}[|]${U}[|]${U}[|](ai|noai)" || { echo "STOP: the pick did not read as one patient, three staff ids and a shape"; exit 1; }
PATIENT=$(echo "${SUBJ}" | cut -d'|' -f1)
T1=$(echo "${SUBJ}" | cut -d'|' -f2)
T2=$(echo "${SUBJ}" | cut -d'|' -f3)
T3=$(echo "${SUBJ}" | cut -d'|' -f4)
SHAPE=$(echo "${SUBJ}" | cut -d'|' -f5)
echo "${SUBJ}" > /tmp/0097-subjects.new
echo "subjects picked: T1 ${T1}, T2 ${T2}, T3 ${T3}, shape ${SHAPE}, and one patient (used, never printed)"
XACTORS="${T1} ${T2} ${T3} "

echo "--- the behaviour check BEFORE the apply, subjects-only. READ ONLY. The subjects and the instrument must hold; no write arm is printed"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v subjects_only=on -v patient_id=${PATIENT} -v t1_id=${T1} -v t2_id=${T2} -v t3_id=${T3} -f scripts/db/behaviour-registo-writes-readonly.sql 2>&1 | tee /tmp/0097-behaviour-before.new
grep -qE '^[[:space:]]*99[[:space:]]*\|' /tmp/0097-behaviour-before.new || { echo "STOP: the behaviour check printed no SUMMARY row before the apply"; exit 1; }
ACTORS=$(grep -E '^ACTOR id ' /tmp/0097-behaviour-before.new | awk '{print $3}' | tr '\n' ' ' || true)
[ "${ACTORS}" = "${XACTORS}" ] || { echo "STOP: the ACTOR lines must name the picked actors in slot order, once each [${XACTORS}]. They named [${ACTORS}]"; exit 1; }
SUBJOK=$(grep -cE '^[[:space:]]*[0-5][[:space:]]*\|[[:space:]]*(0|S0|S1|S2|S3|I1)\. .*\|[[:space:]]*OK[[:space:]]*$' /tmp/0097-behaviour-before.new || true)
[ "${SUBJOK}" = 6 ] || { echo "STOP: before the apply arm 0, S0 to S3 and I1 must each read OK. ${SUBJOK} of 6 did. A subject is not what its slot says. Nothing was applied"; exit 1; }
PROFILE=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0097-behaviour-before.new | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
[ "${PROFILE}" = "6 OK / 0 VACUOUS / 0 FAIL" ] || { echo "STOP: before the apply the subjects-only profile must read 6 OK / 0 VACUOUS / 0 FAIL. It read ${PROFILE}"; exit 1; }
echo "the subjects and the instrument hold: ${PROFILE}"

echo "--- only now, with a passing pre-check, a full pick and the subjects proven, does the previous sitting's state go"
rm -f /tmp/0097-postcheck.out /tmp/0097-behaviour-after.out /tmp/0097-subjects.out /tmp/0097-apply.out /tmp/0097-stage2.ok /tmp/0097-stage3.ok
mv /tmp/0097-precheck.new /tmp/0097-precheck.out
mv /tmp/0097-subjects.new /tmp/0097-subjects.out
mv /tmp/0097-behaviour-before.new /tmp/0097-behaviour-before.out

echo "--- the run window, again before the apply"
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, again before the apply: now ${NOWL}, stage 1 starts by ${WSTART}"
[ "${NOWL}" -le "${WSTART}" ] || { echo "STOP: Lisbon ${NOWL} is past ${WSTART}, the last minute the apply may start. Nothing was applied"; exit 1; }

echo "--- the apply. It is the only writing command in this document. Its whole output goes to /tmp/0097-apply.out"
node packages/db/scripts/verified-migrate.mjs --tag 0097_clinical_records_write_matrix --sha256 ${SHA0097} --expect-pending 1 2>&1 | tee /tmp/0097-apply.out
touch /tmp/0097-applied.ok
echo "0097 APPLIED. Paste stage 2 now."
)
```

**EXPECT, and these are what stage 1 is read for:**

- **the clock line (`Lisbon <HHMM>: outside 08:00 to 21:00`, or on 2026-09-30 only the
  `OVERRIDE: Lisbon <HHMM> ...` line); `recorded by stage 0: <sha>` and `branch head now: <sha>`, the same sha
  twice; and the run window line, now inside it** (each halts the block otherwise, with
  nothing applied);
- **`applying from <sha>`**, the recorded sha, and `docs/migration-apply-0097.md: OK`;
- **`0096: packages/db/migrations/0096_..., sha256 <sha>, journal when <when>`**;
- **`active clinics open now by their own hours: <k> of <n>`**, `n` at least 1. A zero with no
  clinic behind it would be vacuous, so the block requires both. Then either
  `clinics: every active clinic is closed by its own hours` (k is 0) or, ON 2026-09-30 ONLY,
  the owner's override line `OVERRIDE: <k> of <n> active clinics open now ...` (k above 0 and at most n).
  On any other day an open clinic STOPs the block, as before;
- **the pre-check prints `20` OK verdicts and no FAIL**, with `journal_rows_before` 94 and
  verdict 10 naming 0096's sha256 and `when` as the line above it printed them;
- **`draft profile (Q3): ai pending <n>, ai in review 0, other 0, author cannot write 0`**,
  and verdict 13 OK: `at risk 0 of <n> drafts; control c_gone=author cannot write, c_other=other,
  c_owner=author writes, c_pending=ai pending, c_review=ai in review, c_treats=author writes`.
  Anything else STOPs before the pick, with nothing applied (Q3);
- **`subjects picked: T1 <id>, T2 <id>, T3 <id>, shape <ai or noai>`**, and no patient id
  anywhere;
- **the behaviour check BEFORE, subjects-only: `6 OK / 0 VACUOUS / 0 FAIL`**, with arm 0, S0
  to S3 and I1 each OK and the three ACTOR lines naming the picked actors. It prints no write
  arm. A FAIL on any of the six halts the block with nothing applied;
- **`run window, again before the apply: now <t>, stage 1 starts by <t>`**, now no later;
- **verified-migrate, through `tee` into `/tmp/0097-apply.out`: `pending    1
  [0097_clinical_records_write_matrix]`.** Exactly one. It then prints `journal    94 -> 95
  (delta 1)` and `0097_clinical_records_write_matrix present by sha256: yes`, and the block's
  last line is `0097 APPLIED. Paste stage 2 now.` Stage 2 re-reads the journal from the
  database rather than trusting this line.

`verified-migrate.mjs` exits **2** on a bad invocation or a missing environment variable;
**3** BEFORE drizzle runs on a missing file, a wrong sha256, a tag missing from
`_journal.json`, an already-applied migration or a pending count that is not 1, and AFTER
drizzle has run on a journal that moved by the wrong amount or moved without the approved
sha256; **4** if drizzle itself failed or on any thrown error; **5** if drizzle reports
success and the journal did not move. `tee` does not hide the exit: `pipefail` hands the
block verified-migrate's own non-zero, the block stops, and `/tmp/0097-applied.ok` is not
written. **If stage 1 ended non-zero after the `drizzle-kit migrate` banner had printed, do
not paste stage 1 again.** Report the exit code and `/tmp/0097-apply.out` whole; the lead
rules, and the read that answers it (`node --env-file=/Users/ivan/osteojp-secrets/new-prod.env
packages/db/scripts/read-applied-migrations.mjs`, READ ONLY, from the apply worktree) runs only
on the lead's word. If it lists 0097 as APPLIED, production is applied and no marker exists,
so stage 2 will refuse: stop and ask the owner to rule. If it lists 0097 as NOT APPLIED,
nothing changed: drizzle applies the file's statements and the journal row in ONE
transaction. 0097 is eight statements, each ended by `--> statement-breakpoint`, the last one
included.

## STAGE 2: post-check, carries derived from stage 1

```
(
set -eo pipefail
SHA0097=076481bf1599975e3b1bc25b4f9363901c2c7269df32ec2ef781cb19ba1dc318
SHAPOST=296b9a09f00e22c70a98496c7c89bec80d4d955d61eb34492b1e90ee21ad053b
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
BRANCH=db/0099-registo-write-matrix
PR=1475

echo "${PR}" | grep -qE '^[0-9]+$' || { echo "STOP: PR is still a placeholder. This document is not issued for a sitting"; exit 1; }
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/0097-stage2.ok

echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0097-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not complete an apply in this sitting"; exit 1; }
test -f /tmp/0097-head.sha || { echo "STOP: stage 0 recorded no head"; exit 1; }
REC=$(cat /tmp/0097-head.sha)

echo "--- THE HEAD: this stage runs from the recorded head, and only reports a moved branch"
git fetch origin --prune
NOW=$(git rev-parse -q --verify refs/remotes/origin/${BRANCH} || echo "the branch is gone from origin")
echo "checking from the recorded head ${REC}"
echo "branch head now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "the branch has not moved since stage 0"; else echo "BRANCH MOVED since stage 0: this stage still runs from the recorded head. Report both shas"; fi
git checkout -q --detach ${REC}
test -f packages/db/migrations/0097_clinical_records_write_matrix.sql || { echo "STOP: 0097 is not on disk"; exit 1; }
test -f scripts/db/postcheck-0097-registo-writes.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
shasum -a 256 -c docs/migration-apply-0097.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0097_clinical_records_write_matrix.sql | cut -d' ' -f1)" = "${SHA0097}" ] || { echo "STOP: 0097 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0097-registo-writes.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- THE RUN WINDOW: every READ ONLY stage ends before the recorded window's end"
test -f /tmp/0097-window.ok || { echo "STOP: no run window is recorded for this sitting. The write stands"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0097-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another head. The write stands"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0097-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. The write stands"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. The write stands; the READ ONLY stages run only on the owner's or the lead's word"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0097-precheck.out || { echo "STOP: stage 1's transcript is missing; the write stands. Report it"; exit 1; }
[ -n "$(find /tmp/0097-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0097-precheck.out; }
J=$(carry journal_rows_before)
P=$(carry policies_before)
O=$(carry other_policies_md5)
F=$(carry functions_md5)
G=$(carry grants_md5)
[ -n "${J}" ] && [ -n "${P}" ] && [ -n "${O}" ] && [ -n "${F}" ] && [ -n "${G}" ] || { echo "STOP: a carry did not parse out of the transcript"; exit 1; }
[ "${J}" = 94 ] || { echo "STOP: the carried journal_rows_before reads ${J}, not 94"; exit 1; }
echo "carries from this run: journal_before=${J} policies_before=${P} other_policies_md5=${O} functions_md5=${F} grants_md5=${G}"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0097-postcheck.out
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v policies_before="${P}" -v other_policies_md5="${O}" -v functions_md5="${F}" -v grants_md5="${G}" -v journal_rows_before="${J}" -c "begin read only" -f scripts/db/postcheck-0097-registo-writes.sql -c "rollback" 2>&1 | tee /tmp/0097-postcheck.out
N1112=$(grep -cE '^[[:space:]]*1[12]\. .*\|[[:space:]]*OK[[:space:]]*$' /tmp/0097-postcheck.out || true)
[ "${N1112}" = 2 ] || { echo "STOP: post-check 11 or 12 is not OK: the claim function's security, owner, body or EXECUTE is not what 0097 writes. Do NOT run stage 3. Report to the owner now"; exit 1; }
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0097-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0097-postcheck.out || true)
[ "${OKS}" = 15 ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not 15"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0097 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations")
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0097}'")
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0097 is in the journal ${HN} times, not once"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0097 present by hash"

echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;"

echo "${REC}" > /tmp/0097-stage2.ok
echo "0097 POST-CHECK PASSED. 20/20 pre-check OK, 15/15 post-check OK, journal ${J} to ${JA}. Paste stage 3 now."
)
```

**EXPECT:** `checking from the recorded head <sha>` and whether the branch moved (report both
shas if it did; the stage still runs); `docs/migration-apply-0097.md: OK`; the run window line
with now before its end; the carry line reads `journal_before=94`; the post-check prints `15`
OK verdicts and no FAIL, 11 and 12 among them; the journal reads `94` before and `95` after,
with 0097's sha256 in it **exactly once**; the final line reads exactly
`0097 POST-CHECK PASSED. 20/20 pre-check OK, 15/15 post-check OK, journal 94 to 95. Paste stage 3 now.`

**Verdicts 11 and 12 are read first, with their own STOP, because they are the crash
guard.** Stage 3 acts as `authenticated`. On the rehearsal image a live call to a function
the caller cannot execute crashes the backend and drops every connection on the server; the
behaviour check never calls the claim function, but the rehearsal still ran no session as
`authenticated` before 11 and 12 read OK, and mutations F10 to F13 below were judged by the
post-check alone.

## STAGE 3: the behaviour check AFTER the apply. READ ONLY

Same file, the SAME subjects stage 1 picked and wrote down, now with every arm. This stage
never picks.

```
(
set -eo pipefail
umask 077
SHABEHAVIOUR=20c1b13f3ef9c5ba63b301b0dc2d9d7f138ef5a8dd31b296aba166f315765908
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
BRANCH=db/0099-registo-write-matrix
PR=1475
U='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

echo "${PR}" | grep -qE '^[0-9]+$' || { echo "STOP: PR is still a placeholder. This document is not issued for a sitting"; exit 1; }

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/0097-stage3.ok
test -f /tmp/0097-head.sha || { echo "STOP: stage 0 recorded no head"; exit 1; }
REC=$(cat /tmp/0097-head.sha)

echo "--- stage 2 must have PASSED on the recorded head, after this sitting's apply"
test -f /tmp/0097-applied.ok || { echo "STOP: stage 1 left no applied marker"; exit 1; }
test -f /tmp/0097-stage2.ok || { echo "STOP: stage 2 left no pass mark. Do not run the behaviour check"; exit 1; }
[ "$(cat /tmp/0097-stage2.ok)" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the recorded head"; exit 1; }
[ -n "$(find /tmp/0097-stage2.ok -newer /tmp/0097-applied.ok)" ] || { echo "STOP: stage 2's pass mark is older than the apply"; exit 1; }

git fetch origin --prune
NOW=$(git rev-parse -q --verify refs/remotes/origin/${BRANCH} || echo "the branch is gone from origin")
echo "verifying from the recorded head ${REC}"
echo "branch head now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "the branch has not moved since stage 0"; else echo "BRANCH MOVED since stage 0: this stage still runs from the recorded head. Report both shas"; fi
git checkout -q --detach ${REC}
test -f scripts/db/behaviour-registo-writes-readonly.sql || { echo "STOP: the behaviour check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
shasum -a 256 -c docs/migration-apply-0097.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-registo-writes-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- THE RUN WINDOW"
test -f /tmp/0097-window.ok || { echo "STOP: no run window is recorded for this sitting. The write stands"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0097-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another head. The write stands"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0097-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. The write stands"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. The write stands; the READ ONLY stages run only on the owner's or the lead's word"; exit 1; }

echo "--- the subjects are stage 1's, read back and never picked again"
test -f /tmp/0097-behaviour-before.out || { echo "STOP: stage 1's BEFORE transcript is missing, so there is nothing to compare against"; exit 1; }
test -f /tmp/0097-subjects.out || { echo "STOP: stage 1's subjects file is missing. Never pick again after the apply: report it"; exit 1; }
[ "$(wc -l < /tmp/0097-subjects.out | tr -d ' ')" = 1 ] || { echo "STOP: the subjects file must hold exactly one line"; exit 1; }
SUBJ=$(head -1 /tmp/0097-subjects.out)
echo "${SUBJ}" | grep -qxE "${U}[|]${U}[|]${U}[|]${U}[|](ai|noai)" || { echo "STOP: the subjects file does not read as one patient, three staff ids and a shape"; exit 1; }
PATIENT=$(echo "${SUBJ}" | cut -d'|' -f1)
T1=$(echo "${SUBJ}" | cut -d'|' -f2)
T2=$(echo "${SUBJ}" | cut -d'|' -f3)
T3=$(echo "${SUBJ}" | cut -d'|' -f4)
SHAPE=$(echo "${SUBJ}" | cut -d'|' -f5)
XBEFORE="6 OK / 0 VACUOUS / 0 FAIL"
if [ "${SHAPE}" = ai ]; then XAFTER="20 OK / 0 VACUOUS / 0 FAIL"; XVAC=""; else XAFTER="19 OK / 1 VACUOUS / 0 FAIL"; XVAC="A1 "; fi
XACTORS="${T1} ${T2} ${T3} "
BACTORS=$(grep -E '^ACTOR id ' /tmp/0097-behaviour-before.out | awk '{print $3}' | tr '\n' ' ' || true)
[ "${BACTORS}" = "${XACTORS}" ] || { echo "STOP: stage 1's BEFORE transcript and its subjects file do not name the same actors [${BACTORS}] [${XACTORS}]"; exit 1; }
echo "subjects from stage 1: T1 ${T1}, T2 ${T2}, T3 ${T3}, shape ${SHAPE}, and one patient (used, never printed)"

echo "--- the crash guard: stage 2's post-check of this sitting, 15 OK with 11 and 12 among them, before any session acts as authenticated"
test -f /tmp/0097-postcheck.out || { echo "STOP: stage 2's post-check transcript is missing. Run stage 2 first"; exit 1; }
[ /tmp/0097-postcheck.out -nt /tmp/0097-behaviour-before.out ] || { echo "STOP: the post-check transcript is older than stage 1's BEFORE run, so it is not this sitting's"; exit 1; }
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0097-postcheck.out && { echo "STOP: stage 2's post-check read FAIL. Do not run the behaviour check"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0097-postcheck.out || true)
[ "${OKS}" = 15 ] || { echo "STOP: stage 2's post-check printed ${OKS} OK verdicts, not 15"; exit 1; }
N1112=$(grep -cE '^[[:space:]]*1[12]\. .*\|[[:space:]]*OK[[:space:]]*$' /tmp/0097-postcheck.out || true)
[ "${N1112}" = 2 ] || { echo "STOP: post-check 11 and 12 are not both OK. Do not run the behaviour check"; exit 1; }

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs
rm -f /tmp/0097-behaviour-after.out
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v patient_id=${PATIENT} -v t1_id=${T1} -v t2_id=${T2} -v t3_id=${T3} -f scripts/db/behaviour-registo-writes-readonly.sql 2>&1 | tee /tmp/0097-behaviour-after.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0097-behaviour-after.out && { echo "STOP: a behaviour verdict read FAIL after the apply"; exit 1; }
grep -qE '^[[:space:]]*99[[:space:]]*\|' /tmp/0097-behaviour-after.out || { echo "STOP: the behaviour check printed no SUMMARY row, so the transcript is truncated"; exit 1; }
ACTORS=$(grep -E '^ACTOR id ' /tmp/0097-behaviour-after.out | awk '{print $3}' | tr '\n' ' ' || true)
[ "${ACTORS}" = "${XACTORS}" ] || { echo "STOP: the ACTOR lines must name stage 1's actors in slot order, once each [${XACTORS}]. They named [${ACTORS}]"; exit 1; }
VACSET=$(grep -E '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0097-behaviour-after.out | sed -E 's/^[[:space:]]*[0-9]+[[:space:]]*\|[[:space:]]*([A-Z0-9]+)\..*/\1/' | LC_ALL=C sort | tr '\n' ' ' || true)
[ "${VACSET}" = "${XVAC}" ] || { echo "STOP: after the apply the VACUOUS arms must be exactly [${XVAC}]. They were [${VACSET}]"; exit 1; }
BEFORE=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0097-behaviour-before.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
AFTER=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0097-behaviour-after.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
[ "${BEFORE}" = "${XBEFORE}" ] || { echo "STOP: stage 1's subjects-only BEFORE transcript does not read ${XBEFORE}. It read ${BEFORE}"; exit 1; }
[ "${AFTER}" = "${XAFTER}" ] || { echo "STOP: after the apply the profile must read ${XAFTER}. It read ${AFTER}"; exit 1; }
echo "${REC}" > /tmp/0097-stage3.ok
echo "0097 BEHAVES AS RULED AT THE RLS LAYER. subjects before ${BEFORE}, every arm after ${AFTER}. The writes in action are proven by the rehearsal, not by this READ ONLY transcript."
)
```

**EXPECT: no FAIL, a SUMMARY row, the ACTOR lines naming stage 1's actors, and the profile
EXACTLY `20 OK / 0 VACUOUS / 0 FAIL` with shape `ai`, or `19 OK / 1 VACUOUS / 0 FAIL` with
VACUOUS on exactly `A1` with shape `noai`**, which the block asserts, with stage 1's
subjects-only transcript reading `6 OK / 0 VACUOUS / 0 FAIL`. The final line reads `0097
BEHAVES AS RULED AT THE RLS LAYER. subjects before 6 OK / 0 VACUOUS / 0 FAIL, every arm after
<AFTER>. ...`. Only a pass writes `/tmp/0097-stage3.ok`, and the block removes it before
anything else, so a stage 3 that stops leaves no mark and the closing read does not run.

**If stage 3 STOPs, production is already applied.** Do not re-run stage 1, do not pick
again, and do not substitute a subject: report the transcript to the owner.

## THE CLOSING READ. READ ONLY

Paste this on its own, and **only** after stage 3 exited 0 with its last line `0097 BEHAVES
AS RULED AT THE RLS LAYER. ...`. Before the read runs it checks by machine that the worktree
is on the head stage 0 recorded, that stage 1 applied, that stages 2 and 3 passed on that head
after the apply, that the Lisbon clock is before the end of the run window recorded for that
head, and that the reader is the pinned file. A check that fails prints a `STOP:` line and
exits 1, and the read does not run.

```
(
set -eo pipefail
SHAREADER=867e2823130b1ec1a9f7790522968924ecd872452c48322884c3e22efb5704d1
READER=packages/db/scripts/read-applied-migrations.mjs
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
test -f /tmp/0097-head.sha || { echo "STOP: stage 0 recorded no head in this sitting. The journal read has not run"; exit 1; }
REC=$(cat /tmp/0097-head.sha)
[ "$(git rev-parse HEAD)" = "${REC}" ] || { echo "STOP: the apply worktree is not on the head stage 0 recorded. The journal read has not run"; exit 1; }
test -f /tmp/0097-applied.ok || { echo "STOP: stage 1 left no applied marker. The journal read has not run"; exit 1; }
test -f /tmp/0097-stage2.ok || { echo "STOP: stage 2 left no pass mark. The journal read has not run"; exit 1; }
[ "$(cat /tmp/0097-stage2.ok)" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the recorded head. The journal read has not run"; exit 1; }
test -f /tmp/0097-stage3.ok || { echo "STOP: stage 3 left no pass mark, so its last paste did not pass. The journal read has not run"; exit 1; }
[ "$(cat /tmp/0097-stage3.ok)" = "${REC}" ] || { echo "STOP: stage 3's pass mark does not name the recorded head. The journal read has not run"; exit 1; }
[ -n "$(find /tmp/0097-stage3.ok -newer /tmp/0097-applied.ok)" ] || { echo "STOP: stage 3's pass mark is older than the apply. The journal read has not run"; exit 1; }
test -f /tmp/0097-window.ok || { echo "STOP: no run window is recorded for this sitting. The journal read has not run"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0097-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another head. The journal read has not run"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0097-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. The journal read has not run"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. The journal read has not run"; exit 1; }
RW=$(shasum -a 256 ${READER} | cut -d' ' -f1)
echo "reader: ${RW} (at the recorded head ${REC})"
[ "${RW}" = "${SHAREADER}" ] || { echo "STOP: the migration reader at the recorded head is not the pinned file. The journal read has not run"; exit 1; }
node --env-file=/Users/ivan/osteojp-secrets/new-prod.env ${READER} 2>&1 | tee /tmp/0097-journal-after.out
grep -qx 'journal rows on production: 95' /tmp/0097-journal-after.out || { echo "STOP: the journal read after the apply does not say 95"; exit 1; }
grep -qE '^[[:space:]]*APPLIED[[:space:]]+0097_clinical_records_write_matrix[.]sql$' /tmp/0097-journal-after.out || { echo "STOP: the journal read does not list 0097 as APPLIED"; exit 1; }
grep -qx 'pending on this ref: 0' /tmp/0097-journal-after.out || { echo "STOP: the journal read finds a migration pending on the recorded head"; exit 1; }
grep -qx 'journal rows with no matching file on this ref: 0' /tmp/0097-journal-after.out || { echo "STOP: the journal holds a row with no matching file on the recorded head"; exit 1; }
echo "CLOSING READ: the journal reads 95, 0097 is APPLIED, and nothing is pending on the recorded head."
)
```

**EXPECT:** the run window line with now before its end, the reader's sha256 line, then
the read printed IN FULL through `tee`: `journal rows on production: 95`, every migration
file on the recorded head listed `APPLIED`, 0097 last, `pending on this ref: 0`,
`journal rows with no matching file on this ref: 0`, and the last line, exactly,
`CLOSING READ: the journal reads 95, 0097 is APPLIED, and nothing is pending on the recorded head.`
After any halt at any stage it is not pasted: no journal read runs after a halt, and the block
stops on its own when a pass mark is missing.

## What every verdict must read

**Pre-check, 20 rows, all `OK`** (`scripts/db/precheck-0097-registo-writes.sql`):

- 0 the transaction is READ ONLY;
- 1 `clinical_records_insert` is `FOR INSERT`, PERMISSIVE, `TO authenticated`, WITH CHECK md5
  `a8e4b05ed583e82dbb0b136d5ff4a627` (0045's expression);
- 2 `clinical_records_update`, `FOR UPDATE`, USING and WITH CHECK the same md5;
- 3 `clinical_records_delete`, `FOR DELETE`, USING the same md5;
- 4 the two read policies (`clinical_records_select` as 0096 leaves it,
  `clinical_records_patient_selfscope` as 0010 does), one md5
  `ae6ad9a7c3ee236acebd22c1c952afe4`, five policies in all, none RESTRICTIVE;
- 5 the immutability trigger, the only one: `clinical_records_enforce_immutability type=27
  enabled=O cols=all when=none fn=enforce_clinical_record_immutability
  f0691f60a12af6eeb561ce369c18f0d5`;
- 6 `clinical_therapist_sees_patient`: `DEFINER/s/search_path=public/postgres/exec
  9d9e8a5a8ee79ce1c1fe04830d7c9186`;
- 7 row level security ENABLED on `clinical_records`;
- 8 0097 absent from the journal by hash; 9 0095 present by hash
  (`cfdfffff71a6c847a791ce17c71bbc6e05b75a367e9c8f03dfcb0cfc638f5806`);
- 10 the newest journal row is 0096's, by hash and `when`, with no tie at that `when`;
- `journal_rows_before` **94**; `policies_before` (the rehearsal read **100**);
  `other_policies_md5` (rehearsal `7693cc6b289ba2737ec5be5d866345fb`); `functions_md5`
  (rehearsal `34184e4d99739692a0a1e019fd7e5094`); `grants_md5` (rehearsal
  `019553539e5e8eaa76f8601fca2f93d3`); `draft_profile` (the rehearsal fixture read
  `ai pending 1, ai in review 1, other 0, author cannot write 1`, the last being a draft
  recorded in the admin's name, while the draft in the owner's name is not counted; the bare
  base `ai pending 0, ai in review 0, other 0, author cannot write 0`). Only the first is
  asserted as a number; the next four are carried, and production's values are whatever this
  sitting reads; the last is printed for Q3 and gated by verdict 13;
- 11 `public.jwt_tenant_id`, `public.jwt_role` and `auth.uid` exist;
- 12 no function in `public` is called `claim_ai_draft_authorship`;
- 13 **Q3**: `at risk 0 of <n> drafts; control c_gone=author cannot write, c_other=other,
  c_owner=author writes, c_pending=ai pending, c_review=ai in review, c_treats=author writes`.
  The real drafts in the three at-risk classes must number 0, and the six planted rows must
  read exactly those classes; a missing control subject (no active owner, or no active
  therapist with an appointment with a live patient) drops its planted row, and the verdict
  reads FAIL.

**Post-check, 15 rows, all `OK`** (`scripts/db/postcheck-0097-registo-writes.sql`):

1. `clinical_records_insert` WITH CHECK md5 `b29103acdd113bb10d23b45556707fb2`;
2. `clinical_records_update` USING md5 `1170825c999f154fc35dab5217ba9548` and WITH CHECK md5
   `b29103acdd113bb10d23b45556707fb2` (the INSERT's text: the author, for a patient they
   treat or created);
3. `clinical_records_delete` USING md5 `1170825c999f154fc35dab5217ba9548`;
4. the two read policies still `ae6ad9a7c3ee236acebd22c1c952afe4`, five policies, none
   RESTRICTIVE;
5. the immutability trigger still as pre-check arm 5;
6. `clinical_therapist_sees_patient` still as pre-check arm 6;
7. the policy count in the database equals `policies_before`;
8. every OTHER policy in the database still hashes to `other_policies_md5`;
9. every function in `public` but the new one still hashes to `functions_md5`;
10. every table, column and function grant in `public`, the new function's own ACL aside,
    still hashes to `grants_md5`;
11. the claim function exists ONCE: `claim_ai_draft_authorship(uuid)`, `boolean`, `plpgsql`,
    SECURITY DEFINER, VOLATILE, `search_path=public`, owner `postgres`, body md5
    `b8095495c969750b89e2988ce4cd669d`;
12. EXECUTE on it for `authenticated` and for none of `anon`, `service_role`, `patient` or
    PUBLIC (the positive control sits in the same row);
13. row level security still ENABLED on `clinical_records`;
14. 0097 is in the journal by hash, it is the newest row, and the journal moved by exactly
    one;
15. no policy in the database names the claim function.

With 9 and 11 together, the SECURITY DEFINER count in `public` moved by exactly one.

**Behaviour check, 20 arms** (`scripts/db/behaviour-registo-writes-readonly.sql`), as the
rehearsals read them with 0097 applied, on the synthetic fixture (shape `ai`); production's
observed counts differ, the verdicts must not. Before the apply only the first six run
(`-v subjects_only=on`), and read OK.

| Arm | What it proves | With 0097 |
|---|---|---|
| 0 | the transaction is READ ONLY and REPEATABLE READ | OK |
| S0 | P live, an unsigned registo of P by T1, the actors distinct | OK |
| S1 | T1: active therapist who treats or created P and authored the subject registo | OK |
| S2 | T2: active therapist with an appointment with P, not the subject registo's author | OK |
| S3 | T3: no appointment with P, did not create P, authored none of P's registos, not on P's care team | OK |
| I1 | each session is its actor; `clinical_therapist_sees_patient(P)` as each actor agrees with the tables; the write expressions were read | OK |
| U1 | UPDATE of the subject registo, old row: T1 admitted, T2 and T3 not | OK, 1 / 0 / 0 |
| U2 | UPDATE of the subject registo, new row unchanged: the same | OK, 1 / 0 / 0 |
| U3 | UPDATE handing the subject registo to T2, written by T1: refused | OK, 0 |
| U4 | UPDATE of the subject registo by T1 whose new row names a patient T1 neither treats nor created: refused | OK, 0 |
| D1 | DELETE of the subject registo: T1 admitted, T2 and T3 not | OK, 1 / 0 / 0 |
| N1 | INSERT in the actor's own name for P: T1 and T2 admitted, T3 not | OK, 1 / 1 / 0 |
| N2 | INSERT in a colleague's name for P: all refused | OK, 0 / 0 / 0 |
| N3 | INSERT in T3's own name for a patient T3 treats or created: admitted | OK |
| N4 | INSERT under a tenant id no tenant has: refused for every actor | OK |
| X1 | every actor's UPDATE admits exactly the registos it authored | OK, 2 / 1 / 1 same |
| X2 | the same for DELETE | OK |
| Z1 | the author's own subject registo under a tenant id no tenant has: UPDATE (both sides) and DELETE refuse it; control T1 on U1, U2, D1 | OK |
| A1 | an unclaimed AI draft of P: no actor's UPDATE admits it | OK, 0 / 0 / 0 |
| R1 | reads are unchanged: T1 and T2 read the subject registo, T3 does not | OK |
| SUMMARY | shape `ai` | **20 OK / 0 VACUOUS / 0 FAIL** |
| SUMMARY | shape `noai` (A1 VACUOUS) | **19 OK / 1 VACUOUS / 0 FAIL** |
| SUMMARY | subjects-only, before the apply, either shape | **6 OK / 0 VACUOUS / 0 FAIL** |

**How a READ ONLY file measures a write**: it cannot run one, so it reads from `pg_policy`
the expression Postgres applies to the command for `authenticated` and evaluates it with the
actor's claims set over the subject rows, over every registo of the tenant, and over
candidate new rows. Every zero a write arm asserts has a control in the same run that must
read 1 through the same machinery (T1 in U1, U2 and D1; T1 and T2 in N1; T3 in N3; U2's T1
for U3 and U4).

### What the behaviour check does not measure

- **The claim function in action, and every write itself.** A READ ONLY transaction cannot
  call it. The rehearsal's in-action arms do (IA15 to IA23 below), and so does the DB-gated
  suite `packages/db/tests/clinical-records-write-matrix.db.test.ts`. So do the writes U4
  reads from the catalogue (IA30 to IA32).
- **The owner arm**, which no actor here holds, and **admin and reception**, which hold no
  write arm: pre-check arms 1 to 3 and post-check verdicts 1 to 3 pin each whole expression by
  md5, owner arm included; the in-action arms IA19, IA25, IA26 and IA33 and the DB-gated
  suite exercise them.
- **A locked or signed registo**: the immutability trigger refuses those whatever the policies
  admit; pre-check 5 and post-check 5 pin the trigger, and IA14 shows it refusing the author.
- **Nothing about a second tenant is needed**: N4 (INSERT) and Z1 (UPDATE on both sides, and
  DELETE) test each tenant conjunct with a tenant id no tenant has, and post-check verdicts 1
  to 3 pin the conjuncts by md5.

### Which acceptance check this sitting discharges, and which it does not

| Acceptance check | Discharged by | Layer |
|---|---|---|
| The three write policies: UPDATE USING and DELETE author only, INSERT and UPDATE WITH CHECK author AND treats or created (Q4); owner arms and every other policy byte-identical; the count flat | pre-check 1 to 4; post-check 1 to 4, 7, 8; behaviour U1 to U4, D1, N1 to N4, X1, X2, Z1 | the catalogue, and RLS as real staff |
| The immutability trigger untouched | pre-check 5; post-check 5 | the catalogue |
| The narrow claim path for the AI review | post-check 11, 12, 15; behaviour A1; **in action by the rehearsal only** (IA15 to IA23) | the catalogue, and RLS |
| Q3: no draft left that its writer could not write | pre-check 13 with its planted control, and `draft_profile` | the tables, outside RLS |
| The app writers verified; the claim, the queue filter, the 0-row codes, the filing refusals and the record page's controls | **NOT DISCHARGED BY THIS DOCUMENT.** They ship in the app half, #1501, merged before the sitting (Q2 (b)); measured on the rehearsal below and by the app's unit tests | the route, and the test database |
| The behaviour check with T1, T2, T3, ACTOR, VACUOUS contract | this sitting, stages 1 and 3 | RLS |

**The md5 pins depend on how the session renders an expression.** The pre-check's and the
post-check's expression md5s compare `pg_get_expr(...)`, which prints `jwt_tenant_id()`
without its schema only when `public` is on the session's `search_path`. The expected values
were read on a rehearsal database built from main's 91 migrations and the held 0094 to 0098 of
2026-09-27, and read again, identical, on 2026-09-30 on one built from main's 93 migrations
and 0096 alone, the ruled order.
If production rendered differently, pre-check arms 1 to 4 would FAIL and stage 1 would halt
**before** the apply, which is the safe direction. No READ ONLY pre-check ran before the
issue (the owner's ruling of 2026-09-30), so stage 1's own pre-check is the evidence that
production renders the same way.


## Measured on production, READ ONLY

**NOT MEASURED BEFORE ISSUE, BY THE OWNER'S RULING OF 2026-09-30.** The owner ruled that 0096
to 0099 run that day, one after another. So the document was issued without this separate
READ ONLY run, on the fallback the paragraph after next names: **Q3's counts are first read by
stage 1's verdict 13, which STOPs before the pick, with nothing applied, unless they are 0.**
The pick's shape is first read by stage 1 too. The text below is the plan as written before
that ruling, kept for the record.

This lane had no production access, by its dispatch. Before the document
is issued, and never as part of a sitting, the pre-check and the pick of stage 1 are run READ
ONLY against production by GREEN, and this section records: the 20 verdicts, verdict 13 (Q3)
among them; the carries; the `draft_profile`; and whether the pick finds a P, with which
shape. No patient id is recorded here.

**No block and no dispatch for that run exist yet.** Both are SOLO's to write before issue: a
READ ONLY block that runs this document's pinned pre-check and its `PICK` against production
and prints only what this section records, and a GREEN dispatch that names it. The dispatch
for the sitting lists them among the steps before it is issued. Until that run, Q3's counts
are first read by stage 1's verdict 13, which STOPs before the pick, with nothing applied,
unless they are 0.

## Issued 2026-09-30, after 0096 was applied and merged: the promotion and the PR number

0096 was applied by GREEN on 2026-09-30 at 16:08 Lisbon: journal 93 to 94, post-check 16/16 OK,
behaviour check 26 OK / 6 VACUOUS / 0 FAIL. Then the owner merged #1500, the count 26 to 27,
and main was merged into #1471. #1471 merged as `774ddd2f`.

**The promotion, on this branch (#1475), after main was merged in:**
- `git mv` from `migrations-pending/NEXT-AFTER-0096_clinical_records_write_matrix.sql` to
  `migrations/0097_clinical_records_write_matrix.sql`, bytes unchanged. The sha256 is
  `076481bf...c318` before and after.
- Journal: idx 94, when 1788501800000, tag `0097_clinical_records_write_matrix`, strictly
  after 0096's 1788501700000.
- The supabase mirror, by `sync-supabase-migrations`. check-journal reads 95 of 95.
- The pending README's row moved to Promoted.
- `packages/db/tests/security-definer-owner.test.ts` derives its set from the migrations, so
  it now finds 28 definers against the frozen 27. It reads red until 0097's count GATE-CHANGE
  (27 to 28) lands after the apply. That is one red run, expected, as 0096's was.

**The issue:** `PR=1475` is filled in stages 0 to 3, the four lines that held
`NOT-YET-ISSUED`. No other byte of any block changed. The five fenced blocks were cut from
`c3006189` and from this revision by one script and compared: only those four lines differ.
"Measured on production, READ ONLY" records the owner's ruling instead of a measurement.

### The whole blocks on the promoted head, rehearsed 2026-09-30 17:29 to 17:40 Lisbon

This is the run "The rehearsal adaptation" (below) says is owed at promotion. A rehearsal
agent ran every block WHOLE, in order, extracted verbatim from `6a7068c4`: the dispatch's
BEFORE YOU START, stage 0, the dispatch's CLOCK CHECK, stages 1 to 3 and the closing read.

**The throwaway:**
- A local Supabase stack (CLI 2.100.0, project `r0097wb`) at production's position: main's
  94 migrations, 0000 to 0096, without 0097's mirror.
- A drizzle journal of 94 rows. The newest is 0096 by hash `fbf8cad1...`, when
  1788501700000.
- The synthetic fixture `fd217b2c...`, cut to shape `ai` by the documented reduction. As
  loaded, its pre-check read verdict 13 FAIL (`at risk 2 of 8`), exactly as this document
  records, and the reduction took it to `at risk 0 of 6`.

**The substitutions**, and nothing else (the agent diffed each block against its verbatim
cut):
- the apply worktree's `cd`, to a fresh clone;
- every `/tmp/0097-` path, to scratch;
- the production env load, to the throwaway's URL;
- the target guard, to an assertion of the throwaway's host and port. The real guard, run
  once first, refused: `REFUSING: project ref is "postgres", not the production project.`

| block | exit | last line |
|---|---|---|
| BEFORE YOU START | 0 | `BEFORE YOU START: every check passed, and the journal reads 94.` |
| STAGE 0 | 0 | `PROMOTION AND NUMBER VERIFIED` |
| CLOCK CHECK | 0 | `CLOCK: inside the run window, ... Paste stage 1 now.` |
| STAGE 1 | 0 | `0097 APPLIED. Paste stage 2 now.` The pre-check read 20 OK, verdict 13 `at risk 0 of 6`, and the subjects `6 OK / 0 VACUOUS / 0 FAIL`. verified-migrate reached drizzle-kit through pnpm: `pending 1 [0097_clinical_records_write_matrix]`, `journal 94 -> 95 (delta 1)`, present by sha256 |
| STAGE 2 | 0 | `0097 POST-CHECK PASSED. 20/20 pre-check OK, 15/15 post-check OK, journal 94 to 95.` |
| STAGE 3 | 0 | `0097 BEHAVES AS RULED AT THE RLS LAYER. subjects before 6 OK / 0 VACUOUS / 0 FAIL, every arm after 20 OK / 0 VACUOUS / 0 FAIL.` |
| CLOSING READ | 0 | `CLOSING READ: the journal reads 95, 0097 is APPLIED, and nothing is pending on the recorded head.` |

It ran at 17:29 Lisbon on 2026-09-30, inside the clinics' hours. So **the override arms ran
against a real database read for the first time**: both clock checks printed
`OVERRIDE: Lisbon 1729 ...` and `1730 ...`, and the clinic check read `2 of 2` and printed
its `OVERRIDE:` line.

**One part did NOT run by an approved method, and does not count as rehearsed.** The journal
reader, `read-applied-migrations.mjs`, refuses any target whose URL does not contain the
production ref. It did so here, as designed:
`REFUSED: this script reads drizzle.__drizzle_migrations, which only production uses.`
Without authorisation, the agent then passed that guard by putting the ref into the
throwaway URL as an `application_name` label. **SOLO did not authorise that, does not accept
it as evidence, and deleted the env file.** So the journal-read half of BEFORE YOU START and
of the closing read is unrehearsed here. The checks before each read did run. The reader
itself is the pinned program (`867e2823...`) that ran 0096's BEFORE YOU START and closing
read on production on 2026-09-30.

The spoof shows the guard is a substring test (`url.includes(PROD_REF)`), a weakness to
harden separately. That changes a pinned file, so it is not done here.

### Changed after the first review of the issue, 2026-09-30: prose only, no block

A fresh R4 workflow reviewed `6a7068c4`: two lenses, then an adversarial check of every
MAJOR. The block logic passed:
- 2240 runs over the clock and clinic arms;
- the clinic arms are byte-identical to main's 0096;
- only the four `PR` lines changed at issue.

It found two MAJOR, both confirmed by the adversarial check, and several MINOR, all prose.
All are fixed here:
- the status header and the migration row said NOT PROMOTED and NOT YET ISSUED, and named
  the deleted pending path;
- "Before the sitting" item 6 still required the READ ONLY run the ruling skipped;
- item 7 and "The order of the blocks" said the document carries no date;
- the every-day STOP sentence was wrong for `0 of n`;
- the changelog's "this revision";
- the passages that still planned the READ ONLY run;
- two citations of the pending path.

Every fenced block is byte-identical to `6a7068c4`'s.

## Changed after the owner's override, 2026-09-30: the clock and clinic checks, two blocks

The owner ruled at 13:13 Lisbon that 0096 to 0099 run that day "despite the current clinic
schedule, we are doing it now". GREEN, reading 0096's document, stopped before BEFORE YOU START because its clinic check
would STOP; nothing had run against production. The owner then ruled "amend". The same ruling reaches this document's two clinic-hours checks.

**What changed.** The five fenced blocks were cut from `7af3b808` and from `daf161b4` by one
script. Stages 2 and 3 and the closing read compare equal. (At the issue, the `PR` line of
stages 0 to 3 changed too; see "Issued".) Stages 0 and 1 differ only here:
- **The Lisbon clock** (stages 0 and 1, the same eight lines in both):
  - The single awk STOP line became an `if` with three arms. Outside 08:00 to 21:00 it prints
    `Lisbon <HHMM>: outside 08:00 to 21:00` on every day. Inside those hours on `20260930`
    only, it prints the `OVERRIDE:` line. Anything else STOPs.
  - The HHMM format check before it is unchanged.
- **The clinics' own rows** (stage 1): the header line names the override, and the awk STOP
  line became the same three arms as 0096's, byte-identical to 0096's at `aa33a458`:
  - `0 of <n>`, n a positive integer: continue on every day.
  - On `20260930` only, `<k> of <n>`, k and n positive integers written without a sign or
    leading zero, and k at most n: the `OVERRIDE:` line, then continue.
  - Anything else: STOP.
- The `0 of <n>` arm is tighter than before. `0 of 2x` and `0 of 0x1` used to pass and now
  STOP. It loosens nothing.

**How the new arms were proved.** No throwaway-DB rehearsal ran an override arm: every
rehearsal ran outside 08:00 to 21:00 with the fixture's clinics closed. The arms read only
`LT` and `CL`, which come from reads that did not change, and the machine date. The lines
were cut from this document by one script and run under `zsh -f` inside
`( set -eo pipefail ... )`, with only the `TODAYL=` line replaced by a fixed date:

| input | 20260930 | 20261001, 20260929 |
|---|---|---|
| `LT` 0000, 0759, 2100, 2359 | outside, exit 0 | outside, exit 0 |
| `LT` 0800, 1540, 2059 | OVERRIDE, exit 0 | STOP, exit 1 |
| `CL` `0 of 2` | closed, exit 0 | closed, exit 0 |
| `CL` `1 of 2`, `2 of 2` | OVERRIDE, exit 0 | STOP, exit 1 |
| `CL` `3 of 2`, `0 of 0`, empty, `x of 2`, `1 of`, `-1 of 2`, `1.5 of 2`, `00 of 2`, `01 of 2`, `+1 of 2`, `1e0 of 2`, `1 of 2x`, `0 of 2x`, `0 of 0x1` | STOP, exit 1 | STOP, exit 1 |

Stages 0 and 1 each pass `zsh -n`.

0096's second reviewer found two MINOR limits in these same clinic arms. They are known and
not fixed, because neither input can come from the read that feeds the arms. First, awk
compares k and n as floating-point numbers, so a k above n passes once both are above 2^53.
Second, `awk -v` turns backslash escapes into characters and `split` splits on any
whitespace, so a padded, tab-separated or escape-written `1 of 2` passes. `CL` is `psql -At`
output of `count || ' of ' || count`: one line, single spaces, a count of `locations` rows.

**Prose changed:**
- "Before the sitting", item 7.
- "The clock", and the paragraph after it, THE OWNER'S OVERRIDE OF 2026-09-30.
- The closing sentence of "What stays open between the apply and the merge".
- Stage 0's EXPECT, and stage 1's EXPECT items for the clock and clinics lines.
- This section.

## Rehearsed on 2026-09-30, the fifth run, in the ruled order, synthetic data only

**Why a fifth run.** The four runs of 2026-09-27 (the next section) applied this migration on
a base that already held the grants revoke and the staging index. The ruled order now applies
it right after 0096, before both. This run rebuilt the base in that order, re-read every
pinned value, ran the blocks' own lines against it, and re-ran the DB-gated suites; it also
swept the new Q3 verdict.

**Where it ran.** A throwaway container, `c97-reh`, image `supabase/postgres:17.6.1.165`, on
`127.0.0.1:55532`, started for this run and never pointed at anything else. In it `postgres`
is not a superuser and holds BYPASSRLS, as on production. The auth schema was loaded from the
dump the 2026-09-27 rehearsals took of their base (`auth-from-b13a_base.sql`, in the scratch
directory). `c97_base`: `origin/main` at `453cf2c4`, its 93 migrations (0000 to 0095) in
journal order, each with its journal row (hash the file's sha256, `created_at` its `when`):
93 rows, **26** SECURITY DEFINER functions in `public`. `c97_pre`: plus 0096, CARE-02a's
pending file from #1471's head `6fb88730` (sha256 `fbf8cad1...`, the file the 2026-09-27
runs applied as 0098) at `when 1788501700000`: 94 rows, **27**. #1471's head has since moved
to `1d9ae1ab`, which promotes the same bytes as `0096_care02a_care_team_reads.sql` at `idx 93`
and that same `when`, so the 0096 this base holds is still the 0096 that 0097 follows. `c97_fix`: plus the C14
synthetic fixture (sha256 `fd217b2c35231df19f17604112888e9479d0637f764d48dee184cf389ff70a65`,
unchanged; described in the next section), 9 registos.

**The rehearsal adaptation, stated because it is a difference.** Each file was applied with
`psql -1 -f` and its journal row written in the same transaction, the way drizzle does it.
**`verified-migrate.mjs`, `drizzle-kit migrate` and stage 0 as a whole block did not run:**
they need a promoted branch. Stage 0's journal line and its app-half line were run on their
own, from this document's text, below. That run, on a throwaway at production's position, is
owed at promotion, before the document is issued. **It ran on 2026-09-30 after the
promotion: see "The whole blocks on the promoted head, rehearsed".**

**The main run, `c97_main`** (a copy of `c97_fix`, every exit 0):

| Step | Result |
|---|---|
| pre-check (`prev_hash` 0096's sha256, `prev_when` 1788501700000) | 19 OK and verdict 13 FAIL, as the fixture is built to read: `at risk 2 of 8 drafts` (the AI draft already in review, and the draft in the admin's name), the control exact. Carries `journal_rows_before` 94, `policies_before` 100, `other_policies_md5` `7693cc6b289ba2737ec5be5d866345fb`, `functions_md5` `34184e4d99739692a0a1e019fd7e5094`, `grants_md5` `019553539e5e8eaa76f8601fca2f93d3` (all three identical to the 2026-09-27 base: neither the grants revoke nor the staging index moved them on a throwaway with no Supabase default privileges), `draft_profile` `ai pending 1, ai in review 1, other 0, author cannot write 1`. Verdicts 1 to 6 read the same md5s as on 2026-09-27 |
| behaviour BEFORE, subjects-only | `6 OK / 0 VACUOUS / 0 FAIL`; three ACTOR lines |
| apply | 0097 and its journal row in one transaction (`when` 1788501800000); SECURITY DEFINER in `public` **28** |
| post-check | 15 OK, 0 FAIL, read before any session ran as `authenticated` |
| behaviour AFTER | `20 OK / 0 VACUOUS / 0 FAIL`, three ACTOR lines |
| in-action AFTER | 35 OK / 0 FAIL (the arms of the next section, same script) |
| pre-check again, on the applied database | FAIL on 1, 2, 3, 8, 10, `journal_rows_before`, 12 and 13 |

**The blocks' own lines, run from this document's text.** A script (`blocks.py`, in the
scratch directory) cut the database half of each stage out of this file, not retyped: from
stage 1, the run-window section and everything from the clinic-hours read to the line before
the apply; from stage 2, the pass-mark and applied-marker lines and everything from its run
window to the end; from stage 3, the same; from the closing read, everything up to the read
itself. Substitutions, counted: `/tmp/` to a scratch directory, and the env and target-guard
lines dropped; the script refused a segment that still named the secrets directory, the guard,
`verified-migrate`, the apply worktree, `git fetch` or `git checkout`. A synthetic head record
(this worktree's HEAD) and a window record shaped as the CLOCK CHECK writes it (opens 10
minutes before now, stage 1 by 60 after, ends 120 after) stood in for stage 0 and the
dispatch. Between stages 1 and 2, `psql -1` applied 0097 and its journal row and the marker
was touched, standing in for `verified-migrate.mjs`. Every database was a fresh copy of
`c97_fix`, run under `zsh -f`.

| Arm | Exit (1, 2, 3, closing) | What it printed |
|---|---|---|
| shape `ai` (the in-review AI draft and the admin-named draft removed; **the owner's draft kept**) | 0, 0, 0, 0 | `active clinics open now by their own hours: 0 of 2`; `draft profile (Q3): ai pending 1, ai in review 0, other 0, author cannot write 0`; the pick named T1, T2 and **T3, not the lower-id T4 on P's care team**, shape `ai`; `6 OK / 0 VACUOUS / 0 FAIL`; `0097 POST-CHECK PASSED. 20/20 pre-check OK, 15/15 post-check OK, journal 94 to 95. Paste stage 3 now.`; `subjects before 6 OK / 0 VACUOUS / 0 FAIL, every arm after 20 OK / 0 VACUOUS / 0 FAIL`; the closing read's checks passed to the reader's pin |
| shape `noai` (both AI drafts and the admin-named draft removed) | 0, 0, 0, 0 | shape `noai`; `6 OK / 0 VACUOUS / 0 FAIL` before; the same POST-CHECK line; `every arm after 19 OK / 1 VACUOUS / 0 FAIL` |
| the fixture as it stands | 1 | `STOP: Q3, the at-risk draft count, did not read 0 with its control holding [ai pending 1, ai in review 1, other 0, author cannot write 1]. ... Nothing was applied`; journal 94 |
| only the admin-named draft in the way | 1 | the same STOP, `[ai pending 1, ai in review 0, other 0, author cannot write 1]` |
| shape `ai` with the owner deactivated | 1 | the same STOP, `author cannot write 1`: a draft in an inactive owner's name counts (and verdict 13's owner control has no subject) |
| no T3 (T3's patient and draft removed; T4, on P's care team, remains) | 1 | `STOP: a MISSING SUBJECT. No live patient furnishes T1, T2 and T3 by the rule in PICK.` |
| stage 1 on a database already applied (shape `ai`) | 1 | Q3 OK, then `STOP: a pre-check verdict read FAIL`, on 1, 2, 3, 8, 10, `journal_rows_before` and 12; only `0097-precheck.new` written |
| stage 2's pass mark removed before stage 3 | 0, 0, 1, 1 | `STOP: stage 2 left no pass mark. Do not run the behaviour check`; the closing read `STOP: stage 2 left no pass mark. The journal read has not run` |
| the window record in the past | 1 | `STOP: Lisbon <now> is outside the minutes stage 1 may start in. Nothing was applied` |
| the window record for another head | 1 | `STOP: the run window was recorded for another head. Nothing was applied` |
| the window ending at the minute stage 2 starts | 0, 1, 1, 1 | stage 2 `STOP: Lisbon <now> is at or past <now>, the end of the run window. The write stands; ...`; stage 3 and the closing read stop on the missing pass mark |

**The patient id reached no transcript**: 0 matches in every stage's output on every arm.

**Stage 0's two new lines, run alone from this document's text.** The journal line on four
synthetic journals: main's 93 plus 0096 at `idx 93` and 0097 at `idx 94` (exit 0, `journal: 95
entries, then idx 93 0096_... when 1788501700000, then idx 94 0097_clinical_records_write_matrix
when 1788501800000`); main's plus 0096 only; 0097 with 0096's `when`; the wrong tags (each exit
1 with the STOP line). The app-half line: exit 0 in the app half's worktree (#1501's head
`47ee3d25`), exit 1 with its STOP line on this branch as it stands, where `review.ts` is main's.

**Q3's control, on the database.** The pre-check run as a login role with SELECT on every
table and NO BYPASSRLS: `ERROR: query would be affected by row-level security policy for
table "users"`, psql exit 3, no verdict printed. The same role on a copy of the pre-check with
the `row_security` line removed (never committed) reads the quiet zero this guards against,
`draft_profile` `ai pending 0, ai in review 0, other 0, author cannot write 0`, and verdict 13
still reads FAIL: its two planted rows that need the tables (`c_owner`, `c_treats`) have no
subject under row level security, so the control does not match.

**The Q3 sweep: 9 mutations of verdict 13 and its classification, each read on seven
databases** (copies of `c97_fix`: shape `ai`; only the in-review AI draft in the way; only the
admin-named draft; an unauthored non-AI draft; no active owner and no owner's draft; the owner
deactivated; the owner deactivated with a second, active owner), and on the shape `ai` copy as
the no-BYPASSRLS role. The real file reads OK only on shape `ai` and ERROR as that role. Each
mutation, and the database where its verdict differs from the real file's:

| id | mutation | killed on |
|---|---|---|
| Q1 | an AI draft in review is not at risk | only the in-review draft (OK) |
| Q2 | an unauthored non-AI draft is not at risk | the unauthored draft (OK) |
| Q3 | "author cannot write" is not at risk | only the admin-named draft (OK) |
| Q4 | the owner exclusion removed | shape `ai` (FAIL: the owner's draft counts) |
| Q5 | the owner need not be active | the second-owner copy (OK: the inactive owner's draft spared) |
| Q6 | the control not compared | no active owner (OK) |
| Q7 | `row_security` left on | the no-BYPASSRLS role (FAIL instead of ERROR) |
| Q8 | the treating-therapist row not planted | shape `ai` (FAIL) |
| Q9 | an AI draft pending review counted at risk | shape `ai` (FAIL) |

**9 killed, none survived.** `scripts/registo-writes-0097.test.mjs` pins the same rules
statically, each with a planted control.

**The DB-gated suites** (serial, 30 s test and 60 s hook timeouts), on two copies of `c97_pre`
given the `service_role` grant Supabase's default privileges give, identically, one with 0097:
the ten `packages/db` suites that touch `clinical_records` (named in the next section), **169
of 169 with 0097** (the write-matrix suite 21 of 21, titled `[0097 APPLIED]`), **159 passed
and 10 skipped without it** (the write-matrix suite 11 and 10 skipped, titled `[0097 NOT
APPLIED on this database (flips when 0097 is applied)]`), none failed on either side;
`review-finalize-rls.test.ts` 11 of 11 on both. **The app half on a database without 0097:**
every `apps/web` `.db.test.ts`, run from #1501's worktree on a copy of `c97_base` with
`supabase/seed.sql` (the shape CI's DB-gated job builds, 0096 absent as on main today): 40
files, **411 passed, 0 failed, 0 skipped**.

**Not re-run, and why.** The 35-mutation sweep of the migration and the 20-mutation sweep of
the app half, both of 2026-09-27: no statement they exercise changed (the migration is byte for
byte the same file, and the app half moved without a code change). The in-action arms before
the apply: their expectations publish the pre-apply profile and stay in the owner's private
notes.

**The databases.** Kept, on `c97-reh`: `c97_base`, `c97_pre`, `c97_fix`, `c97_main`,
`c97_s97`, `c97_sno97`, `c97_ci`, the `c97_blk*` and `c97_q_*` copies, and the role
`c97_reader`. The container is the rehearsal's own and holds nothing else.

## The rehearsals of 2026-09-27 (C14), in that day's order, synthetic data only

**These four runs predate the fifth renumbering, and their numbers are that day's.** In
this section `0099` is this migration (now 0097), `0098` is CARE-02a (now 0096), `0097` is
the staging index (now 0098) and `0096` is the grants revoke (now 0099); the base carried
0094 to 0098 of that day, so the grants revoke and the staging index were applied BEFORE this
migration, where the ruled order now puts them after it. File names, block variables and
`/tmp/0099-*` paths below are the names the files had then. The fifth run, above, repeated the
main run, the blocks and the DB-gated suites in the ruled order; the mutation sweeps and the
app-half sweep were not repeated, because no statement they exercise changed.

**A fourth run, after the third fresh-context review, on fresh `c14_r4` copies built the same
way** (`b13a_base`, then 0097 and 0098 from their worktrees at the sha256 values below, then
the same fixture, sha256 `fd217b2c...`). What changed: the migration's comments only (section
3 names the consultation actions, and W1's comment), so its sha256 moved to `076481bf...` and
the pre-check's and post-check's pins moved with it; its statements are byte-identical to the
third run's, compared with every comment removed. What ran: the main run on `c14_r4main`
(pre-check 19 OK / 0 FAIL, with the carries and the `draft_profile` of the table below;
behaviour before, subjects-only, `6 OK / 0 VACUOUS / 0 FAIL`; apply; post-check 15 OK / 0
FAIL; behaviour after `20 OK / 0 VACUOUS / 0 FAIL`, one ACTOR line per actor; in-action 35 OK
/ 0 FAIL); the pre-check again on that applied database, which reads FAIL on 1, 2, 3, 8 (0099
present, by the new hash), 10, `journal_rows_before` and 12; the blocks' own lines, shape
`ai` (exit 0, 0, 0 and the lines printed in the table at the end of this section) and the
fixture as it stands (stage 1 STOPs, nothing applied); and the ten `packages/db` suites that
touch `clinical_records`, named in the suites table below, on `c14_r4s99g` and
`c14_r4sno99g`: with 0099 169 of 169 (the write-matrix suite 21 of 21), without it 159
passed and 10 skipped (0099's arms), none failed on either side. The mutation sweep and the
`apps/web` suites were not re-run: no statement they exercise changed. The e2e seed change
(`AI_DELETE_DRAFT`'s author, "The 0-row codes") runs in the e2e suite, not here. The rest of
this section is the third run; the fourth reproduced every figure it re-ran.

**This section is the third rehearsal of the day, run after a second fresh-context review.**
It replaces the second one's numbers throughout. What changed since: the branch took main at
`e0e75cfe` (after #1464, which made the registo writers read back their UPDATEs), and the app
half now names a refusal by a therapist who is not the author `not_author` instead of main's
lost-race codes; the patient-submission claim asks the patient test; the record page offers
only the writes that would succeed; the pre-check's `author cannot write` no longer counts a
draft in an active owner's name; the migration's header and section 3 were rewritten against
that main (its sha256 moved; its statements did not change by one byte). Every database below
is a fresh `c14_r3` copy; no earlier `c14_` database was reused.

**Where it ran.** A throwaway Postgres on `127.0.0.1:55522`. `b13a_base` is `origin/main`'s 91
migrations at `e674100b` plus the pending 0094, 0095 and 0096: 94 journal rows, used as a
template only and never modified (it still reads 94). `origin/main` has since moved; the
commits in between change no migration. 0097 (sha256
`198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0`) and 0098 (sha256
`fbf8cad1dc959a600b0e8b3ccffb7225e2295919e5dfe08432301faf6b5e9c45`), each copied from its
worktree on the day (both unchanged since the first rehearsal), were applied with their journal
rows (`when` 1788501800000 and 1788501900000) to make `c14_r3pre99`, 96 rows, the template
every 0099 copy started from. No `c14_` database was made from `b13a2_final`.

**The rehearsal adaptation, stated because it is a difference.** Each file was applied with
`psql -1 -f` and its journal row written in the same transaction, the way drizzle does it (hash
the sha256 of the file, `created_at` the `when`). **`verified-migrate.mjs` and `drizzle-kit
migrate` did not run, and neither did stages 0 to 3 as whole blocks:** they need a promoted
branch. That run, on a throwaway at production's position, is owed at promotion, before the
document is issued. What was run from this document's own text is below, under "The blocks'
own lines".

**The fixture, all synthetic** (`c14-fixture.sql`, sha256
`fd217b2c35231df19f17604112888e9479d0637f764d48dee184cf389ff70a65`, in the rehearsal's scratch
directory and not in the repository). Tenant A with one clinic: owner, admin, reception, and
therapists T1, T2, T3 and a fourth, T4, with a lower id than T3. P, registered by reception: T1
and T2 each have an appointment; T4 is on P's care team and has none; T1's unsigned draft (the
subject registo) and T1's signed registo; T2's draft; an unclaimed AI draft (no author, pending
review); an AI draft already in review with no author; a draft recorded in the ADMIN's name;
**a draft recorded in the OWNER's name (new in this round)**; a pending patient form
submission. Q, registered by T3, with T3's draft; Q4, registered by T4. Tenant B: a therapist,
a patient and a draft.

**The main run, `c14_r3main`** (every exit 0):

| Step | Result |
|---|---|
| pre-check (`prev_hash` 0098's sha256, `prev_when` 1788501900000) | 19 OK, 0 FAIL. Carries `journal_rows_before` 96, `policies_before` 100, `other_policies_md5` `7693cc6b289ba2737ec5be5d866345fb`, `functions_md5` `34184e4d99739692a0a1e019fd7e5094`, `grants_md5` `019553539e5e8eaa76f8601fca2f93d3`, `draft_profile` `ai pending 1, ai in review 1, other 0, author cannot write 1`: the admin's draft, and not the owner's. **The second round's pre-check on the same database reads `author cannot write 2`**: it counted the owner's draft, which its author still writes |
| behaviour BEFORE, subjects-only | `6 OK / 0 VACUOUS / 0 FAIL`; three ACTOR lines |
| apply #1 | 0099 and its journal row in one transaction (`when` 1788502000000) |
| post-check | 15 OK, 0 FAIL, **read before any session ran as `authenticated`** |
| behaviour AFTER | `20 OK / 0 VACUOUS / 0 FAIL` |
| in-action AFTER | 35 OK / 0 FAIL |
| apply #2, on a fresh copy (`c14_r3idem`) | **changes nothing.** Before and after: policies md5 `bb02bc8ec864d735e8d5202be66b2c3f` over 100, public functions md5 `c9daf8b3ddf8577172f69b63d8cd84dd` over 289 (ACLs and comments included), journal 97. The post-check still reads 15 OK, the behaviour check 20/0/0, the in-action arms 35/0 |

The in-action arms ran before the apply too, against their own expectations for that side,
and met all 35.

**The other shapes, measured:** with no unclaimed AI draft of P, `19 OK / 1 VACUOUS / 0 FAIL`
after (A1 VACUOUS); with no AI draft and no patient T3 treats or created,
`18 OK / 2 VACUOUS / 0 FAIL` after (A1 and N3 VACUOUS; measured in the second round, on the
same behaviour file and fixture shape). The subjects-only run reads
`6 OK / 0 VACUOUS / 0 FAIL` before the apply in every shape. The last shape is not one the
blocks accept: the pick requires a T3 with a patient of their own. **The negative arm of the
subjects:** T4, on P's care team, passed as T3 reads S3 FAIL (`care team true`): the
subjects-only run then reads one FAIL, S3, so stage 1 would halt before the apply, and with
every arm each arm after I1 reads FAIL too, as the verdict contract requires (second round,
same file).

**The writes in action, which no READ ONLY check can show** (`gen_inaction.py` and
`run_inaction.sh`, in the scratch directory, not committed: the repository has no
`scripts/db/rehearsal-only` convention). Each arm is a DO block run as `authenticated` with a
staff claim, inside a transaction that is rolled back; each INSERT is a plain INSERT, so the
insert policy alone decides. With 0099 applied:

| Arm | With 0099 |
|---|---|
| IA1 T1 updates its own draft; IA5 T1 deletes it; IA7 T1 signs it | 1, 1, 1 |
| IA2 T2 updates T1's draft; IA3 T2 deletes it; IA6 T2 signs it | **0, 0, 0** |
| IA4 T3 updates T1's draft | 0 |
| IA8 T1 hands its draft to T2 (`practitioner_id` changed by UPDATE) | **refused 42501** |
| IA9 T3 files in its own name for P; IA10 T1 files in T2's name for P | **refused 42501 each** |
| IA11 T2 files in its own name for P; IA12 T3 for Q, which it registered | 1, 1 |
| IA13 T2 files a new version of T1's SIGNED registo, in its own name | 1 |
| IA14 T1 updates its own SIGNED registo | refused 23514 (the trigger) |
| IA15 the app's AI claim as T2: the function, the claim UPDATE, an edit, the single-statement finalize | **function true**, 1, 1, 1, **author T2** |
| IA16 T2's claim UPDATE of the AI draft without the function | **0** |
| IA17 T3 (does not treat P) calls the function, then claims | false, 0 |
| IA18 T2 calls the function, T2 again, then T1 calls it and updates | true, false, false, **0** |
| IA19 the owner calls the function, then claims | false, 1 |
| IA20 an AI draft already in review; IA21 a non-AI draft; IA22 an admin; IA23 T2 under another tenant's claims; IA29 the receptionist who registered P: each calls the function | **false each** |
| IA24 the patient-form claim as T2: file in its own name, link the submission, sign | 1, 1, 1 |
| IA25 the owner updates and deletes T1's draft | 1, 1 |
| IA26 an admin updates T1's draft; reception files for P | 0, refused 42501 |
| IA27 T1 updates tenant B's draft | 0 |
| IA28 the admin updates and deletes the draft recorded in the admin's own name | 0, 0 |
| IA30 T3 files in its own name for Q (admitted), then an UPDATE of that draft names P, which T3 neither treats nor created | 1, **refused 42501** |
| IA31 T1's appointment with P removed (inside the rolled-back transaction): T1 saves its own draft, the owner saves it, T1 deletes it | **refused 42501**, 1, 1 (Q4's cost) |
| IA32 an UPDATE of T1's own draft that names Q, which T1 neither treats nor created | **refused 42501** |
| IA33 the owner updates the draft in its own name; IA34 T2, who treats P, updates it; IA35 T2 deletes it | 1, **0, 0** |

**The instrument discriminates in both directions:** the expectations for each side, run on the
other side's database, fail, on the same arms each way.

**The DB-gated suites** (serial, 30 s test and 60 s hook timeouts, on copies of `c14_r3pre99`
with and without 0099, run from this branch with main at `e5f1e88d` merged). **The rehearsal
base cannot run every suite as CI does**: it has no Supabase default privileges, so
`service_role` holds no table grant, and a suite that seeds as `service_role` (among them
`clinical-record-hard-delete-fk.test.ts` and `record-annulments.test.ts`, which touch
`clinical_records`) fails at setup with "permission denied for table tenants" on BOTH sides. So
both copies were given `GRANT ALL ON ALL TABLES` and `ON ALL SEQUENCES IN SCHEMA public TO
service_role`, identically, the grant Supabase's default privileges give it. On those copies
(`c14_r3s99g`, `c14_r3sno99g`):

| Suite | Without 0099 | With 0099 |
|---|---|---|
| `packages/db`, the whole suite | 1368 passed, 6 failed, 10 skipped | 1378 passed, 6 failed |
| of which `clinical-records-write-matrix.db.test.ts` | 11 passed and 10 skipped (0099's arms), titled `0099 NOT APPLIED on this database` | 21 of 21, titled `0099 APPLIED` |
| of which `review-finalize-rls.test.ts` (claims through the function where it exists) | 11 of 11 | 11 of 11 |
| of which `clinical-records-location-rls`, `clinical-record-hard-delete-fk`, `record-annulments`, `patient-rls-selfscope`, `ai-ingestion-rls-isolation`, `import-core-wiring`, `migration-upsert-idempotency`, `fisiozero-adapter` | green | green |
| `apps/web`, every `.db.test.ts` | 335 passed, 2 failed, 13 skipped | 336 passed, 1 failed, 13 skipped |

**The failures are the base's or the machine's, and none touches `clinical_records` writes:**
in `packages/db`, the same six on both sides, in `adversarial-rls-escape` and
`cross-tenant-rls-isolation` (two roles arms that 0094, on the base, changes),
`care-team-appointment-visibility` (the CARE-01 arm that 0098 flips; its update is on 0098's
branch) and `storage-bucket-scope` (no storage schema here); in `apps/web`, the CARE-02b arm
0098 flips, and two files that need the seeded demo tenant and fail at setup on both sides.
The second failure without 0099 is `confirm-redeem.db.test.ts`'s timing arm ("the three
refusals take the SAME TIME, within an order of magnitude"), read while the block runs below
loaded the same server; run alone on the same copy it passed 12 of 12. **The negative arm of
the suites:** `origin/main`'s own `review-finalize-rls.test.ts`, run on a database with 0099,
fails its four AI arms ("expected +0 to be 1"): that is the break the claim function exists
for, measured in the first two rounds; the file is unchanged on main since.

**The app half's unit tests** (no database): `apps/web/lib/clinical/records.write-guards.test.ts`,
`review.write-guards.test.ts` and `apps/web/app/clinical/[id]/page-write-controls.test.tsx`,
44 tests, with main's `sign-guard.test.ts` and `page-record-view.test.tsx` beside them.
**The app-half sweep, 20 mutations, each applied alone and the six files run:** each 0-row
code collapsed to main's (updateRecordData, signAndLockRecord, hardDeleteClinicalRecord,
editReviewNarrative, saveReviewFicha, and finalizeReview on each branch: 7), the classifier's
role test or author test dropped (2), each filing refusal deleted (createDraftRecord,
createAddendum, the patient-submission claim) and the refusal inside the helper (4), the
queue's author predicate deleted or narrowed to "no author" (2), and on the record page the
authorship test or the patient test dropped from Save and Sign, the patient test dropped from
New version, Sign offered without authorship, and the attachments made to follow the write gate
(5). **20 killed, none survived.**

**The mutation sweep: 35 mutations**, every predicate and clause 0099 writes, each on a fresh
copy of `c14_r3fix` with the mutated file applied under the real 0099 hash (so the post-check
judges the catalogue), then in order: post-check, crash guard, behaviour (every arm), in-action,
and the two clinical suites. The unmodified file ran first (M00) and last (M00b), both fully
green. "Crash guard" means the mutation was never run as `authenticated`, because the function
was left INVOKER or without EXECUTE for `authenticated`, and a live call to such a function
crashes this server; only the post-check ran. The suite column counts failed tests; "file"
means the write-matrix suite refused the database as half applied. **Four of the 35 (I03, U01, C01
and D01) are not itemised here; all four were KILLED.** The other 31:

| id | mutation | post-check | behaviour | in-action | suites | verdict |
|---|---|---|---|---|---|---|
| I01 | insert: own-name term dropped | 1 | N2 | IA10 | 1 | KILLED |
| I02 | insert: treats-or-created term dropped | 1 | N1 | IA9 | file | KILLED |
| I04 | insert: role literal broken | 1 | N1 N2 N3 N4 | IA11 IA12 IA13 IA24 IA30 | 4 | KILLED |
| I05 | insert: therapist role guard removed | 1 | ok | IA26 | 1 | KILLED |
| I06 | insert: tenant conjunct removed | 1 | N4 | ok | ok | KILLED |
| I07 | insert: owner arm removed | 1 | ok | ok | 1 | KILLED |
| U02 | update USING: author swapped for treats-or-created | 2 | A1 U1 X1 | IA2 IA6 IA16 IA18 IA31 IA34 | file | KILLED |
| U03 | update USING: therapist role guard removed | 2 | ok | IA28 | ok | KILLED |
| U04 | update USING: tenant conjunct removed | 2 | Z1 | ok | ok | KILLED |
| U05 | update USING: owner arm removed | 2 | ok | IA19 IA25 IA31 IA33 | 3 | KILLED |
| C02 | update WITH CHECK: author term dropped | 2 | U2 U3 | IA8 | 1 | KILLED |
| C03 | update WITH CHECK: tenant conjunct removed | 2 | Z1 | ok | ok | KILLED |
| C04 | update WITH CHECK: patient test dropped | 2 | U4 | IA30 IA31 IA32 | file | KILLED |
| C05 | update WITH CHECK: therapist role guard removed | 2 | ok | ok | ok | post-check only (equivalent: USING admits no role but owner and therapist, so no other role reaches WITH CHECK) |
| C06 | update WITH CHECK: owner arm removed | 2 | ok | IA19 IA25 IA31 IA33 | 3 | KILLED |
| D02 | delete: author swapped for treats-or-created | 3 | D1 X2 | IA3 IA31 IA35 | file | KILLED |
| D03 | delete: therapist role guard removed | 3 | ok | IA28 | ok | KILLED |
| D04 | delete: tenant conjunct removed | 3 | Z1 | ok | ok | KILLED |
| F01 | claim: tenant guard dropped | 11 | ok | ok | ok | post-check only (equivalent: `clinical_therapist_sees_patient` is tenant-filtered itself) |
| F02 | claim: therapist role guard dropped | 11 | ok | IA29 | 1 | KILLED |
| F03 | claim: source guard dropped | 11 | ok | ok | ok | post-check only (equivalent on the data the app writes: only AI drafts carry `pending_review`) |
| F04 | claim: status guard dropped | 11 | ok | ok | ok | post-check only (equivalent: the trigger refuses a non-draft, and the app never signs a pending draft) |
| F05 | claim: pending-review guard dropped | 11 | ok | IA20 | 1 | KILLED |
| F06 | claim: no-author guard dropped | 11 | ok | IA18 | 1 | KILLED |
| F07 | claim: treats-or-created guard dropped | 11 | ok | IA17 | 1 | KILLED |
| F08 | claim: no-author OR treats | 11 | ok | IA17 IA18 | 2 | KILLED |
| F09 | claim: also moves the review state | 11 | ok | IA15 | 4 | KILLED |
| F10 | claim: SECURITY INVOKER | 11 | crash guard | crash guard | crash guard | post-check only, by design |
| F11 | claim: `search_path` removed | 11 | ok | ok | ok | post-check only (equivalent: every name in the body is schema-qualified) |
| F12 | claim: EXECUTE for `authenticated` removed | 12 | crash guard | crash guard | crash guard | post-check only, by design |
| F13 | claim: `anon` granted EXECUTE | 12 | ok | ok | 1 | KILLED |

**Totals: 28 killed** by the behaviour check, the in-action arms or the suites (24
in the table above and the four not itemised); **5 by the post-check alone** (C05,
F01, F03, F04, F11, each equivalent); **2 judged by the post-check only, by design** (F10,
F12); **none survived the post-check**. The behaviour check alone kills 15; the suites
alone 22. **What CI would not refuse**, because the suites miss it: I06, U03, U04, C03,
C05, D03, D04 (a tenant conjunct or a role guard: on production the behaviour check's N4 and Z1
and post-check verdicts 1 to 3 hold them) and F01, F03, F04, F10, F11, F12 (post-check verdicts
11 and 12).

**The pre-check's new term, swept on its own.** The owner exclusion in `author cannot write` was
mutated five ways and read on three copies of `c14_r3fix`: V0 the fixture, V1 its owner
deactivated, V2 the owner's draft re-authored by an owner of tenant B. The real file reads
`1, 2, 2`; the second round's file reads `2, 2, 3`. Exclusion removed `2, 2, 3`; the owner
need not be active `1, 1, 2`; the role literal broken `2, 2, 3`; the tenant conjunct removed
`1, 2, 1`; the owner need not be the author `0, 2, 0`. **5 killed, none survived**, and
`scripts/registo-writes-0099.test.mjs` pins the term statically, with a control for the first
two.

**The blocks' own lines, run from this document's text.** The database half of each stage was
extracted from this file by a script (`blocks.py`, in the scratch directory), not retyped: from
stage 1, everything from the clinic-hours read to the line before the apply; from stage 2,
everything from the applied-marker check to the end; from stage 3, everything from reading the
subjects back to the end. Between stages 1 and 2, `psql -1` applied 0099 and its journal row
(`when` 1788502000000) and the marker was touched, standing in for `verified-migrate.mjs`. The
substitutions, counted: `/tmp/` to a scratch directory (stage 1: 20, stage 2: 9, stage 3: 19),
the env line and the target guard dropped (0, 2, 2), `PREVHASH` and `PREVWHEN` set to 0098's
rehearsed values; nothing else, and the script refused to run a segment that still named the
secrets directory, the guard, `verified-migrate` or the apply worktree. Each database was made
from `c14_r3fix` and run under `zsh -f` from the 0099 worktree.

| Arm | Exit (stage 1, 2, 3) | What it printed |
|---|---|---|
| shape `ai` (the in-review AI draft and the admin-named draft removed; **the owner's draft kept**) | 0, 0, 0 | `active clinics open now by their own hours: 0 of 2`; `draft profile (Q3): ai pending 1, ai in review 0, other 0, author cannot write 0`; the pick named T1, T2 and **T3, not the lower-id T4 on P's care team**, shape `ai`; `the subjects and the instrument hold: 6 OK / 0 VACUOUS / 0 FAIL`; `0099 APPLIED. 19/19 pre-check OK, 15/15 post-check OK, journal 96 to 97.`; `subjects before 6 OK / 0 VACUOUS / 0 FAIL, every arm after 20 OK / 0 VACUOUS / 0 FAIL`. **The second round's pre-check on the same database reads `author cannot write 1`, which this block STOPs on** |
| shape `noai` (both AI drafts and the admin-named draft removed; the owner's draft kept) | 0, 0, 0 | shape `noai`; `6 OK / 0 VACUOUS / 0 FAIL` before; the same APPLIED line; `every arm after 19 OK / 1 VACUOUS / 0 FAIL` |
| the fixture as it stands | 1 | `STOP: drafts exist that no therapist could write after 0099 [ai pending 1, ai in review 1, other 0, author cannot write 1]`; journal 96, the function absent |
| only the admin-named draft in the way (the in-review AI draft removed) | 1 | `STOP: drafts exist that no therapist could write after 0099 [ai pending 1, ai in review 0, other 0, author cannot write 1]`; journal 96 |
| shape `ai` with the owner deactivated | 1 | `STOP: drafts exist that no therapist could write after 0099 [ai pending 1, ai in review 0, other 0, author cannot write 1]`: the draft in an inactive owner's name counts; journal 96 |
| no T3 (T3's patient and draft removed; T4, on P's care team, remains) | 1 | `STOP: a MISSING SUBJECT. No live patient furnishes T1, T2 and T3 by the rule in PICK.`; journal 96 |
| stage 1 on the database already applied, marker absent | 1 | `STOP: a pre-check verdict read FAIL`, on 1, 2, 3, 8, 10, `journal_rows_before` and 12; only `0099-precheck.new` written |
| stage 3 with stage 2's transcript removed | 0, 0, 1 | `STOP: stage 2's post-check transcript is missing`; no ACTOR line, so no session acted |

**The patient id reached no transcript**: 0 matches in every stage's output on every arm.

**No refusals, no git operation but the local commits, and no file outside this worktree, the
scratch directory and the owner's handover notes edited.** **The databases.** Kept:
`c14_r3pre99` (the base, 96 rows), `c14_r3fix` (the fixture), `c14_r3main` (the main run, 0099
applied, 97 rows, post-check 15 OK, behaviour 20/0/0), and `c14_r3s99g` and `c14_r3sno99g` (the
suite copies, with the `service_role` grant). Every other `c14_r3` database the rehearsal
created was dropped. From the fourth run, kept: `c14_r4pre99`, `c14_r4fix`, `c14_r4main`,
`c14_r4s99g` and `c14_r4sno99g`, the same roles; its two blocks copies were dropped.
`b13a_base` still reads 94 rows.
