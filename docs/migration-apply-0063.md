# Apply receipt - migration 0063, `guest_booking_requests`

**Status: APPLIED TO PRODUCTION 2026-08-14. RE-VERIFIED READ-ONLY 2026-08-15.**

Migration: `0063_guest_booking_requests` (journal idx 62).
Branch: `feat/GUEST-01-migration-0063`. PR: **#907, merged as `82a1e95`**.
**Applied from sha `4b7fbc8`** - see §4, which is about that sha and matters.
Applied by the owner from `/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply`.
Cards: `GUEST-01-migration-0063-authored` (shipped),
`LE-migration-apply-0063-no-receipt` (closed by this file).
**Next free migration number: `0064`. It is unoccupied and it is NOT authorized** -
the GUEST-04 Option A ruling of 2026-08-14 states so explicitly, and the guest
flow was built without one.

Written under `docs/runbook-prod-migrations.md`.

---

## 0. THIS DOCUMENT IS A RECEIPT, NOT AN APPLY BLOCK, AND IT IS LATE

**Read this before comparing it to `0058` through `0062`.** Those five are apply
*blocks*: drafted before the apply, reviewed by strategy, run by the owner, and
then given an "APPLIED" section holding the journal. This file has only the
second half.

**The apply block for 0063 was drafted** - `GUEST-01`'s card records it, opening
`NOT VALIDATED` per `PORTAL-REHYDRATE.md` §4.9, sent to strategy and not to the
owner - **and no document was ever committed for it.** So 0063 was applied and
merged with its journal living nowhere but a terminal window and a chat.

**It was found on 2026-08-14 by looking for the receipt rather than assuming
it**, while closing `GUEST-01` in the GUEST-04 dispatch. Every migration from
0058 has a `docs/migration-apply-00xx.md`; 0063 had none. The gap was reported as
a board contradiction rather than quietly filled, and this file is the fill.

**What that means for how much this document proves.** Sections 5 and 6 are
verbatim transcript and prove exactly what they say. Nothing here reconstructs a
pre-check from memory, and no number in §5 was typed by the terminal that wrote
this file: the transcript was pasted in by the owner and strategy, and every
figure in it was then **checked against the committed journal** (§7.1). Where
this document asserts something beyond the transcript - the sha reachability in
§4 - it says how it was derived.

---

## 1. What this migration does

`guest_booking_requests`: one table, no changes to any existing one.

It exists so that **the project's first unauthenticated write surface touches no
clinical table at all.** A person with no record and no account can ask for an
appointment; the request lands here and a human converts it. The cheaper design -
a provisional `patients` row reusing the existing pedido path - needs no
migration and is wrong twice: it writes a clinical record from an anonymous HTTP
request, and it is auto-linking under another name, which R-GUEST forbids.

**No anon RLS policy, in either direction.** The insert runs from `apps/api`
under the service role, the seam the durable rate-limit store already uses
(0056). Staff get SELECT and UPDATE, tenant-scoped on the JWT claim. There is no
INSERT policy and no DELETE policy: a declined request is a **status**, not a
deletion.

**The `phone_e164` generated column carries 0062's expression verbatim**, because
reception's possible-existing-patient flag joins on it at both ends. That
duplication is the subject of `GUEST-02`'s DB-gated parity test, which gates the
flow rather than following it: if the two ever normalise differently the flag
returns nothing, and **nothing is the benign-looking answer**.

**The `when` value is on the SYNTHETIC series, not `Date.now()`.**
`1787100000000`, one step of `100000000` above 0062's `1787000000000`. INC-07 was
a `Date.now()` value landing *below* its predecessor, which the journal accepts
and the migrator then skips.

---

## 2. What the columns mean NOW, which is not what this migration says

**Anyone reading `0063_guest_booking_requests.sql` for the meaning of
`requested_starts_at` / `requested_ends_at` will get it wrong**, so it is
recorded here beside the apply rather than left to the next reader.

The DDL declares an exact timestamptz window and its comments describe a slot,
because at authoring time the public form was expected to offer real slots.
**The GUEST-04 Option A ruling (2026-08-14) removed that.** The form shows no
availability; it collects a preferred **date** and a preferred **period**
(manhã 09:00-13:00, tarde 13:00-19:00, Europe/Lisbon). The pair now carries the
**period's boundaries**, encoded by `encodeGuestPreferredWindow` in `@osteojp/db`.

**This required no migration and none was authored.** The reinterpretation is at
the write layer, the encoding lives beside the schema so the writer and
reception's reader cannot disagree, and decoding returns a discriminated union so
a window that is not one of the two encodings is rendered as the timestamp it is
rather than as a period nobody stated. PR #912, merged as `20b8ad2`.

---

## 3. Pre-flight, as performed

- **Working directory**: `/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply`.
  Never a build tree.
- **Checkout**: detached at `4b7fbc8`. `git cat-file -t 4b7fbc8` printed
  `commit`. The detached form is not a preference - a plain
  `git checkout <branch>` is refused when another worktree holds the branch, and
  `db:migrate` then silently no-ops on `main`.
- **Env**: loaded via `set -o allexport` from the secrets file, unset afterwards,
  and the terminal window closed at the end of the sitting, per doctrine. **No
  value appears in this document, in the transcript below, or in any board card.**
- **`git status` clean at apply time**, and it was not clean when the sitting
  started. See §3.1.

**All four of those are the canonical pre-flight**, now committed at
`docs/runbook-prod-migrations.md`, section "THE PRE-FLIGHT" - four lines, two
expected outputs, two STOP conditions. It was uncommitted when this apply ran,
living only in strategy's paste discipline; it is the step that caught §3.1's
strays.

### 3.1 The 21 stray scripts were cleared, and that closes a high card

`LE-prod-apply-worktree-loose-scripts` had been open since 2026-08-12: 21
untracked paths sitting in **the one tree whose shell holds production
credentials**, where every one of them was a single `node <path>` away from the
live database after the `allexport` line. Roughly half were writers, one carried
a dead `AUTORIZO` in its filename, and three were purge scripts written against a
July schema.

**Disposition at this sitting, and the arithmetic reconciles exactly:**

| | Count | Where it went |
|---|---|---|
| Archived | **20** (19 `.mjs`, 1 `.ts`) | `/Users/ivan/osteojp-archive/prod-apply-strays-20260814`, directory structure preserved |
| Removed without archive | **1** (`.json`) | `packages/db/scripts/ficha-v5-only/osteopathy-v5.json`, the sole file in that directory - untracked scratch, recorded here rather than left as a discrepancy |
| **Total** | **21** | matches the card's inventory exactly |

**Re-derived rather than transcribed**, 2026-08-15, from this machine:
`git -C .../osteojp-prod-apply status --porcelain --untracked-files=all` returns
**zero** paths, HEAD reads `4b7fbc8`, and the archive directory holds 20 files.
The card's own count correction ("the true figure is 19 `.mjs` among 21 files")
is what made the reconciliation checkable, which is the argument for correcting
counts even when nobody has asked.

---

## 4. THE PINNED SHA IS ORPHANED. Read this before trying to verify §5.

**`4b7fbc8` will not resolve in a fresh clone**, and a receipt whose central
identifier cannot be resolved by the next person is not doing its job.

**Why.** `4b7fbc8` sat on `feat/GUEST-01-migration-0063`. PR #907 was
**squash-merged**, so the branch's commits never became ancestors of `main` -
`82a1e95` is a new commit with their combined content - and the branch was then
deleted. `git merge-base --is-ancestor 4b7fbc8 origin/main` exits non-zero and
`git branch -a --contains 4b7fbc8` is empty. The object survives in the local
clones that already had it, including the apply worktree, and nowhere else that
is guaranteed.

**What makes the receipt verifiable anyway.** The migration's content is
identical at the applied sha and at its permanent home on `main`:

| Ref | Blob for `packages/db/migrations/0063_guest_booking_requests.sql` |
|---|---|
| `4b7fbc8` (applied) | `fedfb0d3291f30c3350b4a5d1ccc81fafafaa22e` |
| `82a1e95` (squash merge of #907) | `fedfb0d3291f30c3350b4a5d1ccc81fafafaa22e` |
| `origin/main` | `fedfb0d3291f30c3350b4a5d1ccc81fafafaa22e` |

`meta/_journal.json` is byte-identical across the three as well.

**So: what ran against production is byte-identical to what is on `main` today,
and that can be checked from any clone** with

```
git rev-parse origin/main:packages/db/migrations/0063_guest_booking_requests.sql
```

**The general lesson, because it applies to every future receipt.** Under
squash-merge the applied sha is *always* orphaned the moment the PR merges. Pin
**both**: the sha that was checked out, and the squash commit that carries the
same content. The blob hash is what ties them, and it is the only one of the
three identifiers guaranteed to survive.

---

## 5. THE APPLY. 2026-08-14. Verbatim, as pasted back by the owner.

```
Previous HEAD position was 4adafcf docs(db): the whitespace boundary is measured, not hypothesised
HEAD is now at 4b7fbc8 docs(api): document the guest booking endpoint in the OpenAPI spec
last applied "when" in the database: 1787000000000
journal entries on disk:             63
pending:                             1
  PENDING  0063_guest_booking_requests  when=1787100000000
OK: the pending set is exactly what was expected.
[drizzle-kit migrate ran; two NOTICE lines: schema "drizzle"
already exists, skipping; relation "__drizzle_migrations" already
exists, skipping]
[checkmark] migrations applied successfully!
last applied "when" in the database: 1787100000000
journal entries on disk:             63
pending:                             0
OK: the pending set is exactly what was expected.
guest_booking_requests  EXISTS
OK: all 1 table(s) present.
```

---

## 6. THE READ-ONLY VERIFICATION. 2026-08-15. Verbatim.

Run by the owner from the same worktree, on the day after, with no write of any
kind. Its whole purpose is to answer "is it still true" independently of the
sitting that made it true.

```
last applied "when" in the database: 1787100000000
journal entries on disk:             63
pending:                             0
OK: the pending set is exactly what was expected.
guest_booking_requests  EXISTS
OK: all 1 table(s) present.
```

---

## 7. What this proves, line by line

**The pre-check and the post-check are the evidence. The success line is not.**
INC-07 established that twice: `migrations applied successfully` is printed by a
run that applied nothing, because a `when` below its predecessor is skipped
silently. Here both halves are present and they agree.

| Reading | Before | After | What it means |
|---|---|---|---|
| database `last applied "when"` | `1787000000000` | `1787100000000` | advanced by exactly one step of the synthetic series: 0062 -> 0063 |
| `pending` | `1` | `0` | the one pending entry was consumed |
| named pending entry | `0063_guest_booking_requests` | - | the *right* migration, not merely *a* migration |
| `journal entries on disk` | `63` | `63` | unchanged, as it must be - the disk is the input |
| `guest_booking_requests` | - | `EXISTS` | the object the migration creates is present |

### 7.1 Every figure above was checked against the committed journal

Not taken on trust. From `packages/db/migrations/meta/_journal.json` on
`origin/main`:

```
59  0060_pin_security_definer_owner                    when=1786800000000
60  0061_no_double_confirmed_and_confirm_notification  when=1786900000000
61  0062_patient_phone_e164                            when=1787000000000
62  0063_guest_booking_requests                        when=1787100000000
total entries: 63
```

The transcript's "last applied `1787000000000`" is **0062's** `when`, and its
post-apply `1787100000000` is **0063's**. The count of 63 matches. The transcript
is internally consistent with the repository, which is what a receipt has to be
before it is worth anything.

### 7.2 The table check is meaningful here, and it was not for 0059

`guest_booking_requests EXISTS` is real evidence because **the table is genuinely
new**: it did not exist before this migration, so its presence cannot be
inherited from an earlier state. 0059's apply recorded the opposite lesson - the
object it checked already existed, so existence proved nothing about whether that
migration had run.

### 7.3 The two NOTICE lines are expected

`schema "drizzle" already exists, skipping` and `relation
"__drizzle_migrations" already exists, skipping` are drizzle-kit finding its own
bookkeeping in place, on every apply after the first. They are not warnings about
0063.

---

## 8. What this closes, and what it does not

**Closes:**

- `LE-migration-apply-0063-no-receipt` - the receipt exists, and it is
  verifiable from a fresh clone via §4's blob hash rather than only from the
  machine that ran it.
- `LE-prod-apply-worktree-loose-scripts` - 21 untracked paths, reconciled to
  zero in §3.1, in the one tree that holds production credentials.

**Does not close, and is not affected by this document:**

- `GUEST-05-confirmation-copy` - JP's two strings. The public form refuses to
  submit until they land, so **no row can reach this table from the public form
  today**. That is a deliberate gate, not a defect, and it is the only thing
  between the built flow and the WF-03 sitting.

**Nothing in this document was produced by a prod-connected command from a build
terminal.** Standing rule 1 holds: the transcripts arrived as text, and every
independent check here (§3.1, §4, §7.1) is a local `git` read.
