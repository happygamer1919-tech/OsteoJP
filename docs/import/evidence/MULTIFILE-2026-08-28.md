# Multi-name `FICHEIRO` cells — executed end to end

**This file is EVIDENCE, not a runbook.** The runbook is
[`docs/import/REHEARSAL.md`](../REHEARSAL.md). What follows is the transcript
that executing it produced, pasted verbatim, with every exit code including the
zeros.

**IT EXISTS BECAUSE THE VENDOR CONFIRMED IN WRITING, 2026-08-28,** that the
`FICHEIRO` separator is a comma and that a single ficha or episodio can carry
several filenames in one cell.

---

## FIRST, A CORRECTION TO THE PREMISE THAT ORDERED THIS RUN

The dispatch said: *"Every rehearsal to date used STANDIN-attachments.zip with
22 single-name entries. The multi-name case has never been executed."*

**The first sentence is true and the second does not follow.** The archive's 22
entries are single names because a zip entry is one file. The **cells** are not:

```
amostra, measured 2026-08-28 before anything was built
  pacientes.csv               cells 10   names 17   multi-name cells 7
  Episodios_Fisioterapia.csv  cells  4   names  5   multi-name cells 1
  Episodios_Osteopatia.csv    cells  0   names  0   multi-name cells 0
  documentos.csv ficheiro           22 values
  -------------------------------------------------------------------
  FICHEIRO cells (non-empty)  14 | names across them 22 | multi-name 8
  DISTINCT referenced names   22
```

**Eight of the amostra's fourteen `FICHEIRO` cells already hold two
comma-joined names, and all five rehearsals imported them.** That is where the
22 attachments come from: 14 cells yielding 22 names, deduplicated against
`documentos.csv`'s 22 values, which are the same set.

**What had genuinely never been executed is narrower and it is the part the
vendor's note makes likely:**

```
  cells containing a COMMA          8
  cells containing a SEMICOLON      0
  cells with WHITESPACE around it   0     <- ZERO. Never once exercised.
```

So this run was built around the untested case rather than the assumed one: a
**space after the comma**, and a fixture where *names across cells* and
*distinct names* differ from *rows*, so the three numbers can be told apart.

---

## Header

| | |
|---|---|
| **Date executed** | 2026-08-28 (Europe/Lisbon) |
| **Executed by** | PURPLE, terminal, under CLAUDE.md *Exemption, ruled 2026-08-26* |
| **Repository SHA** | `2a50a14f9e998a4f966979bab373e336c489e0e6` |
| **Target project** | `djflfnnjvkbwnsgqwawj` — **non-production**, EU |
| **Production refs** | `dfotoodqvmjhbdcxyaxf` (live), `jaxmkwoxjcgzkwxgbayx` (retired). **Neither was reachable from the shell that ran this**, proven by `assert-not-prod.ts` before the import and again before the reset |
| **Delivery** | a **derived copy** at `/Users/ivan/osteojp-migration/rehearsal-multifile/`, built from the August 2026 amostra |
| **Tenant** | `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560` |

### The amostra was never written to

Re-hashed after the run. Byte-identical to the values recorded in all five
earlier evidence files:

```
12dd4f0771814fb282ecd7fa000d0c0ddefb59cbbc8a4041659cbbfd63c5248e  Episodios_Fisioterapia.csv
471b2241af11a52400e196e9587207e4f1febfa66d53ff1052dfb986011dcbb9  Episodios_Osteopatia.csv
a7b1fa5db50657199b4f7b4f83263a50813fc714ad0e96dbe608709ec5171a53  STANDIN-attachments.zip
4429974cd44f05914a7e900298f33e7b4d44be0f530ccd5eac609d858f444fe8  documentos.csv
eb98375a71ac9b98c5ff9646e3bea11c792330d45ae3dccf8d97df72deb02d83  marcacoes.csv
d7097b26b97598036fb67a4cea8d5d8c3f9f0e73ac92f400960f641c4e0ff6ea  pacientes.csv
```

The five CSVs were copied out; only the copies were edited. The stand-in archive
in the derived directory was generated from scratch.

---

## The fixture

Three single-name cells converted to two comma-separated names each. **Two of
the three carry a space after the comma** — the case with zero examples in the
amostra — and they sit in **two different files**, because `pacientes.csv` and
`Episodios_*.csv` reach the splitter down different code paths.

```
EDITS APPLIED
  pacientes.csv                + MULTIFILE-EXTRA-A.pdf
  pacientes.csv                + MULTIFILE-EXTRA-B.pdf   (SPACE after the comma)
  Episodios_Fisioterapia.csv   + MULTIFILE-EXTRA-C.pdf   (SPACE after the comma)

THE FIXTURE, BY COUNT
  FICHEIRO cells (rows carrying at least one name)    14
  names across those cells                            25
  cells holding more than one name                    11
  cells with whitespace around the separator           2
  documentos.csv ficheiro rows                        22
  DISTINCT referenced names (= expected attachments)  25
```

**THE TWO NUMBERS THE DISPATCH ASKED TO BE STATED SEPARATELY:**

| | |
|---|---|
| **rows carrying a `FICHEIRO` cell** | **14** |
| **names across those cells** | **25** |

The archive was generated to hold exactly the 25 distinct referenced names — no
missing entry, no orphan:

```
  entries written   25
  archive bytes     4657

$ unzip -l  ->  25 files
$ unzip -t  ->  No errors detected in compressed data.
```

---

## The transcript

### The guard

```
$ pnpm --filter @osteojp/db exec tsx scripts/assert-not-prod.ts
  set  DATABASE_URL         ref=djflfnnjvkbwnsgqwawj
  set  SUPABASE_URL         ref=(not a postgres connection string)
OK - no checked variable names a production ref.
exit=0
```

State before: `patients 0, appointments 0, attachments 0, staging_rows 0, patient_locations 0`.

### `check-delivery.mjs`, with the archive

```
$ node scripts/import/check-delivery.mjs "$MF" --zip "$MF/STANDIN-attachments.zip"
  note  pacientes.csv: 1000 row(s), 1000 distinct id_paciente
  note  marcacoes.csv: 1000 row(s)
  note  documentos.csv: 22 row(s)
  note  Episodios_Fisioterapia.csv: 30 row(s)
  note  Episodios_Osteopatia.csv: 14 row(s)
  note  estado seen: marcada=111  realizada=865  falta=24
  note  zip: 25 file entr(ies), 25 referenced name(s)

ACCEPTED - no conformance failure found.
exit=0
```

**`25 referenced name(s)` out of 14 cells.** The checker counts per NAME. Had it
counted per row or per cell it would have reported 14 and then declared 11
archive entries orphaned.

### The mapping emit

```
$ pnpm --filter @osteojp/db exec tsx scripts/rehearsal-import.ts \
    --delivery "$MF" --config "$WORK/mapping-config.local.json" \
    --emit-attachment-mapping "$WORK/attachment-mapping-mf.json"
ATTACHMENT MAPPING WRITTEN
  entries    25
exit=0

mapping keys: 25
```

### `copy-attachments.mjs`

```
$ node scripts/import/copy-attachments.mjs \
    --source "$MF/STANDIN-attachments.zip" \
    --mapping "$WORK/attachment-mapping-mf.json" \
    --checkpoint "$WORK/checkpoint-mf.jsonl"
target project ref: djflfnnjvkbwnsgqwawj   NOT production
ATTACHMENT BYTE COPY
====================
  uploaded   25
  skipped    0
  conflicts  0
  failures   0
  bytes      575
  elapsed    3s
exit=0
```

### The preview

```
ADAPTER OUTPUT
  patient            1000
  clinical_episode   44
  appointment        891
  clinical_record    44
  attachment         25
  to_review          109
      fim_not_after_inicio               109
  warning  83 appointment(s) were still "marcada" with a start in the PAST and were imported as CANCELLED (owner ruling B, 2026-08-25).

  DAY-ONE LOGIN  512 patient(s) will have no portal login: 505 blank telefone, 7 unparseable

STAGED     2004   1.9s   1063.1 rows/s
VALIDATED  2004   FAILED 0   1.3s   1565.6 rows/s

PREVIEW - staged and validated only. NO TARGET TABLE WAS WRITTEN.
exit=0
```

**`attachment 25`, not 22, and `STAGED 2004`, not 2001** — exactly the three new
names, and nothing else moved.

### The apply

```
STAGED     2004   2.0s   987.2 rows/s
VALIDATED  2004   FAILED 0   1.3s   1548.7 rows/s

IMPORTED  patient             1000   skipped     0   failed    0   57.4s   17.4 rows/s
IMPORTED  clinical_episode      44   skipped     0   failed    0   0.9s   48.5 rows/s
IMPORTED  appointment          891   skipped     0   failed    0   2.4s   375.2 rows/s
IMPORTED  clinical_record       44   skipped     0   failed    0   1.1s   41.5 rows/s
IMPORTED  attachment            25   skipped     0   failed    0   1.0s   24.1 rows/s
SKIPPED   0

RECONCILIATION
  patient            staged=1000  imported=1000  to_review=0  failed=0
  clinical_episode   staged=44  imported=44  to_review=0  failed=0
  appointment        staged=891  imported=891  to_review=0  failed=0
  clinical_record    staged=44  imported=44  to_review=0  failed=0
  attachment         staged=25  imported=25  to_review=0  failed=0
  referential integrity: OK
  patient number fidelity: OK   (882 vendor number(s) checked)
exit=0
```

### The attachment rows, read back off the target table

```
  attachment_rows                       25
  rows_from_the_three_edited_cells       3
  distinct_storage_paths                25
  paths_containing_a_comma               0
  paths_with_leading_or_trailing_space   0
```

**`paths_containing_a_comma = 0` is the assertion that matters.** An unsplit
cell would have produced one row whose `storage_path` ended
`.../a.pdf,b.pdf` — a valid-looking `NOT NULL` path naming an object that can
never exist, with both real documents lost behind it. There is no such row.

**`paths_with_leading_or_trailing_space = 0`** covers the sub-case the amostra
has no example of: ` MULTIFILE-EXTRA-B.pdf` would have been uploaded under a
name with a leading space and looked up without one.

**14 rows carried a cell. 25 attachments exist.**

---

## §8 The reset

```
$ assert-not-prod.ts                            exit=0

BEFORE   staging_rows 2004 | patients 1000 | appointments 891 | attachments 25 | patient_locations 1000

cleanup-test-patients.sql, verbatim from disk
  STEP 1   patients 1000  distinct_patient_numbers 1000  min_patient_number 1
  STEP 1b  path_count 25
  STEP 1c  locked 44
  STEP 2   app.expected_patients = '1000'   ->   COMMIT   exit=0

BOTH TRIGGERS
  {"tgname":"clinical_records_enforce_immutability","tgenabled":"O"}
  {"tgname":"patient_audit_log_append_only","tgenabled":"O"}

the ledger      [DELETE 2004]

AFTER    staging_rows 0 | patients 0 | appointments 0 | attachments 0 | patient_locations 0
         locations 2 | users 5        (reference data untouched)

BUCKET   objects under the prefix 25 | deleted 25 | remaining 0

$ rm -f "$WORK/checkpoint-mf.jsonl" "$WORK/attachment-mapping-mf.json"
mapping-config.local.json   <- kept
```

**`path_count` read 25 rather than 0** — the first rehearsal in which STEP 1b
had anything to report, because this is the first whose attachments were still
in the bucket when the cleanup ran. It is the production behaviour
`PROD-RUN.md` BLOCK 5 warns about, observed here for the first time.

---

## What this proves, and what it does not

**PROVES:**

- Every stage of the attachment path splits a multi-name cell: `check-delivery`
  (25 referenced names from 14 cells), the emitter (25 entries), the byte copy
  (25 uploaded), the adapter (25 attachments) and the target table (25 rows).
- Whitespace around the comma is trimmed end to end. No stored path carries a
  comma or a leading or trailing space.
- Both file paths that reach the splitter — `pacientes.csv` and
  `Episodios_*.csv` — behave identically.
- Nothing else moved: patients, episodes, appointments and records are
  identical to 2026-08-27c and to the 2026-08-28 backfill run.

**DOES NOT PROVE:**

- **More than two names in one cell, on a live import.** The fixture uses pairs.
  Three and four names are covered at unit level only
  (`check-delivery.test.mjs`, "SEVERAL names in one cell").
- **A real archive.** 575 bytes of stand-in content against a delivery of tens
  of gigabytes. Unchanged from every earlier rehearsal.
- **The vendor's actual final delivery.** This is a fixture built to the vendor's
  written description, not the thing they will ship.
