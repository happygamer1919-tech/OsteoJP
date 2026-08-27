# Fisiozero import — the rehearsal, re-run on the batched ledger writer

**This file is EVIDENCE, not a runbook.** The runbook is `docs/import/REHEARSAL.md`
and it is the thing that was executed. What follows is the transcript that
executing it produced, pasted verbatim, with every exit code including the zeros.

**It exists to answer one question:** with the staging and validation writes
batched (`MIG-09`), does the whole apply command still write exactly what it
wrote before, and how long does it now take. The answer is **identical counts**
and **84 seconds** for the entire command, against 401s on 2026-08-27 and roughly
twenty minutes on 2026-08-26.

The two earlier rehearsals are [`REHEARSAL-2026-08-26.md`](./REHEARSAL-2026-08-26.md)
(which closed `MIG-02`, `MIG-03`, `MIG-04`) and
[`REHEARSAL-2026-08-27.md`](./REHEARSAL-2026-08-27.md) (which closed `MIG-08`).
This one closes `MIG-09`.

**NOTHING HERE MAY BE EDITED TO READ BETTER.** The one liberty taken is the one
the blind rule requires: attachment filenames and storage object names are
counted, never listed — see `REHEARSAL.md` §0.1.

---

## Header

| | |
|---|---|
| **Date executed** | 2026-08-27 (Europe/Lisbon), second run of the day |
| **Executed by** | PURPLE, terminal, under CLAUDE.md *Exemption, ruled 2026-08-26* |
| **Repository SHA** | `6909bf0c8cb1d0e2b5b4df21165c7d6df9330937` on `main` (PR #1050, `MIG-09`) |
| **Previous rehearsals** | `76dd93a2` — [2026-08-26](./REHEARSAL-2026-08-26.md) · `5ebbacf3` — [2026-08-27](./REHEARSAL-2026-08-27.md) |
| **Target project** | `djflfnnjvkbwnsgqwawj` — **non-production**, EU |
| **Production refs** | `dfotoodqvmjhbdcxyaxf` (live), `jaxmkwoxjcgzkwxgbayx` (retired). **Neither was reachable from the shell that ran this**, proven by `assert-not-prod.ts` before every phase |
| **Delivery** | the August 2026 **amostra**, vendor-confirmed synthetic test data |
| **Tenant** | `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560` — the fixed seed constant (`packages/db/seed/dev-reference.ts`) |

### The delivery, by sha256

**Byte-identical across all three rehearsals.** That is what makes the timings
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
one per `documentos.csv` row, 1413 bytes total. It exercises the whole byte-copy
path against a live bucket and proves nothing about throughput on tens of
gigabytes.

---

## The timing, across all three rehearsals

**Same delivery, same project, same 2001 rows, three writers.**

### By phase — this is the table that matters

| Phase | 2026-08-26 `76dd93a2` | 2026-08-27 `5ebbacf3` | 2026-08-27b `6909bf0c` |
|---|---:|---:|---:|
| adapter + read + gate | ~2s | ~2s | **~2.3s** |
| **stage** | *not measured* | *not measured* | **2.9s** (693.6 rows/s) |
| **validate** | *not measured* | *not measured* | **1.9s** (1049.8 rows/s) |
| **import** | 1149.6s | 78.3s | **76.0s** |
| **TOTAL apply command** | ~19m30s | **401s** | **84s** |

**`stage` and `validate` were never measured before, and that is the point.** On
2026-08-27 the import phase was 78.3s inside a 401s command, and the missing five
minutes had to be found by **subtraction**, after the fact, on a run that could
have said so itself. `MIG-09` prints both phases, so nobody has to subtract
again — and the number it revealed was **validation**, not staging.

### By entity, import phase only

| Entity | Rows | 2026-08-26 | 2026-08-27 | 2026-08-27b |
|---|---:|---:|---:|---:|
| `patient` | 1000 | 571.8s | 71.2s | **69.0s** |
| `clinical_episode` | 44 | 26.1s | 1.2s | **1.1s** |
| `appointment` | 891 | 506.1s | 3.4s | **3.5s** |
| `clinical_record` | 44 | 32.2s | 1.4s | **1.3s** |
| `attachment` | 22 | 13.4s | 1.1s | **1.1s** |
| **TOTAL** | **2001** | **1149.6s** | **78.3s** | **76.0s** |

**`MIG-09` did not touch the import phase and the numbers say so** — 76.0s
against 78.3s is run-to-run noise, not a change. That is the control: if these
had moved, something had been altered that was not supposed to be.

### Where the 317 seconds went

`MIG-09` removed ~5m17s from the command, and **all of it was the validate
phase** marking 2001 ledger rows one at a time. Staging was never the cost — it
was already one multi-row `INSERT` per entity, and the first guess that it was
slow was simply wrong. The measurement is what corrected it.

**What the chunking of `stageRows` bought instead is a failure that could not
happen here.** Every column of every row is a bound parameter, six per row, and
Postgres refuses more than 65535 in one statement — so the single whole-entity
`INSERT` stops working at about **10,900 rows**. The amostra's 1000 never came
close; **the real delivery is 8,000–10,000 patients plus a decade of
appointments.** That is the class of defect a 1000-row rehearsal is structurally
unable to find, and it would have fired first on import night, on the biggest
entity, with the old system already retired.

### And the one number that still does not scale from this table

**`patient` is 69.0s of the 76.0s.** 118 of the 1000 patients carry no vendor
`numero_paciente`, and those are deliberately never chunked (`MIG-08` A4): 0029's
`assign_patient_number` reads `COALESCE(MAX,0)+1` **per statement**. They pay the
old per-row price, and they are ~59s of that 69.0s. **The real delivery's
unnumbered proportion is a fact about the vendor's decade and comes off the
production §6 preview**, not off this run.

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

$ SEED_DEV_CONFIRM=djflfnnjvkbwnsgqwawj pnpm --filter @osteojp/db seed:dev
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

`patients = 50` and `15/30/15` — the same rehearsal delta as both earlier runs.

```
$ scripts/import/preflight-patient-numbers.sql
  tenant_id                          3a2d0711-fbdb-4ce9-b940-b6a87e3d3560
  tenant_slug                        osteojp-dev
  existing_patients                  0
  min_patient_number                 null
  max_patient_number                 null
  number_span                        null
exit=0

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

`exit=0`. Structure identical to both earlier runs — same column lists, same row
counts, `valid UTF-8 yes` and `ragged rows 0` on every file, exactly two
`Episodios_*.csv`, `STANDIN-attachments.zip` 22 entries / 1413 bytes. The sha256
block is reproduced in the header above and matches byte for byte, which is what
makes that identity a fact rather than an impression. The full per-column
fill-rate output is in [`REHEARSAL-2026-08-26.md`](./REHEARSAL-2026-08-26.md) §2
and is not repeated.

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
  … 12 more `missing` lines, identical to 2026-08-27 …
NOTHING WAS STAGED. A partial mapping does not crash - it imports a
fraction of the diary and reports success over the rest.
exit=1
```

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
  elapsed    3s
exit=0

objects under <tenantId>/migration/fisiozero/  22
exit=0
```

`uploaded 22` = `objects 22`, read back from the live bucket — `MIG-02`'s close
condition, holding on a third independent run.

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

STAGED     2001   2.9s   692.9 rows/s
VALIDATED  2001   FAILED 0   1.8s   1113.5 rows/s

PREVIEW - staged and validated only. NO TARGET TABLE WAS WRITTEN.
To run for real: --apply --confirm "IMPORT FISIOZERO INTO PRODUCTION"
exit=0
```

**The two new timing figures are the whole of `MIG-09`'s visible surface.** Every
other number is identical to both earlier runs, including `to_review 109` and
`DAY-ONE LOGIN 512` — the adapter and the validation logic were not touched, and
this is the check that says so.

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

STAGED     2001   2.9s   693.6 rows/s
VALIDATED  2001   FAILED 0   1.9s   1049.8 rows/s

IMPORTED  patient             1000   skipped     0   failed    0   69.0s   14.5 rows/s
IMPORTED  clinical_episode      44   skipped     0   failed    0   1.1s   38.4 rows/s
IMPORTED  appointment          891   skipped     0   failed    0   3.5s   251.9 rows/s
IMPORTED  clinical_record       44   skipped     0   failed    0   1.3s   34.0 rows/s
IMPORTED  attachment            22   skipped     0   failed    0   1.1s   20.0 rows/s
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

TOTAL WALL CLOCK (whole command): 84s
```

**IMPORTED 1000 / 44 / 891 / 44 / 22, failed 0, integrity OK, fidelity OK over
882 — every count identical to both earlier rehearsals.** `SKIPPED 0`, because
this was a clean tenant.

**NO CHUNK FELL BACK, in either the import or the validate phase.** A fallback
would show as ordinary per-row work and as time; `failed 0` everywhere and the
rates above say every chunk committed on its first attempt.

**Acceptance was "under 2 minutes total". It is 84 seconds.**

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
appointments, in the diary, with a null `service_id`, as on both earlier runs.

### §7.3 Idempotency

```
STAGED     2001   3.1s   650.5 rows/s
VALIDATED  2001   FAILED 0   0.6s   3097.5 rows/s

IMPORTED  patient                0   skipped  1000   failed    0   0.6s   1626.0 rows/s
IMPORTED  clinical_episode       0   skipped    44   failed    0   0.7s   60.9 rows/s
IMPORTED  appointment            0   skipped   891   failed    0   0.8s   1125.0 rows/s
IMPORTED  clinical_record        0   skipped    44   failed    0   0.9s   50.5 rows/s
IMPORTED  attachment             0   skipped    22   failed    0   0.7s   33.0 rows/s
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

TOTAL WALL CLOCK: 10s
```

**`IMPORTED 0` on every entity, `SKIPPED 2001`, exit 0.** Batching the ledger
writes did not cost idempotency.

**`VALIDATED … 0.6s` against `2.9s` for the stage that preceded it** is worth
reading: on a re-run every row is already `imported`, so the validate phase finds
**nothing** in `pending` and issues no transition statement at all. That is the
guard from the very first rehearsal still doing its job — marking blindly would
turn the second apply into a crash instead of the no-op it is supposed to prove.

### §8 The reset

```
$ assert-not-prod.ts                      exit=0

BEFORE (query 4):
  staging_rows 2001 · patients 1000 · appointments 891 · attachments 22
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

Both triggers read `O` after the commit. The rehearsal project is back to
reference data only.

---

## What three rehearsals still do not prove

`REHEARSAL.md` §10 in full. What remains, stated against what is now known:

- **Scale.** 2001 rows in 84s says nothing certain about 8,000–10,000 patients
  plus a decade of appointments. Two things in this run do not scale linearly:
  the **unnumbered-patient proportion** (118 of 1000 here, and they are ~59s of
  the 69.0s patient phase) and the **65535-parameter ceiling** that `MIG-09`'s
  chunking now keeps the staging `INSERT` clear of. Budget from the production §6
  preview.
- **The two clinics together.** One run uses one `location.locationKey`. Two
  exports means two runs, and the second against the same tenant is a case no
  rehearsal has covered.
- **`patient_number` collisions against real numbers.** The rehearsal project's
  patients were seeded dev rows, removed before the import. The real check is
  `scripts/import/preflight-patient-numbers.sql`, against production, before
  import day, and only the owner can run it.
- **Neither fallback path has fired on a real delivery.** The import chunk
  fallback and the validate chunk fallback are both covered by DB-gated tests —
  `packages/db/tests/migration-batch-import.test.ts` and
  `migration-batch-staging.test.ts` — but no rehearsal has produced a failing row
  to exercise them end to end, because nothing has failed.
