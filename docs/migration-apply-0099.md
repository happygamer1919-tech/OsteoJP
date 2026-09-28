# 0099: apply the registo write matrix, the clinical_records write policies follow the permission matrix

**Status: HELD. NOT PROMOTED, NOT APPLIED, NOT YET ISSUED FOR A SITTING.** One
migration, today `packages/db/migrations-pending/NEXT-AFTER-0098_clinical_records_write_matrix.sql`
on the branch below, applied later by GREEN as
`packages/db/migrations/0099_clinical_records_write_matrix.sql`, **after 0098**. Any `STOP:`
line, any `FAIL` verdict or any `ERROR` halts the sitting.

**What it makes true, in one sentence: the clinical_records write policies follow the
permission matrix. A therapist edits and deletes only their own unsigned registos, and files
registos only in their own name for a patient they treat or created.** The permission matrix
in `CLAUDE.md` gives a therapist "Edit clinical records: own, until locked"; after 0099 the
three write policies of `clinical_records` say exactly that, and the immutability trigger,
untouched, still refuses every change to a locked or signed registo.

**This document is written before the promotion, on purpose.** The owner ruled on
2026-09-27 "0099 registo fix, SAT-01 from 0100." (recorded in `CLAUDE.md`, "SOLO's record",
by #1466, `b8c62fd5` on main); the lane that authored it never applies it, and GREEN
applies 0099 only after `0094` to `0098` are promoted, applied to production and merged, in
that order. So three kinds of value live here:

- **pinned now**, because their bytes are final: the migration's sha256, the three check
  files, the two programs that run with production credentials, and the rule that picks the
  behaviour subjects (it is text in stage 1, so the sidecar pins it);
- **derived at the sitting, by machine**: 0098's sha256 and journal `when`, which the
  pre-check needs as `-v prev_hash` and `-v prev_when`, read off the branch by stage 1; and
  the behaviour check's patient and actors, **picked by GREEN in stage 1, READ ONLY, by that
  pinned rule**, and reused unchanged by stage 3;
- **filled at promotion, and refused by machine until then**: the PR number. It is a
  placeholder today (`NOT-YET-OPENED`), and every block STOPs on it before it touches git or
  a database. See "What the promotion fills".

**Written at the standard of `docs/migration-apply-0093.md`, section for section, in the
ALTER shape of `docs/migration-apply-0092.md` and with 0098's one-CREATE shape.** Every count
below is a structural count, a verdict profile, or a measurement on the synthetic C14
rehearsal of 2026-09-27. **No production figure appears here: this lane had no production
access, and the production READ ONLY section is written before the document is issued.**

**This document describes the database as it is with 0099.** Stage 1 runs the behaviour
check before the apply only in its subjects-only mode (the subjects and the instrument, no
write arm). `scripts/registo-writes-0099.test.mjs` holds this document, the behaviour check and
the DB-gated suite to that.

| Fact | Value |
|---|---|
| Ruling | Owner, 2026-09-27: "0099 registo fix, SAT-01 from 0100.", Tier C, HELD. The acceptance: the therapist arm of `clinical_records_update` (USING and WITH CHECK) and `clinical_records_delete` is `practitioner_id = auth.uid()` only; the therapist arm of `clinical_records_insert` is `practitioner_id = auth.uid() AND clinical_therapist_sees_patient(patient_id)`; the owner arms and every other policy byte-identical; the policy count flat; the immutability trigger untouched; every app writer verified against the new arms, and a narrow path designed for any legitimate writer they would break. **Built with one difference, which is Q4:** the WITH CHECK of `clinical_records_update` is the INSERT's arm, `practitioner_id = auth.uid() AND clinical_therapist_sees_patient(patient_id)`, not the author alone. **The owner rules on Q4 before the PR is armed**, and the migration's header says so |
| Migration, today | `packages/db/migrations-pending/NEXT-AFTER-0098_clinical_records_write_matrix.sql`, sha256 `076481bf1599975e3b1bc25b4f9363901c2c7269df32ec2ef781cb19ba1dc318` |
| Migration, at the sitting | `packages/db/migrations/0099_clinical_records_write_matrix.sql`, **bytes unchanged** (a promotion is a rename and nothing else, so the sha256 above is the hash drizzle records) |
| Journal | `idx 96`, tag `0099_clinical_records_write_matrix`, `when` set at promotion and **strictly greater than 0098's**. The rehearsal used the synthetic `when` values `0097 1788501800000`, `0098 1788501900000` and `0099 1788502000000`; stage 0 asserts the order, not those values |
| Must follow | `0098`, CARE-02a, pending as `NEXT-AFTER-0097_care02a_care_team_reads.sql` (rehearsed at sha256 `fbf8cad1dc959a600b0e8b3ccffb7225e2295919e5dfe08432301faf6b5e9c45`, the worktree copy on 2026-09-27). Before it: `0094` the users/tenants/roles split (#1459), `0095` the conflict check's patient name (#1438), `0096` the grants revoke (#1397), `0097` the staging index |
| Production journal at the sitting | **96 rows before, 97 after.** 91 once 0093 was applied (`docs/migration-apply-0093.md:7`), plus one row each for 0094 to 0098 |
| Branch | `db/0099-registo-write-matrix`. PR **not yet opened** (`PR=NOT-YET-OPENED` in the blocks); it carries `held-for-apply` from the moment it opens |
| This document | `docs/migration-apply-0099.md`, pinned by `docs/migration-apply-0099.sha256` and asserted in STAGE 0 and again in STAGE 1. The sidecar moves at promotion, when the placeholder is filled |
| Pre-check | `scripts/db/precheck-0099-registo-writes.sql`, READ ONLY, **19 verdicts**, sha256 `b489436d21d44f39462036cef43d79d69b8601258d81b260baaaef51fe23c35d`. Takes `-v prev_hash` and `-v prev_when` |
| Post-check | `scripts/db/postcheck-0099-registo-writes.sql`, READ ONLY, **15 verdicts**, sha256 `6fc232fd81e88b444a48877b0d6e4f7b8c754f0d4bb000f30c8989c1e2ca81cc`. Takes five carries |
| Behaviour check | `scripts/db/behaviour-registo-writes-readonly.sql`, READ ONLY, **20 arms**, three actors and one patient, sha256 `99c1910ec66fe8ffeecb2c3ceadb80905881556743d7646fbd895effd1a27a61`. Run TWICE in this sitting with the same subjects: before the apply in its subjects-only mode (`-v subjects_only=on`: arm 0, S0 to S3 and I1), after it with every arm |
| Behaviour subjects | `-v patient_id`, `-v t1_id`, `-v t2_id`, `-v t3_id`. **Picked by GREEN in stage 1, READ ONLY, by the rule the block carries (`PICK`)**: the lowest id that meets each slot. The patient id is never printed and never committed (this repository is public). See "The behaviour subjects on production" |
| The two programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093`. Both byte-identical to `origin/main` at `e0e75cfe`, read 2026-09-27; both pinned in every block that runs them. If main moves either before the sitting, its pin here moves with it before the document is issued |
| What it changes | THREE `ALTER POLICY` statements, each restating 0045's expression with the therapist arm replaced: `clinical_records_insert` WITH CHECK and `clinical_records_update` WITH CHECK (the author, for a patient they treat or created), `clinical_records_update` USING and `clinical_records_delete` USING (the author). And ONE new function, `public.claim_ai_draft_authorship(uuid)`: SECURITY DEFINER, VOLATILE, `search_path = public`, owned by `postgres`, EXECUTE for `authenticated` only. No policy is created or dropped; the policy count is flat |
| What it never touches | every other policy (one md5 over all of them, and a second over the two read policies of `clinical_records`), every existing function (one md5 over every function in `public` but the new one; `clinical_therapist_sees_patient` pinned on its own), every existing grant, and the immutability trigger `clinical_records_enforce_immutability` with its function (pinned by shape and body md5 before and after) |
| The app half | Ships in the same PR: the review claim of an AI draft calls the new function first, and a therapist's AI review queue holds only drafts with no author or their own (`apps/web/lib/clinical/review.ts`); a save, sign, finalize or delete that touched no row is named `not_author` for a therapist who is not the author, where main names every such refusal a lost race (`zeroRowRefusal`, `apps/web/lib/clinical/records.ts`); the two INSERT writers and the patient-submission claim ask the patient test first and refuse cleanly; the record page offers a therapist Save and Sign only on a draft they authored of a patient they treat or created, and New version only for such a patient. Safe on a database without 0099 (see "Apply before merge") |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its own
sha256: writing the value changes the value. So the digest lives beside it in
`docs/migration-apply-0099.sha256` and STAGE 0 checks it with `shasum -a 256 -c`.

**There is no `#` comment inside any block in this document, deliberately,** and every
parameter is braced, including before a colon, because the blocks are pasted into an
interactive zsh (`scripts/owner-blocks-survive-zsh.test.mjs` enforces the braces). No
backslash continuations, and no `!` except as the `test !` operator followed by a space.
Narration is `echo`.

**Each stage derives the head from `origin/db/0099-registo-write-matrix`, not `origin/main`,
and survives that branch being deleted.** The PR is held until this apply succeeds, so
`origin/main` cannot contain the migration at the moment the apply runs. So every block here
reads `origin/<branch>` when it exists and otherwise `refs/pull/<PR>/head`, which a merge
does not delete, and says which one it read.

## What 0099 makes true

For the role `therapist`, and for no other role:

- **W1, `clinical_records_insert` (WITH CHECK)**: the new row is in the caller's own name
  (`practitioner_id = auth.uid()`) AND its patient is one the caller treats or created
  (`clinical_therapist_sees_patient(patient_id)`, 0045). An addendum (a new version that
  supersedes a signed registo) is an INSERT like any other, so it is filed the same way.
- **W2, `clinical_records_update`**: USING, the caller is the registo's author; WITH CHECK,
  the new row is still the caller's own AND its patient is one the caller treats or created,
  W1's test. So authorship never moves by an UPDATE, and every row a therapist writes, by
  INSERT or by UPDATE, meets the same rule (Q4).
- **W3, `clinical_records_delete` (USING)**: the caller is the author.

"Unsigned" is not in the policies and does not need to be: the BEFORE UPDATE OR DELETE
trigger `clinical_records_enforce_immutability` (0001, re-parent-aware since 0005) refuses
every change to a locked or signed registo, and 0099 does not touch it. The owner arm of all
three policies is 0045's, byte for byte: an owner writes any registo of the tenant, as
before. Admin and reception match no write arm, as before. The SELECT policies are not
touched (`NEXT-AFTER-0098_clinical_records_write_matrix.sql:32-64`, the statements at
`:281-378`).

## Every app writer, read against the new arms

Read on `origin/main` at `e0e75cfe`, after #1464 (`7b8e49b1`), which made each UPDATE below
read back the rows it touched. Every staff writer runs under `withTenantContext`
(`packages/db/src/client.ts:146-158`: `SET LOCAL ROLE authenticated` and the JWT claims), so
the policies apply to it. The same list, with the reasoning, is section 3 of the migration
(`:99-179`).

| Writer | Where (main) | Write | After 0099 |
|---|---|---|---|
| createDraftRecord | `apps/web/lib/clinical/records.ts:431-442` | INSERT, `practitioner_id = ctx.userId`, patient from the new-registo picker, which offers a therapist only patients they treat or created (`:364-375`, `therapistPatientScope`, the same test as `clinical_therapist_sees_patient`) | ADMITTED (W1). Any other patient (a posted id, or one whose last appointment with the caller was deleted since the page rendered) is refused by the app half as `not_found` before the INSERT, not as a raw 42501 |
| updateRecordData | `records.ts:509-517` | UPDATE of the registo being edited. Main reads back the rows it touched and refuses 0 as `not_found`, with no audit row | ADMITTED for its author while they treat or created the patient; 0 rows for anyone else (W2), which the app half names `not_author`. An author who no longer treats or created the patient is refused by WITH CHECK (Q4) |
| createAddendum | `records.ts:554-567` | INSERT in the caller's name for the superseded registo's patient | ADMITTED (W1) for a therapist who treats or created that patient, whoever wrote the registo being superseded. Anyone else is refused by the app half as `not_found` before the INSERT, and the record page shows it; the owner files any |
| signAndLockRecord | `records.ts:613-627` | UPDATE status to signed. Main reads back and reports 0 rows as `stale` | ADMITTED for the author, with the same patient test as the save; 0 rows for anyone else (W2), which main would report as `stale` ("changed in the meantime") and the app half names `not_author` |
| hardDeleteClinicalRecord | `records.ts:691-695` | DELETE of a draft. Main refuses 0 rows as `not_found` | ADMITTED for the author; 0 rows for any other therapist, including on an AI draft nobody has claimed, which the app half names `not_author`. The owner deletes any draft, as before. The patient page still offers a therapist Eliminar on every draft (below and Q5); a therapist discards an AI draft nobody has claimed by claiming it first |
| claimReviewItem, patient submission | `apps/web/lib/clinical/review.ts:284-294` | INSERT in the claimer's name (`:290`) for the submission's patient; the queue offers a therapist only patients they treat or created (`:86-90`) | ADMITTED (W1). A posted submission id for any other patient is refused by the app half as `not_found` before the INSERT, as createDraftRecord refuses one |
| claimReviewItem, AI draft | `review.ts:228-243` | UPDATE of a draft the ingestion endpoint wrote WITHOUT an author (`apps/web/lib/ingestion/store.ts:78-93` sets no `practitioner_id`) | **WOULD BREAK**: no therapist is its author, so the claim reads 0 rows and ends in `not_under_review`. **Measured**: `origin/main`'s own `packages/db/tests/review-finalize-rls.test.ts` fails 4 of its 11 arms on a database with 0099 (the four AI arms, "expected +0 to be 1"). The narrow path is the next section |
| listReviewQueue, AI rows | `review.ts:86-110` | a read, not a write | The app half shows a therapist an AI draft only while it has no author or when they are its author: a draft another therapist has taken is theirs, and a claim of it would end in `not_under_review` |
| editReviewNarrative, saveReviewFicha, finalizeReview | `review.ts:377-384`, `:478-485`, `:548-567` and `:581-590` | UPDATEs of a claimed draft. Main reads back and reports 0 rows as `finalized` (the two saves) or `stale` (finalize) | After the claim the claimer IS the author, so ADMITTED for the claimer; 0 rows for anyone else, which the app half names `not_author` |
| The consultation actions | `apps/web/app/consultation/actions.ts`: `createStubPatient` (`:58`), the recording consent's audit row (`:156`), `persistConsultation` (`:381`) | a stub patient, an audit row, and the `consultations` row, which `apps/web/lib/consultation/consultation-store.ts:96-193` writes on `getDbAdmin()`; none of them writes `clinical_records` (the AI draft a recording leads to arrives through the ingestion endpoint, the next row) | NOT UNDER THESE POLICIES |
| AI ingestion | `apps/web/lib/ingestion/store.ts:77-93` | INSERT on `getDbAdmin()` (BYPASSRLS), the sanctioned service_role path | NOT UNDER THESE POLICIES |
| merge_patients | `packages/db/migrations/0005_patient_merge_multilocation.sql:117-120`, owner `postgres` since `0060:90` | re-points `patient_id` as its SECURITY DEFINER owner | NOT UNDER THESE POLICIES |
| The Fisiozero importer | `packages/db/src/migration/upsert.ts:620-625`, `:934-937`, with OWNER claims (`packages/db/scripts/import-core.ts:336`) | INSERT of imported registos, which keep the original therapist as author | ADMITTED by the owner arm, unchanged; the imported registo's author edits it as its author |
| Development seed | `packages/db/seed/episodes-dev.ts:303` | not production | not applicable |

**The app half, in this PR.** `review.ts` calls the claim function inside the claim's own
transaction, right before its UPDATE (`takeAiDraftAuthorship`), and filters a therapist's AI
queue to drafts with no author or their own.

**The 0-row codes, chosen on purpose.** Main already turns a write that touched no row into a
refusal with no audit row, and names every such refusal a lost race (`stale`, `finalized` or
`not_found`). With 0099, row level security returns 0 rows to a therapist who is not the
author, and "changed in the meantime" would then be the wrong reason. The app half tells the
two apart from the row the writer read first, in the same transaction (`zeroRowRefusal`,
`records.ts`): a therapist who is not the author gets `not_author`; the author, and the owner,
whose arm admits every registo, lost a race and get main's code unchanged. The code only
names a refusal that already happened: it never turns a refusal into a write or a write into
a refusal, with or without 0099. `not_author` reaches the screen as a generic error:
`clinical.error` or `review.error` on the record and review pages, `errors.generic` on the
patient page. On the record page only a page rendered before an authorship change, or a
hand-built request, reaches it, because that page no longer offers the control that would meet
it (below).

**The patient page is not gated in this PR, and meets it.** Its Registos clínicos tab
(`apps/web/app/patients/[id]/page.tsx:709-721`) offers anyone with `clinical_records:author`,
the owner and a therapist, Eliminar on every draft (`record-lifecycle-actions.tsx:80`) and Nova
versão (adenda) on every finalized registo. With 0099, a therapist's Eliminar on a draft they did not
author, a colleague's or an AI draft nobody has claimed, deletes nothing and ends in
`errors.generic`; a therapist's Nova versão for a patient they neither treat nor created (a
care-team reader since 0098) files nothing and ends on the record page with `clinical.error`
(the filing refusals, below). **From the apply on, a therapist discards an AI draft nobody has
claimed by claiming it first** (Assumir in Revisão Consulta makes them its author, through the
claim function) and then using Eliminar; the owner deletes it directly, as before. The e2e
fixture that deletes an AI draft as the therapist (`AI_DELETE_DRAFT`, W6-01a,
`apps/web/e2e/clinical.spec.ts:165-189`) is seeded with the e2e therapist as its author, the
shape a claim leaves (`apps/web/e2e/seed/seed-e2e.mjs`, `ensureAiDeleteDraft`), so it deletes
as its author on a database with or without 0099. Whether the patient page is gated as the
record page is, is Q5.

**The filing refusals.** `createDraftRecord`, `createAddendum` and the patient-submission claim
ask the patient test for a therapist before the INSERT (`assertTherapistMayFileFor`, the same
test as `therapistPatientScope`) and throw `not_found` outside it; `versionRecordAction` keeps
the refusal on the record page.

**The record page offers only what would succeed.** For a therapist, Save and Sign only on a
draft they authored, of a patient they treat or created (W2 on both sides), and New version
only for a patient they treat or created (W1), asked through `mayFileRegistoFor` (one read).
The owner and the admin see what they saw before, and the attachments keep their own gate:
0099 changes no attachment rule.

**Every one of those is pinned by a unit test that goes red when it is deleted**
(`apps/web/lib/clinical/records.write-guards.test.ts`, `review.write-guards.test.ts`,
`apps/web/app/clinical/[id]/page-write-controls.test.tsx`; twenty mutations of the app half,
twenty red). Main's own `sign-guard.test.ts` now names its rows' author, the signer, so its
race arms still read `stale`. No other writer changes.

## The review claim of an AI draft: the one path the new arms would break, and its narrow path

An AI-ingested draft has no author until a human takes it: the ingestion endpoint does not
know which therapist will review it. The review claim is where a therapist takes it, and an
UPDATE policy that admits only the author cannot admit that first UPDATE, because USING reads
the OLD row, whose `practitioner_id` is NULL.

`public.claim_ai_draft_authorship(p_record_id uuid)` makes the caller the author of ONE such
draft and does nothing else (`NEXT-AFTER-0098_clinical_records_write_matrix.sql:182-230`,
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
has no author or when they are its author (`listReviewQueue`, this PR), so it leaves every
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

## Question block (Tier C, new, held unarmed)

**blocked_what:** the design of the AI review claim, the order the app half ships in, the
drafts in flight at the sitting, the one place the migration differs from the acceptance's
text (Q4), and the patient page's registo controls (Q5). Everything else in the migration is
the ruled acceptance.

**Q1. The claim path.** Options:
(a) **as built**: the SECURITY DEFINER claim function, which makes the claiming therapist
the AI draft's author. After the claim the draft is theirs like any other, and a colleague
does not edit it. A direct call outside the app's claim leaves an authored draft pending
review, which is accepted (see the section above): it is the caller's, and only the caller's
queue shows it. Cost: the SECURITY DEFINER count moves 27 to 28, a GATE-CHANGE at
promotion.
(b) no function: a narrow extra UPDATE arm for an unauthored AI draft of a patient the
therapist treats or created. No gate change, but the draft stays unauthored and shared by
every treating therapist until it is signed, which is not "own".
(c) no claim path: only the owner reviews AI drafts. Nothing new, and the therapist review
queue stops working for AI drafts.
**Recommendation: (a).** It is the only option under which the ruled sentence holds for AI
drafts too.

**Q2. The order the app half ships in.** Options:
(a) in this PR, merged promptly after the apply (the apply window below);
(b) the app half first, in its own Tier B PR, merged before the sitting. It is safe on a
database without 0099: the claim asks `to_regprocedure` first and calls nothing that is not
there; the 0-row codes rename only a refusal main already makes, and never turn a refusal into
a write or the reverse; the queue filter changes nothing while no AI draft has an author; and
the two INSERT writers and the patient-submission claim refuse only what the permission matrix
already refuses. One change shows before the sitting: the record page stops offering a
therapist Save and Sign on a draft they did not write, and New version for a patient they
neither treat nor created, which is the permission matrix's own rule.
**Recommendation: (b).** It closes the apply window instead of bounding it.

**Q3. Drafts in flight at the sitting that no therapist can write after it.** The pre-check
prints a profile, `draft_profile`, of four counts of unsigned registos: with no author, AI
drafts pending review, AI drafts already in review, and other drafts; with an author, the
drafts whose author could not write them after 0099 (`author cannot write`): every draft whose
author is neither an active owner of the tenant nor an active therapist of the tenant who
treats or created the patient. That is a deactivated therapist or owner, a non-therapist such
as an admin named on an imported draft, or a therapist with no appointment with the patient
who did not create them. A draft in an active owner's name is not counted: the owner arm,
which 0099 leaves alone, still admits its author. From the apply on, a therapist claims the
first kind through the function and writes the other three not at all; the owner writes all
four, as before. **Recommendation:
proceed when the last three counts are 0, and otherwise the owner finishes those drafts (or
rules) before the sitting.** Stage 1 STOPs on anything else, before the pick. The counts are
read, never assumed: the READ ONLY pre-check before issue reads them first, so the sitting is
not where they are learned. Measured on the rehearsal: a draft in the owner's name does not
count, and with its owner deactivated it does.

**Q4. The new-row check of UPDATE.** The acceptance named the author alone
(`practitioner_id = auth.uid()`) for both sides of `clinical_records_update`. Options:
(a) **as built**: USING the author; WITH CHECK the author AND
`clinical_therapist_sees_patient(patient_id)`, W1's arm, so every row a therapist writes, by
INSERT or by UPDATE, meets the ruled sentence. Cost: an author who no longer treats or created
the patient (every appointment with them deleted) can still delete their draft but can no
longer save or sign it; the owner can. The pre-check's `author cannot write` count is those
drafts, and in-action IA31 and a DB-gated arm measure the rule.
(b) the author alone on both sides, the acceptance's literal text.
**Recommendation: (a).** **The owner rules on Q4 before the PR is armed and before this
document is issued.** A ruling for (b) changes W2's WITH CHECK, the migration's sha256 and every
pin on it, post-check verdict 2, behaviour arm U4, in-action IA30 to IA32 and the sweep, and
the rehearsal runs again.

**Q5. The patient page's registo controls.** Options:
(a) **as built**: unchanged by this PR. The Registos clínicos tab offers the owner and every
therapist Eliminar on every draft and Nova versão (adenda) on every finalized registo. From the
apply on, a therapist's Eliminar on a draft they did not author, and their Nova versão for a
patient they neither treat nor created, write nothing and end in a generic error (see "The
0-row codes"). A therapist discards an AI draft nobody has claimed by claiming it first.
(b) gate it as the record page is, in this PR: for a therapist, Eliminar only on a draft they
authored, Nova versão only for a patient they treat or created (`mayFileRegistoFor`). Merged
before the sitting, it hides Eliminar from a therapist on every AI draft until 0099 is
applied, because until then no claim makes a therapist an AI draft's author.
(c) (b) in a follow-up Tier B PR, merged after the apply.
**Recommendation: (c).** From the apply on the patient page then offers a therapist only what
succeeds, as the record page does, and the AI-draft discard is not hidden before the claim can
make a therapist the draft's author.

## Before the sitting

Checked by the operator before stage 0. None of these is a block.

1. **0094, 0095, 0096, 0097 and 0098 are applied to production and merged, in that order.**
   One migration is in flight at a time (`packages/db/migrations-pending/README.md`). The
   pre-check re-proves the end state by machine: `journal_rows_before` must read **96**, 0093
   must be in the journal by hash (arm 9), and the newest journal row must be 0098's, by hash
   and `when` (arm 10).
2. **0099 is promoted on this branch**: the rename into `packages/db/migrations/`, its journal
   entry with a `when` above 0098's, the supabase mirror, the README's Promoted row, and
   `packages/db/tests/security-definer-owner.test.ts`'s `EXPECTED_FUNCTIONS` gaining the new
   function (`NEXT-AFTER-0098_clinical_records_write_matrix.sql:252-278`). Stage 0 proves the
   rename and the journal, and STOPs until they are there.
3. **The SECURITY DEFINER count moves 27 to 28, and half of that is a GATE-CHANGE.**
   `EXPECTED_COUNT` in `packages/db/scripts/check-security-definer-owner.mjs` is a frozen gate
   (`.github/gate-manifest.json`) that CI's DB-gated job runs against the seeded database. It
   moves in a GATE-CHANGE the owner merges by hand, which may not carry the migration, so
   whichever of the two lands first reddens that step until the other lands. **The order is
   the owner's call**, as it is for 0098's move from 26 to 27.
4. **The PR reads all required checks green on the head being applied.** Held, it stays
   green against main's migrations, and it stays honest: the DB-gated suite
   (`packages/db/tests/clinical-records-write-matrix.db.test.ts`) asks the catalogue which
   side it is on and names it in every title, runs 0099's arms only where 0099 is applied
   (they are skipped on main's database) and the arms that hold on either side everywhere; it
   THROWS on a database that holds half of 0099, and on one that lacks it while the repository
   has it promoted.
   `packages/db/tests/review-finalize-rls.test.ts` claims AI drafts the way the app does,
   through the function when it exists, so it is green on both sides.
5. **This document is issued for the sitting**: `PR` is filled, the production READ ONLY
   section is written, and the sidecar is regenerated. Stages 0 to 3 STOP on the placeholder.
6. **The owner's dispatch names `0099_clinical_records_write_matrix` and a run window that
   falls outside both clinics' opening hours**, and GREEN is launched with
   `scripts/apply-lane/osteojp-apply-settings.json`. This document carries no date: stage 0
   and stage 1 read the Lisbon clock, and stage 1 also reads the clinics' own hours from the
   database.
7. **The owner is ready to take `held-for-apply` off and merge the PR promptly after the
   apply** (the owner's two clicks), unless Q2 (b) shipped the app half first.
8. **Q4 is ruled.** Until it is, the migration's body is final but for W2's WITH CHECK, and
   nothing here is issued.

## Apply before merge, and merge promptly after: the apply window

**Merged before the apply, nothing breaks.** The claim asks the schema whether the function
exists (`to_regprocedure`, `review.ts`, `takeAiDraftAuthorship`) and calls nothing that is
not there, so without 0099 the claim works as it does today. The 0-row codes rename only a
refusal main already makes. The queue filter
changes nothing while no AI draft has an author, which without the function is always. The
two INSERT writers and the patient-submission claim refuse only a patient outside the
permission matrix's own scope, and the record page stops offering a therapist the writes the
matrix does not give them. The DB-gated suites are green on both sides (see "The DB-gated
suites" below).

**Applied and not yet merged, three things read wrong until the merge deploys. That is the
apply window.** First, a therapist's claim of an AI draft is refused (`not_under_review`),
because main's claim does not call the function; the owner can still claim, and nothing is
written. Second, main names a refused write by a therapist who is not the author a lost race:
a sign or a finalize `stale` ("changed in the meantime"), a review save `finalized`, a record
save or a delete `not_found`. Nothing is written and no audit row is written, but the message
gives the wrong reason, and main's record page still offers those controls. Third, main's
`createAddendum`, `createDraftRecord` and patient-submission claim do not ask the patient test
first, so a registo refused for a patient outside the caller's scope reaches the therapist as
the generic error page (a raw 42501) rather than a message on the record. Nothing is lost or
changed in the database; the screen is wrong.
**The window closes when the production deployment of the merge commit is live, not at the
merge click.** The sitting runs while both clinics are closed, which bounds it; Q2 (b) removes
it.

## Undoing 0099: a new migration

**It is not reversible by editing it.** Once applied, 0099's bytes are the hash drizzle's
journal holds, so an undo is a NEW numbered migration, ruled onto the Tier C list like any
other, rehearsed, and applied by GREEN; never a hand edit on production.

**One step is enough, and the function may stay.** The undo's `ALTER POLICY` statements
restore the three expressions from `0045_clinical_records_location_rls.sql:252-316`; this
document's pre-check arms 1 to 3 pin exactly those expressions by md5 (`a8e4b05e...`), so the
undo's own post-check can assert them. The claim function does not have to be dropped: the app
asks for it on every claim (no cache), and the claim runs with it or without it. Dropping it later is a plain `DROP FUNCTION` that moves the
SECURITY DEFINER count back from 28 to 27, which is a GATE-CHANGE. **Authors the function
assigned while 0099 stood stay assigned**: they are the therapists who claimed and signed
those drafts, and the undo does not move clinical authorship.

## What the promotion fills

The lane that promotes 0099 fills these and regenerates the sidecar. GREEN fills nothing: a
GREEN session that meets a placeholder has been handed a document that is not issued, and
stops.

| Value | Where | Placeholder today | Filled with |
|---|---|---|---|
| `PR` | stages 0, 1, 2, 3 | `NOT-YET-OPENED` | the PR number, for the `refs/pull/<PR>/head` fallback |
| "Measured on production, READ ONLY" | the section of that name | NOT YET MEASURED | the pre-check and the stage 1 pick, both READ ONLY, run before issue |
| the sidecar | `docs/migration-apply-0099.sha256` | this revision's digest | the issued revision's digest |

Nothing else in the blocks changes at promotion. If a pinned check file, the migration or a
pinned program changes before the sitting, its pin changes with it and the rehearsal arms
that read it are re-run.

## STAGE 0: verify the promotion, the number and the clock

**This stage PROVES the promotion; it never performs it.** It reads no database.

```
(
set -eo pipefail
SHA=076481bf1599975e3b1bc25b4f9363901c2c7269df32ec2ef781cb19ba1dc318
BRANCH=db/0099-registo-write-matrix
PR=NOT-YET-OPENED
MIG=packages/db/migrations/0099_clinical_records_write_matrix.sql
PEND=packages/db/migrations-pending/NEXT-AFTER-0098_clinical_records_write_matrix.sql
DOCPIN=docs/migration-apply-0099.sha256

echo "--- the Lisbon clock: a sitting runs only while both clinics are closed"
LT=$(TZ=Europe/Lisbon date +%H%M)
echo "${LT}" | grep -qE '^[0-9]{4}$' || { echo "STOP: the Lisbon clock did not read as HHMM"; exit 1; }
awk -v t="${LT}" 'BEGIN { if ((t + 0) < 800 || (t + 0) >= 2100) exit 0; exit 1 }' || { echo "STOP: it is ${LT} in Lisbon. This sitting runs only before 08:00 or from 21:00 Lisbon time, while both clinics are closed"; exit 1; }
echo "Lisbon ${LT}: outside 08:00 to 21:00"

echo "${PR}" | grep -qE '^[0-9]+$' || { echo "STOP: PR is still a placeholder. This document is not issued for a sitting: 0099 is HELD"; exit 1; }

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

test -f ${MIG} || { echo "STOP: 0099 is not on disk; the promotion is not on this branch, and 0099 is still HELD"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA}" ] || { echo "STOP: 0099 is not the approved body"; exit 1; }
test ! -f ${PEND} || { echo "STOP: the pending copy still exists, so the rename did not happen"; exit 1; }
N99=$(find packages/db/migrations -maxdepth 1 -name '0099_*.sql' | wc -l | tr -d ' ')
[ "${N99}" = 1 ] || { echo "STOP: ${N99} files claim migration number 0099, not 1"; exit 1; }
N98=$(find packages/db/migrations -maxdepth 1 -name '0098_*.sql' | wc -l | tr -d ' ')
[ "${N98}" = 1 ] || { echo "STOP: ${N98} files claim migration number 0098, not 1. 0099 follows exactly one 0098"; exit 1; }

node -e 'const e = require("./packages/db/migrations/meta/_journal.json").entries; const a = e[e.length - 2]; const b = e[e.length - 1]; console.log("journal: " + e.length + " entries, then idx " + a.idx + " " + a.tag + " when " + a.when + ", then idx " + b.idx + " " + b.tag + " when " + b.when); if (e.length === 97 && a.idx === 95 && /^0098_/.test(a.tag) && b.idx === 96 && b.tag === "0099_clinical_records_write_matrix" && b.when > a.when) process.exit(0); console.log("STOP: the journal must end with 0098 at idx 95 and then 0099_clinical_records_write_matrix at idx 96, 97 entries, with a strictly greater when"); process.exit(1)'

pnpm db:check-journal
echo "PROMOTION AND NUMBER VERIFIED"
)
```

**EXPECT: `PROMOTION AND NUMBER VERIFIED`.** Before it: `Lisbon <HHMM>: outside 08:00 to
21:00`; `running from <sha>`; `journal: 97 entries, then idx 95 0098_... when <W98>, then
idx 96 0099_clinical_records_write_matrix when <W99>`; and `pnpm db:check-journal` printing
**97 `.sql` files match 97 journal entries** in order, `when` strictly increasing, the
supabase mirror matching by CONTENT. Stage 1 re-proves the migration by sha256 through
`verified-migrate.mjs`.

**The promoted file's own header will still read "RULED NUMBER 0099. NO NUMBER IN THIS FILE
NAME YET, BY CONSTRUCTION"** (`:13`). That is stale after the rename, and it stays stale on
purpose: a promotion does not touch one byte of the file, which is the only reason the sha256
above can pin anything.

**The clock.** Both clinics were ruled to 08:00 to 21:00 on every open day
(`docs/data-op-location-hours.md:18`, AGENDA-2100), so a Lisbon time before 08:00 or from 21:00
is outside every ruled opening hour. The hours are data, not code: stage 1 reads
`locations.opens_at` and `closes_at` READ ONLY right before the apply and STOPs if any active
clinic is open by its own row.

## What is new here, because 0099 is not shaped like 0093

0093 CREATED a table. **0099 alters three policies and creates one function**: 0092's ALTER
shape three times over, and 0098's one-CREATE shape once.

- **The pre-check proves each of the three policies PRESENT and exactly as 0045 left it**, by
  the md5 of its rendered expression (arms 1 to 3; all three render the same text,
  `a8e4b05ed583e82dbb0b136d5ff4a627`). `ALTER POLICY ... USING` replaces whatever expression
  it finds, so a policy somebody edited by hand would be overwritten without a word, and one
  already carrying 0099's arm would mean 0099 had run outside the journal. Both STOP here,
  before the apply.
- **It pins the two read policies of `clinical_records`** (arm 4, as 0098 and 0010 leave
  them), **the immutability trigger and its function** (arm 5, BEFORE UPDATE OR DELETE FOR
  EACH ROW, every column, no WHEN, enabled, body md5), **and
  `clinical_therapist_sees_patient`** (arm 6), because 0099 relies on each of them NOT moving.
- **It proves the new function's name is FREE** (arm 12), because `CREATE OR REPLACE` would
  silently take over a same-named function somebody else made.
- **It prints a profile, `draft_profile`**, the four counts Q3 reads. Its verdict only says
  the counts were read; what they mean is Q3's, and stage 1 asserts the shape Q3 recommends.
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
`functions_md5`, `grants_md5`, and the profile `draft_profile`, which stage 1 asserts and
stage 2 does not pass on. No carry's name is a substring of another's or of any other row's `check`
column, because stage 2's `carry()` matches column 1 with `index()`. The pre-check also takes
two inputs that are not carries, `prev_hash` and `prev_when`, and refuses to run without them.

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
| T3 | the lowest-id active therapist, not a shared resource, other than T1, with no appointment with P, who did not create P, authored no registo of P, is not on P's care team (no live `patient_care_team` row for P: after 0098 a care-team member at one of their own clinics reads P's registos, and T3 is the actor who reads none), and treats or created at least one live patient (so arm N3 has its subject) | S3, N3 |

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
(`<patient>|<T1>|<T2>|<T3>|<ai or noai>`) to `/tmp/0099-subjects.out`, under `umask 077`,
and prints only the three staff ids. Stage 3 reads that file, never picks again, and first
checks that stage 1's BEFORE transcript named exactly its actors. The patient id never
reaches a transcript.

**The pick and the behaviour check read outside row level security for their comparands.**
Both set `row_security = off` for their unfiltered reads, so on a connection that does not
bypass row level security they ERROR rather than read a filtered count. On production the
tables are owned by `postgres` with RLS ENABLED, not FORCED, which is the case where they
read. The READ ONLY run before issue is the first measurement there.

## HEAD CHECK: run this FIRST, and read it with your eyes

Paste this on its own, before stage 1, and again before stage 2. It writes nothing and
touches no database.

```
(
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
echo "head of the branch this document applies from (a failure below means the branch is gone, and the stages read refs/pull/<PR>/head):"
git rev-parse -q --verify refs/remotes/origin/db/0099-registo-write-matrix || echo "the branch is gone from origin"
)
```

**Compare the sha it prints with the one STAGE 0 printed as `running from`.** A moved head
means opposite things depending on WHEN: **before stage 1 has applied**, the sitting starts
again from stage 0; **after stage 1 has applied, NEVER go back to stage 1**: go on to stage 2
on the new head, which asserts every file it reads by sha256. Both shas go on the SR-51 card.

Stage 1 refuses to start while a fresh applied-marker exists, and it never touches the
previous transcripts until a new pre-check, a new pick AND a new subjects-only run have
passed.

## STAGE 1: the clock, pre-flight, pre-check, the pick, the subjects BEFORE, apply

```
(
set -eo pipefail
umask 077
SHA0099=076481bf1599975e3b1bc25b4f9363901c2c7269df32ec2ef781cb19ba1dc318
SHAPRE=b489436d21d44f39462036cef43d79d69b8601258d81b260baaaef51fe23c35d
SHABEHAVIOUR=99c1910ec66fe8ffeecb2c3ceadb80905881556743d7646fbd895effd1a27a61
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
BRANCH=db/0099-registo-write-matrix
PR=NOT-YET-OPENED
U='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
PICK="with t as (select u.id, u.tenant_id from public.users u join public.roles r on r.id = u.role_id and r.slug = 'therapist' where u.is_active and not u.is_shared_resource), f as (select distinct c.tenant_id, c.patient_id as pid, c.practitioner_id as t1 from public.clinical_records c join public.patients p on p.id = c.patient_id and p.tenant_id = c.tenant_id and p.deleted_at is null join t on t.id = c.practitioner_id and t.tenant_id = c.tenant_id where c.status = 'draft' and (p.created_by = c.practitioner_id or exists (select 1 from public.appointments a where a.tenant_id = c.tenant_id and (a.patient_id = c.patient_id or a.patient_2_id = c.patient_id) and (a.practitioner_id = c.practitioner_id or a.practitioner_2_id = c.practitioner_id)))), s as (select f.pid, f.t1::text as t1, (select min(x.id::text) from t x where x.tenant_id = f.tenant_id and x.id <> f.t1 and exists (select 1 from public.appointments a where a.tenant_id = f.tenant_id and (a.patient_id = f.pid or a.patient_2_id = f.pid) and (a.practitioner_id = x.id or a.practitioner_2_id = x.id))) as t2, (select min(y.id::text) from t y where y.tenant_id = f.tenant_id and y.id <> f.t1 and not exists (select 1 from public.appointments a where a.tenant_id = f.tenant_id and (a.patient_id = f.pid or a.patient_2_id = f.pid) and (a.practitioner_id = y.id or a.practitioner_2_id = y.id)) and not exists (select 1 from public.patients p where p.id = f.pid and p.created_by = y.id) and not exists (select 1 from public.clinical_records c where c.tenant_id = f.tenant_id and c.patient_id = f.pid and c.practitioner_id = y.id) and not exists (select 1 from public.patient_care_team ct where ct.tenant_id = f.tenant_id and ct.patient_id = f.pid and ct.user_id = y.id and ct.removed_at is null) and (exists (select 1 from public.patients q where q.tenant_id = f.tenant_id and q.deleted_at is null and q.created_by = y.id) or exists (select 1 from public.appointments a join public.patients q on q.id in (a.patient_id, a.patient_2_id) and q.tenant_id = a.tenant_id and q.deleted_at is null where a.tenant_id = f.tenant_id and (a.practitioner_id = y.id or a.practitioner_2_id = y.id)))) as t3, exists (select 1 from public.clinical_records c where c.tenant_id = f.tenant_id and c.patient_id = f.pid and c.source = 'ai_ingested' and c.status = 'draft' and c.ai_review_state = 'pending_review' and c.practitioner_id is null) as has_ai from f) select pid::text || '|' || t1 || '|' || t2 || '|' || t3 || '|' || case when has_ai then 'ai' else 'noai' end from s where t2 is not null and t3 is not null order by has_ai desc, pid, t1 limit 1"

echo "--- the Lisbon clock, before anything else"
LT=$(TZ=Europe/Lisbon date +%H%M)
echo "${LT}" | grep -qE '^[0-9]{4}$' || { echo "STOP: the Lisbon clock did not read as HHMM"; exit 1; }
awk -v t="${LT}" 'BEGIN { if ((t + 0) < 800 || (t + 0) >= 2100) exit 0; exit 1 }' || { echo "STOP: it is ${LT} in Lisbon. This sitting runs only before 08:00 or from 21:00 Lisbon time, while both clinics are closed"; exit 1; }
echo "Lisbon ${LT}: outside 08:00 to 21:00"

echo "--- the value the promotion fills. A placeholder means this document is not issued: 0099 is HELD"
echo "${PR}" | grep -qE '^[0-9]+$' || { echo "STOP: PR is still a placeholder. This document is not issued for a sitting"; exit 1; }

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/0099-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 ALREADY APPLIED in this sitting. Do not run it again. Go to stage 2"; exit 1; }
rm -f /tmp/0099-precheck.new /tmp/0099-subjects.new /tmp/0099-behaviour-before.new

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
test -f docs/migration-apply-0099.sha256 || { echo "STOP: the document pin is not on disk"; exit 1; }
shasum -a 256 -c docs/migration-apply-0099.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f packages/db/migrations/0099_clinical_records_write_matrix.sql || { echo "STOP: 0099 is not on disk"; exit 1; }
test -f scripts/db/precheck-0099-registo-writes.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/behaviour-registo-writes-readonly.sql || { echo "STOP: the behaviour check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
N99=$(find packages/db/migrations -maxdepth 1 -name '0099_*.sql' | wc -l | tr -d ' ')
[ "${N99}" = 1 ] || { echo "STOP: ${N99} files claim migration number 0099, not 1"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0099_clinical_records_write_matrix.sql | cut -d' ' -f1)" = "${SHA0099}" ] || { echo "STOP: 0099 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0099-registo-writes.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-registo-writes-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- 0098 as this branch carries it: the pre-check's prev_hash and prev_when, read here and never typed"
N98=$(find packages/db/migrations -maxdepth 1 -name '0098_*.sql' | wc -l | tr -d ' ')
[ "${N98}" = 1 ] || { echo "STOP: ${N98} files claim migration number 0098, not 1"; exit 1; }
F98=$(find packages/db/migrations -maxdepth 1 -name '0098_*.sql')
PREVHASH=$(shasum -a 256 ${F98} | cut -d' ' -f1)
PREVWHEN=$(node -e 'const e = require("./packages/db/migrations/meta/_journal.json").entries.filter((x) => /^0098_/.test(x.tag)); process.stdout.write(e.length === 1 ? String(e[0].when) : "")')
echo "${PREVHASH}" | grep -qE '^[0-9a-f]{64}$' || { echo "STOP: 0098's sha256 did not read"; exit 1; }
echo "${PREVWHEN}" | grep -qE '^[0-9]{13}$' || { echo "STOP: 0098's journal when did not read as exactly one 13-digit value"; exit 1; }
echo "0098: ${F98}, sha256 ${PREVHASH}, journal when ${PREVWHEN}"

echo "--- the production target, asserted by the guard, not by the prompt"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the clinics' own hours, READ ONLY: no active clinic may be open now"
CL=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) filter (where is_active and (now() at time zone 'Europe/Lisbon')::time >= opens_at and (now() at time zone 'Europe/Lisbon')::time < closes_at) || ' of ' || count(*) filter (where is_active) from public.locations" | tail -1)
echo "active clinics open now by their own hours: ${CL}"
awk -v s="${CL}" 'BEGIN { n = split(s, a, " "); if (n == 3 && a[1] == "0" && a[2] == "of" && (a[3] + 0) >= 1) exit 0; exit 1 }' || { echo "STOP: a clinic is open now by its own hours, or no active clinic was read [${CL}]. The sitting waits until both are closed"; exit 1; }

echo "--- the pre-check. READ ONLY. Its transcript IS the carry, so it is kept"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v prev_hash=${PREVHASH} -v prev_when=${PREVWHEN} -f scripts/db/precheck-0099-registo-writes.sql 2>&1 | tee /tmp/0099-precheck.new
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0099-precheck.new && { echo "STOP: a pre-check verdict read FAIL. Nothing was applied and no earlier transcript was touched"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0099-precheck.new || true)
[ "${OKS}" = 19 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 19"; exit 1; }
UD=$(awk -F'|' 'index($1,"draft_profile")>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0099-precheck.new)
echo "draft profile (Q3): ${UD}"
echo "${UD}" | grep -qE '^ai pending [0-9]+, ai in review 0, other 0, author cannot write 0$' || { echo "STOP: drafts exist that no therapist could write after 0099 [${UD}]. Q3: the owner finishes them, or rules, before the sitting. Nothing was applied"; exit 1; }

echo "--- the behaviour subjects, picked READ ONLY by the rule in PICK: the lowest id that meets each slot. GREEN chooses nothing and substitutes nothing"
SUBJ=$(psql "${DATABASE_URL_DIRECT}" -X -q -At -v ON_ERROR_STOP=1 -c "begin read only" -c "set local row_security = off" -c "${PICK}" | tail -1)
[ -n "${SUBJ}" ] || { echo "STOP: a MISSING SUBJECT. No live patient furnishes T1, T2 and T3 by the rule in PICK. Nothing was applied. Report it; never pick by hand"; exit 1; }
echo "${SUBJ}" | grep -qxE "${U}[|]${U}[|]${U}[|]${U}[|](ai|noai)" || { echo "STOP: the pick did not read as one patient, three staff ids and a shape"; exit 1; }
PATIENT=$(echo "${SUBJ}" | cut -d'|' -f1)
T1=$(echo "${SUBJ}" | cut -d'|' -f2)
T2=$(echo "${SUBJ}" | cut -d'|' -f3)
T3=$(echo "${SUBJ}" | cut -d'|' -f4)
SHAPE=$(echo "${SUBJ}" | cut -d'|' -f5)
echo "${SUBJ}" > /tmp/0099-subjects.new
echo "subjects picked: T1 ${T1}, T2 ${T2}, T3 ${T3}, shape ${SHAPE}, and one patient (used, never printed)"
XACTORS="${T1} ${T2} ${T3} "

echo "--- the behaviour check BEFORE the apply, subjects-only. READ ONLY. The subjects and the instrument must hold; no write arm is printed"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v subjects_only=on -v patient_id=${PATIENT} -v t1_id=${T1} -v t2_id=${T2} -v t3_id=${T3} -f scripts/db/behaviour-registo-writes-readonly.sql 2>&1 | tee /tmp/0099-behaviour-before.new
grep -qE '^[[:space:]]*99[[:space:]]*\|' /tmp/0099-behaviour-before.new || { echo "STOP: the behaviour check printed no SUMMARY row before the apply"; exit 1; }
ACTORS=$(grep -E '^ACTOR id ' /tmp/0099-behaviour-before.new | awk '{print $3}' | tr '\n' ' ' || true)
[ "${ACTORS}" = "${XACTORS}" ] || { echo "STOP: the ACTOR lines must name the picked actors in slot order, once each [${XACTORS}]. They named [${ACTORS}]"; exit 1; }
SUBJOK=$(grep -cE '^[[:space:]]*[0-5][[:space:]]*\|[[:space:]]*(0|S0|S1|S2|S3|I1)\. .*\|[[:space:]]*OK[[:space:]]*$' /tmp/0099-behaviour-before.new || true)
[ "${SUBJOK}" = 6 ] || { echo "STOP: before the apply arm 0, S0 to S3 and I1 must each read OK. ${SUBJOK} of 6 did. A subject is not what its slot says. Nothing was applied"; exit 1; }
PROFILE=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0099-behaviour-before.new | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
[ "${PROFILE}" = "6 OK / 0 VACUOUS / 0 FAIL" ] || { echo "STOP: before the apply the subjects-only profile must read 6 OK / 0 VACUOUS / 0 FAIL. It read ${PROFILE}"; exit 1; }
echo "the subjects and the instrument hold: ${PROFILE}"

echo "--- only now, with a passing pre-check, a full pick and the subjects proven, does the previous sitting's state go"
rm -f /tmp/0099-postcheck.out /tmp/0099-behaviour-after.out /tmp/0099-applied.ok /tmp/0099-subjects.out
mv /tmp/0099-precheck.new /tmp/0099-precheck.out
mv /tmp/0099-subjects.new /tmp/0099-subjects.out
mv /tmp/0099-behaviour-before.new /tmp/0099-behaviour-before.out

echo "--- the apply. It is the only writing command in this document"
node packages/db/scripts/verified-migrate.mjs --tag 0099_clinical_records_write_matrix --sha256 ${SHA0099} --expect-pending 1
touch /tmp/0099-applied.ok
)
```

**EXPECT, and these are what stage 1 is read for:**

- **the clock line and `active clinics open now by their own hours: 0 of <n>`**, `n` at
  least 1. A zero with no clinic behind it would be vacuous, so the block requires both;
- **the pre-check prints `19` OK verdicts and no FAIL**, with `journal_rows_before` 96 and arm
  10 naming 0098's sha256 and `when` as the line above it printed them;
- **`draft profile (Q3): ai pending <n>, ai in review 0, other 0, author cannot write 0`**.
  Anything else STOPs before the pick, with nothing applied (Q3);
- **`subjects picked: T1 <id>, T2 <id>, T3 <id>, shape <ai or noai>`**, and no patient id
  anywhere;
- **the behaviour check BEFORE, subjects-only: `6 OK / 0 VACUOUS / 0 FAIL`**, with arm 0, S0
  to S3 and I1 each OK and the three ACTOR lines naming the picked actors. It prints no write
  arm. A FAIL on any of the six halts the block with nothing applied;
- **`pending    1  [0099_clinical_records_write_matrix]`.** Exactly one.

It then prints `journal    96 -> 97  (delta 1)` and
`0099_clinical_records_write_matrix present by sha256: yes`. Stage 2 re-reads both from the
database rather than trusting this line.

`verified-migrate.mjs` exits **2** on a bad invocation or a missing environment variable;
**3** BEFORE drizzle runs on a missing file, a wrong sha256, a tag missing from
`_journal.json`, an already-applied migration or a pending count that is not 1, and AFTER
drizzle has run on a journal that moved by the wrong amount or moved without the approved
sha256; **4** if drizzle itself failed or on any thrown error; **5** if drizzle reports
success and the journal did not move. **If stage 1 ended non-zero after the
`drizzle-kit migrate` banner had printed, do not paste stage 1 again.** Run, READ ONLY,
`cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply && node --env-file=/Users/ivan/osteojp-secrets/new-prod.env packages/db/scripts/read-applied-migrations.mjs`.
If it lists 0099 as APPLIED, production is applied and no marker exists, so stage 2 will
refuse: stop and ask the owner to rule. If it lists 0099 as NOT APPLIED, nothing changed:
drizzle applies the file's statements and the journal row in ONE transaction. 0099 is eight
statements, each ended by `--> statement-breakpoint`, the last one included. Stop and report
the exit code and the drizzle output. Do not re-run stage 1 on your own.

## STAGE 2: post-check, carries derived from stage 1

```
(
set -eo pipefail
SHA0099=076481bf1599975e3b1bc25b4f9363901c2c7269df32ec2ef781cb19ba1dc318
SHAPOST=6fc232fd81e88b444a48877b0d6e4f7b8c754f0d4bb000f30c8989c1e2ca81cc
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
BRANCH=db/0099-registo-write-matrix
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
test -f packages/db/migrations/0099_clinical_records_write_matrix.sql || { echo "STOP: 0099 is not on disk"; exit 1; }
test -f scripts/db/postcheck-0099-registo-writes.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0099_clinical_records_write_matrix.sql | cut -d' ' -f1)" = "${SHA0099}" ] || { echo "STOP: 0099 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0099-registo-writes.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0099-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not complete an apply in this sitting"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0099-precheck.out || { echo "STOP: stage 1's transcript is missing; re-run stage 1"; exit 1; }
[ -n "$(find /tmp/0099-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0099-precheck.out; }
J=$(carry journal_rows_before)
P=$(carry policies_before)
O=$(carry other_policies_md5)
F=$(carry functions_md5)
G=$(carry grants_md5)
[ -n "${J}" ] && [ -n "${P}" ] && [ -n "${O}" ] && [ -n "${F}" ] && [ -n "${G}" ] || { echo "STOP: a carry did not parse out of the transcript"; exit 1; }
[ "${J}" = 96 ] || { echo "STOP: the carried journal_rows_before reads ${J}, not 96"; exit 1; }
echo "carries from this run: journal_before=${J} policies_before=${P} other_policies_md5=${O} functions_md5=${F} grants_md5=${G}"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0099-postcheck.out
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v policies_before="${P}" -v other_policies_md5="${O}" -v functions_md5="${F}" -v grants_md5="${G}" -v journal_rows_before="${J}" -c "begin read only" -f scripts/db/postcheck-0099-registo-writes.sql -c "rollback" 2>&1 | tee /tmp/0099-postcheck.out
N1112=$(grep -cE '^[[:space:]]*1[12]\. .*\|[[:space:]]*OK[[:space:]]*$' /tmp/0099-postcheck.out || true)
[ "${N1112}" = 2 ] || { echo "STOP: post-check 11 or 12 is not OK: the claim function's security, owner, body or EXECUTE is not what 0099 writes. Do NOT run stage 3. Report to the owner now"; exit 1; }
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0099-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0099-postcheck.out || true)
[ "${OKS}" = 15 ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not 15"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0099 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations")
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0099}'")
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0099 is in the journal ${HN} times, not once"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0099 present by hash"

echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;"

echo "0099 APPLIED. 19/19 pre-check OK, 15/15 post-check OK, journal ${J} to ${JA}."
)
```

**EXPECT:** the carry line reads `journal_before=96`; the post-check prints `15` OK verdicts
and no FAIL, 11 and 12 among them; the journal reads `96` before and `97` after, with 0099's
sha256 in it **exactly once**; the final line reads exactly
`0099 APPLIED. 19/19 pre-check OK, 15/15 post-check OK, journal 96 to 97.`

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
SHABEHAVIOUR=99c1910ec66fe8ffeecb2c3ceadb80905881556743d7646fbd895effd1a27a61
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
BRANCH=db/0099-registo-write-matrix
PR=NOT-YET-OPENED
U='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

echo "${PR}" | grep -qE '^[0-9]+$' || { echo "STOP: PR is still a placeholder. This document is not issued for a sitting"; exit 1; }

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
if git rev-parse -q --verify refs/remotes/origin/${BRANCH} > /dev/null; then PIN=$(git rev-parse refs/remotes/origin/${BRANCH}); else echo "the branch is gone from origin: reading the head of PR ${PR}"; git fetch -q origin refs/pull/${PR}/head; PIN=$(git rev-parse FETCH_HEAD); fi
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
echo "checking from ${PIN}"
git checkout -q --detach ${PIN}
test -f scripts/db/behaviour-registo-writes-readonly.sql || { echo "STOP: the behaviour check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-registo-writes-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- the subjects are stage 1's, read back and never picked again"
test -f /tmp/0099-behaviour-before.out || { echo "STOP: stage 1's BEFORE transcript is missing, so there is nothing to compare against"; exit 1; }
test -f /tmp/0099-subjects.out || { echo "STOP: stage 1's subjects file is missing. Never pick again after the apply: report it"; exit 1; }
[ "$(wc -l < /tmp/0099-subjects.out | tr -d ' ')" = 1 ] || { echo "STOP: the subjects file must hold exactly one line"; exit 1; }
SUBJ=$(head -1 /tmp/0099-subjects.out)
echo "${SUBJ}" | grep -qxE "${U}[|]${U}[|]${U}[|]${U}[|](ai|noai)" || { echo "STOP: the subjects file does not read as one patient, three staff ids and a shape"; exit 1; }
PATIENT=$(echo "${SUBJ}" | cut -d'|' -f1)
T1=$(echo "${SUBJ}" | cut -d'|' -f2)
T2=$(echo "${SUBJ}" | cut -d'|' -f3)
T3=$(echo "${SUBJ}" | cut -d'|' -f4)
SHAPE=$(echo "${SUBJ}" | cut -d'|' -f5)
XBEFORE="6 OK / 0 VACUOUS / 0 FAIL"
if [ "${SHAPE}" = ai ]; then XAFTER="20 OK / 0 VACUOUS / 0 FAIL"; XVAC=""; else XAFTER="19 OK / 1 VACUOUS / 0 FAIL"; XVAC="A1 "; fi
XACTORS="${T1} ${T2} ${T3} "
BACTORS=$(grep -E '^ACTOR id ' /tmp/0099-behaviour-before.out | awk '{print $3}' | tr '\n' ' ' || true)
[ "${BACTORS}" = "${XACTORS}" ] || { echo "STOP: stage 1's BEFORE transcript and its subjects file do not name the same actors [${BACTORS}] [${XACTORS}]"; exit 1; }
echo "subjects from stage 1: T1 ${T1}, T2 ${T2}, T3 ${T3}, shape ${SHAPE}, and one patient (used, never printed)"

echo "--- the crash guard: stage 2's post-check of this sitting, 15 OK with 11 and 12 among them, before any session acts as authenticated"
test -f /tmp/0099-postcheck.out || { echo "STOP: stage 2's post-check transcript is missing. Run stage 2 first"; exit 1; }
[ /tmp/0099-postcheck.out -nt /tmp/0099-behaviour-before.out ] || { echo "STOP: the post-check transcript is older than stage 1's BEFORE run, so it is not this sitting's"; exit 1; }
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0099-postcheck.out && { echo "STOP: stage 2's post-check read FAIL. Do not run the behaviour check"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0099-postcheck.out || true)
[ "${OKS}" = 15 ] || { echo "STOP: stage 2's post-check printed ${OKS} OK verdicts, not 15"; exit 1; }
N1112=$(grep -cE '^[[:space:]]*1[12]\. .*\|[[:space:]]*OK[[:space:]]*$' /tmp/0099-postcheck.out || true)
[ "${N1112}" = 2 ] || { echo "STOP: post-check 11 and 12 are not both OK. Do not run the behaviour check"; exit 1; }

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs
rm -f /tmp/0099-behaviour-after.out
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v patient_id=${PATIENT} -v t1_id=${T1} -v t2_id=${T2} -v t3_id=${T3} -f scripts/db/behaviour-registo-writes-readonly.sql 2>&1 | tee /tmp/0099-behaviour-after.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0099-behaviour-after.out && { echo "STOP: a behaviour verdict read FAIL after the apply"; exit 1; }
grep -qE '^[[:space:]]*99[[:space:]]*\|' /tmp/0099-behaviour-after.out || { echo "STOP: the behaviour check printed no SUMMARY row, so the transcript is truncated"; exit 1; }
ACTORS=$(grep -E '^ACTOR id ' /tmp/0099-behaviour-after.out | awk '{print $3}' | tr '\n' ' ' || true)
[ "${ACTORS}" = "${XACTORS}" ] || { echo "STOP: the ACTOR lines must name stage 1's actors in slot order, once each [${XACTORS}]. They named [${ACTORS}]"; exit 1; }
VACSET=$(grep -E '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0099-behaviour-after.out | sed -E 's/^[[:space:]]*[0-9]+[[:space:]]*\|[[:space:]]*([A-Z0-9]+)\..*/\1/' | LC_ALL=C sort | tr '\n' ' ' || true)
[ "${VACSET}" = "${XVAC}" ] || { echo "STOP: after the apply the VACUOUS arms must be exactly [${XVAC}]. They were [${VACSET}]"; exit 1; }
BEFORE=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0099-behaviour-before.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
AFTER=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0099-behaviour-after.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
[ "${BEFORE}" = "${XBEFORE}" ] || { echo "STOP: stage 1's subjects-only BEFORE transcript does not read ${XBEFORE}. It read ${BEFORE}"; exit 1; }
[ "${AFTER}" = "${XAFTER}" ] || { echo "STOP: after the apply the profile must read ${XAFTER}. It read ${AFTER}"; exit 1; }
echo "0099 BEHAVES AS RULED AT THE RLS LAYER. subjects before ${BEFORE}, every arm after ${AFTER}. The writes in action are proven by the rehearsal, not by this READ ONLY transcript."
)
```

**EXPECT: no FAIL, a SUMMARY row, the ACTOR lines naming stage 1's actors, and the profile
EXACTLY `20 OK / 0 VACUOUS / 0 FAIL` with shape `ai`, or `19 OK / 1 VACUOUS / 0 FAIL` with
VACUOUS on exactly `A1` with shape `noai`**, which the block asserts, with stage 1's
subjects-only transcript reading `6 OK / 0 VACUOUS / 0 FAIL`. The final line reads `0099
BEHAVES AS RULED AT THE RLS LAYER. subjects before 6 OK / 0 VACUOUS / 0 FAIL, every arm after
<AFTER>. ...`.

**If stage 3 STOPs, production is already applied.** Do not re-run stage 1, do not pick
again, and do not substitute a subject: report the transcript to the owner.

## What every verdict must read

**Pre-check, 19 rows, all `OK`** (`scripts/db/precheck-0099-registo-writes.sql`):

- 0 the transaction is READ ONLY;
- 1 `clinical_records_insert` is `FOR INSERT`, PERMISSIVE, `TO authenticated`, WITH CHECK md5
  `a8e4b05ed583e82dbb0b136d5ff4a627` (0045's expression);
- 2 `clinical_records_update`, `FOR UPDATE`, USING and WITH CHECK the same md5;
- 3 `clinical_records_delete`, `FOR DELETE`, USING the same md5;
- 4 the two read policies (`clinical_records_select` as 0098 leaves it,
  `clinical_records_patient_selfscope` as 0010 does), one md5
  `ae6ad9a7c3ee236acebd22c1c952afe4`, five policies in all, none RESTRICTIVE;
- 5 the immutability trigger, the only one: `clinical_records_enforce_immutability type=27
  enabled=O cols=all when=none fn=enforce_clinical_record_immutability
  f0691f60a12af6eeb561ce369c18f0d5`;
- 6 `clinical_therapist_sees_patient`: `DEFINER/s/search_path=public/postgres/exec
  9d9e8a5a8ee79ce1c1fe04830d7c9186`;
- 7 row level security ENABLED on `clinical_records`;
- 8 0099 absent from the journal by hash; 9 0093 present by hash;
- 10 the newest journal row is 0098's, by hash and `when`, with no tie at that `when`;
- `journal_rows_before` **96**; `policies_before` (the rehearsal read **100**);
  `other_policies_md5` (rehearsal `7693cc6b289ba2737ec5be5d866345fb`); `functions_md5`
  (rehearsal `34184e4d99739692a0a1e019fd7e5094`); `grants_md5` (rehearsal
  `019553539e5e8eaa76f8601fca2f93d3`); `draft_profile` (the rehearsal fixture read
  `ai pending 1, ai in review 1, other 0, author cannot write 1`, the last being a draft
  recorded in the admin's name, while the draft in the owner's name is not counted; the bare
  base `ai pending 0, ai in review 0, other 0, author cannot write 0`). Only the first is
  asserted as a number; the next four are carried, and production's values are whatever this
  sitting reads; the last is Q3's, and stage 1 asserts its shape;
- 11 `public.jwt_tenant_id`, `public.jwt_role` and `auth.uid` exist;
- 12 no function in `public` is called `claim_ai_draft_authorship`.

**Post-check, 15 rows, all `OK`** (`scripts/db/postcheck-0099-registo-writes.sql`):

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
14. 0099 is in the journal by hash, it is the newest row, and the journal moved by exactly
    one;
15. no policy in the database names the claim function.

With 9 and 11 together, the SECURITY DEFINER count in `public` moved by exactly one.

**Behaviour check, 20 arms** (`scripts/db/behaviour-registo-writes-readonly.sql`), as the
C14 rehearsal read them with 0099 applied, on its synthetic fixture (shape `ai`); production's
observed counts differ, the verdicts must not. Before the apply only the first six run
(`-v subjects_only=on`), and read OK.

| Arm | What it proves | With 0099 |
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
| The app writers verified; the claim, the queue filter, the 0-row codes, the filing refusals and the record page's controls | **NOT DISCHARGED BY THIS DOCUMENT.** They ship when the PR merges (or first, under Q2 (b)); measured on the rehearsal below and by the app's unit tests | the route, and the test database |
| The behaviour check with T1, T2, T3, ACTOR, VACUOUS contract | this sitting, stages 1 and 3 | RLS |

**The md5 pins depend on how the session renders an expression.** The pre-check's and the
post-check's expression md5s compare `pg_get_expr(...)`, which prints `jwt_tenant_id()`
without its schema only when `public` is on the session's `search_path`. The expected values
were read on a rehearsal database built from main's 91 migrations and the held 0094 to 0098.
If production rendered differently, pre-check arms 1 to 4 would FAIL and stage 1 would halt
**before** the apply, which is the safe direction. The READ ONLY pre-check before issue is the
evidence that production renders the same way.

## Measured on production, READ ONLY

**NOT YET MEASURED.** This lane had no production access, by its dispatch. Before the document
is issued, and never as part of a sitting, the pre-check and the pick of stage 1 are run READ
ONLY against production by GREEN, and this section records: the 19 verdicts; the carries; the
`draft_profile` (Q3); and whether the pick finds a P, with which shape. No patient id is
recorded here.

## Rehearsed on 2026-09-27 (C14) on a throwaway, synthetic data only

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
