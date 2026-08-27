# Fisiozero import — the production run

**Ivan executes this. No terminal may run any step of it.** Standing rules 1
and 2 forbid a terminal pointing anything at `dfotoodqvmjhbdcxyaxf`.

Derived from [`REHEARSAL.md`](./REHEARSAL.md), and **REHEARSED THREE TIMES. Most
recently 2026-08-27 at `6909bf0c`, on the batched ledger writer. Evidence:
[`docs/import/evidence/REHEARSAL-2026-08-27b.md`](./evidence/REHEARSAL-2026-08-27b.md)**
— the whole apply command, adapter to reconciliation, in **84 seconds**. The two
earlier runs are [`REHEARSAL-2026-08-26.md`](./evidence/REHEARSAL-2026-08-26.md)
(`76dd93a2`, which closed `MIG-02`, `MIG-03` and `MIG-04`) and
[`REHEARSAL-2026-08-27.md`](./evidence/REHEARSAL-2026-08-27.md) (`5ebbacf3`,
`MIG-08`).

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
  §6 preview, not off the rehearsal.**
- **THE AMOSTRA IS 2001 ROWS AND THIS DELIVERY IS AN ORDER OF MAGNITUDE MORE**,
  with a decade of appointments behind 8,000-10,000 patients.

Scale, the two-clinic sequence and real `patient_number` collisions remain the
three things no rehearsal has proved.

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

### 0.2 The order is not negotiable

```
1. Legacy staff accounts exist          ← FK targets; the import fails without them
2. Patient-number preflight             ← decided BEFORE the window, not during
2b. Test-patient cleanup + re-preflight  ← 33 training rows out, so vendor
                                           numbers carry over verbatim
3. Freeze                               ← the clinic stops writing
4. Backup                               ← the only undo you will have
5. Linda-a-Velha:  byte copy → preview → apply → reconcile
6. Castelo Branco: byte copy → preview → apply → reconcile
7. Final reconciliation across both
```

Steps 1 and 2 are **prep, done days earlier**. Everything from 3 is the window.

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

```
export REPO=/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
export WORK=/Users/ivan/osteojp-migration/prod
export LV=/absolute/path/to/the/linda-a-velha/delivery
export CB=/absolute/path/to/the/castelo-branco/delivery
mkdir -p "$WORK"
cd "$REPO"
```

---

## 1. Prep, days before the window

### 1.1 The prod-apply worktree, pinned to a real commit

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

### 1.2 The legacy staff accounts (owner ruling A)

`"Clínica OsteoJP"` and `"NESA"` are two of the vendor's `terapeuta` values.
Neither is a person. Both must exist as `users` rows before the import, because
`appointments.practitioner_id` is `NOT NULL` with a foreign key to `users.id` —
**without them the import fails on a foreign key, mid-run.**

Run [`scripts/import/legacy-staff-accounts.sql`](../../scripts/import/legacy-staff-accounts.sql)
in the Supabase SQL editor against production: STEP 1 (preview), then STEP 2
(insert), then STEP 3 (verify).

**Expected:** STEP 1 all-zero collisions; STEP 2 `INSERT 0 2`; STEP 3 exactly
two rows with `role_id` null, `is_active` f, `is_bookable` f, `has_auth_user` **f**.

**STOP IF `has_auth_user` IS TRUE.** A credential exists for an account that
must never have one.

**They cannot be created in the admin UI.** The only creation path there
(`inviteStaff`) always provisions a Supabase auth user with a password. That is
verified, not assumed — see the header of the SQL file.

Then do **STEP 4**: paste the two uuids into `mapping-config.local.json`,
replacing the `PENDING_OWNER_RULING` markers. **Until that is done the runner
refuses to start** — a placeholder is a hard fail before anything is staged.

### 1.3 The patient-number preflight

Run [`scripts/import/preflight-patient-numbers.sql`](../../scripts/import/preflight-patient-numbers.sql)
in the SQL editor against production. Read-only, four aggregates, no patient
value of any kind.

**Why it must happen now and not in the window:** the clinic's existing patients
already hold `patient_number` values. A vendor number colliding with one of
those is rejected by `patients_tenant_number_uq`, **no migration fixes it**, and
the rows own those numbers today. It has to be decided before the run rather
than discovered during it.

**STOP IF the vendor's `numero_paciente` range overlaps `max_patient_number`.**
That is an owner decision about which numbering wins, and it is not a decision
to take at 22:00.

### 1.3b Remove the staff-training test patients

**Owner-confirmed 2026-08-25: production holds 33 patients, numbers 1–35, all
staff-training data.** They are removed before the import so every vendor
`numero_paciente` carries over **verbatim, with zero collisions**.

**This is the most destructive step in the whole migration.** Take the §2.2
backup *first* — earlier than the runbook otherwise calls for it. There is no
undo inside the script.

Run [`scripts/import/cleanup-test-patients.sql`](../../scripts/import/cleanup-test-patients.sql)
in the Supabase SQL editor against production, in order:

| Step | What | Expected |
|---|---|---|
| **1** | preview counts, read-only | `patients` = **33**, `distinct_patient_numbers` = 33, min/max within 1–35 |
| **1b** | storage paths, read-only | likely `path_count` 0; **run before step 2** or the paths are unrecoverable |
| **2** | the delete, one transaction | a count per statement matching step 1, ending `DELETE 33` |
| **3** | verify, read-only | **every column 0**, `staff_rows` unchanged at **30** |

**STOP IF step 1 does not say exactly 33.** The database is not in the state the
script was written for — a real patient may exist. Do not run step 2 until the
difference is explained.

**STOP IF any step-2 count disagrees with step 1.** The `begin` is still open;
type `rollback;` instead of `commit;`.

**STOP IF any `orphan_*` column in step 3 is non-zero.** Rows survive pointing at
patients that no longer exist — the dependency graph missed a table, and the
import would write on top of it.

**STOP IF `staff_rows` is not 30.** That is 28 real staff plus the two legacy
accounts from §1.2. The script must not touch `users` at all.

**If `path_count` was non-zero:** after step 2, delete those objects in
Supabase dashboard → Storage → `clinical-attachments`. Deleting the row does not
delete the object; nothing in the database reaches into Storage.

**There is no Auth cleanup step, and that is a finding rather than an omission.**
Patients have **no `auth.users` rows** — the portal issues its own token and
migration 0010 creates a *login-less* Postgres role for them. The script header
carries the four pieces of evidence.

### 1.3c Re-run the number preflight — this is what decides the flag

Run [`scripts/import/preflight-patient-numbers.sql`](../../scripts/import/preflight-patient-numbers.sql)
again, now that the tenant has no patients.

**Expected: zero patients, so `max_patient_number` comes back NULL** and there is
no existing range for a vendor number to collide with.

> **AN EMPTY TABLE REMOVES ONE COLLISION CLASS, NOT BOTH.** Corrected
> 2026-08-26 after the rehearsal found the second one.
>
> - **Collisions with rows the clinic already had** — removed by §1.3b. With the
>   table empty there is nothing pre-existing to collide with.
> - **Collisions the import creates against ITSELF** — *not* removed by an empty
>   table. `numero_paciente` is filled on some vendor rows and blank on others
>   (882 of 1000 in the amostra). For a blank one the importer omits the column
>   and 0029's `assign_patient_number` fills it with
>   `COALESCE(MAX(patient_number), 0) + 1` — which can be a number a LATER
>   vendor row legitimately owns. The rehearsal lost 12 patients exactly this
>   way, from a vendor set with **zero** internal duplicates.
>
> **The second class is removed by ORDERING, and that is now in the runner.**
> `orderForImport` imports every row carrying a vendor number before every row
> without one, so by the time the trigger runs, `MAX(patient_number)` already
> includes every vendor number and what it assigns cannot collide with one.
>
> **Together those two authorise the run WITHOUT
> `--reassign-conflicting-patient-numbers`, and §3.3b stays a contingency.**
> Use the flag only if §1.3's preflight shows an overlap that survives both.

**STOP IF ANYTHING STILL COMES BACK.** The cleanup did not finish, and the flag
decision in §3.3b has to be revisited before the window continues.

**The reconciliation now checks the outcome rather than assuming it.** §3.4's
block prints `patient number fidelity: OK (<n> vendor number(s) checked)`, which
compares each imported patient's persisted `patient_number` against the
`numero_paciente` in its own staged row. A single changed number fails the run
and exits `1`.

### 1.3d The storage bucket precheck

`clinical-attachments` already exists on production and holds live clinical
documents — this is a **verification**, not a creation step. Confirm it from the
prod-apply shell before the window, because §3.2 refuses without it.

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

### 1.4 Fill both mapping configs

**Two deliveries, two configs**, because `location.locationKey` differs and the
clinic is in the *filename*, not in any column (vendor confirmed 2026-08-25).

```
cp "$REPO/scripts/import/mapping-config.template.json" "$WORK/mapping-lv.json"
cp "$REPO/scripts/import/mapping-config.template.json" "$WORK/mapping-cb.json"
```

Fill both from [`scripts/import/rehearsal-uuids.sql`](../../scripts/import/rehearsal-uuids.sql)
run against **production**. Everything is identical between the two files
**except one line**:

| Slot | `mapping-lv.json` | `mapping-cb.json` |
|---|---|---|
| `location.locationKey` | `"linda-a-velha"` | `"castelo-branco"` |
| `tenantId` | same | same |
| `location.knownLocations` | both clinics | both clinics |
| `practitionerKeyByName` | same | same |
| `serviceKeyByType` | same | same |

**Getting `locationKey` wrong puts every patient in that file at the wrong
clinic**, and PL-09 scopes who can read a patient by their location. Nothing
downstream catches it — it is a valid uuid either way.

**Verify the only difference is that line:**

```
diff <(python3 -m json.tool "$WORK/mapping-lv.json") <(python3 -m json.tool "$WORK/mapping-cb.json")
```

**Expected:** exactly one changed `locationKey` line. **STOP on any other
difference.**

### 1.5 Dry-run both, days early

```
pnpm --filter @osteojp/db exec tsx scripts/prod-import.ts \
  --delivery "$LV" --config "$WORK/mapping-lv.json" --dry-run
pnpm --filter @osteojp/db exec tsx scripts/prod-import.ts \
  --delivery "$CB" --config "$WORK/mapping-cb.json" --dry-run
```

`--dry-run` opens no database and needs no phrase, so it is safe to run any
number of times. It is the cheapest possible way to find a placeholder still in
a config.

**Expected:** the adapter counts, `to_review` with reasons, and
`DRY RUN - nothing was staged and no database was contacted.` Exit `0`.

**STOP IF EITHER REFUSES.** A refusal now costs minutes. The same refusal
inside the window costs the window.

---

## 2. The window

### 2.1 Freeze

Per the cutover runbook §2 Step 1: staff are told, on WhatsApp, that Fisiozero
is read-only from this moment and nothing more is entered there.

**Record the exact freeze time.** Everything created after it exists only in
OsteoJP, and that sentence is what reception will need in three weeks.

**The freeze covers OsteoJP too, for the duration of this run.** Between the
preview and the apply nobody touches the platform. The reason is specific: the
preview's counts are the numbers you are about to authorise, and a receptionist
booking an appointment between the two makes the reconciliation disagree with
the preview by an amount nobody can attribute.

### 2.2 Backup — the only undo you will have

Supabase dashboard → Database → Backups → **Take a backup now**, labelled
`pre-import-<date>`.

**Record the backup id.**

**STOP UNTIL IT IS COMPLETE.** Not started — complete. There is no cleanup
section in this document; this backup is what stands in for one.

### 2.3 Source the production environment, in a NEW terminal

```
cd "$REPO"
set -o allexport
source /Users/ivan/osteojp-secrets/new-prod.env
set +o allexport
```

**A NEW terminal, and this is not ceremony.** `set -o allexport` exports every
variable in the file, and a shell that has ever sourced the rehearsal env still
holds those values for any name this file does not overwrite. That is how a
production run ends up half-pointed at a scratch project.

**`DATABASE_URL` (transaction pooler, 6543) is what the import uses** —
`DATABASE_URL_DIRECT` is for migrations and this run applies none.

Confirm the target — **and note that the guard here is the opposite of the
rehearsal's**:

```
pnpm --filter @osteojp/db exec tsx scripts/assert-not-prod.ts ; echo "exit=$?"
```

**EXPECTED: `REFUSED`, exit `1`.** Read that twice. On production this guard is
**supposed to refuse** — it exists to keep the rehearsal off prod, and a `0`
here means your shell is **not** pointed at production and every step below
would run against the wrong database.

**STOP IF IT EXITS `0`.**

---

## 3. Linda-a-Velha

### 3.1 Delivery conformance

```
node "$REPO/scripts/import/check-delivery.mjs" "$LV" --zip "$LV/documentos.zip"
```

**Expected exit `0`, `ACCEPTED`.** **STOP ON ANY NON-ZERO EXIT** — every failure
it prints is a non-conformance that goes back to the vendor, and the caderno
v1.1 keeps the clinic's read-only access to Fisiozero until acceptance passes.

**Write down the `estado seen:` line.** §3.3 derives a number from it.

### 3.2 Byte copy — before any row import

Attachments must be in the bucket before the runner will write attachment rows.
`attachments.storage_path` is `NOT NULL`, so a row pointing at nothing looks
entirely healthy.

```
pnpm --filter @osteojp/db exec tsx scripts/prod-import.ts \
  --delivery "$LV" --config "$WORK/mapping-lv.json" \
  --emit-attachment-mapping "$WORK/attachment-mapping-lv.json"

node "$REPO/scripts/import/copy-attachments.mjs" \
  --source "$LV/documentos.zip" \
  --mapping "$WORK/attachment-mapping-lv.json" \
  --checkpoint "$WORK/checkpoint-lv.jsonl"
```

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

**Expected:** `uploaded N`, `skipped 0`, `conflicts 0`, `failures 0`, exit `0`.

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

**STOP IF THE ARCHIVE'S LARGEST ENTRY IS ABOVE 50 MB.** Read it from the probe,
which prints a size and never an entry name:

```
node "$REPO/scripts/import/probe-amostra.mjs" "$LV" | grep "largest entry"
```

Expected: `largest entry (uncompressed)  <bytes>`, and `52428800` is the line.

The Supabase project carries a **project-wide 50 MB upload limit** (confirmed
2026-08-26; the bucket itself sets no per-bucket limit). An
attachment over it fails its own upload while every other file succeeds, so the
summary shows a single `failure` among hundreds and the copy is silently
partial. **This is an owner decision BEFORE the copy starts, not during it** —
raise the project limit, or accept that those documents do not migrate and
record which patients they belong to. Deciding it at 22:00 with a half-copied
bucket is the situation this line exists to prevent.

**STOP IF `conflicts` IS NON-ZERO.** On a bucket that has never held an import
there is nothing to conflict with, so a conflict means the bucket is not what
you think it is. **The job never overwrites** — an object of unknown origin may
be a live clinical document.

**STOP IF `failures` IS NON-ZERO.** `not_in_delivery` means a mapped file is
missing from the archive.

**Confirm in the dashboard**: Storage → `clinical-attachments` →
`<tenantId>/migration/fisiozero/`, object count equals `uploaded`.

### 3.3 Preview

```
pnpm --filter @osteojp/db exec tsx scripts/prod-import.ts \
  --delivery "$LV" --config "$WORK/mapping-lv.json" \
  --checkpoint "$WORK/checkpoint-lv.jsonl"
```

**It will print the target ref and then ask for the phrase.** Type
`IMPORT FISIOZERO INTO PRODUCTION` and press Enter. It is not echoed, and it is
not stored — that is why it is typed rather than passed as `--confirm`, which
would land in shell history and turn the next run into an up-arrow.

**Omitting `--apply` is the preview.** There is no `--preview` flag.

**Expected shape:**

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

So, from §3.1's `estado seen:` line:

> **expected `pastMarcadaCancelled`** ≈ the whole `marcada` count, for a
> historical delivery. It appears as a **warning line**, not as a `to_review`
> reason.
>
> **expected `unknown_estado` = 0.** §3.1 exits non-zero on any estado outside
> `{realizada, falta, marcada}`, so a clean §3.1 guarantees it.

**Nothing maps to `confirmed`**, and a test pins it: confirmation means a patient
answered a reminder *we* sent, and no vendor row can evidence that.

**STOP IF `FAILED` IS NON-ZERO.**
**STOP IF `VALIDATED` + `FAILED` ≠ `STAGED`.**
**READ THE `DAY-ONE LOGIN` LINE.** It is the count of patients with no resolvable
telephone, who therefore cannot log into the portal — a data question for the
clinic, and the number LAUNCH-03 cares about most.

**Do not proceed until you have read the preview counts.** They are what you are
about to authorise.

### 3.3b CONTINGENCY — patient-number collisions

**Skip this unless §1.3's preflight said you need it.** It is a pre-ruled
fallback, built in advance so the decision is never improvised mid-window.

**WHEN IT IS USED, AND ONLY THEN:** the §1.3 preflight, or the vendor's
`numero_paciente` range, shows an **overlap** with numbers the clinic's existing
patients already hold. Nothing else justifies it.

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
  --delivery "$LV" --config "$WORK/mapping-lv.json" \
  --checkpoint "$WORK/checkpoint-lv.jsonl" \
  --reassign-conflicting-patient-numbers
```

**Expected extra output:**

```
PATIENT NUMBERS  <n> already in use for this tenant
                 <k> vendor number(s) collide and will be REASSIGNED by the trigger
```

and, in the reconciliation block after `--apply`:

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

### 3.4 Apply

**Nothing has changed on the platform since the preview. If anything has, go
back to §3.3** — the counts you authorise must be the counts you read.

```
pnpm --filter @osteojp/db exec tsx scripts/prod-import.ts \
  --delivery "$LV" --config "$WORK/mapping-lv.json" \
  --checkpoint "$WORK/checkpoint-lv.jsonl" \
  --apply
```

Type the phrase again when prompted. **Once per window is the rule; this is the
same window, but the process is new, so it is typed again.**

**Expected:** `IMPORTED` lines in dependency order — `patient`,
`clinical_episode`, `appointment`, `clinical_record`, `attachment` — then the
`RECONCILIATION` block with `referential integrity: OK`. Exit `0`.

**STOP IF `referential integrity` IS NOT `OK`.**
**STOP IF the run refuses with `N attachment(s) have no uploaded object`** — §3.2
did not complete. A refusal here has cost nothing: the ledger is untouched and
re-usable.

---

## 4. Castelo Branco

**Repeat §3.1 → §3.4 with `$CB` and `$WORK/mapping-cb.json`**, and the CB
checkpoint and attachment-mapping filenames.

### 4.1 The one thing that is different, and it is not a step

**The staging ledger is SHARED.** Both clinics import into the same
`migration_staging_rows`, under the same `source_system = 'fisiozero'` and the
same batch id. That is deliberate: they are one migration, and a per-clinic
batch would split the reconciliation in two and hide the cross-clinic total
nobody would then compute.

**Idempotency is unaffected.** The ledger's unique key is
`(tenant_id, source_system, entity_type, source_id)` — the batch id is not in
it — and the adapter's source ids are `sha256(id_paciente|inicio|terapeuta)`,
derived from the vendor's own values with no clock, counter or row index. Two
clinics cannot collide unless the vendor issued the same `id_paciente` twice,
which §3.1 would have rejected.

**So the CB reconciliation reports BOTH clinics' totals.** Its `staged` and
`imported` numbers are cumulative, not CB's alone. Expect them to be roughly the
sum. **A CB reconciliation showing only CB's rows means the batch id changed and
the two runs are not in the same ledger.**

---

## 5. Final reconciliation

In the SQL editor, query 4 of `rehearsal-uuids.sql` against production:

| Column | Expected |
|---|---|
| `staging_rows` | LV `STAGED` + CB `STAGED` |
| `patients` | both clinics' patients, **plus** whatever the clinic already had |
| `appointments` | both clinics', plus existing |
| `attachments` | both clinics' `uploaded` totals |

**Two independent sources.** The `RECONCILIATION` block reads the ledger; this
query reads the target tables. A ledger claiming imported over an empty target
table is exactly the failure this cross-check exists to catch.

**Then look at the platform**, not at a number: open the agenda, pick a date
from the imported history, confirm appointments render with practitioner names
including `Clínica OsteoJP` and `NESA`. Open a patient with attachments and
confirm a document opens.

**STOP AND DO NOT ANNOUNCE COMPLETION IF ANY OF THAT FAILS.** The numbers agreeing
and the clinic being able to use its history are different facts.

---

## 6. If it goes wrong

**There is no cleanup section, and that is deliberate.** Do not delete from
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

**A refusal before `--apply` has cost nothing.** Fix the cause and re-run the
same command.

**A failure DURING `--apply`**: the ledger records exactly how far it got. Re-run
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

**Only if the database itself must be rewound**: restore the §2.2 backup. That
loses everything the clinic entered after it, so it is an owner decision, not a
step.

---

## 7. What to paste back

| From | Paste |
|---|---|
| §1.2 | STEP 1 and STEP 3 output of `legacy-staff-accounts.sql` |
| §1.3 | the four preflight numbers |
| §1.3b | cleanup steps 1, 1b `path_count`, and 3 — including `staff_rows` = 30 |
| §1.3c | the re-run preflight, showing zero |
| §1.5 | both dry-run outputs and exit codes |
| §2.1 | the freeze time |
| §2.2 | the backup id |
| §2.3 | the guard's `REFUSED` and exit `1` |
| §3.1 / §4 | both delivery checks in full, with exit codes |
| §3.2 / §4 | both byte-copy summaries and exit codes |
| §3.3 / §4 | both previews in full — counts, `to_review`, the ruling-B warning, `DAY-ONE LOGIN` |
| §3.4 / §4 | both `IMPORTED` blocks and `RECONCILIATION` blocks, with exit codes |
| §3.3b | **the vendor → assigned pairs list, if the flag was used** — this goes to reception on Monday |
| §5 | the four final numbers, and what you saw on the agenda |

**Every exit code, including the zeros.** A transcript with no exit codes proves
the commands produced text, not that they succeeded.

**Never paste:** `mapping-lv.json`, `mapping-cb.json`,
`attachment-mapping-*.json`, `checkpoint-*.jsonl`.
