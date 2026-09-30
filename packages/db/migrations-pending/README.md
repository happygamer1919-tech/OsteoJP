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
| `NEXT-AFTER-0098_revoke_truncate_trigger_references.sql` | `0098` (the staging index, #1469). Ruled **`0099`** by the owner on 2026-09-30 (the fifth renumbering; it was `0096`, after the conflict check, under the 2026-09-27 queue, `0095` under the 2026-09-22 queue, and held as `NEXT-AFTER-0095` until now). At promotion its journal `when` must be strictly greater than `0098`'s; its journal `idx` is set at promotion. The body names no number, so the rename left it byte-identical (sha256 `fbc5e5458bb6ec3be6a5f2aeb558638b53ce2c49d5d58eca3a576cd231b0163b`) | 2026-09-17 | `sec/B10-revoke-truncate-trigger-references` (#1397, a DRAFT), held until `0096`, `0097` and `0098` are promoted, applied and merged, in that order. It only removes three unused privileges from `authenticated`. Apply doc: `docs/migration-apply-revoke-truncate-trigger-references.md` |

**THE `NEXT-AFTER-0089` CONTENTION IS RESOLVED, and this is how it ended.** Two files
claimed `NEXT-AFTER-0089`, which is the situation this directory exists for. NESA-NAMES
was promoted first, by the B8 dispatch's ordering, and took **`0090`**.
`NEXT-AFTER-0089_care_team.sql` was promoted second, on
`care/CARE-01-assigned-therapists` (PR #1374), and took **`0091`** — see the Promoted
table below. Those two promotions emptied the table above. The `0094` file was parked
there later and has since been promoted too, and so has the `0095` conflict-check file (see the
Promoted table), so on main the table is empty again. On this branch it holds one row, the
grants revoke, parked later.

**THE RULED QUEUE, RE-RULED BY THE OWNER ON 2026-09-27 (the fourth time).** It is
**`0090` NESA names · `0091` CARE-01 · `0092` CARE-LOC · `0093` RGPD-01 (all four
applied and merged) · `0094` the users/tenants role fix (#1459, promoted, held for the apply) ·
`0095` the conflict check's patient name (#1438, held; was `0096`) · `0096` the grants revoke
(#1397, held; was `0095`) · `0097` the staging index (held) · `0098` CARE-02a (held) ·
`0099` the registo write fix · `0100` onward SAT-01**. A pending file's `NEXT-AFTER-`
name follows this queue: the conflict check follows `0094`, the grants revoke follows
`0095`. The binding table is in `CLAUDE.md` under "SOLO's record".

The 2026-09-22 queue, superseded: `0094` the users/tenants role fix · `0095` the grants
revoke (#1397) · `0096` the conflict check's patient name.

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

**ONE MIGRATION IS IN FLIGHT AT A TIME.** `0095` is not promoted until `0094` is
applied to production and merged.

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
