# Fisiozero import — the production run

**Ivan executes this. No terminal may run any step of it.** Standing rules 1
and 2 forbid a terminal pointing anything at `dfotoodqvmjhbdcxyaxf`.

Derived from [`REHEARSAL.md`](./REHEARSAL.md), and **REHEARSED FOUR TIMES. Most
recently 2026-08-27 at `b191dde2`, to prove the cleanup guard. Evidence:
[`docs/import/evidence/REHEARSAL-2026-08-27c.md`](./evidence/REHEARSAL-2026-08-27c.md)**
— §1.3b's STEP 2 refused twice on purpose, on live data, before the real run:
once with `app.expected_patients` unset, once with a number the live count
disagreed with, and the table was unchanged after each. The whole apply command
ran in **82 seconds**. Earlier runs:
[`2026-08-26`](./evidence/REHEARSAL-2026-08-26.md) (`76dd93a2` — `MIG-02`,
`MIG-03`, `MIG-04`), [`2026-08-27`](./evidence/REHEARSAL-2026-08-27.md)
(`5ebbacf3` — `MIG-08`),
[`2026-08-27b`](./evidence/REHEARSAL-2026-08-27b.md) (`6909bf0c` — `MIG-09`).
The `patient_locations` backfill in §5.1 was rehearsed separately on
2026-08-28: [`BACKFILL-2026-08-28`](./evidence/BACKFILL-2026-08-28.md).

That precondition is now met and this file no longer waits on it. The byte copy
has met a live bucket (22 objects, read back), the runner has met a database
(2001 rows imported, referential integrity OK, 882 vendor numbers verbatim), the
second apply wrote nothing, and a half-imported run recovered on the
identical command. **Read the evidence file before the window opens** - seven
PRs came out of that rehearsal and every one of them was a defect no test could
have caught.

**THE WHOLE COMMAND IS 84 SECONDS ON THE AMOSTRA, and the budget for THIS
delivery still is not eighty-four seconds.** `MIG-08` batched the target writes
(19m10s of import to 78.3s) and `MIG-09` batched the ledger writes (a 401s
command to 84s). Two things do not scale from that, and both decide the window:

- **UNNUMBERED PATIENTS DO NOT BATCH.** A patient with no vendor
  `numero_paciente` must let 0029's trigger assign one, one statement per row.
  They were 118 of 1000 in the amostra and cost ~59s of the 69.0s the patient
  phase took — most of the remaining time. **Read the real proportion off the
  §3.3 preview, not off the rehearsal.**
- **THE AMOSTRA IS 2001 ROWS AND THIS DELIVERY IS AN ORDER OF MAGNITUDE MORE**,
  with a decade of appointments behind 8,000-10,000 patients.

Scale and real `patient_number` collisions remain the two things no rehearsal
has proved. **The two-clinic sequence is no longer one of them**: §3.1b now
measures it off the two deliveries before anything is written, and §5.1 repairs
the one thing it cannot prevent.

---

## THIS FILE IS IN EXECUTION ORDER, NOT IN NUMERIC ORDER

**READ THAT AGAIN BEFORE YOU SCROLL.** The section numbers below run
`1.1, 1.3c, 2.2, 1.3b, 1.3c-bis, 2.3, 1.3d` and then `1.3e, 1.4, 1.5, 2.1, 3.x`.
That is not damage. The numbers are the ones the four rehearsals and every
earlier note refer to, so they are kept; the ORDER is the one strategy validated
on 2026-08-27, and the order is what you execute. **Follow the BLOCK numbers,
which run 1 to 23 with no gaps.** They are the only sequence in this document.

**TWO SITTINGS, NOT ONE NIGHT.**

| | | |
|---|---|---|
| **SITTING 1 — SATURDAY, after 13:00** | **BLOCKS 1-12** | Everything that does not need the delivery. The worktree, the live patient count, the backup, the cleanup, the orphaned storage objects, the re-preflight, the production environment, the bucket. |
| **SITTING 2 — SUNDAY** | **BLOCKS 13-23** | Everything that does. The cross-delivery check, the two vocabularies, the configs, the dry runs, the conformance checks, both byte copies, both previews, both applies, the backfill and the final reconciliation. |

**WHY THE SPLIT.** Sitting 1 is the destructive half and it is entirely
independent of the vendor: it can be executed, read and stopped on a Saturday
afternoon with the whole of Sunday to recover. Sitting 2 cannot start before the
delivery is in hand. Running them together on Sunday night means taking the most
destructive step in the migration at the hour with the least margin, which is
what this split exists to stop.

**THE FREEZE SPANS BOTH SITTINGS.** It begins before BLOCK 2 and holds until the
go message on Sunday. See the SITTING 1 header.

### What changed on 2026-08-27, and why

Validated by strategy, executed here. If you read this file before that date,
these are the differences and there are no others:

| # | Change | Why |
|---|---|---|
| 1 | **Two sittings** instead of one window. | The cleanup does not need the delivery, and it is the step with no undo. |
| 2 | **§2.3 moves before §1.3d.** | The bucket precheck reads `$SUPABASE_URL`. Run before the environment is sourced it either fails or, worse, answers from a stale shell. |
| 3 | **§2.1 becomes "confirm the freeze held".** | The freeze now starts on Saturday, so Sunday's job is to confirm it held, not to declare it. |
| 4 | **The pre-cleanup preflight is dropped.** | It asked which numbers the tenant already holds. The cleanup empties the tenant minutes later, so the only preflight whose answer survives is the one after it — §1.3c-bis. Two readings of the same query, one of them immediately stale, is a document inviting the wrong one to be believed. |
| 5 | **The hardcoded patient count is gone, everywhere.** | It was the count as of 2026-08-25. On 2026-08-27 production held **35** — two more. A stale number reads as a verified fact right up to the moment it authorises deleting a row nobody meant to delete. The count is now read on the day, in BLOCK 2, into `app.expected_patients`. **No digit in this file is a patient count any more.** |
| 6 | **§1.2 is marked DONE and skipped.** | Executed on production 2026-08-27. |
| 7 | **The archive filename is a FILL.** | Every rehearsal used `STANDIN-attachments.zip`. `documentos.zip` was this document's guess at what the vendor would ship and nothing has confirmed it. |
| 8 | **Both byte copies run before any preview** (BLOCK 19 before BLOCK 20). | The 50 MB ceiling and a missing archive entry are both owner decisions, and finding the second one after the first clinic is already committed costs the window. |
| 9 | **New BLOCK 13, §3.1b:** `cross-delivery.mjs`. | Two deliveries into one tenant create two failure classes no single-delivery rehearsal can produce. Both are decided from the two `pacientes.csv` files, before the first byte. |
| 10 | **New BLOCK 22, §5.1:** `backfill-patient-locations.sql`. | A person seen at both clinics has their second delivery's patient row skipped as already imported — correctly — and that skip is also what would have written their second clinic's `patient_locations` link. PL-09 scopes patient visibility by exactly that table. |
| 11 | **Every block says where it is pasted.** | And from §1.3e onward, that it is never Claude Code. |

---

> ### A NOTE FOR WHOEVER EDITS THIS FILE
>
> **PROSE ABOVE §1 MUST NEVER CONTAIN THE LITERAL STRING `-` `-apply`** (written
> split here so this note does not break the rule it states). Three of
> `scripts/import/prod-run-runbook.test.mjs`'s ordering guards find the FIRST
> occurrence of that token and assert that `legacy-staff-accounts.sql`, the
> patient-number preflight, `cleanup-test-patients.sql`, `copy-attachments.mjs`
> and "Take a backup now" all appear before it. A header sentence mentioning the
> flag moves that first occurrence to the top of the file and every one of those
> guards fails.
>
> **THE GUARDS ARE RIGHT AND THE PROSE IS WRONG**, every time. It has happened
> twice — 2026-08-27, both times in a header paragraph added by a terminal — and
> both times the fix was to reword the sentence, never to relax the test. The
> ordering those guards pin is the actual safety property of this document: the
> backup and the preflight precede the first write, on a night with no undo.
>
> Say "the apply command" or "the live run". Never the flag.
>
> **THE BLOCK NUMBERS ARE ALSO GUARDED.** They must run 1 to 23, once each, in
> the order they appear, and BLOCK 13 must be `cross-delivery.mjs` and BLOCK 22
> `backfill-patient-locations.sql`. Renumbering silently is how a packet and a
> runbook stop agreeing.

---

## 0. Read this before the window opens

### 0.1 What makes this different from the rehearsal

| | Rehearsal | Production |
|---|---|---|
| Entrypoint | `rehearsal-import.ts` | **`prod-import.ts`** |
| Target gate | refuses production refs | **the confirmation phrase, typed** |
| Repeatable? | wipe and re-run freely | **the extraction happens once** |
| Deliveries | one | **two, one per clinic** |
| Cleanup | §8 wipes the project | **there is none. There is no undo.** |

**The single most important difference: there is no §8.** The rehearsal's
cleanup section does not exist here, and `migration_staging_rows` must **never**
be deleted on production — it is the only record of what was imported, on an
extraction the vendor contract does not let you repeat.

### 0.15 WHERE EVERY BLOCK IS PASTED, AND WHERE NONE OF THEM IS

Every numbered block below carries one of exactly two destinations:

| | |
|---|---|
| **plain Terminal.app** | A shell block. macOS Terminal, one tab, the shell that sourced the production environment in BLOCK 11. |
| **Supabase SQL editor** | An SQL block. The dashboard's SQL editor, against `dfotoodqvmjhbdcxyaxf`. |

A handful of steps are neither — they are things you do in the Supabase
dashboard UI or say to a person. Those are marked **dashboard** or **by hand**
and carry no command.

**NOT ONE BLOCK IN THIS DOCUMENT IS EVER PASTED INTO CLAUDE CODE, OR INTO ANY
OTHER TERMINAL AN AI IS DRIVING.** Standing rules 1 and 2: no terminal may point
anything at the production project. That holds for every block from BLOCK 1.

**FROM §1.3e ONWARD THERE IS A SECOND REASON, AND IT IS THE STRONGER ONE.**
Those blocks read the delivery. The final delivery is real patient data and is
**never** covered by the 2026-08-26 amostra exemption (CLAUDE.md). Their output
carries patient counts, therapist names, and in the failure paths file contents.
Pasting one of those commands — or its output — into an AI context creates an
unapproved RGPD processor relationship, and it cannot be undone by deleting the
message. **Every block from §1.3e onward repeats this on its own line, because
the one that gets pasted is the one whose warning was three screens up.**

### 0.2 The order is not negotiable

```
SITTING 1  - SATURDAY, after 13:00. The delivery is not needed.
  BLOCK  1   Worktree pinned to a real commit    <- the only tree holding prod creds
  BLOCK  2   Count the patients, and CONFIRM     <- the human check. The number moves.
  BLOCK  3   Backup                              <- the only undo you will have
  BLOCK  4   Cleanup STEP 1   preview
  BLOCK  5   Cleanup STEP 1b  storage paths      <- before the delete, or they are lost
  BLOCK  6   Cleanup STEP 1c  records by status
  BLOCK  7   Cleanup STEP 2   the delete         <- no undo inside the script
  BLOCK  8   Cleanup STEP 3   verify
  BLOCK  9   The orphaned storage objects        <- deleting the row leaves the file
  BLOCK 10   Re-preflight                        <- authorises running without the flag
  BLOCK 11   Source the production environment   <- and prove the guard REFUSES
  BLOCK 12   Bucket precheck                     <- needs the environment, hence after

SITTING 2  - SUNDAY. Everything below needs the delivery in hand.
  BLOCK 13   Cross-delivery identity check       <- two clinics, one tenant, no writes
  BLOCK 14   The two vocabularies, both deliveries
  BLOCK 15   The two configs
  BLOCK 16   Dry-run both
  BLOCK 17   Confirm the freeze held
  BLOCK 18   Conformance check, both deliveries
  BLOCK 19   Byte copy, BOTH deliveries          <- both, before any preview
  BLOCK 20   Preview, both
  BLOCK 21   Apply, both
  BLOCK 22   Backfill patient_locations          <- only if BLOCK 13 found shared ids
  BLOCK 23   Final reconciliation, and the platform
```

**TWENTY-THREE BLOCKS, TWELVE THEN ELEVEN.** The cleanup is five of the twelve
because each of its steps is read, confirmed and pasted on its own.

### 0.3 Conventions carried from the standing rules

- **`set -o allexport`, never `set -a`** — `set -a` errors in zsh.
- **No tilde paths.** Absolute everywhere.
- **Every path passed to a `pnpm --filter` command must be ABSOLUTE.** That
  command sets the working directory to `packages/db`, so a repo-relative path
  resolves under `packages/db/` and the script reports the file unreadable,
  exit `2`.
- **Exit codes**: `0` OK, `1` FAILED or refused, `2` BAD_INVOCATION. A `2` is
  never a data finding — it means the command was typed wrong.
- **The prod-apply worktree** is `/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply`.
  It is the only tree whose shell holds production credentials.
- **`pnpm 11` prints a bare `undefined` before its
  `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL` block** whenever a
  `pnpm --filter <pkg> exec ...` command exits non-zero. It comes from pnpm's
  own failure reporter, not from any script here — the same command without
  `--filter` does not print it. **Expect it on every refusal below and read past
  it.** Inside a window, treating it as a finding costs a diagnosis you do not
  have time for.

### 0.4 What is safe to paste back

Same guarantee as the rehearsal: every command below prints counts, codes and
column names only. Three files are **never** pasted — they carry personal data:

- `mapping-config.local.json` (live tenant uuids)
- `attachment-mapping.json` and `checkpoint.jsonl` (attachment filenames, which
  may carry patient names)

`legacy-staff-accounts.sql` STEP 3 and `rehearsal-uuids.sql` read the **staff**
roster, not patients. Safe, but they are the clinic's own configuration — paste
them here, not anywhere public.

### 0.5 Shell variables

Set once, in SITTING 1, in the Terminal.app tab you will keep. **Re-set them at
the top of SITTING 2**: it is a new day and a new shell.

```
export REPO=/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
export WORK=/Users/ivan/osteojp-migration/prod
export LV=FILL_absolute_path_to_the_linda_a_velha_delivery
export CB=FILL_absolute_path_to_the_castelo_branco_delivery
export LVZIP=FILL_absolute_path_to_the_linda_a_velha_attachment_archive
export CBZIP=FILL_absolute_path_to_the_castelo_branco_attachment_archive
mkdir -p "$WORK"
cd "$REPO"
```

**FOUR OF THOSE SIX ARE FILLS AND ALL FOUR NEED THE DELIVERY.** `$LV` and `$CB`
are the two delivery directories. `$LVZIP` and `$CBZIP` are the **attachment
archives inside them, and their filename is not known.**

**`documentos.zip` WAS THIS DOCUMENT'S GUESS AND NOTHING HAS CONFIRMED IT.**
Every rehearsal ran against `STANDIN-attachments.zip`, a 1,413-byte file built
in this repository. The caderno does not fix the archive's name. Read the real
one off the delivery directory with `ls` and set these two variables from it —
**one `ls`, in Terminal.app, on a directory listing that shows filenames and
therefore never gets pasted anywhere.**

**If a delivery ships more than one archive, STOP** and ask the vendor which
carries the `FICHEIRO` and `documentos.csv` entries. Guessing which of two
archives is the right one is not a decision to take on Sunday.

---
## SITTING 1 — SATURDAY, AFTER 13:00. BLOCKS 1-12.

**Nothing in this sitting needs the delivery.** Every block below runs against
production and against the repository, and none of them reads a vendor file.
That is the whole reason the sitting exists: the destructive step is here, and
here it has the rest of Saturday and all of Sunday behind it.

**THE FREEZE STARTS NOW, BEFORE BLOCK 2, AND IT COVERS OsteoJP.**

Per the cutover runbook §2 Step 1: staff are told, on WhatsApp, that Fisiozero
is read-only from this moment and nothing more is entered there. **And that
OsteoJP is read-only too** — nobody creates a patient, books an appointment or
writes a record on the platform until the go message on Sunday.

**Record the exact freeze time.** Everything created after it exists only in
Fisiozero's frozen copy, and that sentence is what reception will need in three
weeks.

**WHY OsteoJP AND NOT ONLY FISIOZERO.** BLOCK 2 reads a patient count and BLOCK
7 deletes exactly that many rows, refusing if the live count has moved. A
receptionist creating one patient on Saturday evening does not cause a bad
delete — the guard stops it — it causes a **stopped window**, on the day nobody
has spare hours to work out which document to believe.

---

### 1.1 The prod-apply worktree, pinned to a real commit

**BLOCK 1 — PASTE INTO: plain Terminal.app.**

```
cd "$REPO"
git status --short
git fetch origin --prune
git checkout --detach origin/main
git log -1 --oneline
```

**Expected:** `git status --short` prints **nothing at all**.

**STOP ON ANY LINE FROM `git status --short`.** Not "any line that looks
dangerous" — any line. Deciding which stray file is harmless is exactly the
judgement this step exists to avoid making in the one tree whose shell is about
to hold production credentials. It caught 21 stray scripts before the 0063 apply.

**`--detach`, and this is load-bearing.** A plain `git checkout main` in that
worktree is rejected when another worktree holds the branch, and the fallback
leaves you somewhere you did not intend. Detaching on `origin/main` is
unambiguous.

**Write down the sha `git log -1 --oneline` prints.** It is the version of every
script this run uses, and it belongs in the paste-back.

---

### 1.3c Count the patients, and confirm them with a person

**BLOCK 2 — PASTE INTO: Supabase SQL editor. Read-only.**

**THIS IS THE ONLY STEP THAT PROTECTS A REAL PATIENT FROM §1.3b.** Everything
else in that section is mechanical; this is the human check, and it has to
happen in this sitting rather than days earlier because **the number moves**.

```sql
select count(*)                        as patients,
       count(distinct patient_number)  as distinct_patient_numbers,
       min(patient_number)             as min_patient_number,
       max(patient_number)             as max_patient_number,
       max(created_at)                 as newest_created_at
from   patients
where  tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560';
```

**THEN ASK RODICA, IN WORDS, BEFORE YOU TYPE A NUMBER ANYWHERE:** *is every one
of these N patients still test data, and has nobody entered a real client?* A
count cannot answer that. `newest_created_at` is the prompt for the question,
not the answer to it — **if it is today or yesterday, somebody was creating
patients after the last time anyone confirmed this set.**

**THEN, AND ONLY THEN, write that count into `app.expected_patients` at the top
of `cleanup-test-patients.sql` STEP 2** (BLOCK 7). There is no default: unset,
STEP 2 raises and deletes nothing. Set to a number that disagrees with the live
count at transaction time, STEP 2 raises and deletes nothing. The guard
re-counts **inside** the transaction, so a row created between this SELECT and
that transaction stops the delete instead of being swept into it.

> **RECORDED FROM 2026-08-27, AND IT IS NOT THE NUMBER TO USE.**
>
> | | |
> |---|---|
> | `patients` | **35** |
> | numbers | **1 and 3–36** |
> | `newest_created_at` | **2026-08-26** — the day before |
>
> Owner ruling, 2026-08-27: all 35 are training data and are deletable. **But
> patient 36 was created on 2026-08-26**, which is exactly the pattern this step
> exists to catch: the set grew by one the day before it was confirmed, and it
> can grow again before this sitting. **This file used to hardcode a smaller
> number.** By 2026-08-27 that was two behind — and a stale expectation reads as
> a verified fact right up to the moment it authorises deleting a row nobody
> meant to delete.

---

### 2.2 Backup — the only undo you will have

**BLOCK 3 — dashboard, by hand. No command.**

Supabase dashboard → Database → Backups → **Take a backup now**, labelled
`pre-import-<date>`.

**Record the backup id.**

**STOP UNTIL IT IS COMPLETE.** Not started — complete. There is no cleanup
section in this document; this backup is what stands in for one.

**IT IS THIRD ON PURPOSE, AND EARLIER THAN THE OLD ORDER PUT IT.** BLOCK 7 is
the most destructive step in the migration and there is **no undo** inside the
script. The backup precedes it by four blocks so that the gap between "the only
rollback exists" and "the rows are gone" is as short as it can be while still
letting you read the previews first.

---

### 1.3b Remove the staff-training test patients

**BLOCKS 4-8 — PASTE INTO: Supabase SQL editor.**

Production holds a set of staff-training patients, all confirmed by the owner as
test data. They are removed before the import so every vendor `numero_paciente`
carries over **verbatim, with zero collisions**.

**THE COUNT IS NOT WRITTEN IN THIS DOCUMENT AND MUST NOT BE.** It is whatever
BLOCK 2 printed and Rodica confirmed. See BLOCK 2.

**This is the most destructive step in the whole migration.** BLOCK 3's backup
is taken *first*, earlier than the runbook otherwise called for it. There is no
undo inside the script.

Run [`scripts/import/cleanup-test-patients.sql`](../../scripts/import/cleanup-test-patients.sql)
in the Supabase SQL editor against production, in this order, one block at a
time, reading each before pasting the next:

| Block | Step | What | Expected |
|---|---|---|---|
| **4** | **1** | preview counts, read-only | `patients` = the count from BLOCK 2, `distinct_patient_numbers` the same, min/max inside the range BLOCK 2 printed |
| **5** | **1b** | storage paths, read-only | **EXPECT NON-ZERO** — see below; **run before BLOCK 7** or the paths are unrecoverable |
| **6** | **1c** | clinical records by status, read-only | read it; a `locked` or `signed` row among training data is a finding |
| **7** | **2** | the delete, one transaction | a count per statement matching BLOCK 4, ending with the patient count BLOCK 2 confirmed |
| **8** | **3** | verify, read-only | **every column 0**, `staff_rows` unchanged at **30** |

**STOP IF BLOCK 4 DOES NOT MATCH BLOCK 2.** The database is not in the state you
confirmed minutes ago — a real patient may exist. Do not run BLOCK 7 until the
difference is explained.

**STOP IF ANY BLOCK 7 COUNT DISAGREES WITH BLOCK 4.** The `begin` is still open;
type `rollback;` instead of `commit;`.

**STOP IF ANY `orphan_*` COLUMN IN BLOCK 8 IS NON-ZERO.** Rows survive pointing
at patients that no longer exist — the dependency graph missed a table, and the
import would write on top of it.

**STOP IF `staff_rows` IS NOT 30.** That is 28 real staff plus the two legacy
accounts from §1.2. The script must not touch `users` at all.

**`path_count` WILL BE NON-ZERO ON PRODUCTION, and the rehearsal's `0` is what
would mislead you.** Query 4 against production on 2026-08-27 returned
`attachments 3` for the training patients — the clinic uploaded real files while
practising the workflow, and `clinical-attachments` is not empty the way a fresh
rehearsal bucket is. **Deleting the row does not delete the object**: nothing in
this database reaches into Supabase Storage, so every path BLOCK 5 prints and
BLOCK 7 then removes the row for is an object left orphaned in the bucket,
belonging to a patient that no longer exists. BLOCK 9 is where they go.

**There is no Auth cleanup step, and that is a finding rather than an omission.**
Patients have **no `auth.users` rows** — the portal issues its own token and
migration 0010 creates a *login-less* Postgres role for them. The script header
carries the four pieces of evidence.

---

### 1.3b-storage The orphaned storage objects

**BLOCK 9 — dashboard, by hand. No command.**

**Only if BLOCK 5 printed a non-zero `path_count`.**

Supabase dashboard → Storage → `clinical-attachments`. Delete the objects at the
paths BLOCK 5 printed, and nothing else.

**Deleting the row did not delete the object; nothing in the database reaches
into Storage.** Left behind, they are clinical documents belonging to patients
that no longer exist, in a bucket the import is about to write into.

**DELETE ONLY THE PATHS BLOCK 5 PRINTED.** The bucket holds live clinical
documents for real patients. This is a hand operation in a UI with no undo, on
the one prefix where a mistake is unrecoverable.

**STOP IF A PATH BLOCK 5 PRINTED IS NOT THERE.** The bucket is not what BLOCK 5
described and the difference is worth understanding before the byte copy writes
into it.

---

### 1.3c-bis The re-preflight — this is what decides the flag

**BLOCK 10 — PASTE INTO: Supabase SQL editor. Read-only.**

Run [`scripts/import/preflight-patient-numbers.sql`](../../scripts/import/preflight-patient-numbers.sql),
now that the tenant has no patients.

**Expected: zero patients, so `max_patient_number` comes back NULL** and there is
no existing range for a vendor number to collide with.

**THERE IS NO LONGER A PREFLIGHT BEFORE THE CLEANUP, AND THAT IS DELIBERATE.**
It used to run twice, once each side of §1.3b. The first reading was stale
within minutes of being taken — the cleanup empties the tenant — and two
readings of one query, one of them known-obsolete, is a document inviting the
wrong one to be believed. The reading that decides anything is this one.

> **AN EMPTY TABLE REMOVES ONE COLLISION CLASS, NOT ALL OF THEM.** Corrected
> 2026-08-26 after the rehearsal found the second, and 2026-08-27 after strategy
> found the third.
>
> - **Collisions with rows the clinic already had** — removed by §1.3b. With the
>   table empty there is nothing pre-existing to collide with.
> - **Collisions the import creates against ITSELF, inside one delivery** —
>   *not* removed by an empty table. `numero_paciente` is filled on some vendor
>   rows and blank on others (882 of 1000 in the amostra). For a blank one the
>   importer omits the column and 0029's `assign_patient_number` fills it with
>   `COALESCE(MAX(patient_number), 0) + 1` — which can be a number a LATER
>   vendor row legitimately owns. The rehearsal lost 12 patients exactly this
>   way, from a vendor set with **zero** internal duplicates.
>   **Removed by ORDERING, and that is now in the runner.** `orderForImport`
>   imports every row carrying a vendor number before every row without one, so
>   by the time the trigger runs, `MAX(patient_number)` already includes every
>   vendor number and what it assigns cannot collide with one.
> - **Collisions BETWEEN THE TWO DELIVERIES** — removed by neither. Two clinics,
>   two independent vendor numbering series, one tenant, and
>   `patients_tenant_number_uq` is per-tenant. **BLOCK 13 is what measures this**,
>   and it is the reason that block exists.
>
> **The first two authorise the run WITHOUT
> `--reassign-conflicting-patient-numbers`. The third is decided on Sunday, in
> BLOCK 13**, and §3.3b stays a contingency until it says otherwise.

**STOP IF ANYTHING STILL COMES BACK.** The cleanup did not finish, and the flag
decision in §3.3b has to be revisited before the window continues.

**The reconciliation now checks the outcome rather than assuming it.** §3.4's
block prints `patient number fidelity: OK (<n> vendor number(s) checked)`, which
compares each imported patient's persisted `patient_number` against the
`numero_paciente` in its own staged row. A single changed number fails the run
and exits `1`.

---

### 2.3 Source the production environment, in a NEW terminal

**BLOCK 11 — PASTE INTO: plain Terminal.app. A NEW tab.**

```
cd "$REPO"
set -o allexport
source /Users/ivan/osteojp-secrets/new-prod.env
set +o allexport
pnpm --filter @osteojp/db exec tsx scripts/assert-not-prod.ts ; echo "exit=$?"
```

**A NEW terminal, and this is not ceremony.** `set -o allexport` exports every
variable in the file, and a shell that has ever sourced the rehearsal env still
holds those values for any name this file does not overwrite. That is how a
production run ends up half-pointed at a scratch project.

**`DATABASE_URL` (transaction pooler, 6543) is what the import uses** —
`DATABASE_URL_DIRECT` is for migrations and this run applies none.

**EXPECTED: `REFUSED`, exit `1`.** Read that twice. On production this guard is
**supposed to refuse** — it exists to keep the rehearsal off prod, and a `0`
here means your shell is **not** pointed at production and every step below
would run against the wrong database.

**STOP IF IT EXITS `0`.**

**THIS BLOCK MOVED, AND THE MOVE IS THE POINT.** It used to sit in §2 with the
window, after the bucket precheck. The bucket precheck reads `$SUPABASE_URL`;
run before this block it either fails for want of a variable or, far worse,
answers from whatever a previous shell left behind. The environment is sourced
first now, and BLOCK 12 depends on it.

**KEEP THIS TAB.** Every Terminal.app block in SITTING 2 runs in a shell that
sourced this file. If the tab is closed, re-run this whole block — including the
guard — before anything else.

---

### 1.3d The storage bucket precheck

**BLOCK 12 — PASTE INTO: plain Terminal.app, the tab from BLOCK 11.**

`clinical-attachments` already exists on production and holds live clinical
documents — this is a **verification**, not a creation step. Confirm it from the
prod-apply shell now, because §3.2 refuses without it.

**Bucket names only. Never list objects:** an object name is an attachment
filename and may carry a patient's name.

```
curl -s "$SUPABASE_URL/storage/v1/bucket" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | python3 -c 'import json,sys; print([b["name"] for b in json.load(sys.stdin)])'
```

**Expected:** a list containing `clinical-attachments`.

**STOP IF IT IS ABSENT.** Since 2026-08-26 `copy-attachments.mjs` checks this
itself before the first byte and exits `1` with
`bucket clinical-attachments does not exist in project <ref>`, having attempted
nothing. On production an absent bucket means the shell is pointed somewhere
unexpected, which is a bigger finding than the missing bucket.

**STOP IF THE COMMAND PRINTS NOTHING OR A JSON ERROR.** `$SUPABASE_URL` or
`$SUPABASE_SERVICE_ROLE_KEY` is unset, which means BLOCK 11 did not run in this
tab.

---

## END OF SITTING 1

**What you should be holding:** the pinned sha, the confirmed patient count, the
backup id, five cleanup outputs, the `path_count` and what you did about it, the
re-preflight showing zero, the guard's `REFUSED` and exit `1`, and the bucket
list.

**The freeze stays on.** Fisiozero and OsteoJP are both read-only until the go
message on Sunday.

**Nothing below this line can start before the delivery is in hand.**

---

### 1.2 The legacy staff accounts (owner ruling A) — DONE 2026-08-27. SKIP.

**NO BLOCK. NOTHING TO RUN. This section is kept for the record and for §1.3e,
which refers to its PART B.**

**EXECUTED ON PRODUCTION 2026-08-27.** `"Clínica OsteoJP"` and `"NESA"` — two of
the vendor's `terapeuta` values, neither of them a person — exist as `users`
rows, `role_id` null, `is_active` f, `is_bookable` f, `has_auth_user` **f**.
Their uuids are already pasted into both mapping configs, replacing the
`PENDING_OWNER_RULING` markers.

They were needed because `appointments.practitioner_id` is `NOT NULL` with a
foreign key to `users.id` — **without them the import fails on a foreign key,
mid-run.** The file is
[`scripts/import/legacy-staff-accounts.sql`](../../scripts/import/legacy-staff-accounts.sql).

**They cannot be created in the admin UI.** The only creation path there
(`inviteStaff`) always provisions a Supabase auth user with a password. That is
verified, not assumed — see the header of the SQL file.

**PART B OF THAT FILE IS NOT DONE AND CANNOT BE UNTIL SUNDAY.** It creates a
legacy row for every `terapeuta` the delivery names and the roster does not, and
nobody knows those names until §1.3e reads the delivery. See BLOCK 14.

**IF YOU ARE RE-RUNNING THIS MIGRATION FROM SCRATCH ON A NEW PROJECT**, this
section is not optional and its steps are STEP 1 (preview, all-zero collisions),
STEP 2 (`INSERT 0 2`), STEP 3 (exactly two rows, `has_auth_user` **f**), then
STEP 4 (paste the two uuids into the configs). **STOP IF `has_auth_user` IS
TRUE** — a credential exists for an account that must never have one.

---
## SITTING 2 — SUNDAY. BLOCKS 13-23.

**Every block below needs the delivery in hand.** That is the only thing they
have in common and it is why they are together.

**RE-SET THE SHELL VARIABLES FIRST.** New day, new shell. §0.5, including the
four FILLs, and **`$LVZIP` / `$CBZIP` are read off the delivery directories with
`ls` before anything else.**

**RE-RUN BLOCK 11.** A shell that has not sourced `new-prod.env` today is not
pointed at production, and the guard's `REFUSED` is the proof that it is.

> ### FROM HERE ON, EVERY BLOCK READS THE DELIVERY. NEVER CLAUDE CODE.
>
> The final delivery is real patient data and is **never** covered by the
> 2026-08-26 amostra exemption. Standing rules 1 and 2 already forbid a terminal
> pointing at production; this is the second and stronger reason, and it applies
> to the **output** as much as to the command. A count is safe to paste back
> here. A file listing, an error quoting a row, a therapist name — those go in
> Terminal.app and stay there.

---

### 3.1b Cross-delivery identity check — two clinics, one tenant

**BLOCK 13 — PASTE INTO: plain Terminal.app. NEVER Claude Code.**

**THIS IS THE FIRST THING ON SUNDAY AND IT OPENS NO DATABASE.** It reads the two
`pacientes.csv` files and prints integers. It is the cheapest step in the
migration and it decides two things nothing else can.

```
node "$REPO/scripts/import/cross-delivery.mjs" "$LV" "$CB"
```

**Expected:** counts only — distinct `id_paciente` per delivery, shared
`id_paciente`, shared `numero_paciente`, shared ids whose number differs, and
shared numbers whose id differs.

**THE RULE, AND IT IS THE WHOLE POINT OF THE BLOCK:**

| What it prints | What it means | What you do |
|---|---|---|
| **same id, same number** | One person, seen at both clinics. | **CONTINUE.** Expected. **BLOCK 22 becomes mandatory** — write that down now. |
| **same id, different number** | One person, two vendor numbers. The first delivery imported wins; the second row is skipped and its number is never written. | Continue. **Tell reception**: whichever clinic quotes the other number will not find them. |
| **same number, different ids** | **STOP.** Two people, one number, and `patients_tenant_number_uq` is per-TENANT. | **OWNER DECISION BEFORE THE CB RUN.** §3.3b, or a ruling on which patient keeps the number. |

**EXIT `1` IS THE STOP.** The script exits `1` only on the last row of that
table. Exit `0` means no number is claimed by two different people.

**WHY IT CANNOT WAIT FOR THE APPLY TO FIND IT.** The collision is rejected by
the unique constraint **mid-run, during Castelo Branco, after Linda-a-Velha is
already committed**. No migration fixes it and no ordering avoids it: the two
numbering series were independent at the vendor. Found here it is a decision
with the whole of Sunday behind it; found there it is a decision at 22:00 with
half a migration on disk.

**WHY `shared id_paciente` MATTERS EVEN WHEN NOTHING STOPS.** The staging
ledger's key is `(tenant_id, source_system, entity_type, source_id)` and the
patient source id **is** the vendor's `id_paciente`. So the second delivery's
row for that person is recognised as already imported and **skipped** — correct
for the record, and the skip is also what would have written their second
clinic's `patient_locations` link. Their appointments still import at that
clinic. **PL-09 scopes who may read a patient by that table**, so Castelo Branco
cannot see a patient it has appointments with. §5.1 repairs it and this count is
what says it must.

**Write the `shared id_paciente` number down.** BLOCK 22 compares against it.

---

### 1.3e The two vocabularies the config has to cover

**BLOCK 14 — PASTE INTO: plain Terminal.app. NEVER Claude Code.**

**THE CONFIG CANNOT BE FILLED FROM THE TEMPLATE.**
[`scripts/import/mapping-config.template.json`](../../scripts/import/mapping-config.template.json)
lists five practitioner names and four service types; **those are the amostra's**,
observed in a 1,000-row sample. This delivery is a decade of the clinic's diary
and will carry names of people who left years ago and service labels nobody
remembers choosing.

```
node "$REPO/scripts/import/distinct-keys.mjs" "$LV"
node "$REPO/scripts/import/distinct-keys.mjs" "$CB"
```

It prints two columns of `marcacoes.csv` — `terapeuta` and `tipo_servico` —
distinct values with a row count each, **and nothing else**: no `id_paciente`,
no name, no date, no row. A therapist's professional name is operational
metadata and is printable by the same ruling `check-delivery.mjs` prints the
`estado` vocabulary under.

**RUN IT ON BOTH DELIVERIES AND TAKE THE UNION.** A therapist who only ever
worked at Castelo Branco appears in one file and not the other, and both configs
carry the same `practitionerKeyByName`.

#### What to do with each list, and the two halves are NOT symmetrical

| | `terapeuta` | `tipo_servico` |
|---|---|---|
| Target column | `appointments.practitioner_id`, **NOT NULL** | `appointments.service_id`, **NULLABLE** |
| An absent value | **REFUSES THE ENTIRE RUN** before anything is staged | imports **without a service**, runner notes it |
| Who resolves it | you, with a legacy row | **the owner**, as a product decision |

**EVERY `terapeuta` NOT ON THE PRODUCTION ROSTER GETS A LEGACY ROW FIRST.**
Compare the list against `rehearsal-uuids.sql` query 2 run on production, then
run **PART B** of
[`scripts/import/legacy-staff-accounts.sql`](../../scripts/import/legacy-staff-accounts.sql)
— steps 4, 5 and 6 — for every absent name, **in the Supabase SQL editor**, and
before BLOCK 15. A name discovered later is a stop with the old system already
retired.

**A NAME THAT ALREADY HAS A ROW DOES NOT GET A SECOND ONE.** PART B's preview
flags it and its INSERT skips it. Take the existing uuid from query 2 and map to
that; two rows sharing a `full_name` means a decade of history is attributed to
whichever uuid was pasted, and nothing downstream can tell them apart.

**EVERY ABSENT `tipo_servico` GOES TO THE OWNER, and the run is not blocked on
the answer.** Each one is either a real catalogue entry or a bucket, and the
source cannot say which — `Diversos` is the worked example: mapping it to a
service would assert something the vendor never said. Leave an undecided label
as `TO_NORMALIZE`; the runner strips it, logs it, and those appointments import
with a null `service_id`. **That is a fact quietly lost about every appointment
carrying the label**, so it is worth an answer even though it is not a gate.

---

### 1.4 The two mapping configs

**BLOCK 15 — PASTE INTO: plain Terminal.app. NEVER Claude Code.**

**Two deliveries, two configs**, because `location.locationKey` differs and the
clinic is in the *filename*, not in any column (vendor confirmed 2026-08-25).

**BOTH FILES ALREADY EXIST AND ARE ALREADY FILLED**: copied from
`mapping-config.template.json` and filled from `rehearsal-uuids.sql` run against
production on 2026-08-27. **Do not copy the template again**, or you will create
a second, empty pair beside the real ones and have no way to tell from a command
line which pair a run used.

**UPDATE THEM FIRST IF BLOCK 14 FOUND ANYTHING**: every new `terapeuta` uuid
from PART B, and every `tipo_servico` decision, goes into **both** files.

```
export LVCFG=/Users/ivan/osteojp-migration/prod/mapping-config.LV.json
export CBCFG=/Users/ivan/osteojp-migration/prod/mapping-config.CB.json
diff "$LVCFG" "$CBCFG"
```

They live **outside the repository** and are never committed: they carry live
production identifiers. Everything is identical between the two files **except
one line**:

| Slot | `mapping-config.LV.json` | `mapping-config.CB.json` |
|---|---|---|
| `location.locationKey` | `"linda-a-velha"` | `"castelo-branco"` |
| `tenantId` | same | same |
| `location.knownLocations` | both clinics | both clinics |
| `practitionerKeyByName` | same | same |
| `serviceKeyByType` | same | same |

**Getting `locationKey` wrong puts every patient in that file at the wrong
clinic**, and PL-09 scopes who can read a patient by their location. Nothing
downstream catches it — it is a valid uuid either way.

**Plain `diff`, not `python3 -m json.tool`** — the files are already canonically
formatted, and normalising them before comparing would hide a difference in
formatting that is worth seeing.

**Expected, exactly this and nothing more:**

```
34c34
<     "locationKey": "linda-a-velha",
---
>     "locationKey": "castelo-branco",
```

**STOP on any other difference**, and on a `34c34` that is not this line.
`diff` exits `1` when files differ — that `1` is the expected result here, not a
failure. **A line number other than 34 is not automatically wrong** if BLOCK 14
added practitioner entries above it; what matters is that the ONLY differing
line is `locationKey`.

---

### 1.5 Dry-run both

**BLOCK 16 — PASTE INTO: plain Terminal.app. NEVER Claude Code.**

```
pnpm --filter @osteojp/db exec tsx scripts/prod-import.ts \
  --delivery "$LV" --config "$LVCFG" --dry-run
pnpm --filter @osteojp/db exec tsx scripts/prod-import.ts \
  --delivery "$CB" --config "$CBCFG" --dry-run
```

`--dry-run` opens no database and needs no phrase, so it is safe to run any
number of times. It is the cheapest possible way to find a placeholder still in
a config.

**Expected:** the adapter counts, `to_review` with reasons, and
`DRY RUN - nothing was staged and no database was contacted.` Exit `0`.

**STOP IF EITHER REFUSES.** A refusal now costs minutes. The same refusal after
the freeze is confirmed costs the window.

---

### 2.1 Confirm the freeze held

**BLOCK 17 — by hand. No command.**

**The freeze was declared before BLOCK 2, on Saturday.** This block does not
declare it. It confirms it held.

Ask, and get an answer in words rather than an assumption:

- **Fisiozero has been read-only since the Saturday freeze time.** Nothing was
  entered there.
- **OsteoJP has been untouched since the Saturday freeze time.** No patient
  created, no appointment booked, no record written, by anybody, including you.

**STOP IF EITHER ANSWER IS NO.** Not because a write is unrecoverable, but
because of what it does to every number you are about to authorise: the preview
counts are what you sign off, and a booking made between the preview and the
apply makes the reconciliation disagree with the preview by an amount nobody can
attribute.

**A CONFIRMED BREAK IS NOT AUTOMATICALLY A STOP OF THE MIGRATION.** It is a stop
of *this ordering*: re-run BLOCK 2's count, confirm the delta is exactly what
was described, and record it. What must never happen is discovering it in
BLOCK 23's arithmetic.

**THE FREEZE HOLDS UNTIL THE GO MESSAGE.** Nobody returns to OsteoJP when the
last apply finishes — they return when you have run BLOCK 22 and BLOCK 23,
looked at the agenda, and said so. Between the previews and the applies, in
particular, nobody touches the platform.

---

### 3.1 Delivery conformance, both deliveries

**BLOCK 18 — PASTE INTO: plain Terminal.app. NEVER Claude Code.**

```
node "$REPO/scripts/import/check-delivery.mjs" "$LV" --zip "$LVZIP"
node "$REPO/scripts/import/check-delivery.mjs" "$CB" --zip "$CBZIP"
```

**`$LVZIP` AND `$CBZIP` ARE THE FILLS FROM §0.5.** The archive filename is not
known and `documentos.zip` was a guess. Read the real names off the two delivery
directories, in Terminal.app, and set the variables before this block.

**Expected exit `0`, `ACCEPTED`, for both.** **STOP ON ANY NON-ZERO EXIT** —
every failure it prints is a non-conformance that goes back to the vendor, and
the caderno v1.1 keeps the clinic's read-only access to Fisiozero until
acceptance passes.

**Write down both `estado seen:` lines.** §3.3 derives a number from them.

**BOTH BEFORE EITHER PROCEEDS.** A non-conformance in Castelo Branco found after
Linda-a-Velha is already copied and imported is a vendor round-trip with half
the migration on disk.

---

### 3.2 Byte copy — BOTH deliveries, before any preview

**BLOCK 19 — PASTE INTO: plain Terminal.app. NEVER Claude Code.**

Attachments must be in the bucket before the runner will write attachment rows.
`attachments.storage_path` is `NOT NULL`, so a row pointing at nothing looks
entirely healthy.

**FIRST, THE SIZE PROBE, BOTH DELIVERIES.** It prints a size and never an entry
name:

```
node "$REPO/scripts/import/probe-amostra.mjs" "$LV" | grep "largest entry"
node "$REPO/scripts/import/probe-amostra.mjs" "$CB" | grep "largest entry"
```

Expected: `largest entry (uncompressed)  <bytes>`, and `52428800` is the line.

**STOP IF EITHER ARCHIVE'S LARGEST ENTRY IS ABOVE 50 MB.** The Supabase project
carries a **project-wide 50 MB upload limit** (confirmed 2026-08-26; the bucket
itself sets no per-bucket limit). An attachment over it fails its own upload
while every other file succeeds, so the summary shows a single `failure` among
hundreds and the copy is silently partial. **This is an owner decision BEFORE
the copy starts, not during it** — raise the project limit, or accept that those
documents do not migrate and record which patients they belong to.

**THEN THE MAPPING AND THE COPY, LINDA-A-VELHA:**

```
pnpm --filter @osteojp/db exec tsx scripts/prod-import.ts \
  --delivery "$LV" --config "$LVCFG" \
  --emit-attachment-mapping "$WORK/attachment-mapping-lv.json"

node "$REPO/scripts/import/copy-attachments.mjs" \
  --source "$LVZIP" \
  --mapping "$WORK/attachment-mapping-lv.json" \
  --checkpoint "$WORK/checkpoint-lv.jsonl"
```

**THEN THE SAME FOR CASTELO BRANCO:**

```
pnpm --filter @osteojp/db exec tsx scripts/prod-import.ts \
  --delivery "$CB" --config "$CBCFG" \
  --emit-attachment-mapping "$WORK/attachment-mapping-cb.json"

node "$REPO/scripts/import/copy-attachments.mjs" \
  --source "$CBZIP" \
  --mapping "$WORK/attachment-mapping-cb.json" \
  --checkpoint "$WORK/checkpoint-cb.jsonl"
```

**BOTH COPIES FINISH BEFORE ANY PREVIEW, AND THAT IS NEW.** The old order
interleaved them per clinic. Two of the three things that stop a byte copy — an
oversized entry and a missing archive entry — are owner decisions, and taking
the second one after Linda-a-Velha is already imported costs the window. This
way the last decision of the copying phase is made before the first row is
written.

`--emit-attachment-mapping` opens no database and needs no phrase.

**IT WILL ASK FOR THE CONFIRMATION PHRASE.** Since 2026-08-25 the byte copy
resolves the project ref from `SUPABASE_URL` and, on a **production** target,
refuses to move a single byte without `IMPORT FISIOZERO INTO PRODUCTION` typed on
stdin. Expect:

```
target project ref: dfotoodqvmjhbdcxyaxf   PRODUCTION (matched: parsed)
This target is PRODUCTION. Type the confirmation phrase to authorise the
upload, then press Enter.
> phrase accepted.
```

**A non-prod target is not asked** — that asymmetry is deliberate, so the prompt
never becomes something you type without reading.

**Expected, for each:** `uploaded N`, `skipped 0`, `conflicts 0`, `failures 0`,
exit `0`.

**STOP IF IT EXITS `2` WITH `REFUSED - the confirmation phrase did not match`.**
Nothing was uploaded and no object was created, read or overwritten. Re-run and
type it exactly.

**STOP IF IT EXITS `2` WITH A BLOCKLIST MESSAGE** (`prod blocklist is EMPTY` /
`NOT FOUND` / `unreadable`). The guard could not read
`packages/db/seed/seed-guard.ts`, so it has cleared nothing. That is a repository
problem, not a delivery problem, and it must be fixed before the window
continues.

**`N` is not the `documentos.csv` row count.** Attachments also come from the
`FICHEIRO` column on `pacientes.csv` and each `Episodios_*.csv`, **split on
comma and semicolon** (a cell is multi-valued) and then deduplicated by
filename. `N` is whatever `--emit-attachment-mapping` reported.

**STOP IF `conflicts` IS NON-ZERO ON LINDA-A-VELHA.** On a bucket that has never
held an import there is nothing to conflict with, so a conflict means the bucket
is not what you think it is. **The job never overwrites** — an object of unknown
origin may be a live clinical document.

**A CONFLICT ON CASTELO BRANCO IS DIFFERENT AND IS NOT AUTOMATICALLY A STOP.**
The Linda-a-Velha copy has just written into the same prefix. If BLOCK 13
reported shared ids, the same attachment filename can legitimately appear in
both deliveries. Read the count, compare it against BLOCK 13's shared-id figure,
and stop only if it is larger or unexplained.

**STOP IF `failures` IS NON-ZERO.** `not_in_delivery` means a mapped file is
missing from the archive.

**Confirm in the dashboard**: Storage → `clinical-attachments` →
`<tenantId>/migration/fisiozero/`, object count equals the sum of both
`uploaded` figures minus any Castelo Branco skips.

---

### 3.3 Preview, both deliveries

**BLOCK 20 — PASTE INTO: plain Terminal.app. NEVER Claude Code.**

```
pnpm --filter @osteojp/db exec tsx scripts/prod-import.ts \
  --delivery "$LV" --config "$LVCFG" \
  --checkpoint "$WORK/checkpoint-lv.jsonl"

pnpm --filter @osteojp/db exec tsx scripts/prod-import.ts \
  --delivery "$CB" --config "$CBCFG" \
  --checkpoint "$WORK/checkpoint-cb.jsonl"
```

**It will print the target ref and then ask for the phrase.** Type
`IMPORT FISIOZERO INTO PRODUCTION` and press Enter. It is not echoed, and it is
not stored — that is why it is typed rather than passed as a flag on the command
line, which would land in shell history and turn the next run into an up-arrow.

**Omitting the apply flag is the preview.** There is no `--preview` flag.

**Expected shape, for each:**

```
target project ref: dfotoodqvmjhbdcxyaxf
THIS ENTRYPOINT HAS NO BLOCKLIST. The phrase below is the only gate.
> phrase accepted.
ADAPTER OUTPUT
  patient            …
  clinical_episode   …
  appointment        …
  clinical_record    …
  attachment         …
  to_review          …
  warning  N appointment(s) were still "marcada" with a start in the PAST and
           were imported as CANCELLED (owner ruling B, 2026-08-25).
  DAY-ONE LOGIN  …
STAGED     …
VALIDATED  …   FAILED 0
PREVIEW - staged and validated only. NO TARGET TABLE WAS WRITTEN.
```

**Expected exit `0`.**

**THE CASTELO BRANCO PREVIEW'S `STAGED` IS CUMULATIVE.** The ledger is shared, so
it counts Linda-a-Velha's staged rows too. See §4.1.

#### The estado table, as committed on main

| `estado` | → |
|---|---|
| `realizada` | `completed` |
| `falta` | `no_show` |
| `marcada`, future `inicio` | `scheduled` |
| **`marcada`, past `inicio`** | **`cancelled`** — owner ruling B, 2026-08-25 |
| anything else | `to_review`, carrying the value |

**Owner ruling B is live in the code**, not just in this document:
`ESTADO_MAP` / `mapEstado` in
`packages/db/src/migration/sources/fisiozero.ts`. A past-dated `marcada`
**imports as `cancelled` and is counted** as `checks.pastMarcadaCancelled`; it
is **not** routed to review. Before the ruling it went to `to_review` with
reason `marcada_in_the_past`, and that reason no longer exists.

So, from BLOCK 18's `estado seen:` lines:

> **expected `pastMarcadaCancelled`** ≈ the whole `marcada` count, for a
> historical delivery. It appears as a **warning line**, not as a `to_review`
> reason.
>
> **expected `unknown_estado` = 0.** BLOCK 18 exits non-zero on any estado
> outside `{realizada, falta, marcada}`, so a clean BLOCK 18 guarantees it.

**Nothing maps to `confirmed`**, and a test pins it: confirmation means a patient
answered a reminder *we* sent, and no vendor row can evidence that.

**STOP IF `FAILED` IS NON-ZERO.**
**STOP IF `VALIDATED` + `FAILED` ≠ `STAGED`.**
**READ THE `DAY-ONE LOGIN` LINE** on both. It is the count of patients with no
resolvable telephone, who therefore cannot log into the portal — a data question
for the clinic, and the number LAUNCH-03 cares about most.

**Do not proceed until you have read both previews.** They are what you are
about to authorise.

### 3.3b CONTINGENCY — patient-number collisions

**Skip this unless BLOCK 13 exited `1`.** It is a pre-ruled fallback, built in
advance so the decision is never improvised mid-window.

**WHEN IT IS USED, AND ONLY THEN:** BLOCK 13's cross-delivery check, or the
§1.3c-bis preflight, shows an **overlap** — a `numero_paciente` claimed by two
different people, or a vendor number colliding with one the tenant already
holds. Nothing else justifies it.

**Why the default is to reject.** `patients.patient_number` is per-tenant unique
and the vendor's number is authoritative (owner ruling 2026-08-24), so it
imports verbatim. A collision is rejected by `patients_tenant_number_uq` and no
migration fixes it — those existing rows own those numbers. Rejecting is the
right default because silently renumbering a patient the clinic identifies *by
that number* is a data change nobody asked for.

**With the flag**, existing numbers are read **once** before patients import,
any colliding vendor number has its key omitted, and the 0029 trigger assigns
the next free number. Everything non-colliding is preserved **verbatim** —
the flag changes nothing for a patient whose number is free.

Add the flag to **both** the preview and the apply, so the counts you authorise
are the counts you get:

```
pnpm --filter @osteojp/db exec tsx scripts/prod-import.ts \
  --delivery "$CB" --config "$CBCFG" \
  --checkpoint "$WORK/checkpoint-cb.jsonl" \
  --reassign-conflicting-patient-numbers
```

**IT GOES ON THE SECOND CLINIC, NOT THE FIRST.** BLOCK 13's collision class is
between the deliveries: Linda-a-Velha's numbers are free when it runs, and it is
Castelo Branco that meets them. Putting the flag on the first clinic renumbers
patients nothing was colliding with.

**Expected extra output:**

```
PATIENT NUMBERS  <n> already in use for this tenant
                 <k> vendor number(s) collide and will be REASSIGNED by the trigger
```

and, in the reconciliation block after the apply:

```
  PATIENT NUMBERS REASSIGNED  <k>
  vendor -> assigned   (numbers only; hand this list to reception)
        41 -> 10412
       118 -> 10413
```

**THE PAIRS LIST IS A DELIVERABLE, NOT A LOG LINE. Save it and hand it to
reception on Monday.** A patient walks in quoting the number they have always
had; without the mapping nobody can find them. A *count* of reassignments is
useless for that — the pairs are the whole point.

**It is numbers only.** No name, no id, no vendor key — a pair of integers is
not personal data, and a list of renamed patients would be. It is safe to paste
back and safe to print for the front desk.

**STOP IF THE RUN PRINTS `cannot read back assigned numbers`.** The patients
imported correctly, but the mapping reception needs was not produced. Do not
treat that as "no collisions" — it is the opposite.

**STOP IF IT REFUSES with `needs a pipeline that can read existing patient
numbers`.** The flag was passed to something that cannot honour it; proceeding
would import under the default behaviour while you believed reassignment was on.

---

### 3.4 Apply, both deliveries

**BLOCK 21 — PASTE INTO: plain Terminal.app. NEVER Claude Code.**

**Nothing has changed on the platform since the preview. If anything has, go
back to §3.3** — the counts you authorise must be the counts you read.

**LINDA-A-VELHA FIRST, AND IT FINISHES BEFORE CASTELO BRANCO STARTS:**

```
pnpm --filter @osteojp/db exec tsx scripts/prod-import.ts \
  --delivery "$LV" --config "$LVCFG" \
  --checkpoint "$WORK/checkpoint-lv.jsonl" \
  --apply
```

**THEN CASTELO BRANCO:**

```
pnpm --filter @osteojp/db exec tsx scripts/prod-import.ts \
  --delivery "$CB" --config "$CBCFG" \
  --checkpoint "$WORK/checkpoint-cb.jsonl" \
  --apply
```

Type the phrase again when prompted, each time. **Once per window is the rule;
this is the same window, but each process is new, so it is typed again.**

**Expected, for each:** `IMPORTED` lines in dependency order — `patient`,
`clinical_episode`, `appointment`, `clinical_record`, `attachment` — then the
`RECONCILIATION` block with `referential integrity: OK`. Exit `0`.

**STOP IF `referential integrity` IS NOT `OK`.**
**STOP IF the run refuses with `N attachment(s) have no uploaded object`** —
BLOCK 19 did not complete for that clinic. A refusal here has cost nothing: the
ledger is untouched and re-usable.

**EXPECT CASTELO BRANCO'S `patient` LINE TO SHOW SKIPS, AND THE NUMBER TO MATCH
BLOCK 13.** Every person seen at both clinics was imported by Linda-a-Velha and
is skipped here — that is the ledger working. `IMPORTED patient <n> skipped <s>`
where `<s>` is BLOCK 13's `shared id_paciente` count, give or take patients who
appear in both files but have appointments in only one.

**A SKIP COUNT LARGER THAN BLOCK 13's IS A FINDING.** It means rows are matching
in the ledger that BLOCK 13 did not predict, which means the source ids are not
what this document believes they are.

**THOSE SKIPS ARE EXACTLY WHY BLOCK 22 EXISTS.** Do not finish here.

---

## 4. Castelo Branco — what is different, and it is not a step

### 4.1 The staging ledger is SHARED

Both clinics import into the same `migration_staging_rows`, under the same
`source_system = 'fisiozero'` and the same batch id. That is deliberate: they
are one migration, and a per-clinic batch would split the reconciliation in two
and hide the cross-clinic total nobody would then compute.

**Idempotency is unaffected.** The ledger's unique key is
`(tenant_id, source_system, entity_type, source_id)` — the batch id is not in
it — and the adapter's source ids are `sha256(id_paciente|inicio|terapeuta)` for
appointments and the vendor's `id_paciente` itself for patients, derived from the
vendor's own values with no clock, counter or row index.

**THAT LAST DETAIL IS THE ONE THAT MATTERS ON SUNDAY.** Because the patient
source id **is** `id_paciente`, two deliveries naming the same person resolve to
**one ledger row**. The second delivery skips them. That is correct, it is
measured in advance by BLOCK 13, and its one side effect is repaired by
BLOCK 22.

**So the CB reconciliation reports BOTH clinics' totals.** Its `staged` and
`imported` numbers are cumulative, not CB's alone. Expect them to be roughly the
sum. **A CB reconciliation showing only CB's rows means the batch id changed and
the two runs are not in the same ledger.**

---

## 5. Close the migration

### 5.1 Backfill `patient_locations`

**BLOCK 22 — PASTE INTO: Supabase SQL editor.**

**RUN THIS ONLY IF BLOCK 13 REPORTED A NON-ZERO `shared id_paciente`.** If no
person appears in both deliveries, every patient got their location link at
import time and this block has nothing to do. Running it anyway is harmless —
STEP 1 prints 0 — but it is not a step to invent.

Run [`scripts/import/backfill-patient-locations.sql`](../../scripts/import/backfill-patient-locations.sql)
in the Supabase SQL editor against production: STEP 1 (preview), then STEP 2
(the insert), then STEP 3 (verify).

| Step | What | Expected |
|---|---|---|
| **1** | preview, read-only | `rows_to_insert` ≈ BLOCK 13's `shared id_paciente` |
| **2** | the insert, one statement | `INSERT 0 <n>` where `<n>` is STEP 1's `rows_to_insert`, exactly |
| **3** | verify, read-only | `rows_still_missing` = **0** |

**WHY IT IS NEEDED, IN ONE SENTENCE:** a person seen at both clinics had their
second delivery's patient row skipped as already imported — correctly — and that
skip is also what would have written their second clinic's `patient_locations`
link, which is the table PL-09 scopes patient visibility by.

**WHAT IT IS NOT.** It is not `patients.primary_location_id`, which is a
different question with a different answer and its own backlog item. This writes
membership, not primacy.

**STOP IF STEP 2's COUNT IS LARGER THAN STEP 1's.** Rows were created between
the two statements, which on a frozen platform means the freeze did not hold.

**STOP IF STEP 3's `rows_still_missing` IS NON-ZERO.** The insert reported a
number and the gap did not close.

**Write down `patients_at_both_clinics`.** It is the first time that fact exists
anywhere in the database, and reception will want it.

**Rehearsed 2026-08-28 on the non-prod project**, three counts observed —
`0` after a clean import, `1` after one link was removed, `0` on the re-run:
[`BACKFILL-2026-08-28`](./evidence/BACKFILL-2026-08-28.md).

---

### 5.2 Final reconciliation, and the platform

**BLOCK 23 — PASTE INTO: Supabase SQL editor, then look at the platform.**

Query 4 of [`scripts/import/rehearsal-uuids.sql`](../../scripts/import/rehearsal-uuids.sql)
against production:

| Column | Expected |
|---|---|
| `staging_rows` | LV `STAGED` + CB `STAGED`, minus the rows both deliveries share |
| `patients` | both clinics' patients, counted **once** for anyone in both |
| `appointments` | both clinics', with no sharing — appointments never collide |
| `attachments` | both clinics' `uploaded` totals |

**Two independent sources.** The `RECONCILIATION` block reads the ledger; this
query reads the target tables. A ledger claiming imported over an empty target
table is exactly the failure this cross-check exists to catch.

**THE PATIENT TOTAL IS NOT THE SUM OF THE TWO PREVIEWS IF BLOCK 13 FOUND SHARED
IDS**, and that is the arithmetic most likely to be misread as a loss. Subtract
BLOCK 13's `shared id_paciente` from the sum before comparing.

**Then look at the platform**, not at a number:

- open the agenda, pick a date from the imported history, confirm appointments
  render with practitioner names including `Clínica OsteoJP` and `NESA`
- open a patient with attachments and confirm a document opens
- **if BLOCK 22 ran: open one of the shared patients from the Castelo Branco
  side and confirm they are visible there.** That is the only check that proves
  the backfill did what it was for, and no count can stand in for it.

**STOP AND DO NOT ANNOUNCE COMPLETION IF ANY OF THAT FAILS.** The numbers agreeing
and the clinic being able to use its history are different facts.

**THE GO MESSAGE IS THE LAST ACTION.** Only when all three checks pass does
OsteoJP come out of the freeze and staff are told they may use it.

---

## 6. If it goes wrong

**There is no cleanup section, and that is deliberate.** Do not remove rows from
`migration_staging_rows` on production under any circumstances — it is the only
record of what was imported, and the ledger is also what makes a re-run resume
rather than duplicate.

**STAGING AND VALIDATION ARE CHUNKED TOO (MIG-09).** The ledger writes go 500
rows per statement: staging is one multi-row `INSERT ... ON CONFLICT DO UPDATE`
per chunk, and the validate phase writes its verdicts with one
`UPDATE ... FROM (VALUES ...)` per chunk carrying a per-row status and a per-row
error detail. If a chunk's transition guard refuses — which it does when any one
row is not in the status it expected — that chunk is re-marked one row at a
time, so the offending row gets its own message. **THE 500 IS A CORRECTNESS
BOUND BEFORE IT IS A SPEED ONE:** every column of every row is a bound
parameter, Postgres refuses more than 65535 in one statement, and the single
whole-entity `INSERT` this replaced stops working at about 10,900 rows — inside
the range this delivery actually is.

**THE WRITES ARE CHUNKED, AND A CHUNK FALLBACK IS INVISIBLE HERE (MIG-08).**
Each entity imports in chunks of 200 rows — one multi-row `INSERT`, one bulk
ledger `UPDATE`, one savepoint, with the parent-id lookups loaded once per
entity rather than once per row. A chunk carrying **any** refused row rolls back
to its savepoint and is re-imported **one row at a time**, so the failing row
lands in the ledger with its own sqlstate and constraint and the other 199
import normally. **You will not see a fallback in the transcript**: it shows up
as ordinary per-row failures and as elapsed time, and the counts are the counts
the per-row path would have produced. Unnumbered patients are never in a chunk —
they stay one statement per row, after every numbered row.

**A refusal before the apply flag has cost nothing.** Fix the cause and re-run
the same command.

**A failure DURING the apply**: the ledger records exactly how far it got. Re-run
the identical command — rows already `imported` are **skipped, not repeated and
not re-written**. Every `IMPORTED` line reads `0` with `skipped` carrying the
count, and the `SKIPPED` total equals the first run's `STAGED`:

```
IMPORTED  patient                   0   skipped  1000   failed    0   …
SKIPPED   2001
```

**Read `SKIPPED`, not the zeros.** Five zeros are also what an empty batch
prints; `SKIPPED 2001` says every row was found, recognised as already imported,
and left alone.

**A row that failed AT IMPORT is imported by that re-run**, and there is no
`RETRIED` line: it lands in `IMPORTED`, indistinguishable from a first-time
import, because that is what it is. The mechanism is RE-STAGE PLUS RE-VALIDATE
(ruled 2026-08-26, proven on the rehearsal's live data): the run stages every
record before it imports any, staging resets a non-`imported` row to `pending`,
validate moves it to `validated`, and the import loop writes it. All 105 rows
lost to the 2026-08-26 apply — 61 appointments and 44 clinical_records — came
back on the next identical command this way.

**A row that failed VALIDATION comes back rejected.** Re-staging resets it to
`pending` and validate rejects the identical record again, so nothing short of a
CHANGED DELIVERY imports it. That is the correct answer: `validation_failed`
means the record cannot be written as it stands.

The difference between those two is what the rehearsal's idempotency step exists
to prove, and it is why that step is not optional.

**Only if the database itself must be rewound**: restore the BLOCK 3 backup.
That loses everything the clinic entered after it, so it is an owner decision,
not a step.

---

## 7. What to paste back

| Block | From | Paste |
|---|---|---|
| 1 | §1.1 | the pinned sha, and that `git status --short` printed nothing |
| 2 | §1.3c | the five numbers, and Rodica's answer in words |
| 3 | §2.2 | the backup id |
| 4-8 | §1.3b | cleanup steps 1, 1b `path_count`, 1c, 2 and 3 — including `staff_rows` = 30 |
| 9 | §1.3b-storage | how many objects you deleted |
| 10 | §1.3c-bis | the re-run preflight, showing zero |
| 11 | §2.3 | the guard's `REFUSED` and exit `1` |
| 12 | §1.3d | the bucket list |
| 13 | §3.1b | **the whole cross-delivery output and its exit code** — every later block reads a number off it |
| 14 | §1.3e | both key lists, and which names needed a legacy row |
| 15 | §1.4 | the `diff` output and its exit code |
| 16 | §1.5 | both dry-run outputs and exit codes |
| 17 | §2.1 | the freeze time, and both confirmations |
| 18 | §3.1 | both delivery checks in full, with exit codes |
| 19 | §3.2 | both probe sizes and both byte-copy summaries, with exit codes |
| 20 | §3.3 | both previews in full — counts, `to_review`, the ruling-B warning, `DAY-ONE LOGIN` |
| 20 | §3.3b | **the vendor → assigned pairs list, if the flag was used** — this goes to reception on Monday |
| 21 | §3.4 | both `IMPORTED` blocks and `RECONCILIATION` blocks, with exit codes, and CB's `skipped` |
| 22 | §5.1 | the three backfill counts, and `patients_at_both_clinics` |
| 23 | §5.2 | the four final numbers, and what you saw on the agenda |

**Every exit code, including the zeros.** A transcript with no exit codes proves
the commands produced text, not that they succeeded.

**Never paste:** `mapping-config.LV.json`, `mapping-config.CB.json`,
`attachment-mapping-*.json`, `checkpoint-*.jsonl`.

**And never paste any of it into Claude Code.** §0.15.
