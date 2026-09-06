# OsteoJP — PURPLE session close, 2026-09-05

Written because the owner is closing out and BLUE had an unapplied migration in
flight. **That migration was applied on production on 2026-09-06 and #1175 has
since merged — see §2 and §6.** **Nothing here replaces repo ground truth.** `origin/main`, the board
JSON and `docs/board/PORTAL-REHYDRATE.md` outrank this document; it exists to
say what a fresh session would otherwise have to rediscover, and to carry three
findings that are worth more than the code they came with.

---

## 1. What this session shipped

| PR | what |
|---|---|
| #1181 | `LE-guest-convert-abandoned-booking`, **option B**. A converted guest request stays in reception's queue as `Convertido - sem marcação` until somebody dismisses it. |
| #1183 | **PERF-17.** The eleven call sites of `patientLocationScope` are enumerated by a test, and the two that pass a column other than `patients.id` are covered by a four-class DB suite. |

Neither touches a migration. Neither contacts production.

---

## 2. What is in flight, and whose it is

**BLUE's migration is APPLIED AND MERGED. `main` and production agree again.**
`#1175` — migration **0079**, revokes `EXECUTE` from `service_role` and `anon`
on the twenty SECURITY DEFINER functions. Card
`SEC-security-definer-service-role-execute`, gate `owner_merge`. **Applied on
production 2026-09-06 by the owner, then MERGED as `f3a2b1df`.** Re-derived from
`origin/main` at the second close: `packages/db/migrations/0079_revoke_service_role_execute.sql`
is present, the journal is **77 rows**, and the file still hashes to
`eb3d48f0…`, the value both check scripts pin. Production is 77 as well. There
is no divergence left.

> **An earlier version of this section said `main` contained no 0079 and was one
> migration BEHIND production. That was true when written and is now false.** It
> is corrected rather than deleted because the general fact behind it still
> holds and is the thing to carry: **an OsteoJP migration is applied to
> production from the PR BRANCH, before the PR merges**, so between the apply
> and the merge `main` is behind and its `packages/db/migrations` is not
> evidence about production in either direction. Answer "is this applied" from
> the post-check's sha256 match, never from which files are on `main`. This
> window was open for a few hours on 2026-09-06 and it will open again on the
> next migration.

**0079 is that migration.** Older cards (PERF-15, RLS-01) use "0079" to mean the
deferred patients-path predicate rewrite; that work is now carded as `RLS-02`
and is a different thing. Do not apply a ruling about one to the other.

**Blocked on people, and on whom.** Re-derived from the board at close and then
**re-derived again on 2026-09-06 against `44760e2b`**, which is what found the
gap below. `main` had not moved between the two, and the lists still matched —
but the SECOND derivation asked a better question and got a longer answer.

**DERIVE THIS FROM THE `blocked_on` FIELD, ACROSS EVERY LANE. NOT FROM THE
`blocked_on_people` LANE.** The first version of this section listed that lane
and then added, from memory, "two incidents are also blocked on ivan". Two is
wrong: **four** cards outside that lane carry a `blocked_on`, and the two the
memory supplied were the two that happened to be recent. The lane is a place a
card sits; the field is the fact.

- **ivan (6, in the lane)** — `LE-suppression-observation`,
  `LE-migration-patient-fields-not-persisted`, `LAUNCH-04-sunday-owner-packet`,
  `LE-48h-email-never-observed-sending`, `OBS-03-sentry-source-maps-never-uploaded`,
  `PL-admin-clinical-access`.
- **jp (4, in the lane)** — `LAUNCH-02-jp-packet-signoff`,
  `LE-terms-version-switch-on-jp-text`, `LE-24h-sms-tokenized-confirm-link`,
  `Q-PL-ADMIN-CLINICAL-1`.
- **Blocked, and NOT in that lane — the four the field finds and the lane hides:**
  - ivan — `SEC-supabase-anon-execute-segfault` (incidents)
  - ivan — `INC-agenda-typeerror-m-id` (incidents)
  - ivan — `SEC-branch-protection-does-not-bind-the-owner-account` (loose ends).
    Ruled UNCHANGED for the rest of this wave and on the board as a CONDITION so
    it reaches the security review. **It is not work for a lane. Do not "fix" it.**
  - jp — `LE-portal-reminder-confirm-loop` (loose ends), carded 2026-08-11 and
    not built.

  The count a report should quote is therefore **ivan 9, jp 5**, not 6 and 4.

> **THOSE TWO NUMBERS ARE FROZEN AT `44760e2b`, 2026-09-06, AND THE BOARD HAS
> MOVED SINCE. Do not quote them as current.** Re-derived from the field on
> `origin/main` at `6f0138c1` the same evening, the raw counts are **ivan 15,
> jp 6** — jp gained `PACK-05-two-unbought-orphan-catalogue-rows` (§6.2), ivan
> gained `CI-auto-update-prs-404s-and-reports-success` and
> `LE-guest-queue-service-name` in the lane, and **four of ivan's fifteen sit in
> `shipped`**: `STAFF-01-timefield-offstep-value`,
> `STAFF-02-booking-location-unscoped`,
> `STAFF-03-agenda-hour-row-expansion`, `STAFF-04-marcacoes-name-truncated`.
> Whether a SHIPPED card carrying a `blocked_on` still counts as blocked was a
> board question. **IT IS NOW RULED, AND IT IS A MECHANISM RATHER THAN A
> CONVENTION.** The owner ruled `SR-55`: **quote 11, not 15** — a shipped card
> carrying a `blocked_on` is a contradiction, so either it is not shipped or the
> field is stale, and the quotable count EXCLUDES shipped. `STAFF-01` through
> `STAFF-04` get audited and stripped or reopened, never counted. `#1200` then
> put it in the validator: a SHIPPED card carrying a `blocked_on` is now
> REFUSED, so the state that produced the ambiguity cannot recur. The method
> above stands unchanged; only the figures are dated. **Re-derive before
> quoting.**

**Open lanes at close:** 23 in flight, 6 incidents, 30 loose ends, 10 blocked on
people. `/admin/staff` stays deferred by owner ruling and nothing in this session
touched it.

**SR-52 landed while this session was closing** and binds every lane: privilege
assertions read EFFECTIVE privilege (`has_function_privilege` /
`has_table_privilege`), never a grep of `proacl` for a grantee name, because a
REVOKE from a named role does not remove what PUBLIC holds. Its corollary binds
grant migrations: state your own end state, revoke then GRANT to exactly the
roles intended. It is the rule behind both of 0079's errors and it is worth
reading before touching #1175.

---

## 3. The findings the next session should inherit

These are not tasks. They are things that were measured, that cost something to
find, and that are easy to lose. The first three came out of this lane's own
work; 3.4 and 3.5 are BLUE's. 3.4 was re-derived here rather than transcribed,
and the re-derivation changed the numbers; 3.5 was added on 2026-09-06 from the
production run in §6, and it is the only one of the seven that has not yet cost
anybody anything. **3.6 and 3.7 were added at the session close.** 3.6 is a
near-miss of BLUE's, recorded because nothing in the repo would have caught it;
3.7 is this document's own error, generalised, and it is the only entry here
whose instance is a paragraph of this file.

### 3.1 The control that did NOT fail is the most useful result of the week

Removing the app-layer `roleScope` from **all four** patients-path compositions
leaves every assertion in `location-scope-classes.db.test.ts` **green**, because
0073's `patients_select` narrows an admin to `viewer_visible_patient_ids()` and
produces the identical set on its own.

**So on that path the app predicate can only NARROW what RLS already returned.
Its ABSENCE is invisible to a composite gate and its MUTILATION is not.**

It lives in that file's header rather than in a report, which is what makes it
survive. Two consequences a future session must not rediscover the hard way:

- A gate that asserts SETS through the production functions cannot tell you
  whether the app predicate is still there. If that matters — and for
  defence-in-depth it might — it needs a different kind of assertion.
- PERF-17 then found the other half: **the two call sites disagree.**
  `listPatientsUnreachableBySms` selects `FROM appointments`, so every row first
  survives `appointments_rls`, which IS location-scoped — RLS gets there before
  the app predicate. `listStuckConsultations` reads a table whose policy is not
  location-scoped, so there the predicate is the whole rule. The same patient,
  the same principal, the same minute, two answers, both correct. Asserted in
  `scope-classes-other-columns.db.test.ts`.

### 3.2 What production still pays on /patients is NOT appointment-count-bound

Measured by moving the variable rather than by arguing about it: the lane's
appointments table went from **24,631 to 40,853** rows (production holds 41,558)
and the `/patients` reload moved by about **10 ms** — from a median near 90 to
near 100, inside the run-to-run spread.

| | production (owner) | purple lane |
|---|---|---|
| `db:patients-list`, first load | 654.3 ms | 599.3 ms |
| `db:patients-list`, reload | 657.6 / 626.1 ms | 91.1 / 100.7 / 100.1 / 112.1 ms |

The first load agrees; the reload does not, by about six times, and growing the
fixture does not close it. **The pooler and the round trips across it are the
place to look, not the query shape.** Noted by the owner, not dispatched. Do not
reopen the patients-path predicate rewrite on the strength of the lane's number:
the lane cannot see the cost that remains.

### 3.3 A harness can report the previous fixture's numbers, and a seed can lie about its own

Both were shipped by this lane and both were found by a screen refusing to go
green, not by a gate:

- **PERF-15's class construction drew its patients at random** from all 8,404
  seeded ones, 293 of which sit in a statistic bucket, and moved their
  appointments outside the assignment. It took 1 `seen this month` and 3 `with
  upcoming` with them — **after the seed printed "all four counts match the
  owner's screen"**, because its check asserted only the UNASSIGNED principal and
  counted appointments with RLS out of the way. Fixed in #1177: the classes are
  drawn from the bucket-free patients, and the ASSIGNED principal's four numbers
  are asserted with the appointment scan bounded the way the policy bounds it.
- **`next dev` persists `unstable_cache` to `.next/dev/cache/fetch-cache`, on
  disk**, so it outlives the dev server Playwright starts and stops. With the
  seed corrected and the database demonstrably holding 56 and 153, the spec kept
  failing with 55 and 150 — the previous seed's numbers — until that directory
  was cleared. `perf-admin-stats.spec.ts` now asserts the first click is a cache
  MISS and names the directory.

**The rule both of them are instances of:** a measurement instrument that is not
itself under test will report the last true thing it knew. Before believing a
number from this harness, check that the reading is a MISS and that the seed
asserted the principal you are measuring as.

---

### 3.4 A migration's identity is its sha256. Every number beside it is a counter, and they have already stopped agreeing

BLUE's finding, re-derived here from the repository rather than transcribed —
and the re-derivation moved it, so the numbers below are the ones to carry.

**There are THREE numbers, and only one of them identifies anything.**

| | what it is | where |
|---|---|---|
| `_journal.idx` | a **0-based row counter** | `packages/db/migrations/meta/_journal.json` |
| `__drizzle_migrations.id` | a **1-based serial**, `idx + 1` | `drizzle` schema, in the database |
| the tag | the **file number**, `0078_…` | the filename |

**Where each coincidence ended, counted from the journal:**

- `idx` equalled the tag for `0000` through `0042`. **`0043` does not exist**, so
  from `idx 43 → 0044` the file's own counter has been one behind ever since.
  Anyone reading "id" off `_journal.json` and expecting the tag has been wrong
  since 0044, not since 0078.
- The database `id` equalled the tag right up to **`0075` (id 75 = tag 0075)**,
  which is why nobody noticed.
- **`0076` and `0077` do not exist either** — 0076 was reserved for the admin
  clinical branch and never released, 0077 was allocated and never landed. So the
  next row is **`id 76`, carrying tag `0078`**, and the coincidence is gone
  permanently. It does not resume: the gap does not close by itself.

Three tags are absent from the journal altogether: **`0043`, `0076`, `0077`**.

**IDENTITY IS THE FILE'S sha256**, stored in `__drizzle_migrations.hash`. The
repo's own 0075 post-check labels that line **"THE ONE THAT DECIDES."** Both
hashes reproduce from the files today, which is the whole point of the claim:

```
shasum -a 256 packages/db/migrations/0078_appointments_rls_nullary_location.sql
  68334d6a822088f2…   = the hash RLS-01 recorded for id 76
shasum -a 256 packages/db/migrations/0075_reminder_dispatches.sql
  e268bc0ddbaa7235…   = the hash scripts/0075-postcheck.sql pins for id 75
```

**Why it matters at Castelo Branco.** A second database built from these files
gets its own serial. Its `id` will not match this one's, and neither will match
the tag. Anything that answers "is this migration applied there" by comparing a
NUMBER is comparing two counters that were only ever equal by accident and are
not equal now. **Compare the hash.** `scripts/check-journal.mjs` already treats
`idx` as an ordinal rather than an identity — it asserts the journal's ORDER
matches the on-disk numeric order and never that the two numbers are equal — so
the repository's own guard is already on the right side of this. Reports and
apply blocks are what need to catch up.

**It has now been exercised once.** 0079 was applied to production on 2026-09-06
and is the first row numbered under this rule: tag `0079`, journal `idx` **76**,
database row **77**. Three numbers, none of them equal, on the very first
migration after the finding was written down. §6.1 has the run.

### 3.5 Ranking repoint candidates by attendance cannot tell treatment from clicks

BLUE's, and recorded here because the production run that would have exposed it
could not — the only holder it found was the account least able to expose it.

Section 3 of `scripts/pack04-orphan-identify.sql` is the part that decides where
an orphaned pacote should be repointed. It deliberately refuses to match
services by NAME — that was #1170's defect, and every one of these rows is
named `-` — and instead asks what the patients WHO HOLD the pacote are actually
booked for, ranking the live candidates by `count(*) DESC` over the holders'
appointments.

**That count cannot separate a patient's real treatment from an operator's
diagnostic clicks.** An appointment booked to exercise a screen and an
appointment booked to treat somebody are the same row in `appointments`, and the
ranking weighs them identically. There is no column that distinguishes them and
the script does not claim there is.

**It did not merely risk being wrong on the first production run. It failed.**
Section 3 returned THREE candidates for `7e3359a7`, not one:

```
NESA (270fb115)              2 appointments
Osteopatia / Posturologia    1
Fisioterapia                 1
```

By the script's own rule two or more is not an identification and the pacote is
left alone. **The repoint was authorised anyway, on a fact the script cannot
hold**: the only holder is the owner's test account, and the two
single-appointment rows are the owner and this lane clicking through the defect
on 02/09 and 04/09 while diagnosing it. Our own testing diluted the signal to
the point where the heuristic could not read it, and nothing in the database
says so.

It cost nothing this time only because the one holder is the account least able
to expose it (§6.2). **The first time an orphaned pacote belongs to a REAL
patient, nothing in the script marks which of that patient's appointments were
diagnostic**, and the leader of a diluted ranking will look exactly like an
identification. On a real patient's pacote, two or more candidates means ASK JP:
never take the leader, and never assume the extra rows were testing — that the
account is a test account is a fact only a human holds, stated in the
authorisation, never inferred from the data.

**This is now SR-54** (#1189), carried in the header of
`scripts/pack04-orphan-identify.sql` rather than only on a card, so the next
person to run it reads the limit before they read the ranking.

### 3.6 A worktree is a snapshot of `main` at the moment it was created, and committing from a stale one SILENTLY REVERTS somebody's merge

**This is the artifact collision one layer down, and unlike the artifact it is
not recoverable.** A stale render is repaired by the next render, because the
JSON is truth and the artifact is a picture of it. A stale COMMIT is truth: it
lands on `main` as a deliberate-looking change that removes work, and the only
thing that undoes it is somebody noticing.

**It was nearly paid for on 2026-09-06 and the near-miss is the whole record.**
BLUE's board worktree was created at `4e265efc`. PURPLE merged `#1199` after
that, which added two owner rulings to `SCHED-15`. Committing the worktree's own
copy of `docs/board/portal-board.json` — a file BLUE had every right to edit, and
was editing correctly — would have reverted both rulings, in a diff of a 400KB
JSON file where a removed paragraph is invisible. BLUE caught it by **diffing
their board against `origin/main` card by card before committing, rather than
trusting the worktree's age**, and the committed diff then touched only the three
things they meant to change.

**Why the usual defences do not fire.** `git` reports no conflict: one side
edited the file, the other side is simply older, and a rebase replays the newer
commit cleanly over the older base only if you HAVE rebased. The board validator
passes — a board missing a paragraph is still a valid board. `test:scripts`
passes for the same reason. The reconciler passes. **Every gate this repo has is
green on a board that has quietly lost a card's content**, because none of them
knows what the board said an hour ago.

**So the rule is a diff, not a discipline.** `§1.2` already says to rebase
immediately before a board commit; that is necessary and it is not sufficient,
because it is a thing a person has to remember at the right moment. What
actually catches this is comparing the object you are about to commit against
`origin/main` FIELD BY FIELD and looking at what DISAPPEARS. `LE-board-artifact-
has-no-merge-last-writer-wins` proposes exactly that check one layer up, for the
renderer; the same argument applies to the commit, and nothing implements it
there either. **Attention is not a mechanism.** It worked twice today; that is
not evidence it will work a third time.

### 3.7 Explaining a mechanism is not applying it, and the gap can be one paragraph wide

**§6.3 explains that the repoint's AFTER table selects every pack bound to the
TARGET, so a pre-existing correct binding is EXPECTED to appear there. The very
next paragraph treated that second row as a finding and invented a question for
JP.** Both paragraphs were written in the same sitting, by the same reader, into
the same section.

**The correction was inside the row that was already in hand.** The two pacotes
differ by `location_id` — one Linda-a-Velha, one Castelo Branco. The name, the
session count, the price and the id were all read. The clinic column was not. It
took a separate production read by the other lane to catch it, and the answer had
been sitting in the same result set the whole time.

**The mechanism, since "read more carefully" is not one.** Having produced an
explanation for why a result is not surprising, that explanation stops being a
hypothesis and starts being a conclusion, and the reading moves on. It felt like
the work was done because the hard part — knowing why two rows came back — WAS
done.

> **When a result surprises you and you can say why it should not have, name the
> column that would DISCRIMINATE the rows and read it BEFORE writing either
> sentence.** The explanation and the finding are two different claims and each
> needs its own evidence. Writing the first is not permission to skip the
> second.

It cost a false sentence on a handoff for about an hour, and a question put to a
stakeholder that did not exist. §6.3 carries the instance; this carries the
shape.

---

## 4. Traps this session paid for, so the next one does not

- **`pnpm test` through turbo does NOT forward `DATABASE_URL`.** It reported 681
  skipped in packages/db and 130 in apps/web while looking green. The only honest
  DB-gated proof is the three suites run directly, the way `db-tests.yml` runs
  them: `cd packages/db && DATABASE_URL=… pnpm exec vitest run`, then
  `cd apps/web && DATABASE_URL=… pnpm exec vitest run .db.test.ts`, then the same
  in `apps/api`. Never quote a turbo summary line as the DB-gated gate.
- **The board artifact is one URL shared by both lanes.** On a publish refusal,
  read the live version, recover the other lane's cards from the render's
  `#board-data` island, merge additively, publish the union, and commit only your
  own JSON. This happened twice in two sessions.
- **A negative control that does not fire is a finding about your fixture.**
  PERF-17's `patient_2_id` arm was not load-bearing until a control proved it:
  the fixture had given the secondary-only patient their own appointment inside
  the assignment, so the first arm reached them. Run the controls; do not assume
  the arms you named are the arms being exercised.

---

## 5. Where to start

`PERF-17`'s own file names the four call sites still uncovered —
`followup/scope.ts`, `followup/queries.ts` twice, `statistics/kpi-queries.ts`.
They need window and aggregate fixtures no class suite builds, and all four pass
`patients.id`, which is the shape already pinned. That is the natural next piece
of harness work and it is small enough to finish inside one session.

**Not opened by this session, deliberately.** Three dispatches on 2026-09-06
left all four unopened and each reaffirmed it, pointing here: they stay unopened
and this document names them as the next harness work.

### What actually opens the next session, and it is not that

**`PEDIDO_QUEUE_IS_DURABLE` is still `false`, on purpose, and flipping it is
BLUE's to run.** It is one line —
`apps/web/lib/reminders/confirm-page-gates.ts:94` — and it is recorded in BOTH
handoffs so neither lane re-derives why it is still false.

**Conditions 1 and 2 of its own reopening list are MET.** Migration 0080 created
`appointment_reschedule_requests`; `confirm-redeem.ts` writes the row INSIDE THE
PATIENT'S OWN TRANSACTION, the same transaction as the audit row, so if it does
not commit the patient is never told the request was received. It is independent
of `origin`, so a staff-created appointment produces one exactly like a portal
booking. `/notificacoes` renders the queue, scoped by an EXISTS against
`appointments`, so reception sees their locations' requests and BOTH
practitioners see their own — the owner's 2026-09-04 ruling, true by
construction rather than by a fan-out that could half-fail.

**CONDITION 3 IS THE OWNER'S AND HAS NOT HAPPENED**: he re-tests the control on
the deployed `/c/<code>` route. Not green CI — what failed here was a fact about
which screens exist, and CI asserted the button worked while nothing displayed
its output.

**THE ORDERING IS AWKWARD AND IS NAMED RATHER THAN QUIETLY RESOLVED.** The
constant gates the ACTION as well as the render, so the owner cannot exercise
the button while it is false. Flipping it is what makes his test possible, and
his test is what justifies the flip. The safe order, in the constant's own
words:

> **flip, he presses, the row appears on `/notificacoes` — and if it does not,
> revert one line.**

**What must NOT happen is the flip arriving as a side effect of shipping the
durable half, which is exactly how it was armed on a false comment last time**
(INC-CONFIRM-10; `#1146` was the hide-half that put it back to `false`). That is
why it is a separate one-line change and not part of 0080's commit. **Do not
flip it to make a test pass, and do not flip it because conditions 1 and 2 read
as done.** Condition 3 is a person looking at a screen.

---

## 6. The production runs of 2026-09-06

FOUR owner-run steps on production, after §3.4 was written: the 0079 apply, the
`pack04-orphan-identify` read, the `pack04-repoint-apply` write, and — at the
session close — the PACK-05 retirement. **No lane
measured any of it**, and nothing reported below was re-derived from a database
this session can reach — it is the owner's screen and his pasted output. What IS
re-derived, from `origin/main`, is every claim about what the scripts assert and
about what merged; those are marked as such.

Written across two dispatches the same day, so a few statements here correct an
earlier version of themselves rather than replacing it silently. Where that
happens the superseded claim is quoted, because a handoff that quietly rewrites
its own facts teaches the next reader to trust the wrong things.

### 6.1 0079 is applied, and since merged

- **Applied.** The journal is at **77 rows**, up from the 76 the pre-check
  required (`-v expected_before=76`). `service_role` **0** and `anon` **0**
  across **all 21** SECURITY DEFINER functions in `public`.
- **The 21 is the whole set, not a list.** Verified in the script: both rows
  count over `pg_proc … WHERE nspname='public' AND prosecdef`, with no name
  filter, so they cannot drift out of step with the twenty the migration names.
  The comment in `scripts/0079-postcheck.sql` says so outright — "over the whole
  SECURITY DEFINER set - not a list of twenty names this file could get out of
  step with."
- **Why 21 when the migration touches twenty.** `reminder_dispatch_tenant` is
  the twenty-first, and 0079 leaves it alone on purpose: 0075 already revoked
  PUBLIC, `anon`, `patient` and `service_role` from it by name. The post-check's
  own arithmetic agrees — `authenticated keeps the rest` expects **18** over the
  set minus three named exclusions (`custom_access_token_hook`,
  `assign_patient_number`, `jwt_patient_id`), and 18 + 3 = 21.
- **Three numbers, none equal.** Tag `0079`, journal `idx` **76**, database row
  **77**. §3.4 predicted exactly this and this is the row that demonstrates it.
  The 77 is also the row COUNT, which is a second coincidence and not a second
  proof: count equals max id only while nothing has ever been deleted.
- **Identity was answered by sha256 and read correctly every time.** Four
  row-identity answers across the pair — 0075 and 0078 in each script, 0079
  asserted ABSENT by the pre-check and PRESENT by the post-check — on a journal
  where no number matches its tag. **Three distinct hashes, not four**: each
  script names the same three files (`0075` `e268bc0d…`, `0078` `68334d6a…`,
  `0079` `eb3d48f0…`); it is the 0079 ROW that is asked about twice. Re-derived
  from both files.

**Nothing is owed on it now.** `#1175` merged as `f3a2b1df` later the same day,
and `main`'s journal reads 77 with the file present and hashing to `eb3d48f0…`.
For the few hours between the apply and the merge, every reader of
`packages/db/migrations` on `main` saw a database state that no longer existed;
§2 carries that as the standing rule, because the next migration reopens it.

### 6.2 The orphaned pacotes: one holder in the whole database, and it is the test account

`scripts/pack04-orphan-identify.sql` ran on production, against the three
archived services that carry a pacote — `7e3359a7` (was "Tratamento NESA"),
`a3c1ced1` (was "Tratamento Terapeutico") and `d75f251d`, which appears nowhere
in this repo but the PACK-04 card.

Section 1 still returns 3 rows, so the card was not stale. What the run added is
the column nobody had — **the holder count**:

```
7e3359a7    1 pack bound    1 patient instance
a3c1ced1    1 pack bound    0 patient instances    0 appointments
d75f251d    1 pack bound    0 patient instances    0 appointments
```

**Exactly one patient in the whole database holds an orphaned pacote, and it is
the owner's test account.** It is `7e3359a7`'s, the pacote `ce888bbb`. The other
two archived services have ZERO patient instances.

What that settles: **no real patient's paid sessions are sitting on an archived
service today**, and a pacote with no instance is a catalogue row nobody ever
bought, so `a3c1ced1` and `d75f251d` were never a money decision and never
blocked on one. They are catalogue hygiene, split out as **PACK-05** — which was
`blocked_on: jp` when this was written and **shipped the same evening; see
§6.4**. PACK-04's guard (#1182, merged) is what stops the set
growing — archiving a service that is the base of a pacote is refused and the
refusal names the pacotes.

Section 3 cannot identify those two and never could: it asks what the HOLDERS
attend, and with zero holders it has no input. An empty section 3 for a
holderless pacote is the CORRECT answer, not a broken query.

What the run does NOT settle is the method for the one that DID have a holder.
See **§3.5**: the ranking returned three candidates and therefore refused to
identify, and the repoint went ahead on a fact the script cannot hold.

### 6.3 The repoint ran, and PACK-01 closed on the owner's screen

`scripts/pack04-repoint-apply.sql`, one transaction, four refusals. It **wrote
exactly one row** — `service_packs.base_service_id` moved from the archived
`7e3359a7` to the live NESA `270fb115` — and its final check read
**`still_bound_to_archived = 0`**.

**PACK-01 then closed where it was always going to close: on the owner's screen,
not on a lane's verification.** The appointment drawer offers **`Pacote 10 —
NESA 7/10`** with **`Associar`**. The retroactive linker was never broken; it
had nothing bindable to offer, because the pacote's base service was a dead row.
One data write, and the surface #1118 shipped on 2026-09-02 started working.

**The AFTER table showed a SECOND pacote, and it is not a surprise — it is the
query's scope.** `cc1a9b6f`, **"NESA — 10 sessoes"**, already bound to
`270fb115` and correct before the run. The repoint's refusals count rows bound
to the SOURCE (exactly 1, or it aborts), while the AFTER table selects every
pack bound to the TARGET. So a pre-existing correct binding is EXPECTED to
appear there. `cc1a9b6f` was never in scope, was never touched, and a reader who
takes it for something the repoint did, or for a second thing that went wrong,
will be chasing nothing.

**It raises NO product question, and the sentence that said it did is struck.**

> ~~"Two ACTIVE products now sell ten NESA sessions at Linda-a-Velha: `ce888bbb`
> 'Pacote 10', the repointed one, and `cc1a9b6f` 'NESA — 10 sessoes'. Nothing in
> the data says which the clinic means to sell, or whether both. The owner puts
> it on PACK-05."~~ **THAT WAS FALSE. They are at DIFFERENT CLINICS.**

Read from production under SR-50 by BLUE rather than reasoned about, and
recorded on `PACK-05` (#1193):

```
ce888bbb-5519-4743-ac61-05248703fe7a  Pacote 10 - NESA    LV  10 sessions  39000  1 instance
cc1a9b6f-e878-45c1-83ac-3516ff383dbd  NESA - 10 sessoes   CB  10 sessions  35000  0 instances
```

One Linda-a-Velha at 390.00 EUR, one Castelo Branco at 350.00 EUR, and
`service_pack_location_prices` returns zero rows for both, so those base prices
ARE the prices. **Not a duplicate: one product priced per clinic.**

**And the pattern is the whole catalogue, not a coincidence of two rows.** All
FOURTEEN active pacotes split by clinic on the naming convention itself — CB
reads `<Service> - N sessoes`, LV reads `Pacote N - <Service>` — and every one
of the fourteen conforms. **Both rows also carry `created_at
2026-07-16 00:17:04.921+00`, the same millisecond**, so both came out of one
catalogue seed five days BEFORE the 2026-07-21 reconciliation that still saw the
NESA services live, and weeks before whatever renamed them to `-`. `cc1a9b6f`
has never been updated since; `ce888bbb`'s `updated_at` is the repoint.
**So it cannot have been created when the original broke, which was the specific
worry.**

**Where the error came from, since that is the part worth keeping.** The
repoint's AFTER table returned two rows and this document read a two-row result
as a two-product problem. Two rows bound to one service is what §6.3 already
explains as the query's SCOPE — and having explained it, the paragraph above
then treated the second row as a finding anyway. **The clinic column was never
looked at.** The correction cost one production read. PACK-05 stays what it
always was: the two archived services nobody has bought, `a3c1ced1` and
`d75f251d`, and no third question was ever added to it. It was `blocked_on: jp`
at the time of writing and is **shipped as of §6.4**. **The
general shape of that mistake is §3.7**, and it is worth more than this
correction.

### 6.4 PACK-05 is retired on production, and the stop condition was INSIDE the transaction

The fourth owner-run step, and the one that closes the PACK family. Owner ruling
2026-09-06: retire both products so neither can be sold while bound to a service
archived to `-`. Applied the same day, `#1198`, merged as `f3818d57`.

```
be8ec147  Pacote 10 - Tratamento Terapeutico                      LV  45000  -> retired
e291d05f  Pacote 5 - Pressoterapia / Drenagem Linfatica Mecanica   LV  15000  -> retired
```

Pre-check read 2 rows, both `pack_active=t`, both `base_active=f`, **both
instance counts 0**. The apply moved 2 rows, both now `is_active=f`, active packs
on archived services **0**, instances against the two still 0. Commit, exit 0.

**THE STOP CONDITION IS IN THE TRANSACTION, NOT ONLY IN THE PRE-CHECK, and that
is the part worth carrying.** The ruling says: if either row shows a patient
instance, do not write — money has moved and the decision becomes JP's. It is
checked at WRITE time, so a purchase landing between the read and the write
cannot slip through. **A pre-check is a photograph; a guard inside the
transaction is a rule.** The two commands are minutes apart in the owner's shell
and the database is live in between. It did not fire, which is the outcome a
guard is supposed to have.

**Five arms rehearsed on a fixture built with the real production ids, and the
production run was GATED on the rehearsal's exit code**: the success path, a
patient instance existing, one already repointed to a live service, one already
retired (refused — no half-ruling), and a SECOND run (refused loudly, 0 of 2
active). `is_active` is the right lever and it was checked rather than assumed —
`apps/web/lib/scheduling/data.ts:378` filters `servicePacks.isActive = true` for
bookable types, so clearing it makes the product unsellable and changes nothing
else. Deactivating is reversible; repointing the base services is not, and is
JP's.

**The services stay archived and orphaned BY DESIGN.** Nothing touched
`services`. A service nobody sells is inert, and §3.5 already records that no
script can identify a replacement for a pacote with no holders. **The family is
closed**: all three archived services are accounted for and each differently —
`7e3359a7` repointed, the other two with their products retired — and nothing
sellable now sits on a dead service.
