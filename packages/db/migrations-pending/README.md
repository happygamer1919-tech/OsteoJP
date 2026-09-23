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
| `NEXT-AFTER-0095_conflict_name_visibility.sql` | `0095` (the grants revoke). Ruled **`0096`** by the owner on 2026-09-22: the conflict check returns a patient's name only where the caller's own reads would show it. At promotion its journal `when` must be strictly greater than `0095`'s | 2026-09-22 | `sched/0096-conflict-name-visibility`, Tier C, held until `0093` to `0095` are promoted, applied and merged |

**THE `NEXT-AFTER-0089` CONTENTION IS RESOLVED, and this is how it ended.** Two files
claimed `NEXT-AFTER-0089`, which is the situation this directory exists for. NESA-NAMES
was promoted first, by the B8 dispatch's ordering, and took **`0090`**.
`NEXT-AFTER-0089_care_team.sql` was promoted second, on
`care/CARE-01-assigned-therapists` (PR #1374), and took **`0091`** — see the Promoted
table below. That is why the table above is empty again.

**THE RULED QUEUE, RE-RULED BY THE OWNER ON 2026-09-21.** It is
**`0090` NESA names (#1390, applied and merged) · `0091` CARE-01 (#1374) ·
`0092` RGPD-01 (#1399) · `0093` the users/tenants role fix (not yet opened) ·
`0094` the grants revoke (#1397)**.

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

**ONE MIGRATION IS IN FLIGHT AT A TIME.** `0092` is not promoted until `0091` is
applied to production and merged.

## Promoted

| was | became | on |
|---|---|---|
| `NEXT-AFTER-0085_nesa_shared_resource.sql` | `packages/db/migrations/0086_nesa_shared_resource.sql`, bytes unchanged (sha256 `d3eb9e41dff3f7ba6ccd0c250baf76198e60e884733e06043fcd9518bbac8d99`), journal `when 1788001200000` | 2026-09-11, branch `db/0086-nesa-shared-resource`. Applied after 0085, from `docs/migration-apply-0086.md` |
| `NEXT-AFTER-0088_attachments_soft_delete.sql` | `packages/db/migrations/0089_attachments_soft_delete.sql`, bytes unchanged (sha256 `ec1b90634b4253e50fe1060b03b22a0b2fe447136baaaa811dba819d7c084ced`), journal `idx 86`, `when 1788301200000` | 2026-09-16, branch `patients/SR62-PU4-documentos-soft-delete`. Applied after 0088, from `docs/migration-apply-0089.md` |
| `NEXT-AFTER-0089_nesa_patient_name_for_therapists.sql` | `packages/db/migrations/0090_nesa_patient_name_for_therapists.sql`, bytes unchanged (sha256 `cbff20cb90f5bb27b607055a4bf46d4b7ed5992aebe1c894d0fe559868b5c642`), journal `idx 87`, `when 1788401200000` | 2026-09-18, branch `sched/B8-nesa-names-to-therapists`. Promoted after #1338 put 0089 on main; applied to production from `docs/migration-apply-0090.md` (production journal id 88), merged in #1390 on 2026-09-21 |
| `NEXT-AFTER-0089_care_team.sql` | `packages/db/migrations/0091_care_team.sql`, bytes unchanged (sha256 `bd207cdc8c39099ac213f087e42fbd7cc332158590c5248dcbfe3928bf5a972f`), journal `idx 88`, `when 1788501200000` | 2026-09-21, branch `care/CARE-01-assigned-therapists` (PR #1374). Promoted after 0090 was applied and merged, under the owner's re-ruling of 2026-09-21 that put CARE-01 at `0091`; **authored, NOT yet applied** — the apply runs from `docs/migration-apply-0091.md`, which is staged in **this same commit** together with its sha256 sidecar and the three pinned check scripts. **The promoted file's own header still reads "NO NUMBER YET, BY CONSTRUCTION" and says it must follow an unapplied 0089.** That sentence is stale, and it is left stale on purpose: a promotion moves the file and does not touch one byte of it, which is the only reason the sha256 in this row can pin anything. Read the header as a record of when the file was authored, and this table for where it now sits. |
