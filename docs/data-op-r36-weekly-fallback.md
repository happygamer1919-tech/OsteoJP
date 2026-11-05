NOT READY: authored 2026-11-05, awaiting R4 review, a rehearsal by another session and SOLO's READY line.

# R36: the weekly fallback sittings, while the reminder sweep is still in shadow

**Status: AUTHORED 2026-11-05 BY A BUILD SESSION ON STRATEGY'S RULING B6. NOT REVIEWED. NOT REHEARSED. NOT RUN.** Nothing in this document may be pasted until the first line reads READY. WEEKLY, BEFORE YOU START carries `PENDING` in the six lines GREEN's dispatch fills, and STOPs at its first check while it does.

**In plain words.** On Wednesday 2026-11-04 the fallback re-arm (`docs/data-op-r36-fallback-rearm-20261104.md`, "the R36 document" below) gave a fresh reminder job to every qualifying appointment starting within the next 28 days, and its second pass on Thursday 2026-11-05 reached the visits Wednesday skipped. That covers visits up to about Wednesday 2026-12-02. If the reminder sweep is still in shadow (sending nothing) on Friday 2026-11-13, this document runs the same re-arm once more that night, reaching 28 days from its read, so up to about Friday 2026-12-11. It sends nothing for a visit an earlier sitting already re-armed at the start it still has: this operation's marker holds those, and the program skips them. It writes nothing to the database. It sends one scheduling event per appointment it re-arms, behind the same refusal that stops it if the sweep is sending.

**It runs ONLY if the sweep stays in shadow.** If Friday 11-13 becomes the night the sweep is switched to sending (strategy's B8), no weekly sitting runs, that night or after.

| Fact | Value |
|---|---|
| Rulings | Strategy, B6 and B8 (2026-11-05), and Q-R36-F1 (2026-11-01), quoted in the next section |
| Program | `packages/db/scripts/r36-fallback-rearm-emit.mjs`, **unchanged**: the file the R36 document pins and its rehearsal ran (sha256 `1795c035...f454`). It runs `packages/db/scripts/inc-1007-rearm-reminders-emit.mjs` (the program of 2026-10-12, unchanged). See "Why the program does not change" |
| Tests | `scripts/r36-weekly-fallback.test.mjs`: this document's blocks statically, under fault injection in bash and zsh against the program's real output, its scenarios, its pins, its nights and dates, and the program's settled-marker refusals at a week's distance. The program's own tests are unchanged (`scripts/r36-fallback-rearm-emit.test.mjs`) |
| Who runs it | GREEN, an apply-only session, on the owner's dispatch naming `packages/db/scripts/r36-fallback-rearm-emit.mjs`, in a closed window with the owner at the keyboard. The session that wrote this never runs it |
| Run from | The HELD head of THIS document's pull request, fetched as `refs/pull/1726/head` (`PR=1726` in WEEKLY, BEFORE YOU START; the later blocks run on the head it recorded) and compared to HELD, in `/Users/ivan/Projects/GitHub/osteojp-prod-apply`. That ref survives the branch being deleted. It does not read `origin/data/R36-fallback-rearm-20261104` (#1690) |
| When | Only a night strategy has ruled for a weekly sitting, listed in every block as `NIGHTS`. **Today: `20261113` only (Friday 2026-11-13).** From 21:00 Lisbon that day until 06:29 Lisbon the next morning |
| Scope | `--max-days-ahead 28`: appointments starting more than 24 hours and no more than 28 days after each read, that this operation's marker does not hold as sent at their present start |
| What it sends | One `appointment/scheduled` event per eligible appointment, `confirmationEligible: false`, with NO event id of its own |
| What it writes to Postgres | Nothing. Every read is a READ ONLY transaction |
| What it writes locally | New rows in this operation's marker `~/.osteojp-r36-fallback-rearm/.osteojp-inc1007-rearm.json` (the same file as Wednesday's and Thursday's) and, while a run sends, the lock beside it. Records and transcripts under `/tmp/r36w-` |
| Production tenant | `--tenant-slug osteojp` |
| Rollback | None is needed and none exists |
| Replay | Never pressed, by anybody, on any event or run |
| Tier | C, a production data op: held, R4 and a rehearsal before READY |

## The rulings

Strategy's words, character for character, as the dispatch to this session quoted them:

> B6 (2026-11-05): "Author, R4 and rehearse the weekly fallback blocks now, so Fri 11-13 is ready if there is still no switch."

> B8 (2026-11-05): Fri 11-13 can instead be the switch night if the sweep's conditions close by then, and then no weekly sitting runs.

B8 is the dispatch's summary of the ruling, not a quotation of it. Q-R36-F1, as the R36 document records it:

> "Q-R36-F1 = YES, conditional. Only if still in shadow after a fallback: a fallback sitting every Wednesday from 11-11, the last by Wed 11-25, then strategy re-rules."

B6 moved the first weekly night from Wednesday 11-11 (a migration night: Mon 11-09 to Thu 11-12 are migration nights, `CAL-migration-sittings-2026-11-08-to-2026-11-18`) to Friday 11-13. Wednesday 11-18 is the `0113` migration night and is never a weekly night. The last weekly sitting is by Wednesday 11-25, then strategy re-rules. **Every night after 11-13 is added to `NIGHTS` only on strategy's ruling, by a change to this document** (a new sha256, an R4 round on the changed bytes, a new READY line, a new HELD); see "Questions for strategy".

## What it re-arms, and why

**The reach so far.** Wednesday 11-04's sitting re-armed every qualifying visit starting from its read plus 24 hours to its read plus 28 days, so up to about Wednesday 2026-12-02 21:00. Thursday 11-05's second pass reached up to its read plus 27 days, about the same instant. The first visits beyond them start on Thursday 2026-12-03, and their 48 hour emails fall due from **Tuesday 2026-12-01 at 08:00**. So without the switch, a sitting must run by the night of Monday 2026-11-30 at the latest; Friday 11-13 leaves two weeks of margin.

**What Friday 11-13 reaches.** A sitting that starts at Friday 2026-11-13 21:00 Lisbon reaches visits starting up to **Friday 2026-12-11 21:00**, each with a job that sleeps 27 days at most (the SMS of a visit at 20:59 on 12-11). The first visits beyond it start on Saturday 2026-12-12, and their emails fall due from Thursday 2026-12-10 at 08:00, so the next sitting, or the switch, is needed by the night of Wednesday 2026-12-09.

**What it sends to**, by the selection of 2026-10-12, unchanged (the R36 document, "Which appointments get an event", is the full text):

- **the visits from Thursday 12-03 to Friday 12-11** that no earlier sitting could reach: the purpose of the sitting;
- **any visit inside the 28 days that is not in the marker at the start it has now**: a visit booked or moved since Wednesday (its own save sent an event, so it already has a fresh job; the new event replaces it with another, which is harmless, as on 2026-10-12), a visit moved in the patient portal since (its job sleeps to the old time; this gives it one at the new time), and a visit an earlier sitting skipped as touched and nobody touched since;
- **never** a visit the marker holds as sent at its present start: `skipped: already sent by an earlier run (marker)`. Its job from Wednesday or Thursday sleeps 27 days at most from that night, inside the scheduler's published 30 days, so it needs nothing. Nothing is sent twice at the same start.

**What stays out:** a visit starting within 24 hours of the read; a visit touched in the last 25 hours (rule 7, with the residual the R36 document describes in Q-R36-F5: a confirm that sent nothing keeps its old job; the blocks count it for the owner); a visit the marker holds as attempted (none, by the first block's check).

**The cost.** Every eligible appointment costs at most 8 executions while the sweep is in shadow; G1 bounds everything in scope at 769 appointments, as on Wednesday, and a confirm is refused at `NO`.

## How the weekly sitting uses the marker

The R36 document's BEFORE YOU START refuses a non-empty marker by design, and its second pass is fixed at 27 days, Thursday and no canary. This document has its own four blocks and its own records in `/tmp/r36w-`, so nothing of Wednesday's or Thursday's records is read, and their blocks cannot be pasted on a weekly night (their night checks require a Wednesday or a Thursday).

- **The marker must hold the earlier sittings, settled, and exactly as the last sitting left it.** WEEKLY, BEFORE YOU START runs its dry run with `--second-pass`, the program's settled-marker check, which refuses an empty marker (`holds no sending run`), a marker with a row of unknown outcome, and a lock beside the marker, before anything is read from production. Its other condition, a first sending run 25 hours or more before, holds by nine days on 11-13. The block then requires the G3 line's count of appointments checked to EQUAL `PRIORK`, the count the last sitting's closing line printed, which GREEN's report of that sitting carries. A marker that is empty, smaller, larger, or replaced stops the block.
- **The canary checks it again:** its dry run's G3 count must still equal `PRIORK` (nothing was sent between the two blocks), and THE WEEKLY REST and THE WEEKLY CLOSING DRY RUN require at least `PRIORK + 5`.
- **The marker's folder is the same,** `~/.osteojp-r36-fallback-rearm/`, fixed in the program. It is meant to be: the marker is what keeps every earlier send from going out again. So a weekly sitting runs on the same machine as Wednesday's and Thursday's.
- **Never delete or edit the marker.** A lock left by a killed run is a halt, and the lead rules on it.

### Why the program does not change

The task allowed a minimal change (a weekly mode). None is needed, so none is made: every guard a weekly sitting needs is already in the reviewed and rehearsed program, and the blocks carry the rest.

| A weekly sitting needs | Where it is |
|---|---|
| a non-empty marker, no attempted row, no lock, before the first read | `--second-pass` in the program (its refusals: `holds no sending run`, `row(s) of unknown outcome`, `lock is present`); unit-tested in `scripts/r36-fallback-rearm-emit.test.mjs`, and again at a week's distance in `scripts/r36-weekly-fallback.test.mjs`; the attempted count is also grepped by the block |
| the marker exactly as the last clean sitting left it | the block: G3's count equals `PRIORK` |
| a canary with a non-empty marker | the program never refused one; only the R36 document's canary block did (`marker: 0`). The weekly canary block does not ask for it |
| `--max` at most 200, `--max-days-ahead` at most 28 | the program refuses more (exit 2, before any read); the blocks pass 5 or 200, and 28 |
| a ruled night only | the blocks: `NIGHTS` |

The cost of keeping the program: its refusal sentences under `--second-pass` say "second pass" ("this is not a second pass", "the first sitting is settled"). On a weekly night they mean the earlier sittings. Changing the wording would change the program's sha256, which the R36 document pins and which tonight's second pass verifies, and would need its own rehearsal.

## The nights: which, and the window on a Friday

`NIGHTS='20261113'` in every block. WEEKLY, BEFORE YOU START refuses a RUNDAY that is not in it, and every later block refuses a recorded night that is not in it. 2026-11-13 is a Friday.

**The window on a Friday night: Friday 21:00 to Saturday 06:29, Lisbon,** the same window as every R36 block. It ends before Saturday's opening:

- **By the weekday table** every block checks (strategy's S-1003-A R29, as `CLAUDE.md` and the R36 document hold it): Monday to Friday 08:00 to 21:00, **Saturday 08:00 to 13:00**, Sunday closed. Friday from 21:00 and Saturday before 08:00 read closed, so the whole window reads closed. WEEKLY, BEFORE YOU START checks the table by machine; the later blocks check the window.
- **By the clinics' own Saturday hours.** Migration `0109` (#1682, Monday 11-09 on strategy's calendar) adds two empty columns, `saturday_opens_at` and `saturday_closes_at`; the values (the owner's 09:00 to 13:00) are a separate data op on Sunday 11-15, after this night. No block reads them, and none needs to: the window ends at 06:29, before 08:00 and before 09:00 either way. `0109`'s document keeps the table's Saturday at 08:00 for the same reason (it only ever refuses more).
- **No reminder time falls in the window.** A mark in it would belong to a visit starting Saturday 21:00 to Sunday 06:29 (the SMS) or Sunday 21:00 to Monday 06:29 (the email); no visit starts then. A Saturday morning visit's marks fall on Thursday and Friday in clinic hours.

A later night, once ruled, is a Monday to Friday (`RUNDAY` must read weekday 1 to 5), so its window too ends before 08:00 the next morning.

## This op must NOT run if the sweep is in send mode

Exactly as the R36 document ("This op must NOT run if the sweep is in send mode", "How it refuses", "What the refusal cannot see", "When the heartbeats refuse"): the same program makes the same three checks (this shell's switch, the owner's word `--owner-says-sweep-is-not-sending`, production's heartbeats in `reminder_sweep_passes`), in every mode, before the program of 2026-10-12 reads anything, and every block requires the line `SWEEP GUARD: the sweep is in shadow by all three checks (...)`. The stale-heartbeat path of Q-R36-F6 is the same, behind `STALEPATH`. If the switch happened (B8), the heartbeats read `send` and the program refuses, whatever is pasted.

## Who runs it, from where, and when

- **GREEN**, a fresh apply-only session, on the owner's dispatch naming `packages/db/scripts/r36-fallback-rearm-emit.mjs`. It authors nothing, edits nothing and merges nothing.
- **The owner at the keyboard** for the whole sitting: the looks of step 1, G2 and the step 7 look are his, and two flags are his word.
- **From the HELD head** of this document's pull request: WEEKLY, BEFORE YOU START reads `refs/pull/<PR>/head` from GitHub (`git ls-remote`), requires it to be HELD, fetches it, requires the fetched commit to be HELD, checks it out detached and records it; every later block runs only on that recorded head. The pull request's branch may be deleted or merged; the ref stays.
- **On the machine that holds this operation's marker,** the one Wednesday's and Thursday's sittings ran on.
- **In the night's window only**, by machine, in every block, `TZ=Europe/Lisbon` on every clock read and a STOP unless the zone reads WET or WEST. WEEKLY, BEFORE YOU START also holds the machine's clock against network time (the lines of the R36 document, unchanged).
- **Keep the machine awake:** plugged in, lid open; the two sending commands run under `caffeinate -i`.

## The order of the sitting

1. **The owner's looks**, in the sitting, BEFORE anything is pasted, exactly as step 1 of the R36 document:
   - **Vercel**, Production environment variables of the project: the sweep's send switch is absent or is not `send`, and he will not change it during the sitting. With it `send`: this document is not used (B8).
   - **Inngest**: `schedule-appointment-reminders` shows Debounce; `send-appointment-reminder` shows Singleton; the trigger of `send-appointment-confirmation` shows `event.data.confirmationEligible == true`. With any of the three missing: stop.
   - **Vercel and GitHub Actions, the deploy has settled:** the latest Production deployment in Vercel reads Ready (not Building or Queued), and the scheduler sync of that deployment finished green: note the short commit sha Vercel shows for it; in GitHub, Actions, open the run named "Inngest auto-sync (osteojp-reminders, osteojp-consultation)" whose commit is that sha (runs of the same name with their job Skipped are not the one); its job "Sync osteojp-reminders and osteojp-consultation after a production deploy" shows a green check, not Skipped; its summary shows the headings "osteojp-reminders synced" and "osteojp-consultation synced". Any other state: stop. A week of merges has deployed since Thursday, so this look matters more, not less.
   - **Only when the dispatch carries `STALEPATH=yes` (Q-R36-F6):** the owner confirms BOTH that the switch is off in Vercel AND that the Inngest dashboard (Production), Functions, `sweep-due-reminders`, Runs, shows no run with the status Completed since 07:00 Lisbon on the sitting's day. If he cannot confirm both, the sitting stops there.
   GREEN pastes the blocks, which carry `--owner-says-sweep-is-not-sending`, `--owner-saw-the-sweep-not-running` with the recorded STALEPATH, and `--i-checked-inngest-settings`, only on those words.
2. **WEEKLY, BEFORE YOU START**, from the dispatch's filled copy. Network time, the weekday table, the ruled night and its window, the held head by `refs/pull/<PR>/head`, every pin, the target guard, the sweep refusal, the settled marker equal to `PRIORK`, and the first dry run (counts only). It records the head, the night, `main`, STALEPATH and PRIORK in `/tmp/r36w-`.
3. **THE WEEKLY CANARY**: five appointments three or more days ahead.
4. **G2, the owner's check of the canary** (below). THE WEEKLY REST waits for his word. A week of deploys may have changed the scheduler's path since Wednesday's G2; this check is what shows that the events still arrive and schedule.
5. **THE WEEKLY REST**, in runs of at most 200, pasted again and again until its dry run reads `ELIGIBLE: 0`.
6. **THE WEEKLY CLOSING DRY RUN**, 12 minutes or more after the last send returned.
7. **The owner's look at the re-plan** (below, "After the closing dry run").

**THE MERGE FREEZE, mandatory: no merge to `main` from the owner's first look of step 1 until GREEN reports.** Every production deploy syncs the scheduler (#1660) and restarts the functions; a deploy while events arrive can fail the step that plans their reminders. SOLO and the owner are the only ones who merge. From the owner's first look until GREEN reports, neither merges anything: SOLO disarms every armed pull request, opens no pull request, arms nothing and merges nothing, and says so in writing in GREEN's dispatch, where the owner's part is stated too; a dispatch without that sentence is not issued. THE WEEKLY CANARY and THE WEEKLY REST STOP when `origin/main` is not the commit WEEKLY, BEFORE YOU START recorded.

THE HALT RULE. Any refusal (a REFUSE line, a FAILED line, a BAD INVOCATION line,
or a harness or classifier refusal), any STOP line and any non-zero exit stops the
sitting, and nothing continues to the next block. Whether and when a halted sitting
starts again is the lead's call, never the runner's. What a sending block printed as
sent stays sent and is in the marker; nothing is sent again by hand.

**No block carries `set -e`, and every halt is explicit.** GREEN's Bash tool runs a block as `... && eval '<block>' ...`, where zsh ignores errexit. Each command a later step relies on carries its own `|| { echo "STOP: ..."; exit 1; }`, and `scripts/r36-weekly-fallback.test.mjs` runs every block in that shape, in bash and in zsh, with each external call made to fail in turn. Each block runs in a `( ... )` subshell whose second line is `set -o pipefail`. No block prints, echoes or tests the value of an environment variable, and the program prints counts only: no appointment id, name, phone, email, tenant id, connection string or environment value.

### WEEKLY, BEFORE YOU START: the ruled night, the held head, every pin, the settled marker, the first dry run. GREEN pastes its dispatch's filled copy

```
(
set -o pipefail
HELD='PENDING: set at the READY line'
DOCSHA='PENDING: set at the READY line'
RUNDAY='PENDING: the Lisbon date of the night the dispatch names, one of NIGHTS, YYYYMMDD'
STALEPATH='PENDING: no, or yes only on the ruling of Q-R36-F6'
LASTOK='PENDING: yes only when GREEN reported the last sitting ended clean, as the dispatch names it'
PRIORK='PENDING: the count of appointments sent that the last closing line printed'
NIGHTS='20261113'
PR=1726
FIXSHA=20a6d73151468d36c080bcfd6cfad528d3a69d2d
SHAWRAP=1795c035a45d7a318b2966eda3991423ee0d2c27c5bc1a78d1e811404459f454
SHAEMIT=8f4242d0aefe003acfa2dbc3330e4bf0b7471aa38123763fa9411fc379656e7f
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
DOCF=docs/data-op-r36-weekly-fallback.md
DOCPIN=docs/data-op-r36-weekly-fallback.sha256
WRAP=packages/db/scripts/r36-fallback-rearm-emit.mjs
EMIT=packages/db/scripts/inc-1007-rearm-reminders-emit.mjs
GUARD=scripts/assert-production-target.mjs
PTM=scripts/production-target.mjs
SWEEPOK="SWEEP GUARD: the sweep is in shadow by all three checks (this shell's switch, the owner's word, production's heartbeats)"

echo "${HELD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: HELD is not a filled-in sha, so this block is NOT READY: GREEN pastes the copy in its dispatch, where SOLO filled it. Nothing was read from production and nothing was sent"; exit 1; }
echo "${DOCSHA} ${SHAWRAP} ${SHAEMIT} ${SHAGUARD} ${SHAPTM}" | grep -qxE '[0-9a-f]{64}( [0-9a-f]{64}){4}' || { echo "STOP: a sha256 in this block is still PENDING, so it is NOT READY. Nothing was read from production and nothing was sent"; exit 1; }
echo "${RUNDAY}" | grep -qxE '20[0-9]{2}[01][0-9][0-3][0-9]' || { echo "STOP: RUNDAY is still PENDING, or is not a Lisbon date YYYYMMDD, so this block is NOT READY. Nothing was read from production and nothing was sent"; exit 1; }
echo "${RUNDAY}" | grep -qxE "${NIGHTS}" || { echo "STOP: RUNDAY ${RUNDAY} is not a weekly night strategy has ruled (this document lists ${NIGHTS}). A later night is added only on strategy's ruling, by a change to this document. Nothing was read from production and nothing was sent"; exit 1; }
echo "${STALEPATH}" | grep -qxE 'no|yes' || { echo "STOP: STALEPATH is still PENDING, or is not no or yes, so this block is NOT READY. Nothing was read from production and nothing was sent"; exit 1; }
[ "${LASTOK}" = yes ] || { echo "STOP: LASTOK is not yes: SOLO fills it only when GREEN's report of the last sitting shows it ended with its closing dry run's last line, G2 passed, and the owner's look at the re-plan found no Failed run. Nothing was read from production and nothing was sent"; exit 1; }
echo "${PRIORK}" | grep -qxE '[1-9][0-9]{0,5}' || { echo "STOP: PRIORK is still PENDING, or is not a whole number above 0, so this block is NOT READY. Nothing was read from production and nothing was sent"; exit 1; }
[ "${PRIORK}" -ge 5 ] || { echo "STOP: PRIORK is ${PRIORK}, fewer than a canary's five, so no earlier sitting of this operation ended clean. Nothing was read from production and nothing was sent"; exit 1; }
echo "${FIXSHA}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: FIXSHA is not a full 40-character sha. Nothing was read from production and nothing was sent"; exit 1; }
echo "${PR}" | grep -qxE '[1-9][0-9]{0,5}' || { echo "STOP: PR is not a pull request number. Nothing was read from production and nothing was sent"; exit 1; }
rm -f /tmp/r36w-head.sha /tmp/r36w-night.ok /tmp/r36w-canary.ok /tmp/r36w-last-send.ok /tmp/r36w-main.sha /tmp/r36w-stale.ok /tmp/r36w-priork.ok || { echo "STOP: the previous sitting's records could not be cleared. Nothing was read from production and nothing was sent"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was read from production and nothing was sent"; exit 1; }
TOK=""; TBAD=""; TNOT=""
SN=$(sntp time.apple.com 2>&1) || SN=$(sntp time.apple.com 2>&1) || SN=$(sntp time.apple.com 2>&1) || SN=""
OFF=$(echo "${SN}" | awk '$1 ~ /^[+-][0-9]+[.][0-9]+$/ && $2 == "+/-" && $4 == "time.apple.com" { v = $1 } END { print v }')
if echo "${OFF}" | grep -qxE '[+-][0-9]+[.][0-9]+'; then if awk -v o="${OFF}" 'BEGIN { o += 0; if (o < 0) o = -o; if (o <= 5) exit 0; exit 1 }'; then TOK="${TOK} sntp"; echo "network time:  sntp time.apple.com: read, the machine's clock is ${OFF} seconds from it, within 5 seconds"; else TBAD="${TBAD} sntp"; echo "network time:  sntp time.apple.com: read, the machine's clock is ${OFF} seconds from it, MORE THAN 5 seconds, or the offset could not be compared"; fi; else TNOT="${TNOT} sntp"; echo "network time:  sntp time.apple.com: NOT READ (it failed three times in a row, or no offset could be read out of its answer)"; fi
for TU in https://api.github.com https://www.cloudflare.com; do
TH=$(curl -sI --max-time 8 "${TU}" 2>/dev/null) || TH=""
TL=$(date -u '+%s') || TL=""
TD=$(printf '%s\n' "${TH}" | awk '{ sub(/\r$/, "") } tolower($1) == "date:" { v = $0; sub(/^[^ ]+ +/, "", v) } END { print v }')
TE=""; if printf '%s\n' "${TD}" | grep -qxE '(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT'; then TE=$(LC_ALL=C date -j -u -f '%a, %d %b %Y %H:%M:%S GMT' "${TD}" '+%s' 2>/dev/null) || TE=""; fi
if printf '%s %s\n' "${TE}" "${TL}" | grep -qxE '[1-9][0-9]{8,10} [1-9][0-9]{8,10}'; then TDIF=$(( ${TL} - ${TE} )); if [ "${TDIF}" -ge -30 ] && [ "${TDIF}" -le 30 ]; then TOK="${TOK} ${TU}"; echo "network time:  ${TU}: read, its Date header says ${TD}, the machine's clock is ${TDIF} seconds ahead of it (a minus sign means behind), within 30 seconds"; else TBAD="${TBAD} ${TU}"; echo "network time:  ${TU}: read, its Date header says ${TD}, the machine's clock is ${TDIF} seconds ahead of it (a minus sign means behind), MORE THAN 30 seconds"; fi; else TNOT="${TNOT} ${TU}"; echo "network time:  ${TU}: NOT READ (curl failed or ran past 8 seconds, or it sent no Date header that could be parsed)"; fi
done
[ -z "${TBAD}" ] || { echo "STOP: the machine's clock disagrees with network time, by more than the tolerance, at:${TBAD} (the network time lines above carry the numbers). One source that can be read and disagrees stops the block, whatever the others say. Do not set the clock yourself. Nothing was read from production and nothing was sent"; exit 1; }
[ -n "${TOK}" ] || { echo "STOP: the machine's clock could not be held against network time: none of the three sources could be read, so the clock is not shown to be right. Do not set the clock yourself. Nothing was read from production and nothing was sent"; exit 1; }
echo "network time:  the machine's clock agrees with every source that could be read. Read:${TOK}. Not read:${TNOT:- none}."
NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was read from production and nothing was sent"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9]{12} [1-7] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM, a weekday and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOW}]. Nothing was read from production and nothing was sent"; exit 1; }
NOWL=$(echo "${NOW}" | cut -c1-12)
DOW=$(echo "${NOW}" | cut -c14)
LT=$(echo "${NOWL}" | cut -c9-12)
DAY=$(echo "${NOWL}" | cut -c1-8)
echo "${NOWL} ${DOW} ${LT} ${DAY}" | grep -qxE '[0-9]{12} [1-7] [0-2][0-9][0-5][0-9] [0-9]{8}' || { echo "STOP: the Lisbon time did not split into YYYYMMDDHHMM, a weekday, HHMM and YYYYMMDD. Nothing was read from production and nothing was sent"; exit 1; }
if awk -v s="${DOW}${LT}" 'BEGIN { d = substr(s, 1, 1) + 0; t = substr(s, 2, 4) + 0; if (d == 7) exit 0; if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }'; then CLOCK=closed; else CLOCK=open; fi
echo "Lisbon now:    ${NOWL} (YYYYMMDDHHMM), weekday ${DOW} (1 is Monday, 7 is Sunday): ${CLOCK} by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed)"
[ "${CLOCK}" = closed ] || { echo "STOP: Lisbon ${NOWL} is inside clinic hours by the weekday table. This operation runs in closed hours only. Nothing was read from production and nothing was sent"; exit 1; }
RDOW=$(TZ=Europe/Lisbon date -j -f '%Y%m%d%H%M' "${RUNDAY}1200" '+%u') || { echo "STOP: the weekday of RUNDAY could not be computed. Nothing was read from production and nothing was sent"; exit 1; }
echo "${RDOW}" | grep -qx '[1-5]' || { echo "STOP: RUNDAY ${RUNDAY} is not a Monday to Friday (it reads as weekday ${RDOW}). This operation runs on a weekday night only. Nothing was read from production and nothing was sent"; exit 1; }
NEXTDAY=$(TZ=Europe/Lisbon date -j -v+1d -f '%Y%m%d%H%M' "${RUNDAY}1200" '+%Y%m%d') || { echo "STOP: the day after RUNDAY could not be computed. Nothing was read from production and nothing was sent"; exit 1; }
echo "${NEXTDAY}" | grep -qxE '[0-9]{8}' || { echo "STOP: the day after RUNDAY did not read as YYYYMMDD. Nothing was read from production and nothing was sent"; exit 1; }
WIN=no
if [ "${DAY}" = "${RUNDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) >= 2100) exit 0; exit 1 }'; then WIN=yes; fi
if [ "${DAY}" = "${NEXTDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) <= 629) exit 0; exit 1 }'; then WIN=yes; fi
echo "the night:     RUNDAY ${RUNDAY}, weekday ${RDOW}, a ruled weekly night; the window runs from ${RUNDAY} 21:00 to ${NEXTDAY} 06:29, Lisbon; Lisbon now ${NOWL}; inside: ${WIN}"
[ "${WIN}" = yes ] || { echo "STOP: Lisbon ${NOWL} is outside the window of the night this block names (${RUNDAY} from 21:00 to ${NEXTDAY} at 06:29). Nothing was read from production and nothing was sent"; exit 1; }
git fetch origin --prune || { echo "STOP: the fetch failed, so main may be stale. Nothing was read from production and nothing was sent"; exit 1; }
PRNOW=$(git ls-remote origin refs/pull/${PR}/head | cut -f1) || { echo "STOP: the head of pull request ${PR} could not be read from GitHub. Nothing was read from production and nothing was sent"; exit 1; }
echo "${PRNOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the head of pull request ${PR} did not read as a full 40-character sha [${PRNOW}]. Nothing was read from production and nothing was sent"; exit 1; }
echo "held head now: ${PRNOW}, the head of pull request ${PR} (refs/pull/${PR}/head)"
[ "${PRNOW}" = "${HELD}" ] || { echo "STOP: the head of pull request ${PR} is not the commit this block names (${HELD}): it was pushed to since the READY line. Nothing was read from production and nothing was sent"; exit 1; }
git fetch -q origin refs/pull/${PR}/head || { echo "STOP: the head of pull request ${PR} could not be fetched. Nothing was read from production and nothing was sent"; exit 1; }
TIP=$(git rev-parse FETCH_HEAD) || { echo "STOP: the fetched head could not be read. Nothing was read from production and nothing was sent"; exit 1; }
echo "${TIP}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the fetched head did not read as a full 40-character sha [${TIP}]. Nothing was read from production and nothing was sent"; exit 1; }
[ "${TIP}" = "${HELD}" ] || { echo "STOP: the fetched head is not the commit this block names (${HELD}). Nothing was read from production and nothing was sent"; exit 1; }
MAINSHA=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. Nothing was read from production and nothing was sent"; exit 1; }
echo "${MAINSHA}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: origin/main did not read as a full 40-character sha [${MAINSHA}]. Nothing was read from production and nothing was sent"; exit 1; }
echo "main now:      ${MAINSHA}. No merge to main until the sitting ends"
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was read from production and nothing was sent"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. Nothing was read from production and nothing was sent"; echo "${STRAY}"; exit 1; }
git checkout -q --detach ${TIP} || { echo "STOP: the checkout of the held head failed. Nothing was read from production and nothing was sent"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read after the checkout. Nothing was read from production and nothing was sent"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. Nothing was read from production and nothing was sent"; exit 1; }
[ "${HD}" = "${TIP}" ] || { echo "STOP: the apply worktree is not on the held head after the checkout. Nothing was read from production and nothing was sent"; exit 1; }
echo "checked out:   ${TIP}, the held head"
git merge-base --is-ancestor ${FIXSHA} ${TIP} || { echo "STOP: the reminder fix of 2026-10-07 (#1562, ${FIXSHA}) is not in the history of the held head, or git could not say. Nothing was read from production and nothing was sent"; exit 1; }
echo "the fix:       ${FIXSHA} is in the history of the held head"
DOC=$(git show ${TIP}:${DOCF} | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the document could not be read and hashed at the held head. Nothing was read from production and nothing was sent"; exit 1; }
echo "document:      ${DOC}"
[ "${DOC}" = "${DOCSHA}" ] || { echo "STOP: the document at the held head is not the approved one. Nothing was read from production and nothing was sent"; exit 1; }
TOP=$(git show ${TIP}:${DOCF} | sed -n 1p) || { echo "STOP: the document's first line could not be read. Nothing was read from production and nothing was sent"; exit 1; }
echo "${TOP}" | grep -qvE '^NOT READY' || { echo "STOP: the document's first line at the held head still reads NOT READY, or it could not be searched. Nothing was read from production and nothing was sent"; exit 1; }
echo "first line:    ${TOP}"
SIDE=$(git show ${TIP}:${DOCPIN}) || { echo "STOP: the sidecar could not be read at the held head. Nothing was read from production and nothing was sent"; exit 1; }
echo "sidecar:       ${SIDE}"
[ "${SIDE}" = "${DOCSHA}  ${DOCF}" ] || { echo "STOP: the sidecar at the held head does not pin the approved document. Nothing was read from production and nothing was sent"; exit 1; }
test -f ${WRAP} || { echo "STOP: the program is not on disk at the held head. Nothing was read from production and nothing was sent"; exit 1; }
test -f ${EMIT} || { echo "STOP: the program of 2026-10-12 is not on disk at the held head. Nothing was read from production and nothing was sent"; exit 1; }
test -f ${GUARD} || { echo "STOP: the target guard is not on disk at the held head. Nothing was read from production and nothing was sent"; exit 1; }
test -f ${PTM} || { echo "STOP: the guard's module is not on disk at the held head. Nothing was read from production and nothing was sent"; exit 1; }
SW=$(shasum -a 256 ${WRAP} | cut -d' ' -f1) || { echo "STOP: the program could not be hashed. Nothing was read from production and nothing was sent"; exit 1; }
echo "program:       ${SW}"
[ "${SW}" = "${SHAWRAP}" ] || { echo "STOP: the program on disk is not the approved file. Nothing was read from production and nothing was sent"; exit 1; }
SE=$(shasum -a 256 ${EMIT} | cut -d' ' -f1) || { echo "STOP: the program of 2026-10-12 could not be hashed. Nothing was read from production and nothing was sent"; exit 1; }
echo "2026-10-12:    ${SE}"
[ "${SE}" = "${SHAEMIT}" ] || { echo "STOP: the program of 2026-10-12 on disk is not the pinned file. Nothing was read from production and nothing was sent"; exit 1; }
SG=$(shasum -a 256 ${GUARD} | cut -d' ' -f1) || { echo "STOP: the target guard could not be hashed. Nothing was read from production and nothing was sent"; exit 1; }
echo "guard:         ${SG}"
[ "${SG}" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the pinned file. Nothing was read from production and nothing was sent"; exit 1; }
SM=$(shasum -a 256 ${PTM} | cut -d' ' -f1) || { echo "STOP: the guard's module could not be hashed. Nothing was read from production and nothing was sent"; exit 1; }
echo "module:        ${SM}"
[ "${SM}" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the pinned file. Nothing was read from production and nothing was sent"; exit 1; }
echo "every pin holds. The production environment loads now"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. Nothing was read from production and nothing was sent"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/r36w-target-a.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. Nothing was read from production and nothing was sent"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/r36w-target-a.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. Nothing was read from production and nothing was sent"; exit 1; }
node ${WRAP} --tenant-slug osteojp --max-days-ahead 28 --max 200 --owner-says-sweep-is-not-sending --owner-saw-the-sweep-not-running "${STALEPATH}" --second-pass 2>&1 | tee /tmp/r36w-dry-a.out || { echo "STOP: the dry run failed or was refused; its lines are above. A refusal that names the marker (no sending run, a row of unknown outcome, a lock) is the lead's to rule. A dry run is READ ONLY and nothing was sent"; exit 1; }
grep -qxF "${SWEEPOK}" /tmp/r36w-dry-a.out || { echo "STOP: the dry run does not show the sweep guard's line. Nothing was sent"; exit 1; }
grep -qxF 'target   PRODUCTION' /tmp/r36w-dry-a.out || { echo "STOP: the dry run does not show the line target PRODUCTION. Nothing was sent"; exit 1; }
grep -qxF 'mode     DRY RUN - nothing is sent' /tmp/r36w-dry-a.out || { echo "STOP: the dry run does not show the line mode DRY RUN. Nothing was sent"; exit 1; }
EC=$(grep -cxE 'ELIGIBLE: [0-9]+' /tmp/r36w-dry-a.out) || { echo "STOP: the dry run holds no ELIGIBLE line. Nothing was sent"; exit 1; }
[ "${EC}" = 1 ] || { echo "STOP: the dry run holds ${EC} ELIGIBLE lines, not exactly one. Nothing was sent"; exit 1; }
N=$(grep -xE 'ELIGIBLE: [0-9]+' /tmp/r36w-dry-a.out | cut -d' ' -f2) || { echo "STOP: the ELIGIBLE number could not be read from the dry run. Nothing was sent"; exit 1; }
echo "${N}" | grep -qxE '0|[1-9][0-9]{0,5}' || { echo "STOP: the ELIGIBLE number of the dry run did not read as a whole number [${N}]. Nothing was sent"; exit 1; }
grep -qE '^held back: starts more than --max-days-ahead 28 days after the read: [0-9]+$' /tmp/r36w-dry-a.out || { echo "STOP: the dry run does not show the 28 day bound. Nothing was sent"; exit 1; }
grep -qxF 'marker   second pass: the first sitting is settled (no row of unknown outcome, no lock)' /tmp/r36w-dry-a.out || { echo "STOP: the dry run does not show that this operation's marker is settled (no row of unknown outcome, no lock). Nothing was sent"; exit 1; }
grep -qxF 'skipped: attempted by an earlier run, outcome unknown (marker): 0' /tmp/r36w-dry-a.out || { echo "STOP: this operation's marker holds attempted rows. The lead rules. Nothing was sent"; exit 1; }
MS=$(grep -xE 'skipped: already sent by an earlier run [(]marker[)]: [0-9]+' /tmp/r36w-dry-a.out) || { echo "STOP: the dry run does not show the count of appointments already sent. Nothing was sent"; exit 1; }
grep -qxF 'G1 UNDER THE LIMIT OF 20000: yes' /tmp/r36w-dry-a.out || { echo "STOP: the dry run does not show G1 UNDER THE LIMIT OF 20000: yes. Strategy rules on the scope. Nothing was sent"; exit 1; }
G3L=$(grep -xE 'G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 0  [(]appointments checked: [0-9]+; handed to a provider: 0; not checkable: 0; expected 0[)]' /tmp/r36w-dry-a.out) || { echo "STOP: the dry run does not show the G3 line reading 0 with not checkable 0. Nothing was sent"; exit 1; }
K=$(echo "${G3L}" | sed -E 's/.*appointments checked: ([0-9]+);.*/\1/') || { echo "STOP: the number of appointments checked could not be read from the G3 line. Nothing was sent"; exit 1; }
echo "${K}" | grep -qxE '[1-9][0-9]{0,5}' || { echo "STOP: the number of appointments checked did not read as a whole number above 0 [${K}]: this operation's marker is empty, so no earlier sitting sent and this is not a weekly sitting. The lead rules. Nothing was sent"; exit 1; }
[ "${K}" = "${PRIORK}" ] || { echo "STOP: this operation's marker holds ${K} sent appointments, not the ${PRIORK} the last sitting's closing line printed: it is not the marker the last clean sitting left. The lead rules. Nothing was sent"; exit 1; }
echo "the marker:    the earlier sittings sent ${K} appointments, as the last closing line printed; each is skipped at the start it had then, and nothing is sent twice"
echo "for the owner: ${MS}"
grep -qE '^G4 NEXT 48 HOURS, NOT RE-ARMED: [0-9]+ ' /tmp/r36w-dry-a.out || { echo "STOP: the dry run does not show the G4 line. Nothing was sent"; exit 1; }
HB=$(grep -E "^sweep    production's heartbeats: " /tmp/r36w-dry-a.out) || { echo "STOP: the dry run does not show production's heartbeat line. Nothing was sent"; exit 1; }
echo "for the owner: ${HB}"
TCH=$(grep -xE 'skipped: touched in the last 25 hours: [0-9]+' /tmp/r36w-dry-a.out) || { echo "STOP: the dry run does not show the touched count. Nothing was sent"; exit 1; }
echo "for the owner: ${TCH} (it holds any visit whose last touch was a confirm that sent nothing: the residual of Q-R36-F5)"
echo "${TIP}" > /tmp/r36w-head.sha || { echo "STOP: the held head could not be recorded. Nothing was sent"; exit 1; }
echo "${RUNDAY} ${NEXTDAY}" > /tmp/r36w-night.ok || { echo "STOP: the night could not be recorded. Nothing was sent"; exit 1; }
echo "${MAINSHA}" > /tmp/r36w-main.sha || { echo "STOP: origin/main could not be recorded. Nothing was sent"; exit 1; }
echo "${STALEPATH}" > /tmp/r36w-stale.ok || { echo "STOP: STALEPATH could not be recorded. Nothing was sent"; exit 1; }
echo "${PRIORK}" > /tmp/r36w-priork.ok || { echo "STOP: PRIORK could not be recorded. Nothing was sent"; exit 1; }
echo "recorded:      the held head ${TIP}, the night ${RUNDAY} to ${NEXTDAY}, main ${MAINSHA}, STALEPATH ${STALEPATH} and PRIORK ${PRIORK}, for the blocks that follow"
echo "WEEKLY, BEFORE YOU START: every check passed. ELIGIBLE ${N} at this read. THE WEEKLY CANARY next."
)
```

**EXPECT**, each line checked by the block itself, which stops on any difference: four `network time:` lines; `Lisbon now: ... closed by the weekday table`; `the night: ... a ruled weekly night ... inside: yes`; `held head now: <HELD>, the head of pull request <PR> ...`; `main now:`; `checked out:`; `the fix:`; `document:`, `first line:` (not NOT READY), `sidecar:`; `program:`, `2026-10-12:`, `guard:`, `module:`, each the pinned sha256; the target guard's lines with `target verified: production, session pooler.`; the program's lines IN FULL (counts only), among them `SWEEP GUARD: ...`, `marker   the first sending run of this operation read the database at <instant>, <hours> hours ago (a second pass needs 25)`, `marker   second pass: the first sitting is settled (no row of unknown outcome, no lock)`, `target   PRODUCTION`, `mode     DRY RUN - nothing is sent`, `skipped: already sent by an earlier run (marker): <n>`, `ELIGIBLE: <N>`, `G1 UNDER THE LIMIT OF 20000: yes`, the G4 line, and the G3 line reading 0 for PRIORK appointments checked; `the marker: the earlier sittings sent <PRIORK> appointments ...`; `for the owner:` three times (the already-sent count, production's heartbeat line, the touched count); `recorded: ...`; then `WEEKLY, BEFORE YOU START: every check passed. ELIGIBLE <N> at this read. THE WEEKLY CANARY next.` Exit 0. It reads production and sends nothing. **Its refusals, in order:** HELD, a sha256, RUNDAY, PRIORK or PR not filled; RUNDAY not in `NIGHTS`; STALEPATH not `no` or `yes`; LASTOK not `yes`; PRIORK below 5; the records not cleared; no apply worktree; the network time; clinic hours by the table; RUNDAY not Monday to Friday; outside the night's window; the fetch; `refs/pull/<PR>/head` not readable, not a sha, or not HELD; the fetched head not HELD; `main` not readable; a worktree not clean; the checkout; the reminder fix not in the history; the document, its first line or its sidecar not the approved ones; a pinned file missing or not its pin; the environment; the target guard; the program's own refusals (the sweep guard; under `--second-pass` an empty marker, a row of unknown outcome, a lock); any expected line missing; attempted rows; G1 `NO`; G3 not 0 or a row not checkable; an empty marker; the marker's count not PRIORK; a record not written.

### THE WEEKLY CANARY: five appointments, three or more days ahead

Pasted only after the owner's looks of step 1, in the sitting.

```
(
set -o pipefail
NIGHTS='20261113'
FIXSHA=20a6d73151468d36c080bcfd6cfad528d3a69d2d
SHAWRAP=1795c035a45d7a318b2966eda3991423ee0d2c27c5bc1a78d1e811404459f454
SHAEMIT=8f4242d0aefe003acfa2dbc3330e4bf0b7471aa38123763fa9411fc379656e7f
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
DOCPIN=docs/data-op-r36-weekly-fallback.sha256
WRAP=packages/db/scripts/r36-fallback-rearm-emit.mjs
EMIT=packages/db/scripts/inc-1007-rearm-reminders-emit.mjs
GUARD=scripts/assert-production-target.mjs
PTM=scripts/production-target.mjs
SWEEPOK="SWEEP GUARD: the sweep is in shadow by all three checks (this shell's switch, the owner's word, production's heartbeats)"

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was sent by this block"; exit 1; }
test -f /tmp/r36w-head.sha || { echo "STOP: WEEKLY, BEFORE YOU START recorded no head in this sitting. Nothing was sent by this block"; exit 1; }
REC=$(cat /tmp/r36w-head.sha) || { echo "STOP: the recorded head could not be read. Nothing was sent by this block"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the recorded head did not read as a full 40-character sha [${REC}]. Nothing was sent by this block"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was sent by this block"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. Nothing was sent by this block"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the head WEEKLY, BEFORE YOU START recorded. Nothing was sent by this block"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was sent by this block"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. Nothing was sent by this block"; echo "${STRAY}"; exit 1; }
echo "running from:  ${REC}, the head WEEKLY, BEFORE YOU START recorded"
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one. Nothing was sent by this block"; exit 1; }
[ "$(shasum -a 256 ${WRAP} | cut -d' ' -f1)" = "${SHAWRAP}" ] || { echo "STOP: the program on disk is not the approved file. Nothing was sent by this block"; exit 1; }
[ "$(shasum -a 256 ${EMIT} | cut -d' ' -f1)" = "${SHAEMIT}" ] || { echo "STOP: the program of 2026-10-12 on disk is not the pinned file. Nothing was sent by this block"; exit 1; }
[ "$(shasum -a 256 ${GUARD} | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the pinned file. Nothing was sent by this block"; exit 1; }
[ "$(shasum -a 256 ${PTM} | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the pinned file. Nothing was sent by this block"; exit 1; }
echo "pins:          the program, the program of 2026-10-12, the target guard and its module are the pinned files"
test -f /tmp/r36w-night.ok || { echo "STOP: WEEKLY, BEFORE YOU START recorded no night in this sitting. Nothing was sent by this block"; exit 1; }
NIGHT=$(cat /tmp/r36w-night.ok) || { echo "STOP: the recorded night could not be read. Nothing was sent by this block"; exit 1; }
RUNDAY=$(echo "${NIGHT}" | cut -d' ' -f1)
NEXTDAY=$(echo "${NIGHT}" | cut -d' ' -f2)
NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was sent by this block"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9]{12} [1-7] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM, a weekday and the zone WET or WEST [${NOW}]. Nothing was sent by this block"; exit 1; }
NOWL=$(echo "${NOW}" | cut -c1-12)
LT=$(echo "${NOWL}" | cut -c9-12)
DAY=$(echo "${NOWL}" | cut -c1-8)
echo "${NOWL} ${LT} ${DAY} ${RUNDAY} ${NEXTDAY}" | grep -qxE '[0-9]{12} [0-2][0-9][0-5][0-9] [0-9]{8} [0-9]{8} [0-9]{8}' || { echo "STOP: the Lisbon time or the recorded night did not read as dates and times. Nothing was sent by this block"; exit 1; }
echo "${RUNDAY}" | grep -qxE "${NIGHTS}" || { echo "STOP: the recorded night ${RUNDAY} is not a weekly night strategy has ruled (this document lists ${NIGHTS}). Nothing was sent by this block"; exit 1; }
WIN=no
if [ "${DAY}" = "${RUNDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) >= 2100) exit 0; exit 1 }'; then WIN=yes; fi
if [ "${DAY}" = "${NEXTDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) <= 629) exit 0; exit 1 }'; then WIN=yes; fi
echo "Lisbon now:    ${NOWL}; the night recorded: ${RUNDAY} 21:00 to ${NEXTDAY} 06:29; inside: ${WIN}"
[ "${WIN}" = yes ] || { echo "STOP: Lisbon ${NOWL} is outside the night WEEKLY, BEFORE YOU START recorded (${RUNDAY} from 21:00 to ${NEXTDAY} at 06:29). Nothing was sent by this block"; exit 1; }
test -f /tmp/r36w-stale.ok || { echo "STOP: WEEKLY, BEFORE YOU START recorded no STALEPATH in this sitting. Nothing was sent by this block"; exit 1; }
SR=$(cat /tmp/r36w-stale.ok) || { echo "STOP: the recorded STALEPATH could not be read. Nothing was sent by this block"; exit 1; }
echo "${SR}" | grep -qxE 'no|yes' || { echo "STOP: the recorded STALEPATH is not no or yes [${SR}]. Nothing was sent by this block"; exit 1; }
test ! -f /tmp/r36w-canary.ok || { echo "STOP: the weekly canary already ran in this sitting. It is never sent twice. Nothing was sent by this block"; exit 1; }
test -f /tmp/r36w-priork.ok || { echo "STOP: WEEKLY, BEFORE YOU START recorded no PRIORK in this sitting. Nothing was sent by this block"; exit 1; }
PK=$(cat /tmp/r36w-priork.ok) || { echo "STOP: the recorded PRIORK could not be read. Nothing was sent by this block"; exit 1; }
echo "${PK}" | grep -qxE '[1-9][0-9]{0,5}' || { echo "STOP: the recorded PRIORK did not read as a whole number above 0 [${PK}]. Nothing was sent by this block"; exit 1; }
test -f /tmp/r36w-main.sha || { echo "STOP: WEEKLY, BEFORE YOU START recorded no main in this sitting. Nothing was sent by this block"; exit 1; }
MREC=$(cat /tmp/r36w-main.sha) || { echo "STOP: the recorded main could not be read. Nothing was sent by this block"; exit 1; }
git fetch origin --prune || { echo "STOP: the fetch failed, so whether main moved is not known. Nothing was sent by this block"; exit 1; }
MNOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. Nothing was sent by this block"; exit 1; }
echo "${MNOW} ${MREC}" | grep -qxE '[0-9a-f]{40} [0-9a-f]{40}' || { echo "STOP: origin/main or the recorded main did not read as a full 40-character sha. Nothing was sent by this block"; exit 1; }
[ "${MNOW}" = "${MREC}" ] || { echo "STOP: main moved during the sitting (${MREC} to ${MNOW}): a merge deploys production and re-syncs the scheduler. The lead rules. Nothing was sent by this block"; exit 1; }
echo "main:          ${MNOW}, unchanged since WEEKLY, BEFORE YOU START"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. Nothing was sent by this block"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/r36w-target-b.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. Nothing was sent by this block"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/r36w-target-b.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. Nothing was sent by this block"; exit 1; }
node ${WRAP} --tenant-slug osteojp --min-days-ahead 3 --max-days-ahead 28 --max 5 --owner-says-sweep-is-not-sending --owner-saw-the-sweep-not-running "${SR}" 2>&1 | tee /tmp/r36w-canary-dry.out || { echo "STOP: the canary's dry run failed or was refused; its lines are above. A dry run is READ ONLY and nothing was sent by this block"; exit 1; }
grep -qxF "${SWEEPOK}" /tmp/r36w-canary-dry.out || { echo "STOP: the canary's dry run does not show the sweep guard's line. Nothing was sent by this block"; exit 1; }
grep -qxF 'target   PRODUCTION' /tmp/r36w-canary-dry.out || { echo "STOP: the canary's dry run does not show the line target PRODUCTION. Nothing was sent by this block"; exit 1; }
grep -qxF 'mode     DRY RUN - nothing is sent' /tmp/r36w-canary-dry.out || { echo "STOP: the canary's dry run does not show the line mode DRY RUN. Nothing was sent by this block"; exit 1; }
EC=$(grep -cxE 'ELIGIBLE: [0-9]+' /tmp/r36w-canary-dry.out) || { echo "STOP: the canary's dry run holds no ELIGIBLE line. Nothing was sent by this block"; exit 1; }
[ "${EC}" = 1 ] || { echo "STOP: the canary's dry run holds ${EC} ELIGIBLE lines, not exactly one. Nothing was sent by this block"; exit 1; }
N=$(grep -xE 'ELIGIBLE: [0-9]+' /tmp/r36w-canary-dry.out | cut -d' ' -f2) || { echo "STOP: the ELIGIBLE number could not be read from the canary's dry run. Nothing was sent by this block"; exit 1; }
echo "${N}" | grep -qxE '0|[1-9][0-9]{0,5}' || { echo "STOP: the ELIGIBLE number of the canary's dry run did not read as a whole number [${N}]. Nothing was sent by this block"; exit 1; }
grep -qxF 'skipped: attempted by an earlier run, outcome unknown (marker): 0' /tmp/r36w-canary-dry.out || { echo "STOP: this operation's marker holds attempted rows. The lead rules. Nothing was sent by this block"; exit 1; }
grep -qxF 'G1 UNDER THE LIMIT OF 20000: yes' /tmp/r36w-canary-dry.out || { echo "STOP: the canary's dry run does not show G1 UNDER THE LIMIT OF 20000: yes. Nothing was sent by this block"; exit 1; }
G3L=$(grep -xE 'G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 0  [(]appointments checked: [0-9]+; handed to a provider: 0; not checkable: 0; expected 0[)]' /tmp/r36w-canary-dry.out) || { echo "STOP: the canary's dry run does not show the G3 line reading 0 with not checkable 0. Nothing was sent by this block"; exit 1; }
K=$(echo "${G3L}" | sed -E 's/.*appointments checked: ([0-9]+);.*/\1/') || { echo "STOP: the number of appointments checked could not be read from the G3 line. Nothing was sent by this block"; exit 1; }
echo "${K}" | grep -qxE '[1-9][0-9]{0,5}' || { echo "STOP: the number of appointments checked did not read as a whole number above 0 [${K}]. Nothing was sent by this block"; exit 1; }
[ "${K}" = "${PK}" ] || { echo "STOP: this operation's marker holds ${K} sent appointments, not the ${PK} WEEKLY, BEFORE YOU START found: the marker changed between the two blocks. The lead rules. Nothing was sent by this block"; exit 1; }
[ "${N}" -ge 5 ] || { echo "STOP: the canary's dry run found ${N} eligible appointments three or more days ahead, fewer than the five a canary needs. The lead rules. Nothing was sent by this block"; exit 1; }
grep -qE '^THIS RUN: 5 of ' /tmp/r36w-canary-dry.out || { echo "STOP: the canary's dry run does not show THIS RUN: 5 of. Nothing was sent by this block"; exit 1; }
BEGAN=$(TZ=Europe/Lisbon date '+%Y-%m-%d %H:%M %Z') || { echo "STOP: the Lisbon clock could not be read for the time the canary begins. Nothing was sent by this block"; exit 1; }
echo "${BEGAN}" | grep -qxE '[0-9]{4}-[0-9]{2}-[0-9]{2} [0-2][0-9]:[0-5][0-9] (WET|WEST)' || { echo "STOP: the time the canary begins did not read as YYYY-MM-DD HH:MM and the zone WET or WEST [${BEGAN}]. Nothing was sent by this block"; exit 1; }
BEGANT=$(TZ=America/Toronto date '+%Y-%m-%d %H:%M %Z') || { echo "STOP: the Toronto clock could not be read for the time the canary begins. Nothing was sent by this block"; exit 1; }
echo "${BEGANT}" | grep -qxE '[0-9]{4}-[0-9]{2}-[0-9]{2} [0-2][0-9]:[0-5][0-9] (EST|EDT)' || { echo "STOP: the time the canary begins did not read on the Toronto clock as YYYY-MM-DD HH:MM and the zone EST or EDT [${BEGANT}]. Nothing was sent by this block"; exit 1; }
echo "canary began:  ${BEGAN}, Lisbon time, and ${BEGANT}, the clock of the owner's machine. The five are sent from this minute on"
caffeinate -i node ${WRAP} --tenant-slug osteojp --min-days-ahead 3 --max-days-ahead 28 --max 5 --owner-says-sweep-is-not-sending --owner-saw-the-sweep-not-running "${SR}" --confirm --expect "${N}" --fix-deployed-sha "${FIXSHA}" --i-checked-inngest-settings 2>&1 | tee /tmp/r36w-canary-send.out || { touch /tmp/r36w-last-send.ok || { echo "STOP: the canary failed or was refused, and the time it returned could not be recorded; its lines are above. What they show as sent stays sent and is in the marker. Nothing further is sent"; exit 1; }; echo "STOP: the canary failed or was refused; its lines are above. Conclude nothing from the exit code. What they show as sent stays sent and is in the marker. Nothing further is sent"; exit 1; }
touch /tmp/r36w-last-send.ok || { echo "STOP: the time the canary returned could not be recorded. What the lines above show as sent stays sent. Nothing further is sent"; exit 1; }
grep -qE '^SENT: 5 of 5  ' /tmp/r36w-canary-send.out || { echo "STOP: the canary does not show SENT: 5 of 5. What the lines above show as sent stays sent. Nothing further is sent"; exit 1; }
grep -qxF 'G4 ATTEMPTED EQUALS SENT: yes (5 requests started, 5 sent)' /tmp/r36w-canary-send.out || { echo "STOP: the canary does not show G4 ATTEMPTED EQUALS SENT: yes (5 requests started, 5 sent). Nothing further is sent"; exit 1; }
grep -qxF 'G3 AFTER THIS RUN: 0  (appointments checked: 5; handed to a provider: 0; expected 0)' /tmp/r36w-canary-send.out || { echo "STOP: the canary does not show G3 AFTER THIS RUN: 0 for 5 appointments. Nothing further is sent"; exit 1; }
touch /tmp/r36w-canary.ok || { echo "STOP: the canary's record could not be written. The five were sent. Nothing further is sent"; exit 1; }
echo "WEEKLY CANARY SENT: 5 of 5, G4 yes, G3 0. The owner checks the canary in the Inngest dashboard now (G2); THE WEEKLY REST waits for his word."
)
```

**EXPECT:** `running from:`; the sidecar line `docs/data-op-r36-weekly-fallback.md: OK`; `pins:`; `Lisbon now: ... inside: yes`; `main: ..., unchanged since WEEKLY, BEFORE YOU START`; the target guard's lines; the canary's dry run IN FULL, counts only, with `THIS RUN: 5 of <N>` and its G3 line reading 0 for PRIORK appointments checked; `canary began:` in both zones; the canary's lines IN FULL, with `SENT: 5 of 5`, `G4 ATTEMPTED EQUALS SENT: yes (5 requests started, 5 sent)`, the `settle` line and `G3 AFTER THIS RUN: 0`; then `WEEKLY CANARY SENT: 5 of 5, G4 yes, G3 0. ...`. Exit 0.

### G2: the owner checks the canary

As G2 of the R36 document. The canary prints no appointment id. The owner checks in the Inngest dashboard (Production), right after the canary, since the free plan's trace history reaches back 24 hours only:

1. **Functions, `send-appointment-reminder`, Runs.** The runs started from the minute `canary began` printed (his machine shows Toronto time): exactly **ten** with the status Running, five whose event carries `channel` `email` and five `sms`. Runs these replaced may show as Cancelled; that is the design. A waiting run shows as Running.
2. **Functions, `send-appointment-confirmation`, Runs:** none started since that minute.
3. **If he wants to check each appointment by its id,** the five ids are in this operation's marker, `~/.osteojp-r36-fallback-rearm/.osteojp-inc1007-rearm.json`, the newest entry. He opens it himself; GREEN never prints or reads it.

Anything else: stop, report, nothing further runs. While in the dashboard, press nothing (see "Replay").

### THE WEEKLY REST: repeated until its dry run reads ELIGIBLE 0

Pasted only after the owner's word that G2 passed. Then again after each run that ended clean, until the dry run at its start reads `ELIGIBLE: 0`. Each run sends at most 200.

```
(
set -o pipefail
NIGHTS='20261113'
FIXSHA=20a6d73151468d36c080bcfd6cfad528d3a69d2d
SHAWRAP=1795c035a45d7a318b2966eda3991423ee0d2c27c5bc1a78d1e811404459f454
SHAEMIT=8f4242d0aefe003acfa2dbc3330e4bf0b7471aa38123763fa9411fc379656e7f
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
DOCPIN=docs/data-op-r36-weekly-fallback.sha256
WRAP=packages/db/scripts/r36-fallback-rearm-emit.mjs
EMIT=packages/db/scripts/inc-1007-rearm-reminders-emit.mjs
GUARD=scripts/assert-production-target.mjs
PTM=scripts/production-target.mjs
SWEEPOK="SWEEP GUARD: the sweep is in shadow by all three checks (this shell's switch, the owner's word, production's heartbeats)"

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was sent by this block"; exit 1; }
test -f /tmp/r36w-head.sha || { echo "STOP: WEEKLY, BEFORE YOU START recorded no head in this sitting. Nothing was sent by this block"; exit 1; }
REC=$(cat /tmp/r36w-head.sha) || { echo "STOP: the recorded head could not be read. Nothing was sent by this block"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the recorded head did not read as a full 40-character sha [${REC}]. Nothing was sent by this block"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was sent by this block"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. Nothing was sent by this block"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the head WEEKLY, BEFORE YOU START recorded. Nothing was sent by this block"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was sent by this block"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. Nothing was sent by this block"; echo "${STRAY}"; exit 1; }
echo "running from:  ${REC}, the head WEEKLY, BEFORE YOU START recorded"
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one. Nothing was sent by this block"; exit 1; }
[ "$(shasum -a 256 ${WRAP} | cut -d' ' -f1)" = "${SHAWRAP}" ] || { echo "STOP: the program on disk is not the approved file. Nothing was sent by this block"; exit 1; }
[ "$(shasum -a 256 ${EMIT} | cut -d' ' -f1)" = "${SHAEMIT}" ] || { echo "STOP: the program of 2026-10-12 on disk is not the pinned file. Nothing was sent by this block"; exit 1; }
[ "$(shasum -a 256 ${GUARD} | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the pinned file. Nothing was sent by this block"; exit 1; }
[ "$(shasum -a 256 ${PTM} | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the pinned file. Nothing was sent by this block"; exit 1; }
echo "pins:          the program, the program of 2026-10-12, the target guard and its module are the pinned files"
test -f /tmp/r36w-night.ok || { echo "STOP: WEEKLY, BEFORE YOU START recorded no night in this sitting. Nothing was sent by this block"; exit 1; }
NIGHT=$(cat /tmp/r36w-night.ok) || { echo "STOP: the recorded night could not be read. Nothing was sent by this block"; exit 1; }
RUNDAY=$(echo "${NIGHT}" | cut -d' ' -f1)
NEXTDAY=$(echo "${NIGHT}" | cut -d' ' -f2)
NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was sent by this block"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9]{12} [1-7] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM, a weekday and the zone WET or WEST [${NOW}]. Nothing was sent by this block"; exit 1; }
NOWL=$(echo "${NOW}" | cut -c1-12)
LT=$(echo "${NOWL}" | cut -c9-12)
DAY=$(echo "${NOWL}" | cut -c1-8)
echo "${NOWL} ${LT} ${DAY} ${RUNDAY} ${NEXTDAY}" | grep -qxE '[0-9]{12} [0-2][0-9][0-5][0-9] [0-9]{8} [0-9]{8} [0-9]{8}' || { echo "STOP: the Lisbon time or the recorded night did not read as dates and times. Nothing was sent by this block"; exit 1; }
echo "${RUNDAY}" | grep -qxE "${NIGHTS}" || { echo "STOP: the recorded night ${RUNDAY} is not a weekly night strategy has ruled (this document lists ${NIGHTS}). Nothing was sent by this block"; exit 1; }
WIN=no
if [ "${DAY}" = "${RUNDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) >= 2100) exit 0; exit 1 }'; then WIN=yes; fi
if [ "${DAY}" = "${NEXTDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) <= 629) exit 0; exit 1 }'; then WIN=yes; fi
echo "Lisbon now:    ${NOWL}; the night recorded: ${RUNDAY} 21:00 to ${NEXTDAY} 06:29; inside: ${WIN}"
[ "${WIN}" = yes ] || { echo "STOP: Lisbon ${NOWL} is outside the night WEEKLY, BEFORE YOU START recorded (${RUNDAY} from 21:00 to ${NEXTDAY} at 06:29). Nothing was sent by this block"; exit 1; }
test -f /tmp/r36w-stale.ok || { echo "STOP: WEEKLY, BEFORE YOU START recorded no STALEPATH in this sitting. Nothing was sent by this block"; exit 1; }
SR=$(cat /tmp/r36w-stale.ok) || { echo "STOP: the recorded STALEPATH could not be read. Nothing was sent by this block"; exit 1; }
echo "${SR}" | grep -qxE 'no|yes' || { echo "STOP: the recorded STALEPATH is not no or yes [${SR}]. Nothing was sent by this block"; exit 1; }
test -f /tmp/r36w-canary.ok || { echo "STOP: the weekly canary has not run in this sitting, so THE WEEKLY REST does not run. Nothing was sent by this block"; exit 1; }
test -f /tmp/r36w-priork.ok || { echo "STOP: WEEKLY, BEFORE YOU START recorded no PRIORK in this sitting. Nothing was sent by this block"; exit 1; }
PK=$(cat /tmp/r36w-priork.ok) || { echo "STOP: the recorded PRIORK could not be read. Nothing was sent by this block"; exit 1; }
echo "${PK}" | grep -qxE '[1-9][0-9]{0,5}' || { echo "STOP: the recorded PRIORK did not read as a whole number above 0 [${PK}]. Nothing was sent by this block"; exit 1; }
KMIN=$(( ${PK} + 5 ))
test -f /tmp/r36w-main.sha || { echo "STOP: WEEKLY, BEFORE YOU START recorded no main in this sitting. Nothing was sent by this block"; exit 1; }
MREC=$(cat /tmp/r36w-main.sha) || { echo "STOP: the recorded main could not be read. Nothing was sent by this block"; exit 1; }
git fetch origin --prune || { echo "STOP: the fetch failed, so whether main moved is not known. Nothing was sent by this block"; exit 1; }
MNOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. Nothing was sent by this block"; exit 1; }
echo "${MNOW} ${MREC}" | grep -qxE '[0-9a-f]{40} [0-9a-f]{40}' || { echo "STOP: origin/main or the recorded main did not read as a full 40-character sha. Nothing was sent by this block"; exit 1; }
[ "${MNOW}" = "${MREC}" ] || { echo "STOP: main moved during the sitting (${MREC} to ${MNOW}): a merge deploys production and re-syncs the scheduler. The lead rules. Nothing was sent by this block"; exit 1; }
echo "main:          ${MNOW}, unchanged since WEEKLY, BEFORE YOU START"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. Nothing was sent by this block"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/r36w-target-c.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. Nothing was sent by this block"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/r36w-target-c.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. Nothing was sent by this block"; exit 1; }
node ${WRAP} --tenant-slug osteojp --max-days-ahead 28 --max 200 --owner-says-sweep-is-not-sending --owner-saw-the-sweep-not-running "${SR}" 2>&1 | tee /tmp/r36w-rest-dry.out || { echo "STOP: the dry run failed or was refused; its lines are above. A dry run is READ ONLY and nothing was sent by this block"; exit 1; }
grep -qxF "${SWEEPOK}" /tmp/r36w-rest-dry.out || { echo "STOP: the dry run does not show the sweep guard's line. Nothing was sent by this block"; exit 1; }
grep -qxF 'target   PRODUCTION' /tmp/r36w-rest-dry.out || { echo "STOP: the dry run does not show the line target PRODUCTION. Nothing was sent by this block"; exit 1; }
grep -qxF 'mode     DRY RUN - nothing is sent' /tmp/r36w-rest-dry.out || { echo "STOP: the dry run does not show the line mode DRY RUN. Nothing was sent by this block"; exit 1; }
EC=$(grep -cxE 'ELIGIBLE: [0-9]+' /tmp/r36w-rest-dry.out) || { echo "STOP: the dry run holds no ELIGIBLE line. Nothing was sent by this block"; exit 1; }
[ "${EC}" = 1 ] || { echo "STOP: the dry run holds ${EC} ELIGIBLE lines, not exactly one. Nothing was sent by this block"; exit 1; }
N=$(grep -xE 'ELIGIBLE: [0-9]+' /tmp/r36w-rest-dry.out | cut -d' ' -f2) || { echo "STOP: the ELIGIBLE number could not be read from the dry run. Nothing was sent by this block"; exit 1; }
echo "${N}" | grep -qxE '0|[1-9][0-9]{0,5}' || { echo "STOP: the ELIGIBLE number of the dry run did not read as a whole number [${N}]. Nothing was sent by this block"; exit 1; }
grep -qxF 'G1 UNDER THE LIMIT OF 20000: yes' /tmp/r36w-rest-dry.out || { echo "STOP: the dry run does not show G1 UNDER THE LIMIT OF 20000: yes. Nothing was sent by this block"; exit 1; }
G3L=$(grep -xE 'G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 0  [(]appointments checked: [0-9]+; handed to a provider: 0; not checkable: 0; expected 0[)]' /tmp/r36w-rest-dry.out) || { echo "STOP: the dry run does not show the G3 line reading 0 with not checkable 0. Nothing was sent by this block"; exit 1; }
K=$(echo "${G3L}" | sed -E 's/.*appointments checked: ([0-9]+);.*/\1/') || { echo "STOP: the number of appointments checked could not be read from the G3 line. Nothing was sent by this block"; exit 1; }
echo "${K}" | grep -qxE '[1-9][0-9]{0,5}' || { echo "STOP: the number of appointments checked did not read as a whole number above 0 [${K}]. Nothing was sent by this block"; exit 1; }
[ "${K}" -ge "${KMIN}" ] || { echo "STOP: G3 checked ${K} appointments, fewer than the ${KMIN} the earlier sittings and this canary sent (PRIORK ${PK} plus 5), so the marker is not this sitting's. The lead rules. Nothing was sent by this block"; exit 1; }
if [ "${N}" = 0 ]; then echo "WEEKLY REST: ELIGIBLE 0 at this read, so nothing is left to send and nothing was sent by this block. Paste THE WEEKLY CLOSING DRY RUN 12 minutes or more after the last send returned."; exit 0; fi
echo "the dry run passed: ${N} eligible, G3 0 for ${K} appointments checked. This run sends up to 200 now"
caffeinate -i node ${WRAP} --tenant-slug osteojp --max-days-ahead 28 --max 200 --owner-says-sweep-is-not-sending --owner-saw-the-sweep-not-running "${SR}" --confirm --expect "${N}" --fix-deployed-sha "${FIXSHA}" --i-checked-inngest-settings 2>&1 | tee /tmp/r36w-rest-send.out || { touch /tmp/r36w-last-send.ok || { echo "STOP: the run failed or was refused, and the time it returned could not be recorded; its lines are above. What they show as sent stays sent and is in the marker. Nothing further is sent"; exit 1; }; echo "STOP: the run failed or was refused; its lines are above. Conclude nothing from the exit code. What they show as sent stays sent and is in the marker. Nothing further is sent"; exit 1; }
touch /tmp/r36w-last-send.ok || { echo "STOP: the time the run returned could not be recorded. What the lines above show as sent stays sent. Nothing further is sent"; exit 1; }
SL=$(grep -cE '^SENT: [0-9]+ of [0-9]+  ' /tmp/r36w-rest-send.out) || { echo "STOP: the run does not show a SENT line. Nothing further is sent"; exit 1; }
[ "${SL}" = 1 ] || { echo "STOP: the run shows ${SL} SENT lines, not exactly one. Nothing further is sent"; exit 1; }
grep -qE '^G4 ATTEMPTED EQUALS SENT: yes [(]' /tmp/r36w-rest-send.out || { echo "STOP: the run does not show G4 ATTEMPTED EQUALS SENT: yes. Nothing further is sent"; exit 1; }
grep -qxE 'G3 AFTER THIS RUN: 0  [(]appointments checked: [0-9]+; handed to a provider: 0; expected 0[)]' /tmp/r36w-rest-send.out || { echo "STOP: the run does not show G3 AFTER THIS RUN: 0. Nothing further is sent"; exit 1; }
echo "WEEKLY REST: this run ended clean. Paste THE WEEKLY REST again; when its dry run reads ELIGIBLE 0, paste THE WEEKLY CLOSING DRY RUN 12 minutes or more after this run."
)
```

**EXPECT:** the same opening lines as the canary's; the dry run IN FULL, counts only, its G3 line reading 0 for PRIORK plus the appointments sent so far tonight (PRIORK plus 5 after the canary, more after each run); then either `WEEKLY REST: ELIGIBLE 0 at this read, ...` (exit 0, nothing sent), or `the dry run passed: ...`, the run's lines IN FULL with one `SENT:` line, `G4 ATTEMPTED EQUALS SENT: yes`, the `settle` line, `G3 AFTER THIS RUN: 0`, and `WEEKLY REST: this run ended clean. ...`. Exit 0. A run that printed `OUT OF TIME` ended clean: paste THE WEEKLY REST again. With `--max 200` the margin around a reminder time is 690 seconds; at night no reminder time falls in it.

### THE WEEKLY CLOSING DRY RUN: 12 minutes or more after the last send

```
(
set -o pipefail
NIGHTS='20261113'
FIXSHA=20a6d73151468d36c080bcfd6cfad528d3a69d2d
SHAWRAP=1795c035a45d7a318b2966eda3991423ee0d2c27c5bc1a78d1e811404459f454
SHAEMIT=8f4242d0aefe003acfa2dbc3330e4bf0b7471aa38123763fa9411fc379656e7f
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
DOCPIN=docs/data-op-r36-weekly-fallback.sha256
WRAP=packages/db/scripts/r36-fallback-rearm-emit.mjs
EMIT=packages/db/scripts/inc-1007-rearm-reminders-emit.mjs
GUARD=scripts/assert-production-target.mjs
PTM=scripts/production-target.mjs
SWEEPOK="SWEEP GUARD: the sweep is in shadow by all three checks (this shell's switch, the owner's word, production's heartbeats)"

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. This block sends nothing"; exit 1; }
test -f /tmp/r36w-head.sha || { echo "STOP: WEEKLY, BEFORE YOU START recorded no head in this sitting. This block sends nothing"; exit 1; }
REC=$(cat /tmp/r36w-head.sha) || { echo "STOP: the recorded head could not be read. This block sends nothing"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the recorded head did not read as a full 40-character sha [${REC}]. This block sends nothing"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. This block sends nothing"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. This block sends nothing"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the head WEEKLY, BEFORE YOU START recorded. This block sends nothing"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. This block sends nothing"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. This block sends nothing"; echo "${STRAY}"; exit 1; }
echo "running from:  ${REC}, the head WEEKLY, BEFORE YOU START recorded"
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one. This block sends nothing"; exit 1; }
[ "$(shasum -a 256 ${WRAP} | cut -d' ' -f1)" = "${SHAWRAP}" ] || { echo "STOP: the program on disk is not the approved file. This block sends nothing"; exit 1; }
[ "$(shasum -a 256 ${EMIT} | cut -d' ' -f1)" = "${SHAEMIT}" ] || { echo "STOP: the program of 2026-10-12 on disk is not the pinned file. This block sends nothing"; exit 1; }
[ "$(shasum -a 256 ${GUARD} | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the pinned file. This block sends nothing"; exit 1; }
[ "$(shasum -a 256 ${PTM} | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the pinned file. This block sends nothing"; exit 1; }
echo "pins:          the program, the program of 2026-10-12, the target guard and its module are the pinned files"
test -f /tmp/r36w-night.ok || { echo "STOP: WEEKLY, BEFORE YOU START recorded no night in this sitting. This block sends nothing"; exit 1; }
NIGHT=$(cat /tmp/r36w-night.ok) || { echo "STOP: the recorded night could not be read. This block sends nothing"; exit 1; }
RUNDAY=$(echo "${NIGHT}" | cut -d' ' -f1)
NEXTDAY=$(echo "${NIGHT}" | cut -d' ' -f2)
NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z') || { echo "STOP: the Lisbon clock could not be read. This block sends nothing"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9]{12} [1-7] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM, a weekday and the zone WET or WEST [${NOW}]. This block sends nothing"; exit 1; }
NOWL=$(echo "${NOW}" | cut -c1-12)
LT=$(echo "${NOWL}" | cut -c9-12)
DAY=$(echo "${NOWL}" | cut -c1-8)
echo "${NOWL} ${LT} ${DAY} ${RUNDAY} ${NEXTDAY}" | grep -qxE '[0-9]{12} [0-2][0-9][0-5][0-9] [0-9]{8} [0-9]{8} [0-9]{8}' || { echo "STOP: the Lisbon time or the recorded night did not read as dates and times. This block sends nothing"; exit 1; }
echo "${RUNDAY}" | grep -qxE "${NIGHTS}" || { echo "STOP: the recorded night ${RUNDAY} is not a weekly night strategy has ruled (this document lists ${NIGHTS}). This block sends nothing"; exit 1; }
WIN=no
if [ "${DAY}" = "${RUNDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) >= 2100) exit 0; exit 1 }'; then WIN=yes; fi
if [ "${DAY}" = "${NEXTDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) <= 629) exit 0; exit 1 }'; then WIN=yes; fi
echo "Lisbon now:    ${NOWL}; the night recorded: ${RUNDAY} 21:00 to ${NEXTDAY} 06:29; inside: ${WIN}"
[ "${WIN}" = yes ] || { echo "STOP: Lisbon ${NOWL} is outside the night WEEKLY, BEFORE YOU START recorded (${RUNDAY} from 21:00 to ${NEXTDAY} at 06:29). This block sends nothing"; exit 1; }
test -f /tmp/r36w-stale.ok || { echo "STOP: WEEKLY, BEFORE YOU START recorded no STALEPATH in this sitting. This block sends nothing"; exit 1; }
SR=$(cat /tmp/r36w-stale.ok) || { echo "STOP: the recorded STALEPATH could not be read. This block sends nothing"; exit 1; }
echo "${SR}" | grep -qxE 'no|yes' || { echo "STOP: the recorded STALEPATH is not no or yes [${SR}]. This block sends nothing"; exit 1; }
test -f /tmp/r36w-canary.ok || { echo "STOP: the weekly canary has not run in this sitting. This block sends nothing"; exit 1; }
test -f /tmp/r36w-priork.ok || { echo "STOP: WEEKLY, BEFORE YOU START recorded no PRIORK in this sitting. This block sends nothing"; exit 1; }
PK=$(cat /tmp/r36w-priork.ok) || { echo "STOP: the recorded PRIORK could not be read. This block sends nothing"; exit 1; }
echo "${PK}" | grep -qxE '[1-9][0-9]{0,5}' || { echo "STOP: the recorded PRIORK did not read as a whole number above 0 [${PK}]. This block sends nothing"; exit 1; }
KMIN=$(( ${PK} + 5 ))
test -f /tmp/r36w-last-send.ok || { echo "STOP: no send of this sitting recorded the time it returned. This block sends nothing"; exit 1; }
RECENT=$(find /tmp/r36w-last-send.ok -mmin -12) || { echo "STOP: the age of the record of the last send could not be read. This block sends nothing"; exit 1; }
[ -z "${RECENT}" ] || { echo "STOP: the last send returned less than 12 minutes ago, so the window of its run has not closed. Wait, and paste this block again. This block sends nothing"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. This block sends nothing"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/r36w-target-d.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. This block sends nothing"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/r36w-target-d.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. This block sends nothing"; exit 1; }
node ${WRAP} --tenant-slug osteojp --max-days-ahead 28 --max 200 --owner-says-sweep-is-not-sending --owner-saw-the-sweep-not-running "${SR}" 2>&1 | tee /tmp/r36w-closing.out || { echo "STOP: the closing dry run failed or was refused; its lines are above. It is READ ONLY. This block sends nothing"; exit 1; }
grep -qxF "${SWEEPOK}" /tmp/r36w-closing.out || { echo "STOP: the closing dry run does not show the sweep guard's line. This block sends nothing"; exit 1; }
grep -qxF 'target   PRODUCTION' /tmp/r36w-closing.out || { echo "STOP: the closing dry run does not show the line target PRODUCTION. This block sends nothing"; exit 1; }
grep -qxF 'mode     DRY RUN - nothing is sent' /tmp/r36w-closing.out || { echo "STOP: the closing dry run does not show the line mode DRY RUN. This block sends nothing"; exit 1; }
grep -qxF 'ELIGIBLE: 0' /tmp/r36w-closing.out || { echo "STOP: the closing dry run does not read ELIGIBLE: 0. Paste THE WEEKLY REST again, then this block 12 minutes or more after it. This block sends nothing"; exit 1; }
G3L=$(grep -xE 'G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 0  [(]appointments checked: [0-9]+; handed to a provider: 0; not checkable: 0; expected 0[)]' /tmp/r36w-closing.out) || { echo "STOP: the closing dry run does not show the G3 line reading 0 with not checkable 0. This block sends nothing"; exit 1; }
K=$(echo "${G3L}" | sed -E 's/.*appointments checked: ([0-9]+);.*/\1/') || { echo "STOP: the number of appointments checked could not be read from the G3 line. This block sends nothing"; exit 1; }
echo "${K}" | grep -qxE '[1-9][0-9]{0,5}' || { echo "STOP: the number of appointments checked did not read as a whole number above 0 [${K}]. This block sends nothing"; exit 1; }
[ "${K}" -ge "${KMIN}" ] || { echo "STOP: G3 checked ${K} appointments, fewer than the ${KMIN} the earlier sittings and this canary sent (PRIORK ${PK} plus 5). The lead rules. This block sends nothing"; exit 1; }
TONIGHT=$(( ${K} - ${PK} ))
G4L=$(grep -E '^G4 NEXT 48 HOURS, NOT RE-ARMED: [0-9]+ ' /tmp/r36w-closing.out) || { echo "STOP: the closing dry run does not show the G4 line. This block sends nothing"; exit 1; }
echo "for the owner: ${G4L}"
TCH=$(grep -xE 'skipped: touched in the last 25 hours: [0-9]+' /tmp/r36w-closing.out) || { echo "STOP: the closing dry run does not show the touched count. This block sends nothing"; exit 1; }
echo "for the owner: ${TCH} (it holds any visit whose last touch was a confirm that sent nothing: the residual of Q-R36-F5)"
echo "WEEKLY CLOSING DRY RUN: ELIGIBLE 0, and G3 reads 0 for the ${K} appointments this operation sent, ${TONIGHT} of them in this sitting. The sends of the sitting are over. The next weekly dispatch's PRIORK is ${K}."
)
```

**EXPECT:** the opening lines; the closing dry run IN FULL, counts only, with `ELIGIBLE: 0` and the G3 line reading 0 for every appointment this operation has sent; `for the owner: G4 NEXT 48 HOURS, NOT RE-ARMED: ...`; `for the owner: skipped: touched in the last 25 hours: <n> ...`; then `WEEKLY CLOSING DRY RUN: ELIGIBLE 0, and G3 reads 0 for the <K> appointments this operation sent, <K minus PRIORK> of them in this sitting. ... The next weekly dispatch's PRIORK is <K>.` Exit 0. GREEN reports every line of every block.

### After the closing dry run: the owner's look at the re-plan (step 7)

As the R36 document's step 7. Each event cancels the appointment's sleeping jobs when it arrives, and their replacements exist only if the planning run, `schedule-appointment-reminders`, succeeds. So, after THE WEEKLY CLOSING DRY RUN, the owner looks in the Inngest dashboard (Production): **Functions, `schedule-appointment-reminders`, Runs, from the minute `canary began` printed: none with the status Failed**; and the same for **`send-appointment-reminder`**. Any Failed run: report it with its count, and the lead rules; the next weekly dispatch's LASTOK is then not `yes` without the lead's ruling. The marker holds that appointment as sent, so no later run of this program sends it again unasked.

## The dispatch

GREEN pastes WEEKLY, BEFORE YOU START only from a dispatch of its own, for one night, issued by SOLO, which fills these six lines and states the rest:

| Field | What SOLO fills |
|---|---|
| `RUNDAY` | the Lisbon date of the night, YYYYMMDD, one of `NIGHTS` (today only `20261113`) |
| `HELD` | the full sha of this pull request's head at the READY line, the commit `refs/pull/<PR>/head` must read |
| `DOCSHA` | this document's sha256 at that head (the sidecar's value) |
| `STALEPATH` | `no` while the heartbeats are fresh; `yes` only on the ruling of Q-R36-F6, the owner's two confirmations that night, and an open incident card for why the sweep stopped |
| `LASTOK` | `yes` only when GREEN's report of the LAST sitting of this operation (Thursday 11-05's second pass, or Wednesday 11-04's if no second pass ran, or the previous weekly sitting) shows: G2 passed, the sitting ended with its closing dry run's last line (`... The second pass is over.`, `... The sends of the sitting are over.`), no G3 stop, no FAILED send, no lock left behind, and the owner's step 7 look found no Failed run. The dispatch quotes the lines of that report it rests on. Anything else: no weekly dispatch is issued without the lead's ruling |
| `PRIORK` | the number `<K>` that last closing line printed (`... G3 reads 0 for the <K> appointments this operation sent ...`), copied from GREEN's report |

The dispatch also: names `packages/db/scripts/r36-fallback-rearm-emit.mjs`; states that the rollback is none and that Replay is never pressed; states that the sweep is still in shadow and that this night is not the switch night (B8); carries **SOLO's written statement of THE MERGE FREEZE** (every armed pull request disarmed; no pull request opened, armed or merged from the owner's first look until GREEN reports; the owner's part stated too); and lists the pull requests merged to `main` since the last sitting that touch `apps/web/lib/reminders/` or `apps/web/lib/scheduling/`, so the owner knows what G2 is checking against.

## If a block stops

- **Before a send** (every STOP of WEEKLY, BEFORE YOU START, and of the others before their `caffeinate` line): nothing was sent by that block. Report, and the lead rules. A STOP on `RUNDAY ... is not a weekly night strategy has ruled`, `LASTOK is not yes` or `not the ... the last sitting's closing line printed` means the dispatch is wrong or the precondition does not hold: no sitting that night without a new dispatch.
- **A refusal that names the marker** (`holds no sending run`, `row(s) of unknown outcome`, `lock is present`): nothing was read by the 2026-10-12 program and nothing was sent. Never delete or edit the marker or the lock; the lead rules.
- **`main moved during the sitting`, in THE WEEKLY CANARY.** Nothing was sent and the marker is as WEEKLY, BEFORE YOU START found it. Halt and report. SOLO re-confirms the freeze in writing and names what moved `main`; then, on the lead's ruling, after the owner's three looks again, WEEKLY, BEFORE YOU START may be pasted again (same PRIORK: the marker has not changed): it clears the records and re-records `main`, and the sitting goes on from THE WEEKLY CANARY.
- **`main moved during the sitting`, in THE WEEKLY REST** (the canary has sent): **halt for the night.** The owner looks at `schedule-appointment-reminders`, Runs, from the minute `canary began` printed (every one Completed, none Running or Failed) and at the scheduler sync of the new deployment. Nothing resumes this sitting: WEEKLY, BEFORE YOU START would now find a marker larger than PRIORK and stop, by design. The appointments not re-armed that night wait for the next ruled night, on the lead's ruling (with PRIORK read from that night's last clean G3 line), or for the switch.
- **In or after a send:** what the lines show as sent stays sent and is in the marker. A row the run stopped on is held as attempted, and no later run sends it unless the lead rules `--resend-attempted`; a later weekly sitting stops on it (the first block requires 0 attempted rows). A killed run leaves the lock: a halt, the lead rules.
- **A refusal of the sweep guard**: nothing was sent. If the sweep is sending, this document is not used that night or after.

## Rollback

None is needed and none exists. It writes nothing to Postgres. An event cannot be recalled and need not be: with the settings of the owner's Inngest look live, each event leaves its appointment with exactly one waiting reminder per channel. A run that stops half way leaves nothing to undo.

## Replay

**Nobody presses Replay or Rerun on any event or run in the Inngest dashboard: not before the sitting, not during it, not after it.** The reasons are the 2026-10-12 document's ("Replay"). A row whose send is in doubt goes out again only through the program, as a new event, on the lead's ruling.

## Rehearsal

**NOT REHEARSED.** Nothing in this document has run on a database. The rehearsal is done by a session that did not write it, on a local throwaway at production's migration position, under the lead's rule: "A script's own REFUSE or STOP line is a halt, the same as a harness refusal. Never edit an env file, a URL, a flag, a label or a script to get past a guard. A block that cannot run on the throwaway is recorded as NOT REHEARSED and the document says so." The R36 document's substitutions (a) to (i) apply ("Rehearsal"), plus: (j) the scratch clone's local bare `origin` carries this pull request's head as `refs/pull/<PR>/head`; (k) the scratch marker is the one left by a rehearsed Wednesday sitting and second pass into the sink, and, to pass `--second-pass` without waiting 25 hours, its first `readAt` may be aged as run 6 of the R36 rehearsal did (test data on a throwaway, said in the record, an untouched copy kept); (l) `PRIORK` is filled from that rehearsal's own closing line.

What the rehearsal should show at the least: the four blocks in order end on their last lines, the weekly sitting sends exactly the visits beyond the earlier reach plus those not in the marker at their present start, and nothing the marker holds at the same start; an empty marker, an attempted row, a lock, a PRIORK one off, a RUNDAY outside `NIGHTS` and `main` moved each STOP before any send.

**What a throwaway cannot run, so it stays NOT REHEARSED whatever the rehearsal does:**

- the production target guard's pass and `target   PRODUCTION`: the guard refuses 127.0.0.1 by design;
- the real scheduler: the sends to Inngest, G2, the step 7 look, and the Inngest settings look;
- GitHub: `refs/pull/<PR>/head` read from GitHub itself, the Actions run of the scheduler sync, and the Vercel looks;
- network time (`sntp`, the Date headers) against real hosts;
- the night's window on a real Friday night, unless the rehearsal runs on one;
- the marker and lock in `~/.osteojp-r36-fallback-rearm` (sink runs keep them beside the sink file), and a marker genuinely a week old;
- `OUT OF TIME`, a killed run, a failed send, and a row that changes between its read and its send.

## What must happen before READY, in this order, and none of it by GREEN

1. **The R4 round**, a fresh reviewer given this document, `scripts/r36-weekly-fallback.test.mjs` and the ruling, under the review-loop cap.
2. **The rehearsal** on a throwaway by a session that did not write this (see "Rehearsal"), recorded in this document with what stayed NOT REHEARSED.
3. **No GATE-CHANGE is needed to land the new test file:** it is under `scripts/**/*.test.mjs`, a gate glob, and the freeze allows an ADDED gate file (`scripts/assert-gates-unchanged.mjs`). It becomes frozen at the next GATE-CHANGE that regenerates the manifest.
4. **SOLO's READY line**: the first line changes and the sidecar `docs/data-op-r36-weekly-fallback.sha256` is regenerated in the same commit. The test accepts either first line.
5. **The pull request kept held, unarmed and unmerged** until the last weekly sitting's GREEN report, because every block reads its head. This authoring session changed no label; the `held-for-apply` label, if SOLO wants it, is SOLO's to put on.
6. **Strategy's go for the night** (still in shadow, not the switch night under B8), then **GREEN's dispatch** (see "The dispatch").

## Questions for strategy

**Q-R36W-1. Which nights after Friday 11-13.**
- blocked_what: every weekly sitting after 11-13. `NIGHTS` lists `20261113` only, and a block refuses any other RUNDAY.
- options: (a) none: the switch happens by then, or Q-R36-F1's re-rule ends the weekly sittings; (b) one more night by Wednesday 11-25, the last Q-R36-F1 allows: Thursday 11-19 or Friday 11-20 (Wednesday 11-18 is the `0113` night); (c) both 11-20 and 11-25.
- recommendation: (b), Friday 11-20, if the sweep is still in shadow on 11-18. A sitting on 11-20 reaches visits up to Friday 12-18, which carries every reminder to the night of Wednesday 12-16, past the re-rule Q-R36-F1 asks for after 11-25. Each night is added by a one-token change to `NIGHTS` in the four blocks, one narrow R4 round (R8), a new READY line and a new HELD.

**Q-R36W-2. The R36 pull request's hold.** The R36 document keeps #1690 held to the last weekly sitting because it once expected the weekly blocks to read its branch. These blocks do not: they read this pull request's head, which carries #1690's commits. Whether #1690 may merge after tonight's GREEN report is the lead's call; nothing here needs it held.

## Authoring record

- Authored on branch `data/R36-weekly-fallback-20261113`, stacked on #1690's held head `415bd0e9`, as pull request #1726, the number in WEEKLY, BEFORE YOU START. This pull request's own diff is this document, its sidecar and `scripts/r36-weekly-fallback.test.mjs`. No program, no other test and no document of #1690 changed.
- `scripts/r36-weekly-fallback.test.mjs`, run with `node --test` and `DATABASE_URL` blank, no database and no Docker. Its counts are in the pull request's description.
