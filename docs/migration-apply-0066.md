# Apply receipt - migration 0066, `users.must_set_password`

**Status: AUTHORED, NOT APPLIED. The apply block in §3 is UNVALIDATED and must
not be run.**

Migration: `0066_users_must_set_password` (journal idx 65, `when` 1787300100000).
Branch: `sec/SEC-02-force-password-rotation`.
PR: **opened, and it does NOT merge until this migration is applied** (standing
rule 7: author, owner applies, apply BEFORE merge).
Card: `SEC-02-temp-password-no-forced-rotation`.

**Next free migration number after this one: `0067`.** It is unoccupied and NOT
authorized.

Written under `docs/runbook-prod-migrations.md`.

---

## 1. What this migration does

**One column, one default, one partial index.** No policy change, no grant
change, no data change to any existing row.

```
ALTER TABLE public.users
  ADD COLUMN must_set_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.must_set_password IS '...';

CREATE INDEX IF NOT EXISTS users_must_set_password_idx
  ON public.users (tenant_id)
  WHERE must_set_password;
```

**It is additive and it touches nothing that exists.** `NOT NULL DEFAULT false`
means every current row acquires `false` without a rewrite of any value anyone
chose, and no existing behaviour changes until the application reads the column.

## 2. Why the default is `false`, which is a decision about real people

Every staff member already onboarded also received a password an admin chose and
could read. Defaulting to `true` would force all of them to rotate at their next
sign-in - defensible on the merits, and **an operational event landing on a
working clinic at a moment nobody picked**, not a code change.

**WHAT CANNOT BE DONE, stated so nobody goes looking for it:** there is no
predicate that selects only the still-exposed accounts. GoTrue owns the
credential and exposes no password-last-changed fact to this database, so
"who is still on their handed-over password" is not answerable here.

So this migration closes the hole **going forward** and changes nothing for
anyone already working. Forcing the existing population is a separate,
owner-timed action and is carded rather than smuggled into a schema change.

## 3. THE APPLY BLOCK

```
NOT VALIDATED - STRATEGY REVIEW REQUIRED - DO NOT RUN
```

The block is reproduced in the session report that accompanies this file. It is
**not duplicated here in runnable form** until strategy has replaced that first
line, because a receipt carrying a runnable block and a review gate at the same
time is exactly the artefact PORTAL-REHYDRATE §4.9 forbids.

**Expected pending count: `1`.** Only `0066` is unapplied. `0065` was applied to
production on 2026-08-18 and merged (`docs/migration-apply-0065.md` §5), and the
journal on `origin/main` carries 65 entries, idx 0..64, with `0066` appended here
as idx 65.

## 4. After the apply - independent verification, both directions

The migrate output is **not** evidence. `drizzle-kit migrate` prints
`migrations applied successfully!` when it applies nothing, which is how 0049 and
0058 both reported success over an unchanged schema. What counts is the pre-check
number moving `1` -> `0` and the column existing:

```
pnpm --filter @osteojp/db exec node scripts/check-migration-columns.mjs users.must_set_password
```

`check-migration-columns.mjs` is the right checker here and
`check-migration-tables.mjs` is not: this migration creates **no table**, so a
table-existence read would have passed before it ran and proven nothing. That is
the exact false green the column checker was written for (0057).

## 5. THE APPLY. Deliberately empty.

**This section stays empty, and says so, until the owner pastes the transcript
back.** A receipt reconstructed from a summary is not a transcript, and
`docs/migration-apply-0065.md` §0 records what happens when an apply document is
built from the shape of its predecessor instead of from the evidence.

## 6. What this does NOT cover

- **No change for existing staff.** See §2. Their marker is `false` and they are
  not prompted.
- **No server-action-level enforcement.** The guard is page-level, in `AppShell`,
  which every authenticated section's layout renders. A server action invoked
  directly does not render a shell. Those paths carry their own capability
  checks, and reaching one requires first loading a page that this gate refuses.
  Stated as a limit rather than left to be discovered.
- **No password policy change, no credential expiry, no invite email.** Each is
  defensible and none was ruled.
