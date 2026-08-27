# Fisiozero import — the rehearsal, re-run on the batched writer

**This file is EVIDENCE, not a runbook.** The runbook is `docs/import/REHEARSAL.md`
and it is the thing that was executed. What follows is the transcript that
executing it produced, pasted verbatim, with every exit code including the zeros.

**It exists to answer one question:** does the batched import writer (`MIG-08`)
write exactly what the per-row writer wrote, and how much faster. The answer is
**identical counts** and **78.3s instead of 19m10s** — a 14.7× speedup on the
import phase.

The full first rehearsal is
[`REHEARSAL-2026-08-26.md`](./REHEARSAL-2026-08-26.md), and it remains the
close-out evidence for `MIG-02`, `MIG-03` and `MIG-04`. This one closes
`MIG-08`.

**NOTHING HERE MAY BE EDITED TO READ BETTER.** The one liberty taken is the one
the blind rule requires: attachment filenames and storage object names are
counted, never listed — see `REHEARSAL.md` §0.1.

---

## Header

| | |
|---|---|
| **Date executed** | 2026-08-27 (Europe/Lisbon) |
| **Executed by** | PURPLE, terminal, under CLAUDE.md *Exemption, ruled 2026-08-26* |
| **Repository SHA** | `5ebbacf36fdf5ee92be73b460dbb76e8774acb99` on `main` (PR #1048, `MIG-08`) |
| **Previous rehearsal** | `76dd93a2` — [`REHEARSAL-2026-08-26.md`](./REHEARSAL-2026-08-26.md) |
| **Target project** | `djflfnnjvkbwnsgqwawj` — **non-production**, EU |
| **Production refs** | `dfotoodqvmjhbdcxyaxf` (live), `jaxmkwoxjcgzkwxgbayx` (retired). **Neither was reachable from the shell that ran this**, proven by `assert-not-prod.ts` before every phase |
| **Delivery** | the August 2026 **amostra**, vendor-confirmed synthetic test data |
| **Tenant** | `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560` — the fixed seed constant (`packages/db/seed/dev-reference.ts`) |

### The delivery, by sha256

**Byte-identical to 2026-08-26.** That is what makes the two transcripts
comparable: the only variable between them is the writer.

```
12dd4f0771814fb282ecd7fa000d0c0ddefb59cbbc8a4041659cbbfd63c5248e  Episodios_Fisioterapia.csv
471b2241af11a52400e196e9587207e4f1febfa66d53ff1052dfb986011dcbb9  Episodios_Osteopatia.csv
a7b1fa5db50657199b4f7b4f83263a50813fc714ad0e96dbe608709ec5171a53  STANDIN-attachments.zip
4429974cd44f05914a7e900298f33e7b4d44be0f530ccd5eac609d858f444fe8  documentos.csv
eb98375a71ac9b98c5ff9646e3bea11c792330d45ae3dccf8d97df72deb02d83  marcacoes.csv
d7097b26b97598036fb67a4cea8d5d8c3f9f0e73ac92f400960f641c4e0ff6ea  pacientes.csv
```

**THE ARCHIVE IS `STANDIN-attachments.zip`, NOT `documentos.zip`** — 22 entries,
one per `documentos.csv` row, 1413 bytes total. Same caveat as last time: it
exercises the whole byte-copy path against a live bucket and proves nothing
about throughput on tens of gigabytes.

---

## The timing, which is what this run is for

**Import phase, per entity. Same delivery, same project, same rows.**

| Entity | Rows | 2026-08-26 | 2026-08-27 | 2026-08-26 | 2026-08-27 | Speedup |
|---|---:|---:|---:|---:|---:|---:|
| `patient` | 1000 | 571.8s | **71.2s** | 1.7 rows/s | **14.1 rows/s** | 8.0× |
| `clinical_episode` | 44 | 26.1s | **1.2s** | 1.7 rows/s | **37.8 rows/s** | 21.8× |
| `appointment` | 891 | 506.1s | **3.4s** | 1.8 rows/s | **262.1 rows/s** | 148.9× |
| `clinical_record` | 44 | 32.2s | **1.4s** | 1.4 rows/s | **31.8 rows/s** | 23.0× |
| `attachment` | 22 | 13.4s | **1.1s** | 1.6 rows/s | **19.9 rows/s** | 12.2× |
| **TOTAL** | **2001** | **1149.6s (19m10s)** | **78.3s (1m18s)** | **1.7 rows/s** | **25.6 rows/s** | **14.7×** |

**Acceptance was "under 3 minutes with identical counts". It is 1m18s.**

### Read the patient row, because it is the one that did not go 100×

`patient` is 8.0× where `appointment` is 148.9×, and the reason is `A4` working
rather than a limit: **118 of the 1000 patients carry no vendor
`numero_paciente`**, and those are deliberately never chunked. 0029's
`assign_patient_number` fills a NULL with `COALESCE(MAX,0)+1` **per statement**,
so a chunk of unnumbered rows would have every row in it read the same MAX and
`patients_tenant_number_uq` would refuse all but one. They stay one statement per
row, after every numbered row — B5's ordering unchanged.

So the 882 numbered patients batched into five chunks, and the 118 unnumbered
ones paid the old per-row price. That is ~59s of the 71.2s, and it is the correct
trade: the alternative is a faster import that renumbers patients the clinic
identifies by number.

**What this means for the real delivery.** The 8,000–10,000 patients arrive with
whatever proportion of `numero_paciente` the vendor's decade actually holds —
88.2% in the amostra. The unnumbered remainder is the part that will not
accelerate, and it is worth knowing the proportion **from the production §6
preview** before budgeting the window.

### What did NOT get faster, and is now the larger half

The `--apply` command's total wall clock was **401s**, of which the import phase
is 78.3s. **The remaining ~5m20s is the adapter, staging and validation**, and
`MIG-08` did not touch any of it: `stageRows` and `markValidated` still run
per row. That is not a defect and it was not in scope — but on this delivery
staging is now the dominant cost, and on the real one it will be the thing worth
measuring next.

---

## §9 — the transcript

Section numbering is `REHEARSAL.md`'s.

### §1.1 The project

```
$ pnpm --filter @osteojp/db exec node scripts/check-pending-migrations.mjs 0
last applied "when" in the database: 1787300200000
journal entries on disk:             67
pending:                             0

OK: the pending set is exactly what was expected.
exit=0
```

```
$ SEED_DEV_CONFIRM=djflfnnjvkbwnsgqwawj pnpm --filter @osteojp/db seed:dev
… form templates: 12 upserted
dev-reference seed complete.
Seeding 50 patients → tenant 3a2d0711-fbdb-4ce9-b940-b6a87e3d3560…
Done. inserted=50 skipped=0 total=50
Seeding 271 appointments → tenant 3a2d0711-fbdb-4ce9-b940-b6a87e3d3560…
Done. inserted=271 skipped=0 total=271
Seeding 34 availability templates → tenant 3a2d0711-fbdb-4ce9-b940-b6a87e3d3560…
Done. inserted=0 skipped=34 total=34
Seeding 40 episodes, 60 records → tenant 3a2d0711-fbdb-4ce9-b940-b6a87e3d3560…
Done. episodes: inserted=40 skipped=0 | records: inserted=60 skipped=0
exit=0
```

#### `scripts/import/cleanup-test-patients.sql`, verbatim from disk

```
----- STEP 1 -----
  patients                           50
  distinct_patient_numbers           50
  min_patient_number                 1
  max_patient_number                 50
  ai_ingestion_requests              0
  attachments                        0
  patient_form_submissions           0
  record_annulments                  0
  appointment_notes                  0
  clinical_records                   60
  invoices                           0
  appointments                       271
  analytics_events                   0
  clinical_episodes                  40
  consultations                      0
  patient_followup_contacts          0
  patient_followup_postponements     0
  patient_locations                  0
  patient_note_revisions             0
  patient_pack_instances             0
  patient_terms_acceptances          0
  patient_trusted_devices            0
  patient_audit_log                  0
  staff_notifications                0
  guest_requests_to_null             0
exit=0

----- STEP 1b -----
  path_count                         0
  (SELECT 0)
exit=0

----- STEP 1c -----
  status  draft    records  15
  status  locked   records  30
  status  signed   records  15
exit=0

----- STEP 2 -----
  (COMMIT 0)
exit=0

----- STEP 3 -----
  immutability_trigger               O
  audit_append_only_trigger          O
  patients                           0
  orphan_appointments                0
  orphan_clinical_records            0
  orphan_clinical_episodes           0
  orphan_attachments                 0
  orphan_patient_locations           0
  orphan_patient_audit_log           0
  orphan_staff_notifications         0
  orphan_guest_requests              0
  staff_rows                         5
  staging_rows_untouched             0
exit=0
```

`patients = 50` and `15/30/15` — the same rehearsal delta as 2026-08-26.

```
$ scripts/import/preflight-patient-numbers.sql
  tenant_id                          3a2d0711-fbdb-4ce9-b940-b6a87e3d3560
  tenant_slug                        osteojp-dev
  existing_patients                  0
  min_patient_number                 null
  max_patient_number                 null
  number_span                        null
exit=0
```

```
$ storage/v1/bucket   (names only)
[{"name":"clinical-attachments","public":false}]
exit=0
objects under <tenantId>/migration/fisiozero/  0
exit=0
```

### §1.3 The guard

```
REHEARSAL TARGET GUARD
======================
blocklist: 2 production ref(s), from packages/db/seed/seed-guard.ts
  set  DATABASE_URL         ref=djflfnnjvkbwnsgqwawj
  set  SUPABASE_URL         ref=(not a postgres connection string)

OK - no checked variable names a production ref.
This proves the target is NOT production. It does not prove the target is
the project you intended; confirm the ref above in the Supabase dashboard.
exit=0
```

### §2 The probe

`exit=0`. Structure identical to 2026-08-26 in every particular — same column
lists, same row counts, `valid UTF-8 yes` and `ragged rows 0` on every file,
exactly two `Episodios_*.csv`. The sha256 block is reproduced in the header
above and matches byte for byte, which is what makes that identity a fact rather
than an impression. The full per-column fill-rate output is in
[`REHEARSAL-2026-08-26.md`](./REHEARSAL-2026-08-26.md) §2 and is not repeated.

```
ZIP FILES
---------
  FILE  STANDIN-attachments.zip
    zip64            no
    entries          22  (22 file(s), 0 director(ies))
    uncompressed     1413 bytes
    largest entry (uncompressed)  66 bytes
    filename length  min=45 max=48
    by extension     pdf=14  jpg=5  jpeg=2  png=1
exit=0
```

### §3 The delivery conformance check

```
FISIOZERO DELIVERY CHECK
========================
  note  pacientes.csv: 1000 row(s), 1000 distinct id_paciente
  note  marcacoes.csv: 1000 row(s)
  note  documentos.csv: 22 row(s)
  note  Episodios_Fisioterapia.csv: 7 column(s) beyond the spec ["queixas","antecedentes","medicacao","diagnostico","ot","obs","alertas"]
  note  Episodios_Fisioterapia.csv: 30 row(s)
  note  Episodios_Osteopatia.csv: 9 column(s) beyond the spec ["peso","altura","alerta","motivos","condicoes","antecedentes","diagnostico","tratamento","obs"]
  note  Episodios_Osteopatia.csv: 14 row(s)
  note  estado seen: marcada=111  realizada=865  falta=24
  note  zip: 22 file entr(ies), 22 referenced name(s)

ACCEPTED - no conformance failure found.

This checks STRUCTURE and REFERENCES. It does not and cannot check
that the contents are correct or complete against the clinic's records.
exit=0
```

### §4.3 The config cannot be committed

```
$ git check-ignore -v scripts/import/mapping-config.local.json
.gitignore:68:**/mapping-config.local.json	scripts/import/mapping-config.local.json
exit=0
OUTSIDE the repo - ok
```

### §4.4 The unfilled config is refused

```
  note  serviceKeyByType "Diversos" is TO_NORMALIZE - imported WITHOUT a service
REFUSED - the mapping config does not cover this delivery.
  missing   practitionerKeyByName."Jp" still holds placeholder uuid
  missing   practitionerKeyByName."Mafalda Toscano" still holds placeholder uuid
  missing   practitionerKeyByName."Tiago Grilo" still holds placeholder uuid
  missing   practitionerKeyByName."Isaac Fonseca" still holds placeholder uuid
  missing   practitionerKeyByName."Bernardo Calmeiro" still holds placeholder uuid
  missing   practitionerKeyByName."Clínica OsteoJP" still holds PENDING_OWNER_RULING
  missing   practitionerKeyByName."NESA" still holds PENDING_OWNER_RULING
  missing   serviceKeyByType."Tratamento" still holds placeholder uuid
  missing   serviceKeyByType."1ª Avaliação" still holds placeholder uuid
  missing   serviceKeyByType."Consulta" still holds placeholder uuid
  missing   location.knownLocations."linda-a-velha" still holds placeholder uuid
  missing   location.knownLocations."castelo-branco" still holds placeholder uuid
  missing   config."tenantId" still holds placeholder uuid
  tipo_servico unmapped  "Diversos"  61 row(s)

NOTHING WAS STAGED. A partial mapping does not crash - it imports a
fraction of the diary and reports success over the rest.
undefined
[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] …
exit=1
```

The lone `undefined` is pnpm's own failure reporter — `REHEARSAL.md` §0.35.

### §5.1 The attachment mapping

```
ATTACHMENT MAPPING WRITTEN
  entries    22
  written to /Users/ivan/osteojp-migration/rehearsal/attachment-mapping.json
exit=0
```

### §5.2 The byte copy

```
target project ref: djflfnnjvkbwnsgqwawj   NOT production
ATTACHMENT BYTE COPY
====================
  uploaded   22
  skipped    0
  conflicts  0
  failures   0
  bytes      1413
  elapsed    2s
exit=0

objects under <tenantId>/migration/fisiozero/  22
exit=0
```

`uploaded 22` = `objects 22`, read back from the live bucket. That is `MIG-02`'s
close condition as reworded on 2026-08-27, and it holds on this run too.

### §5.3 Resume and skip

```
target project ref: djflfnnjvkbwnsgqwawj   NOT production
ATTACHMENT BYTE COPY
====================
  uploaded   0
  skipped    22
  conflicts  0
  failures   0
  bytes      0
  elapsed    1s
exit=0
```

### §6 The runner, `--preview`

```
target project ref: djflfnnjvkbwnsgqwawj   (not on the 2-entry blocklist)
  note  serviceKeyByType "Diversos" is TO_NORMALIZE - imported WITHOUT a service
ADAPTER OUTPUT
  patient            1000
  clinical_episode   44
  appointment        891
  clinical_record    44
  attachment         22
  to_review          109
      fim_not_after_inicio               109
  warning  83 appointment(s) were still "marcada" with a start in the PAST and were imported as CANCELLED (owner ruling B, 2026-08-25). They are in the patient's history, not in the diary.

  DAY-ONE LOGIN  512 patient(s) will have no portal login: 505 blank telefone, 7 unparseable
                 They will be imported and will NOT be able to log into the
                 portal. This is a data question for the clinic, not a bug.

STAGED     2001
VALIDATED  2001   FAILED 0

PREVIEW - staged and validated only. NO TARGET TABLE WAS WRITTEN.
To run for real: --apply --confirm "IMPORT FISIOZERO INTO PRODUCTION"
exit=0
```

Every number identical to 2026-08-26, including `to_review 109` and
`DAY-ONE LOGIN 512`. The adapter was not touched by `MIG-08` and this is the
check that says so.

### §7.1 The live run

```
target project ref: djflfnnjvkbwnsgqwawj   (not on the 2-entry blocklist)
  note  serviceKeyByType "Diversos" is TO_NORMALIZE - imported WITHOUT a service
ADAPTER OUTPUT
  patient            1000
  clinical_episode   44
  appointment        891
  clinical_record    44
  attachment         22
  to_review          109
      fim_not_after_inicio               109
  warning  83 appointment(s) were still "marcada" with a start in the PAST and were imported as CANCELLED (owner ruling B, 2026-08-25). They are in the patient's history, not in the diary.

  DAY-ONE LOGIN  512 patient(s) will have no portal login: 505 blank telefone, 7 unparseable
                 They will be imported and will NOT be able to log into the
                 portal. This is a data question for the clinic, not a bug.

STAGED     2001
VALIDATED  2001   FAILED 0

IMPORTED  patient             1000   skipped     0   failed    0   71.2s   14.1 rows/s
IMPORTED  clinical_episode      44   skipped     0   failed    0   1.2s   37.8 rows/s
IMPORTED  appointment          891   skipped     0   failed    0   3.4s   262.1 rows/s
IMPORTED  clinical_record       44   skipped     0   failed    0   1.4s   31.8 rows/s
IMPORTED  attachment            22   skipped     0   failed    0   1.1s   19.9 rows/s
SKIPPED   0

RECONCILIATION
  patient            staged=1000  imported=1000  to_review=0  failed=0
  clinical_episode   staged=44  imported=44  to_review=0  failed=0
  appointment        staged=891  imported=891  to_review=0  failed=0
  clinical_record    staged=44  imported=44  to_review=0  failed=0
  attachment         staged=22  imported=22  to_review=0  failed=0
  referential integrity: OK
  patient number fidelity: OK   (882 vendor number(s) checked)
exit=0

WALL CLOCK (whole command, including adapter + stage + validate): 401s
IMPORT PHASE: 71.2 + 1.2 + 3.4 + 1.4 + 1.1 = 78.3s
```

**IMPORTED 1000 / 44 / 891 / 44 / 22, failed 0, integrity OK, fidelity OK over
882 — every count identical to 2026-08-26.** `SKIPPED 0`, because this was a
clean tenant and nothing had been imported before.

**NO CHUNK FELL BACK.** A fallback would have shown as ordinary per-row failures
and as time; `failed 0` on every entity and the rates above say every chunk
committed on its first attempt.

### §7.2 The reconciliation, read from the target tables

```
QUERY 4 (rehearsal-uuids.sql)
  staging_rows        2001
  patients            1000
  appointments        891
  attachments         22
ALSO
  clinical_episodes   44
  clinical_records    44
  appts_null_service  61
  trigger tgenabled   O
exit=0

LEDGER  entity_type / status / error code / rows
  patient            imported   -                      1000
  appointment        imported   -                      891
  clinical_episode   imported   -                      44
  clinical_record    imported   -                      44
  attachment         imported   -                      22
  TOTAL 2001
exit=0
```

**Two sources, and they agree.** `appts_null_service 61` — the Diversos
appointments, in the diary, with a null `service_id`, exactly as on 2026-08-26.

### §7.3 Idempotency

```
STAGED     2001
VALIDATED  2001   FAILED 0

IMPORTED  patient                0   skipped  1000   failed    0   0.6s   1715.3 rows/s
IMPORTED  clinical_episode       0   skipped    44   failed    0   1.2s   37.3 rows/s
IMPORTED  appointment            0   skipped   891   failed    0   1.5s   593.2 rows/s
IMPORTED  clinical_record        0   skipped    44   failed    0   1.3s   33.0 rows/s
IMPORTED  attachment             0   skipped    22   failed    0   0.7s   32.9 rows/s
SKIPPED   2001

RECONCILIATION
  patient            staged=1000  imported=1000  to_review=0  failed=0
  clinical_episode   staged=44  imported=44  to_review=0  failed=0
  appointment        staged=891  imported=891  to_review=0  failed=0
  clinical_record    staged=44  imported=44  to_review=0  failed=0
  attachment         staged=22  imported=22  to_review=0  failed=0
  referential integrity: OK
  patient number fidelity: OK   (882 vendor number(s) checked)
exit=0
```

**`IMPORTED 0` on every entity, `SKIPPED 2001`, exit 0.** Batching did not cost
idempotency: `imported` ledger rows are skipped before anything is chunked, so
the second `--apply` writes nothing — and it now finishes in 5.3s rather than
2.5s of skipping, because the skip path was never the slow part.

### §8 The reset

```
$ assert-not-prod.ts                      exit=0

BEFORE (query 4):
  staging_rows 2001 · patients 1000 · appointments 891 · attachments 22
  clinical_episodes 44 · clinical_records 44 · appts_null_service 61 · tgenabled O
exit=0

----- STEP 1 -----
  patients 1000 · distinct_patient_numbers 1000 · min 1 · max 1118
  attachments 22 · clinical_records 44 · appointments 891 · clinical_episodes 44
  patient_locations 1000 · every other count 0
----- STEP 1c -----
  status  locked   records  44
exit=0

----- STEP 2 -----
  (COMMIT 0)
exit=0

  DELETE migration_staging_rows  2001
exit=0

----- STEP 3 -----
  immutability_trigger               O
  audit_append_only_trigger          O
  patients                           0
  orphan_appointments                0
  orphan_clinical_records            0
  orphan_clinical_episodes           0
  orphan_attachments                 0
  orphan_patient_locations           0
  orphan_patient_audit_log           0
  orphan_staff_notifications         0
  orphan_guest_requests              0
  staff_rows                         5
  staging_rows_untouched             0
exit=0

§8.4  objects removed  22
      objects left     0
exit=0

§8.5  $WORK now holds mapping-config.local.json only
exit=0

AFTER (query 4):
  staging_rows 0 · patients 0 · appointments 0 · attachments 0
  clinical_episodes 0 · clinical_records 0 · appts_null_service 0 · tgenabled O
exit=0
```

**`min_patient_number 1`, `max 1118`, 1000 distinct** — the same numbering the
per-row writer produced on 2026-08-26, from the same 882 vendor numbers plus 118
trigger-assigned ones. Both triggers read `O` after the commit.

---

## What this run still does not prove

`REHEARSAL.md` §10 in full. The three that matter on import night, updated for
what `MIG-08` did and did not change:

- **Scale, still.** 2001 rows at 25.6 rows/s is 78s; the real delivery is
  8,000–10,000 patients plus a decade of appointments and records. The rate is
  now dominated by the **unnumbered-patient proportion** and by **staging**,
  neither of which this delivery is representative of. Budget from the
  production §6 preview, not from this table.
- **The two clinics together.** One run uses one `location.locationKey`. Two
  exports means two runs, and the second against the same tenant is a case
  neither rehearsal covers.
- **`patient_number` collisions against real numbers.** This project's patients
  were seeded dev rows, removed before the import. The real check is
  `scripts/import/preflight-patient-numbers.sql`, against production, before
  import day, and only the owner can run it.

**And one this run adds:** the chunk fallback path never fired here, because
nothing failed. It is covered by `packages/db/tests/migration-batch-import.test.ts`
against a live database — 200 rows, one duplicate `patient_number`, 199 imported
and 1 failed carrying `sqlstate 23505` and `patients_tenant_number_uq` — but it
has not yet been exercised by a real delivery.
