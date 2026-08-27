# Fisiozero import — the dress rehearsal

**Card MIG-04.** Executable by **Ivan or a terminal**, against the **non-prod**
project only — CLAUDE.md, *Exemption, ruled 2026-08-26*: the August 2026 amostra
is vendor-confirmed synthetic test data.

**The exemption is about the DATA, not the TARGET.** It authorises reading the
amostra and running against the rehearsal project. It authorises nothing against
production, where standing rules 1 and 2 are unchanged and `PROD-RUN.md` stays
owner-executed. The FINAL delivery is never exempt.

This is the runbook that closes the two integration gaps `MIG-02` and `MIG-03`
are held open by. Both cards are green on their own tests and both say, in their
own `open_on_purpose`, that green tests are not the claim being made:

| Card | What has never happened |
|---|---|
| `MIG-02-attachment-byte-copy` | *"THE SUPABASE REST CALLS HAVE NEVER RUN AGAINST A LIVE BUCKET."* Every test drives a mock client. |
| `MIG-03-import-runner-cli` | *"it has no live wiring to packages/db yet … closing on green tests would report an import runner as ready when it has never met a database."* |

One rehearsal closes both: the amostra (vendor-confirmed synthetic test data)
goes through the whole pipeline against a **non-production** Supabase project,
and the bytes land in a real bucket.

**The card closes on your pasted transcript, not on this file existing.** What
is needed is in §9.

---

## 0. Read this before the first command

### 0.1 The blind rule, and what the 2026-08-26 exemption changed

CLAUDE.md, *Patient data isolation (Fisiozero import)*, still says no terminal
opens, reads, cats, greps or samples a delivery file — **and that rule is intact
for the final delivery.**

**What changed:** the August 2026 **amostra** is vendor-confirmed synthetic test
data, so it is exempt. Whoever is running this — Ivan or a terminal — may open
it. The output discipline below is kept anyway, because it costs nothing and
because the same commands are run against the real delivery in `PROD-RUN.md`,
where none of it is exempt:

> Evidence returned to terminals is limited to column headers, row counts, file
> counts, encodings, extension patterns, sha256 hashes, exit codes, and
> validation error summaries that contain no personal data.

Every command below is built to produce exactly that and nothing else. **The
outputs of §2, §3, §6, §7 and §8 are safe to paste back in full without reading
them first.** That is a design property of the scripts, not a promise about the
data. Two places where it is deliberately not true, called out where they occur:

- **§4's SQL reads the STAFF roster** (names, emails, job titles). It touches no
  patient table. Safe from the rehearsal project; never run it against
  production.
- **§5's checkpoint file contains storage paths, which contain attachment
  filenames, which may contain patient names.** The file stays on your disk.
  Paste the byte-copy job's *summary*, never the checkpoint.

### 0.2 Three things this rehearsal is not

1. **It is not proof the data is correct.** `check-delivery.mjs` says so on its
   own accept path: it checks structure and references. Whether the amostra
   matches the clinic's real records is a question no script here can answer.
2. **It is not the production run.** Nothing learned here authorises pointing
   any of it at `dfotoodqvmjhbdcxyaxf`. The production run is its own card with
   its own gate.
3. **It is not a load test.** The amostra is ~1,000 patients; the delivery is
   8,000–10,000 with tens of gigabytes of attachments (caderno v1.1). Timings
   here are indicative, not a plan.

### 0.3 The safety posture, stated once

- **The prod refs are `dfotoodqvmjhbdcxyaxf` (live) and `jaxmkwoxjcgzkwxgbayx`
  (retired).** Both are blocklisted in `packages/db/seed/seed-guard.ts`. Neither
  may appear in any file, variable or command in this rehearsal.
- **`set -o allexport`, never `set -a`.** Standing rule; `set -a` errors in zsh.
- **No tilde paths.** Absolute paths everywhere.
- **Every path you pass to a `pnpm --filter` command must be ABSOLUTE.**
  `pnpm --filter @osteojp/db exec` runs with the working directory set to
  `packages/db`, so a repo-relative path silently resolves under `packages/db/`
  and the script reports the file as unreadable. This is the single most likely
  way to lose ten minutes below.

### 0.35 `pnpm` prints a bare `undefined` on failure. It is not a defect.

`pnpm 11` prints a lone `undefined` line before its
`ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL` block whenever a
`pnpm --filter <pkg> exec ...` command exits non-zero:

```
NOTHING WAS STAGED. A partial mapping does not crash - it imports a
fraction of the diary and reports success over the rest.
undefined
/Users/ivan/.../packages/db:
[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code 1: ...
```

It comes from pnpm's own failure reporter, not from any script in this
repository — the same command run without `--filter`, or through `npx tsx`
directly, does not print it. **Expect it on every refusal path below and read
past it.** It is noise on a correct refusal, and treating it as a finding costs
a diagnosis.

### 0.4 Exit codes, ratified (CLAUDE.md, *Import execution rules*)

| Code | Meaning |
|---|---|
| `0` | OK |
| `1` | FAILED, or deliberately refused |
| `2` | BAD_INVOCATION — wrong flags, unreadable file |

**A `2` is never a data finding.** It means the command was typed wrong. Fix the
invocation and re-run; do not investigate the delivery.

### 0.5 Set these shell variables first

Everything below uses them. Set them once, in the terminal you will use
throughout.

```
export REPO=/Users/ivan/Documents/Projects/GitHub/OsteoJP
export AMOSTRA=/absolute/path/to/the/amostra/directory
export WORK=/Users/ivan/osteojp-migration/rehearsal
mkdir -p "$WORK"
cd "$REPO"
```

`$WORK` holds the filled config, the attachment mapping and the checkpoint.
**None of those three files may ever be committed** — see §4.3.

---

## 1. The target project, and the guard that proves it is not production

### 1.1 The non-prod project

You need a Supabase project that is **not** either prod ref, in the **EU**
(CLAUDE.md rule 8: EU data residency applies to the amostra too — it is
synthetic, but the rehearsal is also a dress rehearsal for the posture), with
the schema applied and reference data seeded.

If you are creating it fresh, from `$REPO` with the rehearsal env sourced
(§1.2), in this order:

```
pnpm --filter @osteojp/db exec drizzle-kit migrate
pnpm --filter @osteojp/db exec node scripts/check-pending-migrations.mjs 0
SEED_DEV_CONFIRM=<the rehearsal ref> pnpm --filter @osteojp/db seed:dev
```

**Expected:** the migrate reports the journal advancing; the pending check exits
`0`; the seed creates a tenant, both locations, the service catalogue and a
staff roster.

**STOP IF** `check-pending-migrations.mjs 0` exits non-zero. The schema is not
fully applied and every count below would be measuring a different database than
the one the pipeline expects.

**STOP IF** the seed refuses. It refuses on a blocklisted ref with no override,
and it refuses when `SEED_DEV_CONFIRM` does not exactly equal the ref parsed
from `DATABASE_URL`. Both refusals are the guard working. Read the ref it
printed and check it in the Supabase dashboard before you retype anything.

#### Empty the tenant, exactly as production will be emptied

**Ruled 2026-08-26.** The seed stays, and then the same cleanup production runs
is run here, verbatim.

```
scripts/import/cleanup-test-patients.sql   -- STEP 1, then STEP 2, then STEP 3
scripts/import/preflight-patient-numbers.sql
```

**Its predicate is `tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'` — every
patient of the tenant**, not a number range and not a list of ids. That uuid is
the fixed seed constant (`packages/db/seed/dev-reference.ts`), so it is the same
tenant in both projects and "verbatim" is literally true.

**STEP 1 will say `patients = 50` here, not 33.** Production holds 33
staff-training rows; the rehearsal holds the 50 the dev seed just created. **50
is the expected rehearsal delta — record it and proceed.** The `33` in the SQL
file's own header is the production figure and is not a STOP for this run.

Then `preflight-patient-numbers.sql`, **expecting zero patients and a NULL
`max_patient_number`**, which is the same evidence `PROD-RUN.md` §1.3c reads.

**WHY THIS IS NOT OPTIONAL.** The 2026-08-26 rehearsal imported against a seeded
tenant and lost 45 patients to collisions with seeded `patient_number` 1–50 —
noise that told you nothing about the delivery and buried the 12 collisions that
did matter. Emptying the tenant makes the rehearsal measure the delivery.

**Reference data is untouched.** The script deletes patients and what is rooted
in them; the tenant, locations, services, roles, users and form templates all
survive, and §6's mapping depends on every one of them.

#### The storage bucket. OWNER STEP, and nothing in the schema does it for you.

Supabase dashboard → Storage → **New bucket** → name `clinical-attachments`,
**private** (never public), matching the production bucket's settings.

**NO MIGRATION CREATES IT.** The schema has no `storage.buckets` statement and
the seeds have none either, so a project that has just had §1.1 run against it
has **zero** buckets. §5.2 then fails every upload one at a time, each recorded
in the checkpoint as a bare `Error` with the status stripped, and the single
shared cause appears nowhere in the output.

Verify from the terminal, with the rehearsal env sourced. **Bucket names only —
never list objects, whose names are attachment filenames:**

```
curl -s "$SUPABASE_URL/storage/v1/bucket" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | python3 -c 'import json,sys; print([b["name"] for b in json.load(sys.stdin)])'
```

**Expected:** a list containing `clinical-attachments`.

**STOP IF IT IS ABSENT.** Since 2026-08-26 `copy-attachments.mjs` checks this
itself before the first byte and exits `1` with
`bucket clinical-attachments does not exist in project <ref>`, having attempted
nothing. This step is here so you find it before §5 rather than during it.

### 1.2 The environment file

Create `/Users/ivan/osteojp-secrets/rehearsal.env` — **a new file, beside
`new-prod.env`, never a copy of it.**

Variable **names** it must hold (values are yours and never appear in this repo,
in any transcript, or in any message to a terminal):

| Name | What it points at |
|---|---|
| `DATABASE_URL` | the rehearsal project, **session pooler, port 5432** (`...pooler.supabase.com:5432`) |
| `SUPABASE_URL` | `https://<rehearsal-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the rehearsal project's service role key |

**THE SESSION POOLER, NOT THE TRANSACTION POOLER.** This table said 6543 until
2026-08-26 and it was wrong for this file: `drizzle.config.ts` falls back to
`DATABASE_URL` when `DATABASE_URL_DIRECT` is unset, and §1.1's `drizzle-kit
migrate` needs session-level advisory locks that the transaction pooler on 6543
does not support. Port 5432 serves both §1.1 and every step after it from one
variable. (Production is different and correctly uses 6543: `PROD-RUN.md` §2.3
applies no migrations.)

**Do not put `DATABASE_URL_DEV` or `DATABASE_URL_DIRECT` in this file** unless
they point at the same rehearsal project. `seed-guard.ts` *prefers*
`DATABASE_URL_DEV` over `DATABASE_URL`, so a stale one is what the seeds would
actually use.

Source it into a **new** terminal:

```
cd "$REPO"
set -o allexport
source /Users/ivan/osteojp-secrets/rehearsal.env
set +o allexport
```

**A NEW terminal, and this is not ceremony.** `set -o allexport` exports *every*
variable in the file, and a shell that has ever sourced `new-prod.env` still
holds those values for any name the rehearsal file does not overwrite. That is
how a rehearsal ends up half-pointed at production.

### 1.3 THE GUARD. Nothing runs before this passes.

```
pnpm --filter @osteojp/db exec tsx scripts/assert-not-prod.ts
```

**Expected output shape:**

```
REHEARSAL TARGET GUARD
======================
blocklist: 2 production ref(s), from packages/db/seed/seed-guard.ts
  set  DATABASE_URL         ref=<the rehearsal ref>
  set  SUPABASE_URL         ref=(not a postgres connection string)

OK - no checked variable names a production ref.
This proves the target is NOT production. It does not prove the target is
the project you intended; confirm the ref above in the Supabase dashboard.
```

**STOP IF the exit code is anything but `0`.** There are exactly two failures
and they are different problems:

- `REFUSED - N variable(s) name a PRODUCTION project ref` — a production ref is
  live in this shell. Close the terminal. Do not unset variables and continue;
  you do not know what else that shell holds.
- `REFUSED - none of the checked variables is set` — the env file was not
  sourced. **This is a refusal and not a pass on purpose**: a guard that passes
  when it examined nothing reports the harmless case over an unknown one, which
  is the exact shape `PORTAL-REHYDRATE §1.3` exists to end.

**STOP ALSO IF the `ref=` line does not match the project you meant.** The guard
proves the target is not production. It cannot prove it is the right non-prod
project, and it says so.

*What it does, so you can trust it:* it imports `PROD_REFS` from
`packages/db/seed/seed-guard.ts` — it does not carry its own copy, which is what
a grep guard would do and how a blocklist goes stale. It checks
`DATABASE_URL_DEV`, `DATABASE_URL`, `DATABASE_URL_DIRECT` and `SUPABASE_URL`,
and it checks `SUPABASE_URL` by substring because `https://<ref>.supabase.co` is
not a connection string and the connection-string parser returns null for it. A
database-only guard would pass a shell whose *storage* still points at
production, and the byte copy would put patient documents in the live bucket.

---

## 2. Probe the amostra

```
node "$REPO/scripts/import/probe-amostra.mjs" "$AMOSTRA"
```

**Expected output shape** (structure only — no cell value, no zip entry name and
no error message appears in it, by construction):

```
FISIOZERO AMOSTRA - BLIND STRUCTURE PROBE
=========================================
top-level files  N

CSV FILES
---------
  FILE  pacientes.csv
    bytes            …
    utf8 BOM         …
    valid UTF-8      yes
    delimiter        …
    columns          17
    data rows        1000
    headers          ["id_paciente","nome_completo",…]
    ragged rows      0
    per-column fill rate and distinct values: …
  … one block per CSV …

ZIP FILES / MANIFESTO / SHA256 OF EVERY TOP-LEVEL FILE
```

**Check against the committed expected structure**, which is
`EXPECTED` in `scripts/import/check-delivery.mjs` (lines 33–46) — it is the only
committed statement of what the delivery must contain:

| File | Expected columns |
|---|---|
| `pacientes.csv` | `id_paciente, nome_completo, numero_paciente, data_nascimento, sexo, nif, email, telefone, morada, codigo_postal, localidade, clinica, seguro_saude, numero_apolice, observacoes, data_criacao, FICHEIRO` |
| `marcacoes.csv` | `id_paciente, inicio, fim, terapeuta, clinica, tipo_servico, estado, observacoes` |
| `documentos.csv` | `id_documento, id_paciente, ficheiro, nome_original, tipo_mime, descricao` |
| `Episodios_<Especialidade>.csv` | at least `tipo, id_paciente, terapeuta, data_avaliacao, escala_eva, FICHEIRO`; specialty columns vary |

Only two specialty filenames are expected: `Episodios_Fisioterapia.csv` and
`Episodios_Osteopatia.csv` (vendor confirmed 2026-08-25).

**STOP IF `valid UTF-8` is `NO` on any file.** A cp1252 export decodes without
throwing and silently mangles every accented character. That is a re-delivery,
not something to work around.

**STOP IF `ragged rows` is non-zero.** The field count differs from the header,
which means a quoted field is broken and every column after it on those rows is
shifted.

**STOP IF a third `Episodios_*.csv` filename appears.** The vendor said two
specialties exist. A third is a finding, not a variation.

**Exit code:** `0` always, except `2` when the directory is missing.
**A `2` here means the path in `$AMOSTRA` is wrong.**

---

## 3. The delivery conformance check

```
node "$REPO/scripts/import/check-delivery.mjs" "$AMOSTRA" --zip "$AMOSTRA/documentos.zip"
```

Pass `--zip` if the amostra includes the attachment archive. Without it the tool
prints `zip: not supplied - correspondence NOT checked`, and that line is there
because silence would read as checked-and-fine.

**Expected output shape:**

```
FISIOZERO DELIVERY CHECK
========================
  note  pacientes.csv: 1000 row(s), 1000 distinct id_paciente
  note  marcacoes.csv: 1000 row(s)
  note  documentos.csv: 22 row(s)
  note  Episodios_<Especialidade>.csv: N row(s)      ← one line per specialty file
  note  estado seen: realizada=…  falta=…  marcada=…
  note  zip: N file entr(ies), M referenced name(s)

ACCEPTED - no conformance failure found.
```

**Expected exit code: `0`.**

**STOP ON ANY NON-ZERO EXIT.** Every failure this prints is a non-conformance
against the caderno and goes back to the vendor. In particular:

- `id_paciente is NOT unique` — the caderno's single most load-bearing
  requirement. Without it the delivery is not reconstructable at all.
- `N row(s) reference an id_paciente not present in pacientes.csv` — orphans.
- `estado: N value(s) outside the known list` — the vocabulary is wider than the
  adapter knows. The values are printed by ruling; they are the answer.
- `zip: N referenced file(s) are NOT in the archive` — a broken record: a
  patient's document is gone.
- `zip: N archived file(s) are referenced by no row` — an orphan, which may be
  the document of a patient the export dropped. Row counts alone never show
  this.

**Write down the `estado seen` line.** §6 derives an expected `to_review` count
from it, and it is the only place that number comes from.

---

## 4. Fill the mapping config

### 4.1 Get the uuids

Open `scripts/import/rehearsal-uuids.sql` and run its five queries **in the
Supabase SQL editor, against the rehearsal project**, in order. Query 0 gives
the tenant uuid; substitute it for `:tenant_id` in queries 1–4.

All five are read-only single `SELECT`s. **They read the staff roster and touch
no patient table** — see §0.1.

**STOP IF query 0 returns more than one row.** The project holds more than one
tenant and you must choose deliberately rather than take the first.

**STOP IF query 4's `staging_rows` and `attachments` are not both `0`.** A
previous rehearsal is still in the ledger and the idempotency proof in §7.3
would be measuring the wrong thing: a second `--apply` over a half-populated
ledger looks identical to the clean no-op it is supposed to prove. Run §8's
cleanup first.

**`patients` and `appointments` are EXPECTED to be non-zero here**, and this
STOP used to demand all four be `0`, which no correctly prepared project could
satisfy: §1.1 seeds 50 patients and 271 appointments into this same tenant, §7.2
expects the target counts to include them, and §8.3 says the cleanup removes
them. Only the two migration-owned counts prove the ledger is clean.

### 4.2 Fill the file

```
cp "$REPO/scripts/import/mapping-config.template.json" "$WORK/mapping-config.local.json"
```

Then fill every slot from the query results:

| Slot | From |
|---|---|
| `tenantId` | query 0 |
| `location.knownLocations` | query 1, **both** clinics |
| `location.locationKey` | which clinic **this** delivery is (two exports, one per clinic — it is in the filename, not in any column) |
| `practitionerKeyByName` | query 2, keyed by the `terapeuta` string **exactly as the vendor stored it** |
| `serviceKeyByType` | query 3, keyed by the `tipo_servico` string exactly as stored |

**Two entries ship as `PENDING_OWNER_RULING` and are not people:**
`Clínica OsteoJP` and `NESA`. An appointment attributed to a clinic or to a
method is not attributable to a practitioner, and `appointments.practitioner_id`
is `NOT NULL`. For the rehearsal, point both at any seeded staff uuid — the
point is to exercise the pipeline. **For the real run they need your ruling.**

`Diversos` ships as `TO_NORMALIZE`. Leave it. The runner strips it and logs the
removal; it is a bucket, not a service.

### 4.3 The file cannot be committed, and confirm that rather than trust it

The filled file carries live tenant uuids. Two independent reasons it is safe,
and both are checkable:

```
cd "$REPO"
git check-ignore -v scripts/import/mapping-config.local.json ; echo "exit=$?"
case "$WORK" in "$REPO"/*) echo "INSIDE THE REPO - MOVE IT" ;; *) echo "OUTSIDE the repo - ok" ;; esac
```

**Expected:**

```
.gitignore:68:**/mapping-config.local.json	scripts/import/mapping-config.local.json
exit=0
OUTSIDE the repo - ok
```

The first proves the pattern is live, for the realistic accident: copying the
template *in place* inside `scripts/import/`. The second proves your actual file
is not in the repository at all.

**Do not run `git check-ignore` on `$WORK/...` directly.** `$WORK` is outside
the repository, so git exits `128` with `fatal: Invalid path` — which is not a
finding about the ignore rules, it is git refusing to answer a question about a
path it does not own.

**STOP IF the first command exits non-zero.** The ignore pattern is gone and an
in-repo copy would be committable.

### 4.4 Prove the config is refused before it is filled

Worth thirty seconds, because it proves the refusal you are relying on is live:

```
pnpm --filter @osteojp/db exec tsx scripts/rehearsal-import.ts \
  --delivery "$AMOSTRA" \
  --config "$REPO/scripts/import/mapping-config.template.json" \
  --dry-run
```

**Expected:** `REFUSED - the mapping config does not cover this delivery`,
followed by one `missing` line per unfilled slot including
`config."tenantId" still holds placeholder uuid`, then `NOTHING WAS STAGED`.
Exit `1`.

**STOP IF this exits `0`.** The placeholder check is not working, and a config
of all-zero uuids would stage the whole delivery and fail at import time on a
foreign key, halfway through, with rows already written.

---

## 5. The byte copy into the rehearsal bucket

This is the half of the rehearsal that `MIG-02` is open for. Until these
commands run, the Supabase Storage REST calls have never executed anywhere.

### 5.1 Emit the attachment mapping

`copy-attachments.mjs` requires `--mapping <mapping.json>`, a
`{ deliveryFileName: storagePath }` object. **Nothing produced that file until
now** — it is the adapter's attachment output, and this is what emits it:

```
pnpm --filter @osteojp/db exec tsx scripts/rehearsal-import.ts \
  --delivery "$AMOSTRA" \
  --config "$WORK/mapping-config.local.json" \
  --emit-attachment-mapping "$WORK/attachment-mapping.json"
```

**Expected output shape:**

```
ATTACHMENT MAPPING WRITTEN
  entries    N
  written to /Users/ivan/osteojp-migration/rehearsal/attachment-mapping.json
```

**Expected exit code: `0`. No database is opened by this mode.**

**`N` IS NOT 22.** `documentos.csv` has 22 rows, but attachments also come from
the `FICHEIRO` column on `pacientes.csv` and on each `Episodios_*.csv`,
deduplicated by filename with `documentos.csv` winning (it is the only source
carrying the mime type and the original name). So:

> `N` = (documentos rows) + (FILENAMES obtained by splitting every non-empty
> `FICHEIRO` cell on comma and semicolon, across pacientes and every
> `Episodios_*.csv`) − (filenames appearing in more than one source)

**COUNT SPLIT NAMES, NOT CELLS.** A `FICHEIRO` cell is multi-valued: the August
2026 amostra has eight cells holding two filenames joined by a comma. Counting
cells inflated `N` from 22 to 30 and put eight phantom entries in the mapping,
each naming an object that can never exist. Since 2026-08-26 the adapter splits
them (`splitDeliveryFileNames`), and `check-delivery.mjs` splits identically, so
the two agree by construction. `documentos.ficheiro` is **not** split: that file
is one row per document, with `nome_original` and `tipo_mime` pinned to a single
name.

Take the fill-rate figures for `FICHEIRO` from §2's probe and check `N` is
consistent with them. **STOP IF `N` is less than 22** — that would mean rows in
`documentos.csv` produced no attachment, and the only route to that is an empty
`ficheiro` or an orphan `id_paciente`, both of which §3 should already have
rejected.

**The mapping file contains attachment filenames, which may contain patient
names.** It stays in `$WORK`. Do not paste it.

### 5.2 Copy the bytes

```
node "$REPO/scripts/import/copy-attachments.mjs" \
  --source "$AMOSTRA/documentos.zip" \
  --mapping "$WORK/attachment-mapping.json" \
  --checkpoint "$WORK/checkpoint.jsonl"
```

`--source` takes the ZIP directly, or a directory of extracted files. The ZIP is
preferred: it is streamed entry by entry, nothing is extracted to disk, and
ZIP64 is handled.

**Expected output shape:**

```
ATTACHMENT BYTE COPY
====================
  uploaded   N          ← the same N as §5.1
  skipped    0          ← first run: nothing to skip
  conflicts  0
  failures   0
  bytes      …
  elapsed    …s
```

**Expected exit code: `0`.**

**STOP IF `conflicts` is non-zero.** Three cases and all three refuse to
overwrite: the digest differs from what we uploaded, the digest changed since we
uploaded, or the target exists with **no record of our having put it there**.
The last is the one that matters — an object of unknown origin may be a live
clinical document, and this job has no business deciding otherwise. On a fresh
rehearsal bucket there is nothing to conflict with, so any conflict means the
bucket is not fresh.

**STOP IF `failures` is non-zero.** `not_in_delivery` means a mapped file is
absent from the archive: the importer would write an attachment row pointing at
nothing, and `storage_path` being `NOT NULL` makes exactly that look healthy.

Conflicts and failures are reported by **checkpoint line number and sha256**,
never by filename — filenames may carry patient names and a failure summary is
precisely the output somebody pastes into a chat. Resolve them locally by
looking up the line in `$WORK/checkpoint.jsonl`.

**THE CLOSE CONDITION FOR `MIG-02` IS THE OBJECT COUNT, READ BACK FROM THE
BUCKET.** The exit code proves the job ran; the count proves the bytes arrived,
and those are different facts. List the prefix
`<tenantId>/migration/fisiozero/` through the Storage REST API and confirm the
number of objects equals `uploaded`:

```
curl -s -X POST "$SUPABASE_URL/storage/v1/object/list/clinical-attachments" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prefix":"<tenantId>/migration/fisiozero/","limit":100,"offset":0}' \
  | python3 -c 'import json,sys; print("objects", len(json.load(sys.stdin)))'
```

**COUNT ONLY. NEVER PRINT THE NAMES** — an object name is an attachment
filename, which may carry a patient name (§0.1). Page with `offset` when the
count can exceed `limit`.

**Ruled 2026-08-26**, and the reason is that the previous wording made a
BROWSER the close condition for a storage integration. A terminal executing this
runbook has none, so the card could not close on the run that actually proved it.
The REST read asks the same question of the same API the upload used, and
answers it in the transcript rather than in somebody's memory of a screen.

**The dashboard view is OPTIONAL and it is still worth thirty seconds** if you
have a browser open: Storage → `clinical-attachments` → the
`<tenantId>/migration/fisiozero/` prefix. It shows the same number.

### 5.3 Re-run to prove resume and skip

**Run the exact same command again.**

**Expected output shape:**

```
  uploaded   0          ← nothing re-uploaded
  skipped    N          ← every file recognised as already there
  conflicts  0
  failures   0
```

**Expected exit code: `0`.**

**STOP IF `uploaded` is non-zero on the second run.** The checkpoint is not
being read, and a resumed run over tens of gigabytes would start from the
beginning.

**STOP IF `conflicts` is non-zero on the second run.** The digest of a file on
disk changed between the two runs, or the object in the bucket was replaced.

*Why this proves something worth proving:* the job does **not** trust the
checkpoint on its own. The checkpoint records what it believes it did; a live
`exists` call records what is actually there. A resume that skipped on the
checkpoint alone would skip an entire bucket that had been emptied between runs
on the strength of a file sitting on this laptop. To see that arm work, delete
one object in the dashboard and run a third time: `uploaded` should be `1` and
`skipped` `N-1`. **That third run is optional but it is the strongest single
piece of evidence in this section.**

---

## 6. The runner, `--preview`

Staging and validation against the live ledger. **No target table is written.**

```
pnpm --filter @osteojp/db exec tsx scripts/rehearsal-import.ts \
  --delivery "$AMOSTRA" \
  --config "$WORK/mapping-config.local.json" \
  --checkpoint "$WORK/checkpoint.jsonl"
```

`--preview` is the default; there is no flag for it. Omitting `--apply` **is**
preview.

**Expected output shape:**

```
target project ref: <rehearsal ref>   (not on the 2-entry blocklist)
  note  serviceKeyByType "Diversos" is TO_NORMALIZE - imported WITHOUT a service
ADAPTER OUTPUT
  patient            1000
  clinical_episode     44
  appointment        1000
  clinical_record      44
  attachment            N
  to_review             T
      <reason>                         <count>
  DAY-ONE LOGIN  … patient(s) have NO resolvable telephone number.

STAGED     <1000 + 44 + 1000 + 44 + N − T>
VALIDATED  <same>   FAILED 0

PREVIEW - staged and validated only. NO TARGET TABLE WAS WRITTEN.
To run for real: --apply --confirm "IMPORT FISIOZERO INTO PRODUCTION"
```

### 6.1 The expected counts, stated literally

The amostra is **1000 patients, 1000 marcacoes, 44 episodios, 22 documentos**.
What the adapter emits from those four numbers is not one-to-one, and the
mapping is exact:

| Entity | Expected | Why it is that number |
|---|---|---|
| `patient` | **1000** minus patient-level `to_review` | one per `pacientes.csv` row |
| `appointment` | **1000** minus appointment-level `to_review` | one per `marcacoes.csv` row |
| `clinical_episode` | **44** minus episode-level `to_review` | one per episodios row across **both** specialty files combined |
| `clinical_record` | **44** minus episode-level `to_review` | **the same rows again.** The caderno's instruction for a vendor with no episode concept is one episode per clinical record, closed — so each episodios row emits *both*, with the same `sourceId` |
| `attachment` | **N from §5.1**, *not* 22 | `documentos.csv` (22) + `FICHEIRO` on pacientes + `FICHEIRO` on episodios, deduplicated by filename |

**`clinical_episode` and `clinical_record` must be equal.** If they are not, an
episodios row produced one and not the other, which the adapter has no path to
do — investigate before continuing.

**`44` is the total across both specialty files**, not 44 each. Check it against
§3's per-file `note` lines.

### 6.2 The expected `to_review` count, derived from the estado table

`ESTADO_MAP` is frozen in `packages/db/src/migration/sources/fisiozero.ts` and
is reproduced in the config template for reference only:

| `estado` | Outcome |
|---|---|
| `realizada` | → `completed` |
| `falta` | → `no_show` |
| `marcada`, future `inicio` | → `scheduled` |
| `marcada`, **past** `inicio` | → **`cancelled`** (owner ruling B, 2026-08-25). Imported, counted as `checks.pastMarcadaCancelled`, **not** routed to review |
| anything else | → `to_review`, reason `unknown_estado`, carrying the value |

**Nothing maps to `confirmed`, and a test pins it.** Confirmation in this
platform means a patient answered a reminder *we* sent; no vendor row can
evidence that, and asserting it would fabricate a patient's action.

So, taking the `estado seen:` line you wrote down in §3:

> **expected `pastMarcadaCancelled`** = the `marcada` count, minus any whose
> `inicio` is still in the future. The amostra is historical data, so for a
> sample drawn from a closed period **this should be the entire `marcada`
> count.**
>
> **It is a `checks` figure and a warning line, NOT a `to_review` reason.** Owner
> ruling B (2026-08-25) reversed that: these rows now IMPORT as `cancelled`.
> Before the ruling they went to review, and a runbook that still expected them
> there would read a correct run as a large unexplained review queue.

> **expected `unknown_estado`** = **0**. §3 exits non-zero on any estado outside
> `{realizada, falta, marcada}`, so a clean §3 guarantees it.

The other `to_review` reasons are data-quality findings rather than derivable
numbers, and each is a count you report rather than predict:

`missing_id_paciente`, `duplicate_id_paciente`, `missing_nome_completo`,
`unresolved_primary_location`, `unrecognised_sexo`,
`insurance_columns_mismatched`, `orphan_id_paciente`, `unresolved_terapeuta`,
`unresolved_location`, `inicio_unparseable`, `inicio_nonexistent_local_time`,
`fim_unparseable`, `fim_not_after_inicio`, `missing_data_avaliacao`,
`data_avaliacao_unparseable`, `missing_ficheiro`.

`marcada_in_the_past` is NOT in that list any more, and its absence is the
ruling: see the estado table above.

**Expect `unresolved_terapeuta` to be 0**, and not because the data is clean:
the runner *refuses the entire run* on an unmapped `terapeuta` before anything
is staged. If you got this far, there were none.

**Two reasons worth understanding when they appear**, because they are the
adapter being right rather than the data being wrong:

- `inicio_nonexistent_local_time` — the March DST jump. `01:30` on the jump day
  is not a moment; converting it invents one. A decade of history crosses that
  edge about twenty times.
- `ambiguousLocalTimes` in the checks (a count, not a `to_review`) — the October
  fold, where a wall time happens twice. The earlier instant is taken **and you
  are told**, because either answer is a guess and a silent pick is
  indistinguishable from a certainty.

### 6.3 The STOP conditions

**Expected exit code: `0`.**

**STOP IF `VALIDATED` + `FAILED` does not equal `STAGED`.** Rows went missing
between the two phases.

**STOP IF `FAILED` is non-zero.** `validate.ts` rejects rows whose target
columns are `NOT NULL` and whose value is absent. Every failure is a row that
would not import, and the reason is in `migration_staging_rows.error_detail`.

**STOP IF `STAGED` does not equal the sum of the entity counts minus
`to_review`.** Staging is idempotent on
`(tenant_id, source_system, entity_type, source_id)`, so a shortfall means
duplicate synthetic ids collapsed — check `duplicateSyntheticAppointmentIds` and
`duplicateSyntheticEpisodeIds` in the adapter's own tally.

**STOP IF the `target project ref:` line is absent.** The guard did not run,
which means you are in a mode that opens no database — check your flags.

**READ THE `DAY-ONE LOGIN` LINE AND DO NOT SKIP PAST IT.** The portal
authenticates **by telephone**; migration 0062 derives `phone_e164` and yields
`NULL` for a shape it does not recognise, and that patient then simply cannot log
in, with nothing in any log to say so. This is a count and never the numbers.
It is not a bug and it does not stop the rehearsal — **it is a data question for
the clinic** and it is the number `LAUNCH-03` cares about most.

---

## 7. The runner, `--apply`

### 7.1 The live run

```
pnpm --filter @osteojp/db exec tsx scripts/rehearsal-import.ts \
  --delivery "$AMOSTRA" \
  --config "$WORK/mapping-config.local.json" \
  --checkpoint "$WORK/checkpoint.jsonl" \
  --apply --confirm "IMPORT FISIOZERO INTO PRODUCTION"
```

**The phrase is `IMPORT FISIOZERO INTO PRODUCTION`, verbatim, even here.**
CLAUDE.md ratified it 2026-08-24 and it is not parameterised by environment. It
reads wrong against a rehearsal project, and that is the correct trade: a phrase
that changes per environment is a phrase muscle memory learns to type without
reading. `--apply` alone is refused.

**Expected output shape:**

```
target project ref: <rehearsal ref>   (not on the 2-entry blocklist)
ADAPTER OUTPUT
  …                                    ← identical to §6
STAGED     <same as §6>
VALIDATED  <same>   FAILED 0

IMPORTED  patient            1000
IMPORTED  clinical_episode     44
IMPORTED  appointment        1000
IMPORTED  clinical_record      44
IMPORTED  attachment            N

RECONCILIATION
  patient            staged=…  imported=…  to_review=…
  clinical_episode   staged=…  imported=…  to_review=…
  appointment        staged=…  imported=…  to_review=…
  clinical_record    staged=…  imported=…  to_review=…
  attachment         staged=…  imported=…  to_review=…
  referential integrity: OK
```

**Expected exit code: `0`.**

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

**THE WRITES ARE CHUNKED, AND A CHUNK FALLBACK LOOKS LIKE NOTHING (MIG-08).**
Each entity is imported in chunks of 200 rows: one multi-row `INSERT` and one
bulk ledger `UPDATE` per chunk, inside one savepoint, with the parent-id lookups
loaded once per entity instead of once per row. If **any** row in a chunk is
refused, the savepoint rolls back and that chunk is re-imported **one row at a
time** through the old path — so the failing row is recorded with its own
sqlstate and constraint and the other 199 still land. **A fallback therefore
does not appear in this transcript at all**, except as time: the counts, the
`failed` lines and `error_detail` are exactly what the per-row path produced.
Unnumbered patients are never chunked — 0029's `assign_patient_number` reads
`MAX+1` per statement, so they stay one statement per row, after every numbered
row, which is B5's ordering unchanged.

**The import order is fixed and is not the adapter's emission order:**
`patient → clinical_episode → appointment → clinical_record → attachment`.
Parents before children, because every child resolves its parent through the
staging ledger and an unimported parent is an `unresolved_reference` rather than
an error anybody would notice.

**STOP IF `referential integrity` is not `OK`.** Children point at parents that
did not import.

**STOP IF any `imported` count is less than its `staged` count** without a
matching `to_review`. The difference is rows that failed at import, and
`migration_staging_rows.error_detail` carries the structured reason.

**STOP IF the run refuses with `N attachment(s) have no uploaded object`.** §5
did not complete. `storage_path` is `NOT NULL`, so those rows would be written
and would point at nothing, and the database would accept them happily. The
precondition reads §5's checkpoint and refuses the **whole run** if any
attachment has no `uploaded` entry — including one whose upload ended in a
conflict.

**A refusal here has cost you nothing.** The staging ledger is untouched and is
re-usable: fix the cause and re-run the same command.

### 7.2 The reconciliation report

The `RECONCILIATION` block above **is** the report — it is generated inside the
run, scoped to the batch. Re-read it against §6's numbers rather than glancing
at it: `staged` must match §6's `STAGED` per entity, and `imported + to_review`
must account for all of it.

Confirm independently in the Supabase SQL editor with query 4 of
`rehearsal-uuids.sql`, which now reports the populated state:

| Column | Expected |
|---|---|
| `staging_rows` | the `STAGED` total |
| `patients` | 1000 minus patient `to_review`. **Nothing else**: §1.1's cleanup emptied the tenant |
| `appointments` | the imported appointment count, and nothing else |
| `attachments` | `N` minus attachment `to_review` |

**Two sources, and they should agree.** The reconciliation report reads the
ledger; query 4 reads the target tables. A ledger that says imported over a
target table that is empty is the failure mode this cross-check exists for.

### 7.3 Prove idempotency: run `--apply` again

**Run the exact same command from §7.1 a second time. Change nothing.**

**Expected output shape:** identical adapter and staging lines, and then every
`IMPORTED` at **0** with `skipped` carrying the first run's count, and a
`SKIPPED` total equal to the first run's `STAGED`:

```
IMPORTED  patient                   0   skipped  1000   failed    0   …
IMPORTED  clinical_episode          0   skipped    44   failed    0   …
IMPORTED  appointment               0   skipped   891   failed    0   …
IMPORTED  clinical_record           0   skipped    44   failed    0   …
IMPORTED  attachment                0   skipped    22   failed    0   …
SKIPPED   2001
```

**`SKIPPED` IS THE NUMBER THAT PROVES IT, not the zeros.** Five zeros are also
what an empty batch prints. `SKIPPED 2001` says the runner found all 2001 rows,
recognised every one as already imported, and wrote nothing.

**Expected exit code: `0`.**

**STOP IF ANY `IMPORTED` COUNT IS NON-ZERO.** That is a duplicate import and it
is the single most important negative result in this entire runbook. The whole
one-shot extraction strategy rests on the run being repeatable: if the real
delivery half-imports and the second attempt duplicates rather than resumes,
there is no recovery that does not involve reconciling thousands of rows by
hand.

**STOP IF `staging_rows` from query 4 has grown.** The ledger is keyed on
`(tenant_id, source_system, entity_type, source_id)` and a re-run must land on
the same rows. Growth means the synthetic ids are not deterministic — the
adapter derives them from `sha256(id_paciente|inicio|terapeuta)` and reads no
clock, counter or row index precisely so that a re-run is byte-identical.

**STOP IF the patient/appointment counts from query 4 have grown.** Same
finding, seen from the target side.

**Why the counts are zero rather than "updated":** a second `--apply` finds
every ledger row already `imported` and every target row unchanged, so
`importOne` returns `skipped`. Zero here means *nothing needed doing*, which is
exactly right.

---

## 8. Cleanup — resetting the rehearsal project

Do this **after** you have pasted the transcript, not before. The transcript is
the card's close condition and the state backs it up.

### 8.1 The permission, stated precisely

> **Deleting from `migration_staging_rows` is permitted ONLY on a non-prod
> rehearsal target. It is NEVER permitted on production.**

This is a narrow, deliberate exception to the pipeline's own rule, and the
reason the rule exists is worth carrying: **the ledger is both the audit trail
and the idempotency key.** A run that deletes from it makes the next run
re-import everything it already did. `MIG-03` states it as an invariant — *"the
runner exposes no delete capability to inject in the first place, and the test
asserts both"* — and that invariant is unchanged. Nothing in the import tooling
deletes. What follows is an operator resetting a scratch project by hand.

On production the same delete would destroy the record of what was imported, on
a one-shot extraction that cannot be repeated. There is no circumstance in which
it is correct.

### 8.2 Re-assert the guard first

The delete statements below are the most destructive thing in this document, and
they are typed into a SQL editor where nothing checks the connection for you.

```
pnpm --filter @osteojp/db exec tsx scripts/assert-not-prod.ts
```

**STOP unless this exits `0`.** Then confirm the project name in the Supabase
dashboard header **visually** before running anything in §8.3. Two independent
confirmations, because the SQL editor has no guard at all.

### 8.2b TWO triggers block the delete, and both are handled the same way

**Neither of these is a bug to route around.** Each is a safety property doing
exactly what it was built to do, and each makes a plain `delete` impossible.

**1. `clinical_records_enforce_immutability` (migration 0005).** A finalized
clinical record cannot be deleted, and it cannot be downgraded either. The
trigger raises `23514 check_violation` on a DELETE of any row whose `status` is
`locked` or `signed`, and raises again on an UPDATE unless the change is a merge
re-parent gated by `app.merge_reparent` with every other column byte-identical.
Setting `status = 'draft'` fails that test, so **there is no in-band
downgrade**:

```
[0] code=23514 msg=clinical_records <id>: status=locked is finalized and
    immutable; create a new versioned record (addendum) instead
```

That is CLAUDE.md rule 4 working. The dev seed leaves 45 finalized records of
60, and `fisiozero.ts` imports every migrated record as `locked`, so a wipe
after any rehearsal hits this wall.

**2. `patient_audit_log_append_only` (migration 0054).** Found on the
2026-08-26 rehearsal, on live data, and this one is the more dangerous of the
two because **the row count gives no warning**:

```
SQL FAILED: 42501 public.patient_audit_log is append-only; DELETE is refused
```

`patient_audit_log` held **zero** rows for the tenant when that fired. The
trigger is `BEFORE UPDATE OR DELETE OR TRUNCATE ... FOR EACH STATEMENT`, so it
fires on the STATEMENT and never looks at how many rows matched — a `0` in
STEP 1 is not protection, and production would have aborted on the identical
statement, mid-window, on import night.

**So both triggers are disabled for the duration of the reset transaction**,
which is the narrowest form available, and three properties make it safe. They
hold for both:

- **`ALTER TABLE ... DISABLE TRIGGER` is transactional.** On a rollback the
  triggers come back enabled — verified: `tgenabled` reads `O` after an aborted
  reset, and that was confirmed again by the 2026-08-26 abort above. A failed
  wipe cannot leave clinical records unprotected or the audit trail writable.
- **It takes a `ShareRowExclusiveLock`** on each table, so no other session can
  write one while the trigger is off. Reads are unaffected.
- **Both are re-enabled inside the same transaction**, before `commit`, and in
  the **reverse order** they were disabled, so the window is the wipe and
  nothing more.

**Both are verified after the commit, not one of them.** A reset that restored
the immutability trigger and not the append-only one leaves the audit trail
deletable, and nothing later in this runbook would notice.

**REHEARSAL ONLY.** Production has no §8 at all (`PROD-RUN.md` §6), and nothing
here authorises disabling a clinical-safety trigger there. The one place
production disables them is `cleanup-test-patients.sql`, under its own guards,
for the 33 training patients — which is precisely why §8.3 now runs that file
rather than a list of its own.

### 8.3 Wipe the imported rows

**THIS STEP DELEGATES. It no longer carries a delete list of its own**, and the
reason is a defect this runbook shipped: the five-table list that used to be
here — `attachments`, `clinical_records`, `clinical_episodes`, `appointments`,
`patients` — is not the graph. **Eighteen tables have an FK path to
`patients`.** On the 2026-08-26 reset the list aborted on the thirteenth of them:

```
RESET FAILED: 23503 update or delete on table "patients" violates foreign key
constraint "patient_locations_patient_id_patients_id_fk" on table "patient_locations"
```

`cleanup-test-patients.sql` already derives that graph from the committed
migrations across all five DDL forms, is covered by its own test suite, and is
the file production runs. **A second, shorter, untested copy of the same delete
is exactly the shape of the mistake `SEC-seed-guard-prod-blocklist` was.** So
this step runs that file and adds the one statement it deliberately does not
carry.

#### Before: the counts you are about to change

Query 4 of `rehearsal-uuids.sql`. Record all four. They are the "before" half of
the evidence, and §8.3's last step is the same query again.

#### 1. `cleanup-test-patients.sql` STEP 2, VERBATIM

Run it from the file. Do not retype it, do not trim it to what looks relevant.
It is scoped by `tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'` — the fixed
seed constant, the same tenant in both projects — and it carries the two trigger
windows §8.2b describes.

**`patients` will read 1000-ish here, not 33 and not 50.** The file's own STEP 1
header states the production figure. In this position it is counting the
imported delivery, which is what you are wiping.

**STEP 1, 1b and 1c first, as the file says.** STEP 1c is where the `locked`
count comes from, and `locked + signed` is the number that would otherwise stop
the delete.

#### 2. The ledger, which that file will never touch

```sql
-- PERMITTED HERE AND ONLY HERE. See §8.1.
-- cleanup-test-patients.sql asserts, in its own test suite, that the name
-- `migration_staging_rows` appears in no delete or update of that file. That
-- assertion is correct and must stay: the ledger is the import's audit trail
-- and its idempotency key, and on production destroying it is never right.
-- This one statement is the rehearsal's narrow exception, and it lives here
-- rather than in that file so the production script stays unable to do it.
delete from migration_staging_rows
 where tenant_id = ':tenant_id' and source_system = 'fisiozero';
```

#### 3. Confirm BOTH triggers are back on

`cleanup-test-patients.sql` STEP 3 prints both, and this is the same check:

```sql
select tgname, tgenabled from pg_trigger
 where (tgrelid = 'public.clinical_records'::regclass
        and tgname = 'clinical_records_enforce_immutability')
    or (tgrelid = 'public.patient_audit_log'::regclass
        and tgname = 'patient_audit_log_append_only')
 order by tgname;
```

**Expected `O` on BOTH rows.** **STOP ON ANYTHING ELSE** and re-enable by hand
before any other work touches this project. Verifying one of the two proves
nothing about the other.

**STEP 2 is transactional and that is load-bearing.** If any statement fails on
a foreign key the whole delete rolls back, rather than leaving a half-wiped
project that the next rehearsal would silently measure against — which is what
happened on 2026-08-26, and why the counts below are read rather than assumed.

#### After: the counts again

**Verify** with query 4 of `rehearsal-uuids.sql`: all four counts back to `0`.

**A STEP 2 that rolls back leaves the ledger delete stranded.** Run the two in
that order and read the outcome of the first before running the second: on
2026-08-26 the ledger was emptied while the target tables were still full, and
the next `--apply` against that state would have re-imported all 2001 rows on
top of the ones already there.

**There are no seeded dev patients left to delete** — §1.1's
`cleanup-test-patients.sql` removed them before the import, so what this wipes is
the imported delivery and nothing else. Re-run `seed:dev` from §1.1 before the
next rehearsal anyway: it restores the reference data this wipe does not touch,
and it is the step whose 50 patients §1.1's cleanup then removes again.

### 8.4 Empty the bucket

Supabase dashboard → Storage → `clinical-attachments` → delete the
`<tenantId>/migration/fisiozero/` prefix.

**Delete `$WORK/checkpoint.jsonl` in the same breath.** A checkpoint claiming
`uploaded` against an emptied bucket is the exact state the byte-copy job's
existence check is built to survive — the next run re-uploads correctly — but
leaving the two disagreeing means the next rehearsal starts from a state you did
not intend, and its `skipped` counts would not mean what §5.3 says they mean.

### 8.5 Files to remove from `$WORK`

```
rm -f "$WORK/checkpoint.jsonl" "$WORK/attachment-mapping.json"
```

**Keep `$WORK/mapping-config.local.json`** — it is the work product of §4 and
re-deriving it costs the whole SQL round trip. It is gitignored and carries no
credential.

---

## 9. What closes the card

`MIG-04` closes on **your pasted transcript**, and the following are what make
it evidence rather than a report:

| From | Paste |
|---|---|
| §1.3 | the guard's full output and its exit code |
| §2 | the probe's full output (safe by construction) |
| §3 | the delivery check's full output and exit code |
| §5.1 | the `entries N` line |
| §5.2 | the five counts and the exit code |
| §5.3 | the five counts of the **second** run — `uploaded 0`, `skipped N` |
| §6 | the whole preview block: entity counts, `to_review` with reasons, `STAGED`, `VALIDATED`/`FAILED`, `DAY-ONE LOGIN`, exit code |
| §7.1 | the `IMPORTED` lines, the `RECONCILIATION` block, exit code |
| §7.2 | query 4's four numbers |
| §7.3 | the `IMPORTED` lines of the **second** `--apply` — all zero — and exit code |
| §5.2 | the object COUNT read back from the bucket under `<tenantId>/migration/fisiozero/`, equal to `uploaded` — never the names. **This is what closes `MIG-02`;** the dashboard view is optional |

**Do not paste:** `$WORK/mapping-config.local.json` (live tenant uuids),
`$WORK/attachment-mapping.json` or `$WORK/checkpoint.jsonl` (attachment
filenames, which may carry patient names), or anything from
`rehearsal-uuids.sql` queries 1–3 (the staff roster).

**Every exit code, even the zeros.** *"Definition of done is a number, a file, or
an exit code"* — a transcript of output with no exit codes proves the commands
produced text, not that they succeeded.

---

## 10. What this rehearsal still does not prove

Recorded here so nobody reads a green transcript as more than it is:

- **Scale.** ~1,000 patients against 8,000–10,000, and an amostra's attachments
  against tens of gigabytes. Nothing here exercises a run long enough to be
  interrupted, and the resume path is the reason the checkpoint exists.
- **The two clinics together.** A run uses one `location.locationKey`. Two
  exports means two runs, and the second run against the same tenant is a case
  this rehearsal does not cover.
- **The real vocabulary.** The amostra's `estado` and `tipo_servico` values are
  the sample's, not the decade's. `ESTADO_MAP` is frozen data precisely so a
  vendor confirming one more value is an edit rather than a code change.
- **`patient_number` collisions.** The rehearsal project's existing patients are
  seeded dev rows, not the clinic's real numbered patients. That check is
  `scripts/import/preflight-patient-numbers.sql` and it runs against
  **production**, before import day, and only you can run it.
- **The clinical correctness of any row.** Structure and references, as §0.2
  says, and no more.
