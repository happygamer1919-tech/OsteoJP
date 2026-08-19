# Apply receipt - migration 0066, `users.must_set_password`

**Status: APPLIED TO PRODUCTION 2026-08-18. MERGED THE SAME DAY. TRANSCRIPT
COMPLETE.**

Migration: `0066_users_must_set_password` (journal idx 65, `when` 1787300100000).
Branch: `sec/SEC-02-force-password-rotation` (deleted at merge).
PR: **#943, squash-merged as `810a52d`.**
**Applied from sha `1d75c1c`** - orphaned by the squash, see §5.1.
Applied by the owner from `/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply`.
Card: `SEC-02-temp-password-no-forced-rotation`.

**Next free migration number: `0067`. It is unoccupied and NOT authorized.**

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

## 3. THE APPLY BLOCK, AND THE LINE THAT GATED IT

The block handed to the owner opened with, verbatim:

```
NOT VALIDATED - STRATEGY REVIEW REQUIRED - DO NOT RUN
```

**Quoted rather than deleted.** A receipt that simply lacks the line is
indistinguishable from a block that never carried one, and PORTAL-REHYDRATE §4.9
exists because three apply blocks have been defective while their migrations were
fine.

It was delivered as **two separate pastes** - pre-flight first, read before any
credential was sourced, then the apply - per the runbook's "THE PRE-FLIGHT" and
the four faults 0065 §0 records.

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

## 5. THE APPLY. 2026-08-18. Verbatim, as pasted back by the owner.

### 5.1 THE PINNED SHA IS ORPHANED. Read this before trying to verify §5.2.

`1d75c1c` **will not resolve in a fresh clone.** It sat on
`sec/SEC-02-force-password-rotation`; #943 was squash-merged, so that branch's
commits never became ancestors of `main`, and the branch was deleted at merge.
Checked, not assumed: `git merge-base --is-ancestor 1d75c1c origin/main` exits
non-zero today.

**What makes this receipt verifiable anyway** is the tie 0063 §4 established as
the general rule - pin the sha that was checked out, the squash commit carrying
the same content, and the blob hashes that bind them:

| Ref | Blob for `0066_users_must_set_password.sql` | Blob for `meta/_journal.json` |
|---|---|---|
| `1d75c1c` (applied) | `beb5d60b7af11d7186ad993f871418da3f777a44` | `42751bbd0fa59593d844e3eb6059ade76f767c09` |
| `810a52d` (squash merge of #943) | `beb5d60b7af11d7186ad993f871418da3f777a44` | `42751bbd0fa59593d844e3eb6059ade76f767c09` |
| `origin/main` | `beb5d60b7af11d7186ad993f871418da3f777a44` | `42751bbd0fa59593d844e3eb6059ade76f767c09` |

**So what ran against production is byte-identical to what is on `main` today**,
and anyone can check it from any clone:

```
git rev-parse origin/main:packages/db/migrations/0066_users_must_set_password.sql
```

**THE PIN WAS REBASED FORWARD BEFORE THE APPLY, DELIBERATELY.** 0064's receipt
records the opposite situation: that PR was 7 commits behind main when its apply
completed, GitHub refused the merge as out of date, and updating the branch would
have broken the identity between "what was applied" and "what merged" - forcing an
`--admin` merge to preserve it. Here the branch was rebased onto current `main`
and re-gated BEFORE the pin was handed over, so no such choice arose. The head was
re-verified as `1d75c1c` as the last action before the merge, per the runbook.

### 5.2 The transcript

```
HEAD is now at 1d75c1c fix(db): sync 0066 into supabase/migrations with the script, not by hand
last applied "when" in the database: 1787300000000
journal entries on disk:             66
pending:                             1
  PENDING  0066_users_must_set_password  when=1787300100000
OK: the pending set is exactly what was expected.
[drizzle-kit migrate ran; two expected NOTICE lines: schema
"drizzle" already exists, skipping; relation
"__drizzle_migrations" already exists, skipping]
migrations applied successfully!
last applied "when" in the database: 1787300100000
journal entries on disk:             66
pending:                             0
OK: the pending set is exactly what was expected.
users.must_set_password  EXISTS  boolean, not null, default false
OK: all 1 column(s) present.
```

### 5.3 The transcript checked against the committed repo, not just read

Every figure above was re-derived from `origin/main` by the terminal writing this
file. This is the section that distinguishes a receipt from a paste.

| Transcript says | Committed repo says | Agrees |
|---|---|---|
| `journal entries on disk: 66` | `meta/_journal.json` holds 66 entries | yes |
| `PENDING 0066_users_must_set_password when=1787300100000` | last entry is `idx 65`, tag `0066_users_must_set_password`, `when 1787300100000` | yes |
| `last applied "when" ... 1787300000000` before | 0065's `when`, the previous entry | yes |
| `last applied "when" ... 1787300100000` after | same `when` as the journal's final entry | yes |
| `pending: 0` after | nothing on disk beyond idx 65 | yes |
| `boolean, not null, default false` | `ADD COLUMN must_set_password boolean NOT NULL DEFAULT false` | yes |

**THE PRE-CHECK IS THE PART THAT MATTERS AND IT DID ITS JOB.** The `when` moved
`1787300000000` -> `1787300100000` and pending went `1` -> `0`. §4 of this
document was written because `migrations applied successfully!` prints even when
drizzle applies **nothing** - which is how 0049 and 0058 produced a success over
a no-op. The success line alone would not have been evidence; the two numbers
moving is.

**AND THE COLUMN CHECK IS THE INDEPENDENT HALF.** It reads
`information_schema` rather than drizzle's own bookkeeping, so it answers a
different question from a different source: not "does a tracking row exist" but
"is the column there". June 2026 is the lesson - a tracking row was inserted
while the SQL never ran, and only an object-level read would have caught it. The
column checker also reports the TYPE, the nullability and the default, so
`boolean, not null, default false` confirms the three properties §2 depends on
rather than merely that a name exists.

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
