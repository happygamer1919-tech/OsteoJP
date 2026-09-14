# Two staff-row blocks, authored by BLUE on 2026-09-13 (B4, B5)

Landed here so GREEN, the designated apply lane (ruling 2026-09-13), can run them
by ref under SR-61. The six `.sql` files are byte-identical to the ones BLUE
printed in its 2026-09-13 report; their sha256 values are below and did not
change in the move. BLUE authored them and does not run them: author and applier
are different lanes.

## B4: remove the login from staff row bdc466d7 (NESA, Linda-a-Velha)

Card `NESA-LV-ROW-remove-login-bdc466d7`.

| Step | File | sha256 | Writes |
|---|---|---|---|
| 1 pre-check | `scripts/staff-rows-2026-09-13/B4-1-precheck.sql` | `64d7d6c3e268b4eb7023b36644b4cd7bc6541bd778ef0be8942992f11abc8941` | no |
| 2 remove the login | `scripts/staff-rows-2026-09-13/B4-2-remove-login.sql` | `4611cb240507b8c6d46e5c7985a363ad5db443fe1884005324c43ebcd710ba76` | yes |
| 3 post-check | `scripts/staff-rows-2026-09-13/B4-3-postcheck.sql` | `b44c04d3547d41eafc8e1fd0556eabf21380690e2ca59caee21ae77484536376` | no |

## B5: set is_bookable false on the JP row not taking patients. HELD.

Card `JP-ROW-not-taking-patients-set-not-bookable`.

| Step | File | sha256 | Writes |
|---|---|---|---|
| 1 pre-check | `scripts/staff-rows-2026-09-13/B5-1-precheck.sql` | `20641f8b4f095f0f91e4e24794c05a1e8187461ccca431d3d486c4f66a1b15e6` | no |
| 2 set not bookable | `scripts/staff-rows-2026-09-13/B5-2-set-not-bookable.sql` | `5c57473c26effdabf180f430ee2c3d46697cf44630d51bd02505b18e693fb435` | yes |
| 3 undo | `scripts/staff-rows-2026-09-13/B5-3-undo.sql` | `17aa97ed0f9b3611636d47fdbffb4a26e8422351265f6c16a31af952618134e9` | yes |

**Do not run B5-2.** Its row choice ("the one JP row with no future booking in
either role") is known to be unsafe since 2026-09-13: JP(lv) is receiving manual
bookings, so at run time that rule can resolve to JP(cb) or to neither row. Only
the pre-check B5-1 runs. The owner reads its output and rules which row; B5-2 is
rebuilt against that ruling in a later dispatch, under a new sha256.

## What these files assume about their reader

Every header says "Paste into the Supabase SQL Editor". That is a human step.
Run unattended, each file is plain SQL and runs as-is with
`psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f <file>`:

- B4-1, B4-3 and B5-1 are single `SELECT`s. B4-1 and B4-3 print `fact | found | needs`;
  the reader compares the columns. Nothing in the file fails on a mismatch.
- B4-2 is one `DO` block. It refuses on its own (`raise exception 'STOP: ...'`), so
  under `ON_ERROR_STOP=1` psql exits 3 and nothing is written. Success is the
  NOTICE line `NESA-LV-ROW DONE: ...`.
- No file prompts, waits, or reads a value typed between two steps.
