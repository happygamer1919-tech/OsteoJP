# migrations-pending

**Authored migrations that have not been given a number yet.**

Nothing in this directory can be applied. `drizzle-kit migrate` reads
`packages/db/migrations` and its journal; this is a sibling directory, so a file
here is invisible to the applier by construction rather than by discipline.

## Why it exists

`scripts/check-journal.mjs` requires every `.sql` in `packages/db/migrations` to
have a matching `meta/_journal.json` entry, and requires the journal's `idx`
order to match the numeric filename order. Both are correct and neither can be
relaxed: they exist because the journal and the files drifted once (INC-07) and
because a backwards `when` makes drizzle skip a migration in silence.

So a migration that is written but whose NUMBER is not yet decidable has nowhere
to live inside `migrations/`. Taking a number early is the alternative and it is
worse: two branches take the same number, one merges, and the other is applied
under a tag the journal already claims.

## The rule

A file here is named `NEXT-AFTER-<NNNN>_<slug>.sql`, where `<NNNN>` is the
migration it must follow. It carries no number of its own.

**To promote one:** rename it to `<NNNN+1>_<slug>.sql`, move it into
`packages/db/migrations/`, add its journal entry, mirror it into
`supabase/migrations/`, and run `pnpm db:check-journal`. The rename is the only
edit; the body is already final.

## What is here now

| file | must follow | authored | held on |
|---|---|---|---|

**THE `NEXT-AFTER-0089` CONTENTION IS RESOLVED, and this is how it ended.** Two files
claimed `NEXT-AFTER-0089`, which is the situation this directory exists for. NESA-NAMES
was promoted first, by the B8 dispatch's ordering, and took **`0090`**.
`NEXT-AFTER-0089_care_team.sql` was promoted second, on
`care/CARE-01-assigned-therapists` (PR #1374), and took **`0091`** — see the Promoted
table below. Those two promotions emptied the table above. The `0094` file was parked
there later and has since been promoted too, and so has the `0095` conflict-check file (see the
Promoted table), so the table is empty again on `main`. The four held files of the queue below
live on their held branches, not on `main`, until each is promoted. CARE-02a was promoted as
`0096` on #1471, applied on 2026-09-30 and merged. The registo write file was promoted as
`0097` on #1475 and the staging index as `0098` on #1469, both applied on 2026-10-01 and
merged. The grants revoke was promoted as `0099` on #1397 (see the Promoted table), applied on
2026-10-01 and merged. On the branch `db/0100-maintain-revoke` (#1520) the MAINTAIN revoke is
promoted as `0100` (see the Promoted table), so the table above is empty here too. `0100` was applied on
2026-10-03 and merged; on the branch `db/0101-guest-request-email` (#1538) the optional email on a public booking
request is promoted as `0101` (see the Promoted table), so the table above is empty there too. `0101` was applied on
2026-10-05 and merged; on the branch `db/0102-sat01-tables` (#1551) SAT-01's migration is promoted as `0102`
(see the Promoted table), so the table above is empty here too. Other branches hold their own pending files, which this table does not
list: it is only accurate for the branch you read it on.

**THE RULED QUEUE, RE-RULED BY THE OWNER AND THE LEAD ON 2026-09-30 (the fifth time).**
It is **`0090` NESA names · `0091` CARE-01 · `0092` CARE-LOC · `0093` RGPD-01 · `0094`
the users/tenants role fix · `0095` the conflict check's patient name (all six applied
and merged) · `0096` CARE-02a (#1471, applied 2026-09-30 and merged; was `0098`) · `0097` the registo write
policies (#1475, promoted on its branch, held for the apply; was `0099`) · `0098` the staging index (#1469, held; was `0097`) ·
`0099` the grants revoke (#1397, held; was `0096`) · `0100` onward SAT-01**. From this
ruling on, **apply order equals file order**: the lead rules an apply order only in number
order or after a renumber, because `scripts/check-journal.mjs` rule 3 requires the
journal's `idx` order to match the numeric file order, and the apply order ruled on
2026-09-29 (`0098, 0099, 0097, 0096` under the old numbers) would have broken it at the
first promotion. The binding table is in `CLAUDE.md` under "SOLO's record".

**Re-ruled 2026-10-01 (strategy S-1001-A R2), after `0096` to `0099` were all applied:** "Numbering: this is 0100 (catalog-only pilot of the SET LOCAL gate). SAT-01 becomes 0101, the episode-policy item 0102." The queue above is the 2026-09-30 ruling as it was written; read its "`0100` onward SAT-01" as `0101` onward.

**Re-ruled 2026-10-04 (strategy S-1004-A R41):** "0101 = public-form email column ... SAT-01 becomes 0102." So read "SAT-01 becomes 0101" above as superseded: `0101` is the optional email on a public booking request (#1538), and SAT-01 is `0102`, pending after it. `CLAUDE.md`'s table and the board still read `0101` for SAT-01 until their own pull requests record R41.

A pending file's `NEXT-AFTER-` name follows this queue. Named as they will be on their
held branches:

| file | must follow | becomes | held on |
|---|---|---|---|
| `NEXT-AFTER-0095_care02a_care_team_reads.sql` | `0095` | `0096` | #1471 |
| `NEXT-AFTER-0096_clinical_records_write_matrix.sql` | `0096` | `0097` | #1475 |
| `NEXT-AFTER-0097_migration_staging_imported_entity_idx.sql` | `0097` | `0098` | #1469 |
| `NEXT-AFTER-0098_revoke_truncate_trigger_references.sql` | `0098` | `0099` | #1397 |

Before this ruling the same four files were named `NEXT-AFTER-0097_care02a_care_team_reads.sql`,
`NEXT-AFTER-0098_clinical_records_write_matrix.sql`,
`NEXT-AFTER-0096_migration_staging_imported_entity_idx.sql` and
`NEXT-AFTER-0095_revoke_truncate_trigger_references.sql`. Those names are superseded, not
typos; a branch still carrying one is renamed on that branch, with no other edit.

**A FILE'S HEADER COMMENT MAY STILL NAME ITS OLD NUMBER, AND THAT IS ON PURPOSE.** A
rename changes no byte of the file. CARE-02a's header reads "RULED NUMBER 0098", the
registo write policies' header reads "RULED NUMBER 0099" and the staging index's header
reads "RULED NUMBER 0097", and each names the predecessor and the queue of its day. They
keep saying so after the rename and after the promotion. The file is never edited to
match, because its sha256 is what every pin points at (the apply document, its sidecar,
and any pre-check that pins it as a literal). Read the header as a record of when the
file was authored, and this README and the table in `CLAUDE.md` for where it sits now.

The 2026-09-27 queue, superseded: `0095` the conflict check's patient name · `0096` the
grants revoke (#1397) · `0097` the staging index · `0098` CARE-02a · `0099` the registo
write fix.

The 2026-09-27 queue, superseded: `0096` the grants revoke (#1397) · `0097` the staging
index · `0098` CARE-02a · `0099` the registo write fix. The 2026-09-22 queue, superseded:
`0094` the users/tenants role fix · `0095` the grants revoke (#1397) · `0096` the conflict
check's patient name.

**THIS IS THE SECOND RENUMBERING OF THAT QUEUE, and the earlier ones were real.**
The order first recorded here was 0090 NESA, 0091 care-team, 0092 RGPD-01,
0093 TRUNCATE revoke. On 2026-09-20 the owner ruled the users/tenants/roles policy
split into Tier C at `0091` and pushed the other three down a slot, which made
care-team `0092`; the three held PR descriptions were updated to that order the same
day. On 2026-09-21 he re-ruled it to the queue above. Each of those was binding while
it stood, so a PR description, comment or note still naming `0092` for care-team is
**superseded, not a typo**, and is corrected rather than argued with. The binding
table lives in `CLAUDE.md` under "SOLO's record"; read it, not a number remembered
from a branch name.

**ONE MIGRATION IS IN FLIGHT AT A TIME.** `0097` is not promoted until `0096` is
applied to production and merged, `0098` not until `0097` is, and `0099` not until
`0098` is. `0096`'s sitting kept its documented order: promote, apply, the count
GATE-CHANGE (26 to 27), main into #1471, then #1471 merges. `0097`'s keeps the same order:
promote, apply from #1475's held head, the count GATE-CHANGE (27 to 28), main into #1475,
then #1475 merges.

Other branches hold their own pending files that are not listed here, because this
table is only accurate for the branch you are reading it on.

## Promoted

| was | became | on |
|---|---|---|
| `NEXT-AFTER-0085_nesa_shared_resource.sql` | `packages/db/migrations/0086_nesa_shared_resource.sql`, bytes unchanged (sha256 `d3eb9e41dff3f7ba6ccd0c250baf76198e60e884733e06043fcd9518bbac8d99`), journal `when 1788001200000` | 2026-09-11, branch `db/0086-nesa-shared-resource`. Applied after 0085, from `docs/migration-apply-0086.md` |
| `NEXT-AFTER-0088_attachments_soft_delete.sql` | `packages/db/migrations/0089_attachments_soft_delete.sql`, bytes unchanged (sha256 `ec1b90634b4253e50fe1060b03b22a0b2fe447136baaaa811dba819d7c084ced`), journal `idx 86`, `when 1788301200000` | 2026-09-16, branch `patients/SR62-PU4-documentos-soft-delete`. Applied after 0088, from `docs/migration-apply-0089.md` |
| `NEXT-AFTER-0089_nesa_patient_name_for_therapists.sql` | `packages/db/migrations/0090_nesa_patient_name_for_therapists.sql`, bytes unchanged (sha256 `cbff20cb90f5bb27b607055a4bf46d4b7ed5992aebe1c894d0fe559868b5c642`), journal `idx 87`, `when 1788401200000` | 2026-09-18, branch `sched/B8-nesa-names-to-therapists`. Promoted after #1338 put 0089 on main; applied to production from `docs/migration-apply-0090.md` (production journal id 88), merged in #1390 on 2026-09-21 |
| `NEXT-AFTER-0089_care_team.sql` | `packages/db/migrations/0091_care_team.sql`, bytes unchanged (sha256 `bd207cdc8c39099ac213f087e42fbd7cc332158590c5248dcbfe3928bf5a972f`), journal `idx 88`, `when 1788501200000` | 2026-09-21, branch `care/CARE-01-assigned-therapists` (PR #1374). Promoted after 0090 was applied and merged, under the owner's re-ruling of 2026-09-21 that put CARE-01 at `0091`; **authored, NOT yet applied** — the apply runs from `docs/migration-apply-0091.md`, which is staged in **this same commit** together with its sha256 sidecar and the three pinned check scripts. **The promoted file's own header still reads "NO NUMBER YET, BY CONSTRUCTION" and says it must follow an unapplied 0089.** That sentence is stale, and it is left stale on purpose: a promotion moves the file and does not touch one byte of it, which is the only reason the sha256 in this row can pin anything. Read the header as a record of when the file was authored, and this table for where it now sits. |
| `NEXT-AFTER-0089_patient_rgpd_acceptances.sql` | `packages/db/migrations/0093_patient_rgpd_acceptances.sql`, bytes unchanged (sha256 `7a769298c43f982cdc27dc71cbec403a53861dbfc2c24b72c62c2203d370c454`), journal `idx 90`, `when 1788501400000` | 2026-09-23, branch `patients/RGPD-01-consent-at-creation` (PR #1399). Promoted after 0092 was applied and merged, under the owner's ruling of 2026-09-22 that put RGPD-01 at `0093`; **authored, NOT yet applied**. The apply runs from `docs/migration-apply-0093.md`, staged in the same commit with its sha256 sidecar and the three pinned check scripts, and it replaces `docs/migration-apply-RGPD-01.md`. **The promoted file's own header still reads "PARKED, NOT NUMBERED".** Stale on purpose, for the same reason as 0091's row above. |
| `NEXT-AFTER-0093_users_tenants_roles_policy_split.sql` | `packages/db/migrations/0094_users_tenants_roles_policy_split.sql`, bytes unchanged (sha256 `439cb53eab62803026a74e1148dbe3f5af1b7f95f0fc8e486d55eb7d62836a6c`), journal `idx 91`, `when 1788501500000` | 2026-09-28, branch `db/0094-users-tenants-role-policy-split-r6` (PR #1459). Promoted after 0093 was applied and merged, under the owner's ruling of 2026-09-22 that put the users/tenants role fix at `0094`; **authored, NOT yet applied**. By the owner's ruling of 2026-09-27 the PR merges first and GREEN applies it from `origin/main`, from `docs/migration-apply-0094.md`, which is not part of this promotion commit. The pre-check pins this sha256 as a literal (`scripts/db/precheck-users-tenants-roles.sql`, verdict 10), so it needed no edit. **The promoted file's own header still reads "NO NUMBER IN THIS FILE NAME YET, BY CONSTRUCTION".** Stale on purpose, for the same reason as 0091's row above. |
| `NEXT-AFTER-0094_conflict_name_visibility.sql` | `packages/db/migrations/0095_conflict_name_visibility.sql`, bytes unchanged (sha256 `cfdfffff71a6c847a791ce17c71bbc6e05b75a367e9c8f03dfcb0cfc638f5806`), journal `idx 92`, `when 1788501600000` | 2026-09-29, branch `sched/0096-conflict-names-follow-caller-reads` (PR #1438). Promoted after 0094 was applied (2026-09-29 00:27 Lisbon, journal 92) and merged, under the owner's ruling of 2026-09-27 that put the conflict check at `0095`; **authored, NOT yet applied**. The PR merges first and GREEN applies it from `origin/main`. |
| `NEXT-AFTER-0097_care02a_care_team_reads.sql` | `packages/db/migrations/0096_care02a_care_team_reads.sql`, bytes unchanged (sha256 `fbf8cad1dc959a600b0e8b3ccffb7225e2295919e5dfe08432301faf6b5e9c45`), journal `idx 93`, `when 1788501700000` | 2026-09-30, branch `care/0098-CARE-02a-care-team-reads` (PR #1471; the branch keeps its old number). Promoted after 0095 was applied (journal 93) and merged, under the owner's and the lead's fifth renumbering of 2026-09-30 that put CARE-02a at `0096`; **authored, NOT yet applied**. By that ruling GREEN applies it from #1471's HELD head, before #1471 merges, from `docs/migration-apply-0096.md` (staged in the same commit, with its sidecar and the three check scripts renamed to `0096`); then the owner merges the SECURITY DEFINER count's GATE-CHANGE (26 to 27), main is merged into #1471, and #1471 merges. **The promoted file's own header still reads "RULED NUMBER 0098" and "MUST FOLLOW 0097", and cites the 2026-09-27 queue, and the helper's `COMMENT ON FUNCTION` text, which production will carry, begins "CARE-02a (0098)".** Stale on purpose, for the same reason as 0091's row above: a promotion changes no byte, and the sha256 in this row is what every pin points at. |
| `NEXT-AFTER-0096_clinical_records_write_matrix.sql` | `packages/db/migrations/0097_clinical_records_write_matrix.sql`, bytes unchanged (sha256 `076481bf1599975e3b1bc25b4f9363901c2c7269df32ec2ef781cb19ba1dc318`), journal `idx 94`, `when 1788501800000` | 2026-09-30, branch `db/0099-registo-write-matrix` (PR #1475; the branch keeps its old name). Promoted after 0096 was applied (2026-09-30 16:08 Lisbon, journal 94) and merged (#1471), under the owner's and the lead's fifth renumbering of 2026-09-30 that put the registo write policies at `0097`; **authored, NOT yet applied**. By 0096's order GREEN applies it from #1475's HELD head, before #1475 merges, from `docs/migration-apply-0097.md`; then the owner merges the SECURITY DEFINER count's GATE-CHANGE (27 to 28), main is merged into #1475, and #1475 merges. Its app half, #1501, merged first. **The promoted file's own header still reads "RULED NUMBER 0099", "must follow 0098 (CARE-02a)" and Q4 open, and the function's `COMMENT ON FUNCTION` text, which production will carry, opens "0099".** Stale on purpose, for the same reason as 0091's row above. |
| `NEXT-AFTER-0097_migration_staging_imported_entity_idx.sql` | `packages/db/migrations/0098_migration_staging_imported_entity_idx.sql`, bytes unchanged (sha256 `198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0`), journal `idx 95`, `when 1788501900000` | 2026-10-01, branch `db/0097-staging-imported-entity-index` (PR #1469; the branch keeps its old number). Promoted after 0097 was applied (2026-10-01 16:31 Lisbon, journal 95) and merged (#1475), under the fifth renumbering that put the staging index at `0098`; **authored, NOT yet applied**. The PR merges first and GREEN applies it from `origin/main`, from `docs/migration-apply-0098.md`. |
| `NEXT-AFTER-0098_revoke_truncate_trigger_references.sql` | `packages/db/migrations/0099_revoke_truncate_trigger_references.sql`, bytes unchanged (sha256 `fbc5e5458bb6ec3be6a5f2aeb558638b53ce2c49d5d58eca3a576cd231b0163b`), journal `idx 96`, `when 1788502000000` | 2026-10-01, branch `sec/B10-revoke-truncate-trigger-references` (PR #1397). Promoted after 0098 was applied (2026-10-01 18:23 Lisbon, journal 96) and merged (#1469), option 1 as ruled; **authored, NOT yet applied**. The PR merges first and GREEN applies it from `origin/main`, from `docs/migration-apply-0099.md`. |
| `NEXT-AFTER-0099_revoke_maintain.sql` | `packages/db/migrations/0100_revoke_maintain.sql`, bytes unchanged (sha256 `80f85018e8ed35922ad546b8a28e96d80e894b04f2a1f09f201d00b601ff6106`), journal `idx 97`, `when 1788502100000` | 2026-10-02, branch `db/0100-maintain-revoke` (PR #1520). Promoted after 0099 was merged (#1397) and applied (2026-10-01 21:15 Lisbon, journal 97) and the guard pair (#1508, #1509) merged, under S-1001-A R2 that numbered it `0100`; **authored, NOT yet applied**. The PR merges first and GREEN applies it from `origin/main`, from `docs/migration-apply-0100.md`. **The promoted file's own header names no number of its own:** it calls 0099 "the migration before this one", quotes the ruling that names 0099, and says the SET LOCAL rule holds "from 0100", all still true after the rename, so nothing in it went stale. Had anything gone stale it would stay so, for the same reason as 0091's row above: a promotion changes no byte, and the sha256 in this row is what every pin points at. |
| `NEXT-AFTER-0100_guest_request_email.sql` | `packages/db/migrations/0101_guest_request_email.sql`, bytes unchanged (sha256 `36a1ed543133fea9b27b2449dcc1de62a50e41c4a29d80987dc8db0b4241cb5b`), journal `idx 98`, `when 1788502200000` | 2026-10-05, branch `db/0101-guest-request-email` (PR #1538, `held-for-apply`). Promoted after 0100 was applied (2026-10-03, journal 98) and merged (#1520), and after the GATE-CHANGE the promotion needed (#1537, the 0100 harness journal cut) merged, under S-1004-A R41 that numbered it `0101` ("SAT-01 becomes 0102"); **authored, NOT yet applied**. The PR merges first and GREEN applies it from `origin/main`, from `docs/migration-apply-0101.md`. The pre-check and the post-check pin this sha256 as a literal, so neither needed an edit. The drizzle schema column is NOT in this PR: it travels with the application PR, after the apply (the same document, section 3). **The promoted file's own header still reads "PENDING" and says it is "parked in packages/db/migrations-pending and carries no number of its own", and the pre-check's header (`scripts/db/precheck-0101-guest-request-email.sql`) still names the pending path.** Stale on purpose, for the same reason as 0091's row above: a promotion changes no byte, and the sha256 in this row is what every pin points at. |
| `NEXT-AFTER-0101_sat01_satisfaction_survey.sql` | `packages/db/migrations/0102_sat01_satisfaction_survey.sql`, bytes unchanged (sha256 `db12b967d4f67bfbfeaff5447cf5fa41ae74e007112a26f97b345e9e3fb7d9c1`), journal `idx 99`, `when 1788502300000` | 2026-10-06, branch `db/0102-sat01-tables` (PR #1551, `held-for-apply`). Promoted after 0101 was applied (2026-10-05, journal 99) and merged (#1538), and after the GATE-CHANGE the promotion needed (#1544, the cleanup test learns SAT-01's three tables) merged, under S-1004-A R41 that numbered it `0102`; **authored, NOT yet applied**. GREEN applies it from #1551's HELD head, before #1551 merges, from `docs/migration-apply-0102.md`; then the owner merges the SECURITY DEFINER count's GATE-CHANGE (28 to 36), main is merged into #1551, and #1551 merges. Until that GATE-CHANGE the pull request reads red on the count, by construction. The pre-check and the post-check pin this sha256 as a literal, so neither needed an edit. The same commit carries the three ordinary edits the promotion forces, none of them a gate file: the denied list of `packages/db/tests/security-definer-execute-acl.db.test.ts` gains two names, `scripts/import/cleanup-test-patients.sql` gains the three deletes, and `packages/db/src/schema.ts` declares the three tables. The `patients.survey_enabled` column is NOT declared in `schema.ts` in this commit. **The promoted file's own header still opens "PENDING" and says it "carries no number of its own", and the pre-check's header (`scripts/db/precheck-0102-sat01-tables.sql`) still names the pending path.** Stale on purpose, for the same reason as 0091's row above: a promotion changes no byte, and the sha256 in this row is what every pin points at. |
