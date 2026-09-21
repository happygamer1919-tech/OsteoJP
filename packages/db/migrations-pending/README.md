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
| `NEXT-AFTER-0089_revoke_truncate_trigger_references.sql` | 0089 | 2026-09-17 | **last in the queue, deliberately.** It only removes three unused privileges from `authenticated`; the migrations that deliver a feature go first. Apply doc: `docs/migration-apply-revoke-truncate-trigger-references.md` |

Other branches hold their own pending files that are not listed here, because
this table is only accurate for the branch you are reading it on. `#1374` carries
one; `#1399` carries one.

**THE `NEXT-AFTER-0089` CONTENTION IS RESOLVED, and this is how it ended.** Several files
claimed `NEXT-AFTER-0089`, which is the situation this directory exists for. NESA-NAMES was
promoted first, by the B8 dispatch's ordering, and took **`0090`** - it is merged (#1390) and
applied on production, so `0089` is no longer the head and every file name here is historical.

**THE RULED QUEUE, as the owner renumbered it on 2026-09-20.** An earlier version of this
paragraph gave the order as 0091 care-team, 0092 RGPD-01, 0093 TRUNCATE revoke. That is one
slot out: the owner ruled a users/tenants/roles policy migration into Tier C at **`0091`** and
pushed the rest down.

| number | content | PR |
|---|---|---|
| `0090` | NESA patient name for therapists | #1390, **merged and applied** |
| `0091` | the users/tenants/roles policy split | not yet opened |
| `0092` | `NEXT-AFTER-0089_care_team.sql` (CARE-01) | #1374, held |
| `0093` | `NEXT-AFTER-0089_patient_rgpd_acceptances.sql` (RGPD-01) | #1399, held |
| `0094` | `NEXT-AFTER-0089_revoke_truncate_trigger_references.sql`, the row above | #1397, held |

The number is the apply authorisation, so take it from this table and never from a file name.

## Promoted

| was | became | on |
|---|---|---|
| `NEXT-AFTER-0085_nesa_shared_resource.sql` | `packages/db/migrations/0086_nesa_shared_resource.sql`, bytes unchanged (sha256 `d3eb9e41dff3f7ba6ccd0c250baf76198e60e884733e06043fcd9518bbac8d99`), journal `when 1788001200000` | 2026-09-11, branch `db/0086-nesa-shared-resource`. Applied after 0085, from `docs/migration-apply-0086.md` |
| `NEXT-AFTER-0088_attachments_soft_delete.sql` | `packages/db/migrations/0089_attachments_soft_delete.sql`, bytes unchanged (sha256 `ec1b90634b4253e50fe1060b03b22a0b2fe447136baaaa811dba819d7c084ced`), journal `idx 86`, `when 1788301200000` | 2026-09-16, branch `patients/SR62-PU4-documentos-soft-delete`. Applied after 0088, from `docs/migration-apply-0089.md` |
| `NEXT-AFTER-0089_nesa_patient_name_for_therapists.sql` | `packages/db/migrations/0090_nesa_patient_name_for_therapists.sql`, bytes unchanged (sha256 `cbff20cb90f5bb27b607055a4bf46d4b7ed5992aebe1c894d0fe559868b5c642`), journal `idx 87`, `when 1788401200000` | 2026-09-18, branch `sched/B8-nesa-names-to-therapists`. Promoted after #1338 put 0089 on main; **authored, NOT yet applied** — the apply runs from `docs/migration-apply-0090.md` |
