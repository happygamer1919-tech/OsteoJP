# REPORT — a wrapper that makes `drizzle-kit migrate` say what it did

**Status: REPORT. NOTHING IS BUILT.** BLUE, 2026-09-08. Re-derived from
`origin/main`; every script named below was read, not remembered.

---

## 0. The one-sentence problem

`drizzle-kit migrate` prints `[✓] migrations applied successfully!` **whether or
not it applied anything**, and on at least one occasion it has exited **1 with no
output at all**. Its exit code and its stdout are therefore both unusable as
evidence, in both directions.

This has cost this project real time on **five** separate occasions, and they are
not five instances of one bug — they are **four distinct causes** wearing one
face:

| # | what happened | why `migrate` still said success |
|---|---|---|
| 0038–0041 | a plain `git checkout <branch>` left the apply worktree on `main` | the migration files were not on disk, so nothing was pending |
| 0049 | same cause, again (`docs/DECISIONS.md:2215`) | as above |
| 0058 | the file WAS on disk and the checkout WAS right; the journal entry had a hand-appended `when` **lower** than the previously applied migration's | drizzle decides pending with `Number(lastDbMigration.created_at) < migration.folderMillis`, so a lower `when` reads as **already applied** |
| 2026-08-26 rehearsal | `drizzle-kit migrate` exited **1** with nothing on stdout or stderr (`POST-01`) | not a success — a **silent failure**, which is the same unreadable output one bit over |
| 2026-09-08 (SR-58) | a stage inheriting a working tree from a previous stage | the tree had moved (`gh pr merge --delete-branch` checks out the default branch; a second session's `git pull` moves it too) |

**The 0038/0049/SR-58 family and the 0058 family look identical from the migrate
output and have opposite fixes.** One is "your files are missing"; the other is
"your files are there and drizzle has decided they are already applied". That is
the whole reason a wrapper is worth building rather than a habit.

---

## 1. What already exists, and it is more than a fresh reader expects

**Two committed scripts already do the two halves.** Neither is a wrapper; both
are separate commands a human remembers to type.

### `packages/db/scripts/check-pending-migrations.mjs` — the BEFORE half

Reads `drizzle.__drizzle_migrations` inside a `READ ONLY` transaction and answers
*"how many migrations does this database consider pending"*. It takes the
**expected** count as an argument and exits non-zero when the actual differs, so
it is a gate rather than a report. Its own header already names the 0038–0041,
0049 and 0058 incidents and explains how the two causes are distinguished.

### `packages/db/scripts/check-migration-tables.mjs` — the AFTER half

Reads `pg_catalog` via `to_regclass` for the tables the migration creates, again
`READ ONLY`, using the `postgres` driver `packages/db` already depends on so it
needs no external tooling. Its header records exactly why it exists: the 0055
apply block asked for a journal read *out of git*, which pins the commit and says
nothing about the database, and the 0056 block asked for `psql`, which is not
installed on the owner's machine.

### And three more catalogue checks

`check-migration-columns.mjs`, `check-migration-functions.mjs`,
`check-security-definer-owner.mjs`. Every one is READ ONLY and prints no patient
data.

**So the material is all there. What is missing is that none of it is
compulsory.** The apply blocks in `docs/migration-apply-00*.md` chain them with
`&&`, which works exactly as long as the person pasting the block pastes the
whole block.

---

## 2. What the wrapper is

**A single command that replaces `pnpm db:migrate` in every apply block, and that
cannot report success without proving it.**

```
pnpm db:migrate:verified --expect-pending 1 --tag 0082_patient_locale_grant \
                         --sha256 b43423ae…
```

It does five things in order and **stops at the first that fails**:

1. **SR-58 — assert the files are on disk.** The migration named by `--tag` must
   exist at `packages/db/migrations/<tag>.sql`, and its sha256 must equal
   `--sha256`. This is the check that makes a wrong working tree **loud** instead
   of silent, and it costs one `readFileSync`.
2. **Read the journal count BEFORE**, and assert the pending count equals
   `--expect-pending`. This is `check-pending-migrations.mjs`, called rather than
   reimplemented.
3. **Run `drizzle-kit migrate`, capturing stdout, stderr and the exit code**, and
   print all three **even on success** — because `POST-01` is the case where
   there is nothing to print and the wrapper should say *"drizzle exited 1 and
   said nothing"* in those words.
4. **Read the journal count AFTER**, and assert the delta is exactly
   `--expect-pending`. **This is the assertion that closes the whole class.** A
   no-op leaves the delta at 0 and fails here regardless of which of the four
   causes produced it.
5. **Assert the applied row carries the sha256 from step 1.** `drizzle`'s `id` is
   a SERIAL — the count of migrations applied — and it stopped matching the tag at
   the 0076/0077 gap, so `max(id) = 82` is not a check. The **hash** is the only
   identity that proves the file applied is the file approved.

**Steps 1 and 5 are the same claim asked at two ends**, and that is deliberate:
step 1 proves the right bytes were on disk, step 5 proves the database recorded
those bytes. A wrapper that only did step 5 would pass on a database somebody
else migrated.

### The exit contract

| exit | meaning |
|---|---|
| 0 | the delta matched, the hash is in the journal, and both are printed |
| 2 | bad invocation (missing `--tag`, no `--sha256`) — never confused with a failure |
| 3 | a precondition failed: file missing, hash mismatch, pending count wrong |
| 4 | drizzle itself failed — **its captured output is reprinted, including when it is empty** |
| 5 | drizzle succeeded and the journal did not move. **This is the silent no-op, named.** |

Exit 5 existing as its own code is most of the value: today that state is
indistinguishable from success and it is the one that has cost the days.

---

## 3. What it must not do

- **It must not apply anything itself.** It shells out to `drizzle-kit migrate`.
  A wrapper that reimplements the applier is a second migration engine that can
  disagree with the first.
- **It must not print the connection string or any environment value**, and must
  not touch a patient table. Both existing checkers already hold that line and
  say so in their headers; the wrapper inherits it by only ever reading
  `drizzle.__drizzle_migrations`.
- **It must not be the only guard.** The per-migration post-checks
  (`scripts/00NN-postcheck.sql`) assert what the migration *meant* — that a
  constraint fires, that a privilege is held. The wrapper only asserts that the
  right file ran. Those are different claims and neither substitutes.

---

## 4. Two things this does NOT fix, stated so nobody assumes it does

**POST-01's root cause is not addressed.** The wrapper makes a silent exit 1
legible; it does not explain why `drizzle-kit migrate` exited 1 against
`djflfnnjvkbwnsgqwawj` with nothing to say. That card's own first-things-to-try
list stands: the session pooler on 5432 rather than 6543 (advisory locks),
`drizzle.config.ts`'s `DATABASE_URL_DIRECT` fallback, and running `drizzle-kit`
directly rather than through `pnpm --filter exec`, which swallows output on some
failure paths.

**SR-59 is a different rule and the wrapper does not enforce it.** Carry values
travel from a pre-check to a post-check by hand, through the operator's
scrollback, and this wrapper does not touch either file. The structural fix for
that is named on SR-59: have the pre-check **write** its numbers to a file the
post-check **reads**. Worth doing when a future migration wants it; not retro-fitted
to 0081, whose instrument is retired.

---

## 5. Recommendation

**Build it, and build it before the next migration apply, not after.** It is
roughly 120 lines, it calls two scripts that already exist, and every one of its
five steps is a check this project has already written down somewhere as a
lesson. The argument against — that the apply blocks already chain the same
checks with `&&` — is exactly the argument that failed on 0038, 0049 and 0058:
a chain a human assembles by hand is a chain a human can assemble incompletely,
at 7am, on the one morning it matters.

**Owner-gated only in that it changes the apply blocks**, which are the owner's
to run. Nothing in it touches production without him.
