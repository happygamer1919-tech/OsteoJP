# R22 READ, 2026-10-30: why the reminder sweep did not take the marks the sleeping job took

**READ ONLY. One block. No apply, no write.**
**Status: AUTHORED 2026-10-30 by SOLO's builder; THE SQL REHEARSED ON THROWAWAY DATABASES ON THE LOCAL STACK (lane blue, synthetic rows, the cases below); THE BLOCK PROVEN BY ITS FAULT-INJECTION TEST (`scripts/read-sweep-unexplained-20261030.test.mjs`); THE BLOCK REHEARSED IN A FAKE APPLY LAYOUT WITH REAL git AND shasum UP TO THE TARGET GUARD, WHICH REFUSED THE LOCAL TARGET, AS IT MUST; ITS PRODUCTION PATH NOT REHEARSED (see "NOT REHEARSED"). NOT YET REVIEWED (R4).** The block's two value lines read `PENDING` here; GREEN pastes its dispatch's filled copy, in which `PRHEAD` is the pull request's head commit SOLO names.

## Why this read exists

Strategy's R22 of 2026-10-30, its words: "Read-only, one row per unexplained visit, no personal data: status, created against mark, which audit actions exist, origin, location, the live job's outcome, and everything the sweep's selection reads at each pass."

R20 (`scripts/db/read-shadow-compare-20261029.sql`, `docs/read-shadow-compare-20261029.md`) compared the reminder sweep's shadow with the sleeping job. GREEN ran it on Friday 2026-10-30 at 18:18 Lisbon. Verdicts 0 to 10 were OK, and on Monday 10-26 to Wednesday 10-28 both sides took 337 marks. It also found reminders the sleeping job claimed and the sweep never took, which none of R20's candidate labels explains (run only, UNEXPLAINED): 8 marks on the full days (6 visits), and 2 more on Thursday 10-29 (on 2 of those same visits). This read names, per such mark, which predicate of the sweep's selection was false. It decides nothing and writes nothing.

## What it reads

`scripts/db/read-sweep-unexplained-20261030.sql`, sha256 `c47dd7284d4aa7a5fb2214814de140096135d4a676d78a5cbe667f20143d2af9`. One result set, columns `n | check | observed | expected | verdict`, ordered by mark and then by `n`.

**The set is R20's, recomputed, never typed in.** Lines 103 to 402 of the read are a byte-for-byte copy of R20's lines 145 to 444 (from `clock as (` to the end of `pc`, at `e604854b`, merged as #1670): the window, the sides, the comparison key and the candidate labels, unchanged. The test fails if one byte of that span differs. An unexplained mark is a `pc` row with side `run_only` and category `UNEXPLAINED`, on ANY Lisbon day from `t0` to the read's clock (R20 judged only Monday to Wednesday). No appointment id is written in the repository.

**What it prints.** Lisbon times, minutes, counts, the fixed labels of offsets, channels, statuses, origins, audit action names, ledger outcomes and suppression reasons, appointment ids, location ids and location names. No tenant id, patient id or staff id, no name of a person, no phone, no email address, no message text, no note. Of the audit metadata it prints only the fields the reminder code reads, each as a fixed word or `other`: `toStatus` and `fromStatus` (one of the five statuses), whether `startsAt` is this start or another one, `via` (`portal_request_confirm` or `other`), and whether each scheduling-save arm matched. It never prints stored metadata text.

**What the sweep's selection reads, and how each is evaluated here.** `apps/web/lib/reminders/sweep.ts` `selectDueMarks` takes, per tenant and per offset, the visits where `dueVisits`, `hasSchedulingEvent` (because `REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER` is `false`) and `notTakenBySweep` all hold, at most 50 a pass (oldest mark first), inside `withReminderTenantContext` (`context.ts`: role `authenticated`, claims `tenant_id` and `user_role` `admin`, no user id). Each predicate is evaluated as of each pass, from the rows that existed then:

| Predicate | Source | As of the pass |
|---|---|---|
| P1 tenant | `dueVisits`: `appointments.tenant_id` = the pass's tenant | the visit row under the claim's tenant |
| P2 start | the selection reads the start the visit has at the pass; another start is another key | the `startsAt` of the latest `appointment.create` or `appointment.reschedule` row written at or before the pass, when the visit was moved after the pass; the start now when it was not. `?` when it cannot be reconstructed |
| P3 status | `dueVisits`: status `scheduled` or `confirmed` | the `fromStatus` of the first audit row after the pass that carries a `toStatus`; the status now when there is none. `?` when that row records no `fromStatus` |
| P4 ahead | `sweepStartRange.after`: the start is after the pass's clock | the claimed start against `pass_at` |
| P5 due | `sweepStartRange.limit`, `sweepLookAheadLimit`: start at or before `pass_at` plus the offset; for the 21:45 pass, before 23:00 Lisbon plus the offset | recomputed from `pass_at`; a row says when it differs from the `look_ahead_before` the pass recorded |
| P6 created | `dueVisits`: `created_at` before the mark | the claimed start minus the offset |
| P7 scheduling | `reminder-population.ts` `hasSchedulingEvent`, predicate by predicate, read under `audit_log_tenant_select` (tenant only) | a save of the visit's tenant written at or before the heartbeat's `created_at`; beside it the same over every tenant's rows |
| P8 not taken | `notTakenBySweep`: no shadow row and no live `sweep` claim (not early, not released) of this key | written before the pass |
| the pass | its heartbeat | due, recorded and left-out counts, over the ceiling |
| NOW | the row-level security the job's context reads under | the policies on `appointments` and `audit_log` as they are NOW (rows 10 and 11), labelled NOW: a policy cannot be read as of a past pass |

The passes evaluated per mark are every shadow heartbeat of the visit's tenant from 75 minutes before the mark (the 21:45 look-ahead) to the claimed start. Under the job's context, `appointments_rls` admits an `admin` claim with no user id to every row of its tenant (`NOT viewer_has_location_assignment()`), and `audit_log_tenant_select` admits every row of its tenant; row 11 prints the count of restrictive policies, which would narrow that.

**Two clocks, as in R20.** P4 and P5 compare with `pass_at`, the pass's own clock. "The rows that existed then" (P2, P3, P7, P8) compares a row's database `created_at` with the heartbeat's `created_at`, the start of the pass's transaction. A row written in the same few milliseconds, or one whose transaction began before the pass and committed after it, is the case this cannot place exactly.

## THE VERDICTS, AND WHAT EACH EXPECTS

A PASS is **5 OK / 0 VACUOUS / 0 FAIL**. A zero is never a pass: a verdict whose subject is empty reads VACUOUS.

| n | Verdict | EXPECT (OK) | VACUOUS when | FAIL when |
|---|---|---|---|---|
| 0 | the transaction is READ ONLY | `on` | never | anything else |
| 1 | the recomputed unexplained set is not empty | one or more marks | none | never |
| 2 | Monday 10-26 to Wednesday 10-28: the set R20 printed on 2026-10-30 18:18 | 8 marks over 6 visits | the set is empty | any other count: the set moved since R20's run (a save or a claim since then). The rows are still the current set; SOLO reads them |
| 3 | Thursday 10-29: the marks R20 printed | 2 marks, both on visits of the Monday-to-Wednesday set | the set is empty | any other count, or a Thursday mark on another visit |
| 4 | every unexplained mark has its visit row and is evaluated at one or more passes | 0 without a visit row, 0 with no pass | the set is empty | any |

The counts in verdicts 2 and 3 are R20's result as relayed in the brief for this read (SOLO's record of GREEN's report of 2026-10-30); this builder did not see that output.

**The INFO rows (never counted):**

| n | What |
|---|---|
| 10 | NOW: the `SELECT` and `ALL` policies on `appointments` and `audit_log`: name, command, permissive or restrictive, roles |
| 11 | NOW: the count of restrictive policies on the two tables, and whether row security is on |
| 20 | per mark: appointment id, Lisbon day (full or partial), mark, offset, channel, claimed start, claim time, and what the claim ended as (R20's `r_out`) |
| 21 | per mark, the visit NOW: status, origin, location id and name, start now (the claimed start or not), created, created minus mark in minutes, updated (before or after the mark) |
| 22 | per mark: every `reminder_claims` row of the appointment, both offsets, any start (claims with taker, early and attempt; releases; shadow rows with `saved_after_mark`) |
| 23 | per mark: every reminder ledger row of the appointment: time, template, outcome, suppression reason |
| 24 | per mark: every audit row of the appointment: time, action, tenant match, and the scheduling fields only |
| 26 | per mark and pass: P1 to P8, each `T`, `F` or `?`, `EVERY`, and the heartbeat's counts |
| 27 | per mark, the summary: passes, passes with the mark in range (P4 and P5), how many of those each predicate was false at, **the predicates false at EVERY pass in range** (the cause), and the first pass, if any, at which every predicate held |

**How to read row 27.** A predicate false at every pass in range is the reason the selection never returned the mark. "none" with `every predicate held at 0 passes` means different predicates failed at different passes; read rows 26. `every predicate held at N passes` with N above 0 means that, as reconstructed, the selection would have returned it: then the cause lies outside the reconstructed predicates (the ceiling, a pass that read before a row committed, or the NOW rows), and rows 26 show the passes.

## Known limits

- A status change that wrote no audit row with a `toStatus` cannot be seen (P3 reads the status now for every pass after the last such row).
- A move that wrote no `appointment.reschedule` row cannot be seen (P2).
- The ceiling is read from the heartbeat only: which marks a pass over the ceiling deferred is not recorded anywhere.
- Row-level security is read NOW, as policy names, not evaluated as the job's principal.
- Run time on production is not measured; its inputs are R20's (which ran inside the same 120 seconds) plus, per unexplained mark, a few hundred heartbeats and the visit's audit trail.

## THE HALT RULE

Any STOP line ends the block: nothing after it is pasted or run again, and GREEN reports the output as printed. A REFUSE line from the target guard, and any harness or classifier refusal, is a STOP. **Nothing in this block writes to production, so no STOP leaves anything changed there.** A VACUOUS or FAIL verdict stops the block after the table has been written: GREEN reports the lines as printed.

## Pins

| What | Pin |
|---|---|
| The read | `scripts/db/read-sweep-unexplained-20261030.sql`, sha256 `c47dd7284d4aa7a5fb2214814de140096135d4a676d78a5cbe667f20143d2af9` |
| The target guard | `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96` (the bytes R20's document pins) |
| The guard's module | `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c` (the same) |
| This document | the dispatch names its sha256 in `DOCSHA`, and the sidecar `docs/read-sweep-unexplained-20261030.sha256` pins it |
| The commit | the dispatch names the pull request's head commit in `PRHEAD`; the block fetches `refs/pull/1672/head` and refuses any other sha |

**Why the pull request's head and not `main`.** `main` is frozen until another pull request merges, so this one is not merged before GREEN runs it. The block fetches `refs/pull/1672/head`, which GitHub keeps after a branch is deleted, and checks out the head commit by its full sha.

## When

Any time after the pull request is READY, while no other GREEN sitting runs. It is read only, so clinic hours do not bind it, and it has no clock bound. The block prints the Lisbon time for the record.

## Where the output goes

To `/Users/ivan/osteojp-handover/r22-unexplained-read-20261030.out` and nowhere else: it holds appointment ids and location names, so it never goes into the repository, a pull request, a card or a commit. psql writes it there directly (`> ${OUT} 2>&1`, no `tee`). **GREEN never opens that file**; the block prints only the verdict counts. GREEN reports those lines and the file's path; SOLO reads the file.

## THE BLOCK

GREEN pastes its dispatch's filled copy, whole and on its own, from `/Users/ivan/Projects/GitHub/osteojp-prod-apply`. This copy STOPs at its first check.

```
(
set -o pipefail
PRHEAD=PENDING
DOCSHA=PENDING
PRNUM=1672
SHAREAD=c47dd7284d4aa7a5fb2214814de140096135d4a676d78a5cbe667f20143d2af9
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READFILE=scripts/db/read-sweep-unexplained-20261030.sql
DOC=docs/read-sweep-unexplained-20261030.md
OUTDIR=/Users/ivan/osteojp-handover
OUT=/Users/ivan/osteojp-handover/r22-unexplained-read-20261030.out
echo "${PRHEAD} ${DOCSHA}" | grep -qxE '[0-9a-f]{40} [0-9a-f]{64}' || { echo "STOP: the head commit or the document's sha256 still reads PENDING, so it is NOT READY. Nothing was read"; exit 1; }
ZONE=$(TZ=Europe/Lisbon date +%Z) || { echo "STOP: the Lisbon clock could not be read. Nothing was read"; exit 1; }
[ "${ZONE}" = "WET" ] || [ "${ZONE}" = "WEST" ] || { echo "STOP: the Lisbon zone reads [${ZONE}], not WET or WEST. Nothing was read"; exit 1; }
NOW=$(TZ=Europe/Lisbon date +%Y%m%d%H%M) || { echo "STOP: the Lisbon clock could not be read. Nothing was read"; exit 1; }
echo "lisbon now:  ${NOW} ${ZONE}"
[ -d "${OUTDIR}" ] || { echo "STOP: the handover folder is not there. Nothing was read"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was read"; exit 1; }
DIRTY=$(git status --porcelain) || { echo "STOP: the worktree's status could not be read. Nothing was read"; exit 1; }
[ -z "${DIRTY}" ] || { echo "STOP: the apply worktree is not clean. Nothing was read"; exit 1; }
git fetch origin "refs/pull/${PRNUM}/head" || { echo "STOP: the pull request's head could not be fetched. Nothing was read"; exit 1; }
FH=$(git rev-parse FETCH_HEAD) || { echo "STOP: the fetched head could not be read. Nothing was read"; exit 1; }
[ "${FH}" = "${PRHEAD}" ] || { echo "STOP: the pull request's head is [${FH}], not the commit the dispatch names. Nothing was read"; exit 1; }
git checkout --quiet --detach ${PRHEAD} || { echo "STOP: the head commit could not be checked out. Nothing was read"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was read"; exit 1; }
[ "${HD}" = "${PRHEAD}" ] || { echo "STOP: the worktree is not on the head commit [${HD}]. Nothing was read"; exit 1; }
echo "checked out: ${HD}"
D=$(shasum -a 256 ${DOC} | cut -d' ' -f1) || { echo "STOP: this document could not be hashed. Nothing was read"; exit 1; }
echo "document:    ${D}"
[ "${D}" = "${DOCSHA}" ] || { echo "STOP: this document is not the one the dispatch names. Nothing was read"; exit 1; }
shasum -a 256 -c docs/read-sweep-unexplained-20261030.sha256 || { echo "STOP: the sidecar does not pin this document. Nothing was read"; exit 1; }
R=$(shasum -a 256 ${READFILE} | cut -d' ' -f1) || { echo "STOP: the read could not be hashed. Nothing was read"; exit 1; }
echo "read:        ${R}"
[ "${R}" = "${SHAREAD}" ] || { echo "STOP: the read on disk is not the reviewed file. Nothing was read"; exit 1; }
G=$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1) || { echo "STOP: the target guard could not be hashed. Nothing was read"; exit 1; }
echo "guard:       ${G}"
[ "${G}" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. Nothing was read"; exit 1; }
M=$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1) || { echo "STOP: the guard's module could not be hashed. Nothing was read"; exit 1; }
echo "module:      ${M}"
[ "${M}" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file. Nothing was read"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. Nothing was read"; exit 1; }
node scripts/assert-production-target.mjs || { echo "STOP: the target guard refused or failed (its lines are above). Nothing was read"; exit 1; }
rm -f ${OUT} || { echo "STOP: the old transcript could not be removed. Nothing was read"; exit 1; }
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -c "begin read only" -c "set local statement_timeout = '120s'" -c "select 'read only: ' || current_setting('transaction_read_only') as r22_read_transaction" -f ${READFILE} -c "rollback" > ${OUT} 2>&1 || { echo "STOP: the read did not complete (an error, or longer than 120 seconds; psql's lines are in ${OUT}), or its transcript could not be written. Nothing was written: the transaction is read only"; exit 1; }
grep -q 'read only: on' ${OUT} || { echo "STOP: the read did not run inside a transaction that read as READ ONLY (psql's lines are in ${OUT}), so its table is not reported"; exit 1; }
CNT=$(awk -F'|' '{ v = $NF; gsub(/[[:space:]]/, "", v); if (v == "OK") o++; else if (v == "VACUOUS") a++; else if (v == "FAIL") f++ } END { printf "%d OK / %d VACUOUS / %d FAIL", o, a, f }' ${OUT}) || { echo "STOP: the verdicts could not be counted. The table is in ${OUT}"; exit 1; }
echo "verdicts: ${CNT}"
[ "${CNT}" = "5 OK / 0 VACUOUS / 0 FAIL" ] || { echo "STOP: the read has a FAIL or a VACUOUS verdict, or a verdict is missing. The table is in ${OUT}; GREEN does not open it, SOLO reads it"; exit 1; }
echo "R22-READ PASSED: 5 OK / 0 VACUOUS / 0 FAIL. The whole table is in ${OUT}; GREEN does not open it, SOLO reads it"
)
```

**EXPECT:** `lisbon now:  <the time> WET`; `checked out: <PRHEAD>`; `document:`, then `docs/read-sweep-unexplained-20261030.md: OK`; `read:`, `guard:`, `module:`, each the pinned sha256; the target guard's four lines; `verdicts: 5 OK / 0 VACUOUS / 0 FAIL`; `R22-READ PASSED: ...`. Exit 0. psql prints nothing to the terminal: the table is in `/Users/ivan/osteojp-handover/r22-unexplained-read-20261030.out` only. **REPORT THESE LINES AND THE FILE'S PATH.** It writes nothing to production.

**STOP:** any `STOP:` line. The likely ones: `NOT READY` (the dispatch was not filled in); `the pull request's head is [...]` (the pull request moved after the dispatch was written: SOLO writes a new dispatch); `a FAIL or a VACUOUS verdict` (the read ran and the table is in the file: report the printed lines and the path, and SOLO reads the file).

## Rehearsal (2026-10-30, throwaway databases on the local stack, lane blue, synthetic rows)

The `public` schema copied from lane blue's database (`node scripts/lane-stack.mjs up --lane blue`, the repository's migrations) with `pg_dump --schema-only`, into a throwaway database per case, made from one seeded base: R20's base carried to Friday. One synthetic tenant (and a second with no visit of its own), one synthetic clinic row, 14 synthetic visits (Monday 10-26 to Sunday 11-01, 10:00 and 15:00 Lisbon) each with an `appointment.create` audit row, a shadow heartbeat every 15 minutes from Sunday 15:30 to Friday 18:45, and for every mark in the window a sleeping-job claim, a `sent` ledger row and a shadow row in the first pass at or after the mark. Every base mark is taken by both sides. The three appointment foreign keys to people and clinics were dropped in the throwaway so no synthetic person had to be made. The read ran as the block runs it (`begin read only`, 120 seconds, `rollback`), with ONE substitution: its single clock line `select now() as t1` replaced by 2026-10-30 19:00 Lisbon. Each case adds one visit with a sleeping-job claim and no shadow row, built so that exactly one predicate is false. The test runs these cases whenever `R22_READ_TEST_PGURL` names a local database, and refuses any other host.

**Run of 2026-10-30 (lane blue): 13 cases, the test's database part 1 of 1 passing.**

| Case | What was seeded | Verdicts | Row 27 printed |
|---|---|---|---|
| clean | the base | 0 OK, 1 to 4 VACUOUS | no mark; a base visit's id is not printed |
| R20's profile, and the sweep that lost them | 6 visits whose marks every predicate admits and that have no shadow row: 8 marks Monday to Wednesday, 2 on Thursday on two of them | 5 OK | `false at EVERY pass in range: none`, `every predicate held at 120 passes, first 2026-10-26 11:00:03` (U001); rows 20 to 26 checked field by field |
| P1 tenant | the visit row is under another tenant than the claim | 0, 1 OK; 2, 3, 4 FAIL | `P1 tenant, P7 scheduling` (its audit row is under that other tenant too); P2 and P3 read `?` |
| P2 start | booked at another start, moved to the claimed start after the claimed start | 0, 1, 4 OK; 2, 3 FAIL | `P2 start` |
| P3 status | `cancelled` at every pass, set back to `scheduled` after the start | 0, 1, 4 OK; 2, 3 FAIL | `P3 status` (row 26: `P3 status F (cancelled)`) |
| P4 and P5 range | no heartbeat between the mark and the start | 0, 1, 4 OK; 2, 3 FAIL | `passes 5, of them with the mark in range 0`, `no pass had the mark in range` |
| P6 created | created after its mark | 0 OK, 1 to 4 VACUOUS | not in the set: R20 labels it R3, so P6 can never be the cause of an UNEXPLAINED mark |
| P7 scheduling | no scheduling save until after the start | 0, 1, 4 OK; 2, 3 FAIL | `P7 scheduling` (row 26: `P7 scheduling F (any tenant F)`) |
| P7, another tenant | the only scheduling save is under another tenant | 0 OK, 1 to 4 VACUOUS | not in the set: R20's R4 reads only the visit's own tenant's saves, so it labels this R4 |
| P8 not taken | a live claim of taker `sweep` of the same key before the mark | 0, 1, 4 OK; 2, 3 FAIL | `P8 not taken` |
| the ceiling | every predicate holds, every pass in range over the ceiling | 0, 1, 4 OK; 2, 3 FAIL | `over the ceiling 60`, `none`, `every predicate held at 60 passes` |
| MUTANT 1 | the P7 case, with P7's as-of-the-pass bound removed | 0, 1, 4 OK; 2, 3 FAIL | `none`, `every predicate held at 60 passes`: without the bound the cause disappears |
| MUTANT 2 | the P3 case, with the status read NOW instead of reconstructed | 0, 1, 4 OK; 2, 3 FAIL | `none`: without the reconstruction the cause disappears |

Verdicts 2 and 3 read FAIL in the single-mark cases because their counts are R20's production counts (8 and 2), which only the profile case reproduces.

## The block in a fake apply layout (2026-10-30, 19:15 Lisbon)

The block, filled with `PRHEAD=c715e0cb930c185ffa41905da90ab0d12e1f0435` (this pull request's head at the time) and that commit's document sha256, was run in GREEN's tool shape (`true && eval '<block>' < /dev/null && echo TOOL-CHAIN-CONTINUED`, `bash --noprofile --norc`) with real `git`, `shasum`, `node` and `date`. Three substitutions, and only these: the apply checkout was a clone of a local bare repository in the scratch folder (holding only `refs/pull/1672/head`, no branch), the handover folder a scratch folder, and the environment file a scratch file naming the lane blue database on 127.0.0.1. What it showed:

- `lisbon now:  202610301915 WET`; `git fetch origin "refs/pull/1672/head"` fetched it to `FETCH_HEAD`; `checked out: c715e0cb930c185ffa41905da90ab0d12e1f0435`; the document, sidecar (`docs/read-sweep-unexplained-20261030.md: OK`), read, guard and module hashes all matched their pins.
- The target guard printed `REFUSING: project ref is "postgres", not the production project.` and the block STOPped: `STOP: the target guard refused or failed`. It is not got past (the lead's rule of 2026-09-30).
- With `refs/pull/1672/head` pointed at the branch's first commit, the block STOPped: `the pull request's head is [175a134e...], not the commit the dispatch names`. With the ref deleted: `fatal: couldn't find remote ref` and `STOP: the pull request's head could not be fetched`.

## NOT REHEARSED

The block itself reads only production: its target guard refuses anything else, and the lead's rule of 2026-09-30 forbids getting past a guard on a throwaway ("A block that cannot run on the throwaway is recorded as NOT REHEARSED and the document says so"). So the block's production path is NOT REHEARSED: the environment file, the target guard against the real target, the connection and the psql call through the block, and `git fetch origin refs/pull/1672/head` against GitHub in the real apply checkout (it was rehearsed against a local bare repository, above). What stands in for it: the SQL run above with exactly the block's psql arguments and one named clock substitution, and the fault-injection test, which runs the block in GREEN's tool shape in bash and zsh with every external command a stub, fails each call in turn, and proves every halt is explicit and that the block passes only on `5 OK / 0 VACUOUS / 0 FAIL`.
