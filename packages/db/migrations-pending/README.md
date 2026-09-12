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
| (none) | | | |

## Promoted

| was | became | on |
|---|---|---|
| `NEXT-AFTER-0085_nesa_shared_resource.sql` | `packages/db/migrations/0086_nesa_shared_resource.sql`, bytes unchanged (sha256 `d3eb9e41dff3f7ba6ccd0c250baf76198e60e884733e06043fcd9518bbac8d99`), journal `when 1788001200000` | 2026-09-11, branch `db/0086-nesa-shared-resource`. Applied after 0085, from `docs/migration-apply-0086.md` |
