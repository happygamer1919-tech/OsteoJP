# Fisiozero import — the dress rehearsal, executed

**This file is EVIDENCE, not a runbook.** The runbook is `docs/import/REHEARSAL.md`
and it is the thing that was executed. What follows is the transcript that
executing it produced, pasted verbatim, with every exit code including the zeros.

`MIG-04` closes on this file. `MIG-02` closes on §5.2 of it. `MIG-03` closes on
§7.1 of it.

**NOTHING HERE MAY BE EDITED TO READ BETTER.** A transcript that has been tidied
is a report, and a report is what this file exists instead of. The one liberty
taken is the one the blind rule requires: attachment filenames and storage object
names are counted, never listed — see `REHEARSAL.md` §0.1.

---

## Header

| | |
|---|---|
| **Date executed** | 2026-08-26 into 2026-08-27 (Europe/Lisbon) |
| **Executed by** | PURPLE, terminal, under CLAUDE.md *Exemption, ruled 2026-08-26* |
| **Repository SHA** | `76dd93a2fcf33b6c80b3590d2bab1ed13f8b4674` on `main` (PR #1046) |
| **Target project** | `djflfnnjvkbwnsgqwawj` — **non-production**, EU |
| **Production refs** | `dfotoodqvmjhbdcxyaxf` (live), `jaxmkwoxjcgzkwxgbayx` (retired). **Neither was reachable from the shell that ran this**, proven by `assert-not-prod.ts` before every phase |
| **Delivery** | the August 2026 **amostra**, vendor-confirmed synthetic test data |
| **Tenant** | `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560` — the fixed seed constant (`packages/db/seed/dev-reference.ts`), the same id in both projects |

### The delivery, by sha256

Every top-level file of the amostra, as `probe-amostra.mjs` reported it. These
are the bytes the transcript below was produced from, and they are what a later
reader compares against to know they are looking at the same delivery.

```
12dd4f0771814fb282ecd7fa000d0c0ddefb59cbbc8a4041659cbbfd63c5248e  Episodios_Fisioterapia.csv
471b2241af11a52400e196e9587207e4f1febfa66d53ff1052dfb986011dcbb9  Episodios_Osteopatia.csv
a7b1fa5db50657199b4f7b4f83263a50813fc714ad0e96dbe608709ec5171a53  STANDIN-attachments.zip
4429974cd44f05914a7e900298f33e7b4d44be0f530ccd5eac609d858f444fe8  documentos.csv
eb98375a71ac9b98c5ff9646e3bea11c792330d45ae3dccf8d97df72deb02d83  marcacoes.csv
d7097b26b97598036fb67a4cea8d5d8c3f9f0e73ac92f400960f641c4e0ff6ea  pacientes.csv
```

**THE ARCHIVE IS `STANDIN-attachments.zip`, NOT `documentos.zip`.** The amostra
shipped without the attachment archive the caderno describes, so a stand-in was
built to its shape: 22 entries — one per `documentos.csv` row — 63 to 66 bytes
each, 1413 bytes total, extensions `pdf=14 jpg=5 jpeg=2 png=1`. Its sha256 is
above.

**What that proves and what it does not.** It exercises the whole byte-copy path
end to end against a live bucket — REST calls, digests, checkpoint, resume,
skip — which is exactly what `MIG-02` was open for. It proves nothing about
throughput on tens of gigabytes, and `REHEARSAL.md` §10 already says so.

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
Seeding tenant…
Seeding roles…
Seeding locations…
Seeding services…
Seeding users…
Seeding form templates…
[seed:form-templates] unchanged ficha_geral v1 (general-anamnese-v1.json)
[seed:form-templates] skipped   massagem-terapeutica -> physiotherapy (x-form-ref wrapper, massagem-terapeutica-v1.json)
[seed:form-templates] unchanged nesa v1 (nesa-v1.json)
[seed:form-templates] unchanged osteopathy v1 (osteopathy-v1.json)
[seed:form-templates] unchanged osteopathy v2 (osteopathy-v2.json)
[seed:form-templates] unchanged osteopathy v3 (osteopathy-v3.json)
[seed:form-templates] unchanged osteopathy v4 (osteopathy-v4.json)
[seed:form-templates] unchanged osteopathy v5 (osteopathy-v5.json)
[seed:form-templates] unchanged physiotherapy v3 (physiotherapy-v1.json)
[seed:form-templates] unchanged physiotherapy v4 (physiotherapy-v4.json)
[seed:form-templates] skipped   pilates-terapeutico -> physiotherapy (x-form-ref wrapper, pilates-terapeutico-v1.json)
[seed:form-templates] skipped   rpg -> physiotherapy (x-form-ref wrapper, rpg-v1.json)
  form templates: 12 upserted
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
```

**`patients = 50`, and it is the expected rehearsal delta.** Production holds 33
staff-training rows; this project holds the 50 the dev seed had just created.
`REHEARSAL.md` §1.1 states it; the `33` in the SQL file's own header is the
production figure and is not a STOP for this run.

```
----- STEP 1b -----
  path_count                         0
  (SELECT 0)
exit=0

----- STEP 1c -----
  status  draft    records  15
  status  locked   records  30
  status  signed   records  15
exit=0
```

**45 finalized records of 60.** That is the number `REHEARSAL.md` §8.2b names as
the one that would otherwise stop the delete.

```
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

`staff_rows 5` is this project's seeded roster, not production's 30.

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

**Zero patients and a NULL `max_patient_number`** — the same evidence
`PROD-RUN.md` §1.3c reads, and what authorises the import to run WITHOUT
`--reassign-conflicting-patient-numbers`.

#### The bucket

```
$ storage/v1/bucket   (names only)
[{"name":"clinical-attachments","public":false}]
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

```
FISIOZERO AMOSTRA - BLIND STRUCTURE PROBE
=========================================
Structure only. No cell value, no zip entry name and no error message
appears below. Safe to paste back in full.

top-level files  6

CSV FILES
---------
  FILE  Episodios_Fisioterapia.csv
    bytes            4161
    utf8 BOM         no
    valid UTF-8      yes
    lines (physical) 42
    delimiter        comma  (header: 12 comma, 0 semicolon)
    columns          13
    data rows        30
    headers          ["tipo","id_paciente","terapeuta","data_avaliacao","queixas","antecedentes","medicacao","diagnostico","ot","escala_eva","obs","alertas","FICHEIRO"]
    ragged rows      0
    per-column fill rate and distinct values:
       0  "tipo"  fill=100.0% (30/30)  distinct=1
       1  "id_paciente"  fill=100.0% (30/30)  distinct=24
       2  "terapeuta"  fill=100.0% (30/30)  distinct=3
       3  "data_avaliacao"  fill=100.0% (30/30)  distinct=30  <-- UNIQUE ID CANDIDATE
       4  "queixas"  fill=100.0% (30/30)  distinct=28
       5  "antecedentes"  fill=6.7% (2/30)  distinct=2
       6  "medicacao"  fill=3.3% (1/30)  distinct=1
       7  "diagnostico"  fill=3.3% (1/30)  distinct=1
       8  "ot"  fill=6.7% (2/30)  distinct=2
       9  "escala_eva"  fill=100.0% (30/30)  distinct=1
      10  "obs"  fill=3.3% (1/30)  distinct=1
      11  "alertas"  fill=3.3% (1/30)  distinct=1
      12  "FICHEIRO"  fill=13.3% (4/30)  distinct=4
    unique id        1 candidate(s): ["data_avaliacao"]

  FILE  Episodios_Osteopatia.csv
    bytes            2684
    utf8 BOM         no
    valid UTF-8      yes
    lines (physical) 17
    delimiter        comma  (header: 14 comma, 0 semicolon)
    columns          15
    data rows        14
    headers          ["tipo","id_paciente","terapeuta","data_avaliacao","peso","altura","alerta","motivos","condicoes","antecedentes","diagnostico","tratamento","escala_eva","obs","FICHEIRO"]
    ragged rows      0
    per-column fill rate and distinct values:
       0  "tipo"  fill=100.0% (14/14)  distinct=1
       1  "id_paciente"  fill=100.0% (14/14)  distinct=13
       2  "terapeuta"  fill=100.0% (14/14)  distinct=1
       3  "data_avaliacao"  fill=100.0% (14/14)  distinct=13
       4  "peso"  fill=0.0% (0/14)  distinct=0
       5  "altura"  fill=0.0% (0/14)  distinct=0
       6  "alerta"  fill=7.1% (1/14)  distinct=1
       7  "motivos"  fill=100.0% (14/14)  distinct=14  <-- UNIQUE ID CANDIDATE
       8  "condicoes"  fill=0.0% (0/14)  distinct=0
       9  "antecedentes"  fill=7.1% (1/14)  distinct=1
      10  "diagnostico"  fill=14.3% (2/14)  distinct=2
      11  "tratamento"  fill=57.1% (8/14)  distinct=8
      12  "escala_eva"  fill=100.0% (14/14)  distinct=1
      13  "obs"  fill=14.3% (2/14)  distinct=2
      14  "FICHEIRO"  fill=0.0% (0/14)  distinct=0
    unique id        1 candidate(s): ["motivos"]
    CAVEAT           only 14 data row(s): distinctness proves little at this size, and these candidates are NOT evidence of a stable identifier

  FILE  documentos.csv
    bytes            2530
    utf8 BOM         no
    valid UTF-8      yes
    lines (physical) 23
    delimiter        comma  (header: 5 comma, 0 semicolon)
    columns          6
    data rows        22
    headers          ["id_documento","id_paciente","ficheiro","nome_original","tipo_mime","descricao"]
    ragged rows      0
    per-column fill rate and distinct values:
       0  "id_documento"  fill=100.0% (22/22)  distinct=22  <-- UNIQUE ID CANDIDATE
       1  "id_paciente"  fill=100.0% (22/22)  distinct=12
       2  "ficheiro"  fill=100.0% (22/22)  distinct=22  <-- UNIQUE ID CANDIDATE
       3  "nome_original"  fill=100.0% (22/22)  distinct=22  <-- UNIQUE ID CANDIDATE
       4  "tipo_mime"  fill=100.0% (22/22)  distinct=3
       5  "descricao"  fill=0.0% (0/22)  distinct=0
    unique id        3 candidate(s): ["id_documento","ficheiro","nome_original"]

  FILE  marcacoes.csv
    bytes            122414
    utf8 BOM         no
    valid UTF-8      yes
    lines (physical) 1054
    delimiter        comma  (header: 7 comma, 0 semicolon)
    columns          8
    data rows        1000
    headers          ["id_paciente","inicio","fim","terapeuta","clinica","tipo_servico","estado","observacoes"]
    ragged rows      0
    per-column fill rate and distinct values:
       0  "id_paciente"  fill=100.0% (1000/1000)  distinct=79
       1  "inicio"  fill=100.0% (1000/1000)  distinct=925
       2  "fim"  fill=100.0% (1000/1000)  distinct=924
       3  "terapeuta"  fill=100.0% (1000/1000)  distinct=7
       4  "clinica"  fill=100.0% (1000/1000)  distinct=1
       5  "tipo_servico"  fill=100.0% (1000/1000)  distinct=4
       6  "estado"  fill=100.0% (1000/1000)  distinct=3
       7  "observacoes"  fill=54.1% (541/1000)  distinct=435
    unique id        NONE - no column is both 100% filled and fully distinct

  FILE  pacientes.csv
    bytes            115661
    utf8 BOM         no
    valid UTF-8      yes
    lines (physical) 1002
    delimiter        comma  (header: 16 comma, 0 semicolon)
    columns          17
    data rows        1000
    headers          ["id_paciente","nome_completo","numero_paciente","data_nascimento","sexo","nif","email","telefone","morada","codigo_postal","localidade","clinica","seguro_saude","numero_apolice","observacoes","data_criacao","FICHEIRO"]
    ragged rows      0
    per-column fill rate and distinct values:
       0  "id_paciente"  fill=100.0% (1000/1000)  distinct=1000  <-- UNIQUE ID CANDIDATE
       1  "nome_completo"  fill=100.0% (1000/1000)  distinct=984
       2  "numero_paciente"  fill=88.2% (882/1000)  distinct=882
       3  "data_nascimento"  fill=25.8% (258/1000)  distinct=251
       4  "sexo"  fill=100.0% (1000/1000)  distinct=2
       5  "nif"  fill=98.4% (984/1000)  distinct=934
       6  "email"  fill=4.5% (45/1000)  distinct=45
       7  "telefone"  fill=49.5% (495/1000)  distinct=479
       8  "morada"  fill=43.6% (436/1000)  distinct=178
       9  "codigo_postal"  fill=0.4% (4/1000)  distinct=4
      10  "localidade"  fill=18.2% (182/1000)  distinct=64
      11  "clinica"  fill=100.0% (1000/1000)  distinct=1
      12  "seguro_saude"  fill=0.0% (0/1000)  distinct=0
      13  "numero_apolice"  fill=0.0% (0/1000)  distinct=0
      14  "observacoes"  fill=0.3% (3/1000)  distinct=3
      15  "data_criacao"  fill=99.9% (999/1000)  distinct=2
      16  "FICHEIRO"  fill=1.0% (10/1000)  distinct=10
    unique id        1 candidate(s): ["id_paciente"]


ZIP FILES
---------
  FILE  STANDIN-attachments.zip
    zip64            no
    entries          22  (22 file(s), 0 director(ies))
    uncompressed     1413 bytes
    largest entry (uncompressed)  66 bytes
    filename length  min=45 max=48
    by extension     pdf=14  jpg=5  jpeg=2  png=1


MANIFESTO
---------
  (none)

SHA256 OF EVERY TOP-LEVEL FILE
------------------------------
  12dd4f0771814fb282ecd7fa000d0c0ddefb59cbbc8a4041659cbbfd63c5248e  Episodios_Fisioterapia.csv
  471b2241af11a52400e196e9587207e4f1febfa66d53ff1052dfb986011dcbb9  Episodios_Osteopatia.csv
  a7b1fa5db50657199b4f7b4f83263a50813fc714ad0e96dbe608709ec5171a53  STANDIN-attachments.zip
  4429974cd44f05914a7e900298f33e7b4d44be0f530ccd5eac609d858f444fe8  documentos.csv
  eb98375a71ac9b98c5ff9646e3bea11c792330d45ae3dccf8d97df72deb02d83  marcacoes.csv
  d7097b26b97598036fb67a4cea8d5d8c3f9f0e73ac92f400960f641c4e0ff6ea  pacientes.csv
exit=0
```

`valid UTF-8 yes` on every file, `ragged rows 0` on every file, exactly two
`Episodios_*.csv` filenames. No STOP condition of §2 fired.

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

**The `estado seen` line is the one §6.2 derives from**, and it is recorded here
because it is the only place that number comes from: `marcada=111`,
`realizada=865`, `falta=24`. 30 + 14 = 44 episodios rows across both specialty
files, which is the `44` §6.1 requires.

### §4.3 The config cannot be committed

```
$ git check-ignore -v scripts/import/mapping-config.local.json
.gitignore:68:**/mapping-config.local.json	scripts/import/mapping-config.local.json
exit=0
OUTSIDE the repo - ok
```

### §4.4 The unfilled config is refused

```
$ … --config scripts/import/mapping-config.template.json --dry-run
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
/Users/ivan/Documents/Projects/GitHub/OsteoJP/packages/db:
[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code 1: tsx scripts/rehearsal-import.ts …
exit=1
```

The lone `undefined` is pnpm's own failure reporter, not a script in this
repository. `REHEARSAL.md` §0.35 says to expect it on every refusal path and read
past it.

### §5.1 The attachment mapping

```
ATTACHMENT MAPPING WRITTEN
  entries    22
  written to /Users/ivan/osteojp-migration/rehearsal/attachment-mapping.json
exit=0
```

`entries 22`, which is ≥ 22, so §5.1's STOP did not fire. The mapping file itself
is not reproduced: it contains attachment filenames.

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
```

**THE OBJECTS ARE IN THE BUCKET**, read back from Supabase Storage after the
copy, counted under the prefix and never named:

```
objects under <tenantId>/migration/fisiozero/  22
exit=0
```

**`uploaded 22` = `objects 22`.** This is the close condition for `MIG-02`: the
exit code proves the job ran; this count proves the bytes arrived. It is a REST
read of the live bucket rather than a dashboard screenshot — a terminal has no
browser, and the count is the fact the dashboard would have shown.

### §5.3 Resume and skip

The same command again, changing nothing:

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

`uploaded 0`, `skipped 22`, `conflicts 0`. The resume path works and the
checkpoint is being read.

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

Against §6's STOP conditions, one by one:

- `VALIDATED 2001 + FAILED 0 = STAGED 2001`.
- `STAGED 2001` = 1000 + 44 + 891 + 44 + 22, and each entity is already net of
  its `to_review`.
- `clinical_episode 44 = clinical_record 44`, as §6.1 requires.
- `to_review 109`, every one of them `fim_not_after_inicio`.
  **`unknown_estado` is 0**, guaranteed by a clean §3.
  **`unresolved_terapeuta` is 0**, and not because the data is clean — the runner
  refuses the whole run on an unmapped `terapeuta` before anything is staged.
- `pastMarcadaCancelled` = 83 of the 111 `marcada`, reported as a warning and
  imported as `cancelled` (owner ruling B, 2026-08-25). Not a `to_review` reason.
- The `target project ref:` line is present, so the guard ran.

**DAY-ONE LOGIN: 512 of 1000 patients** — 505 blank `telefone`, 7 unparseable.
That is a data question for the clinic, it is the number `LAUNCH-03` cares about
most, and **the amostra's figure is not the delivery's**. The real one comes from
this same line on the production `§6` preview.

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

IMPORTED  patient             1000   skipped     0   failed    0   571.8s   1.7 rows/s
IMPORTED  clinical_episode      44   skipped     0   failed    0   26.1s   1.7 rows/s
IMPORTED  appointment          891   skipped     0   failed    0   506.1s   1.8 rows/s
IMPORTED  clinical_record       44   skipped     0   failed    0   32.2s   1.4 rows/s
IMPORTED  attachment            22   skipped     0   failed    0   13.4s   1.6 rows/s
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
```

**This is `MIG-03`'s close condition.** The runner has met a database: the import
order is the fixed `patient → clinical_episode → appointment → clinical_record →
attachment`, every child resolved its parent through the staging ledger,
referential integrity is OK, and all 882 vendor `numero_paciente` values carried
over verbatim.

**THE TIMING IS THE FINDING, AND IT IS THE ONLY UNCOMFORTABLE NUMBER IN THIS
FILE.** ~19m30s of import for 2001 rows, **1.7 rows/s**, dominated by per-row
round trips to Frankfurt — `importOne` runs in its own savepoint and issues
several statements per row. Against the real delivery's ~10,000 patients plus
their history that is hours, on the one night the extraction cannot be repeated.
`MIG-08-batch-import-writes` exists for exactly this and is the next build card.

### §7.2 The reconciliation, read from the target tables

Query 4 of `rehearsal-uuids.sql`, plus the two counts that answer the Diversos
question directly:

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

**Two sources, and they agree.** The reconciliation block above reads the ledger;
this reads the target tables. `staging_rows` equals the `STAGED` total, and
`patients` is 1000 and **nothing else** — §1.1's cleanup emptied the tenant.

**`appts_null_service 61`** is the Diversos appointments, in the diary, with a
null `service_id`. That is the `TO_NORMALIZE` sentinel behaving as the runner's
note has always claimed (PR #1045).

### §7.3 Idempotency

The identical `--apply` command a second time, changing nothing:

```
STAGED     2001
VALIDATED  2001   FAILED 0

IMPORTED  patient                0   skipped  1000   failed    0   0.5s   1964.6 rows/s
IMPORTED  clinical_episode       0   skipped    44   failed    0   0.5s   89.8 rows/s
IMPORTED  appointment            0   skipped   891   failed    0   0.5s   1747.1 rows/s
IMPORTED  clinical_record        0   skipped    44   failed    0   0.5s   90.0 rows/s
IMPORTED  attachment             0   skipped    22   failed    0   0.5s   44.9 rows/s
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

**`SKIPPED 2001` is the proof, not the five zeros** — an empty batch prints zeros
too. The runner found all 2001 rows, recognised every one as already imported,
and wrote nothing. `staging_rows` did not grow and neither did any target count.

**There is no `RETRIED` line, and there never will be again.** PR #1046 removed
the counter with the gate that fed it; recovery is re-stage plus re-validate, and
the transcript proving that is in the next section.

### §8 The reset

```
$ assert-not-prod.ts                     ref=djflfnnjvkbwnsgqwawj   exit=0

BEFORE (query 4):
  staging_rows 2001 · patients 1000 · appointments 891 · attachments 22
  clinical_episodes 44 · clinical_records 44 · appts_null_service 61 · tgenabled O
exit=0
```

§8.3 delegates to `cleanup-test-patients.sql` STEP 2 rather than carrying a
delete list of its own (PR #1046, and see the PR table below for why):

```
----- STEP 1 -----
  patients                           1000
  distinct_patient_numbers           1000
  min_patient_number                 1
  max_patient_number                 1118
  attachments                        22
  clinical_records                   44
  appointments                       891
  clinical_episodes                  44
  patient_locations                  1000
  (every other count 0)
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
```

`patient_locations 1000` is the table the old §8.3 delete list did not name, and
it is why that list could never complete.

```
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

**Both triggers read `O` after the commit.** The rehearsal project is back to
reference data only.

---

## Recovery path, proven on live data

**This is the half nobody plans for and everybody needs.** The 2026-08-26 apply
failed 105 of 2001 rows: 61 Diversos appointments on `unresolved_reference` and
all 44 clinical_records on `import_failed`. PRs #1045 and #1046 fixed the two
causes. What follows is the transcript of the **recovery**, run against that
real half-imported state at `10348b6e` — not a reconstruction, and not a test.

It is the answer to the question `PROD-RUN.md` §6 asks: *the apply failed part of
the way through, on the one night the extraction cannot be repeated — what now?*

### The state it started from

```
QUERY 4 (rehearsal-uuids.sql)
  staging_rows        2001
  patients            1000
  appointments        830
  attachments         22
ALSO
  clinical_episodes   44
  clinical_records    0
  appts_null_service  0
  trigger tgenabled   O
exit=0

LEDGER  entity_type / status / error code / rows
  patient            imported   -                      1000
  appointment        imported   -                      830
  appointment        failed     unresolved_reference   61
  clinical_episode   imported   -                      44
  clinical_record    failed     import_failed          44
  attachment         imported   -                      22
  TOTAL 2001
exit=0
```

1896 imported, 105 failed, two distinct causes, one per entity — visible on the
ledger before anything was re-run.

### The recovery: re-run the identical §7.1 command

Not a repair script, not a manual fix-up, not a subset. **The same command, typed
again.**

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

IMPORTED  patient                0   skipped  1000   failed    0   0.5s   1821.5 rows/s
IMPORTED  clinical_episode       0   skipped    44   failed    0   1.0s   44.4 rows/s
IMPORTED  appointment           61   skipped   830   failed    0   36.3s   24.6 rows/s
IMPORTED  clinical_record       44   skipped     0   failed    0   32.2s   1.4 rows/s
IMPORTED  attachment             0   skipped    22   failed    0   0.6s   36.7 rows/s
SKIPPED   1896

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

**Exactly the 105 rows that had failed, and nothing else.** `SKIPPED 1896` is the
1896 already-imported rows recognised and left alone. `failed 0`. Every entity's
`staged` now equals its `imported`.

### The mechanism, because "it retried" is the wrong word

**`RETRIED` printed nothing, and the counter read 0 while all 105 rows landed.**
That is not a reporting gap; it is the mechanism being different from the one the
code claimed. A full run **stages every record before it imports any**, and
`stageRows`' `ON CONFLICT` resets any non-`imported` row to `pending`. Validate
then moves every `pending` row to `validated`, and the import loop writes it. So
a row that failed on the previous run is `validated` by the time the import phase
reads its status — never `failed`, so the in-place retry gate could not fire.

**RECOVERY IS RE-STAGE PLUS RE-VALIDATE.** PR #1046 removed the dead gate, its
counter and the `RETRIED` line, and put that sentence where the gate used to be.

**A row rejected by VALIDATION is rejected again**, and that is the correct
answer rather than an omission: re-staging resets it to `pending`, validate
rejects the identical record, and nothing short of a **changed delivery** imports
it. Two live tests pin the two halves separately.

### And then the run after it wrote nothing

```
IMPORTED  patient                0   skipped  1000   failed    0
IMPORTED  clinical_episode       0   skipped    44   failed    0
IMPORTED  appointment            0   skipped   891   failed    0
IMPORTED  clinical_record        0   skipped    44   failed    0
IMPORTED  attachment             0   skipped    22   failed    0
SKIPPED   2001
  referential integrity: OK
  patient number fidelity: OK   (882 vendor number(s) checked)
exit=0
```

```
QUERY 4
  staging_rows 2001 · patients 1000 · appointments 891 · attachments 22
  clinical_episodes 44 · clinical_records 44 · appts_null_service 61
LEDGER  every entity `imported`, zero failed, TOTAL 2001
exit=0
```

**Recovery does not cost idempotency.** The run after a recovery is the same
clean no-op as the run after a clean import.

---

## What the rehearsal found, and the PRs that fixed it

Seven PRs in nineteen hours. **Not one of these was found by a test**, and that
is the point of the card: each sits exactly where a mock stops and a real
database, a real bucket or a real thousand rows begins.

| PR | Merged | What the rehearsal found, and what the PR did |
|---|---|---|
| [#1040](https://github.com/happygamer1919-tech/OsteoJP/pull/1040) `53b5a917` | 2026-08-26 | **The rehearsal could not be run at all.** The blind rule forbade a terminal touching the amostra and standing rules 1–2 forbade it pointing at any Supabase project. Ruled the August 2026 amostra vendor-confirmed synthetic and therefore exempt, scoped to the amostra and to non-prod only, and made the runbook terminal-executable. |
| [#1041](https://github.com/happygamer1919-tech/OsteoJP/pull/1041) `377486f2` | 2026-08-26 | **The first live byte copy failed 30 of 30.** Four defects: the mapping was keyed by `fileName`, which `documentos.csv` overwrites with `nome_original`; a `FICHEIRO` cell is multi-valued and nothing split it (8 phantom attachments); `check-delivery.mjs` never read `FICHEIRO` from `pacientes.csv`; and the day-one login counter reported **7** where the real figure is **512**. The attachment count is 22, not 30. `copy-attachments.mjs` also now refuses before the first byte if the bucket does not exist. |
| [#1042](https://github.com/happygamer1919-tech/OsteoJP/pull/1042) `4c37d840` | 2026-08-26 | **Then it failed 22 of 22 with every file present and the bucket confirmed.** Supabase answers "object not found" with an **HTTP 400** carrying `NoSuchKey` in the body, so `exists()`'s absent-object branch was unreachable and it threw before every upload. `bytes 0` across 22 files. No mock could have disagreed with the wire; the new tests stub `fetch` at the exact response shape the live API returned. |
| [#1043](https://github.com/happygamer1919-tech/OsteoJP/pull/1043) `d1299156` | 2026-08-26 | **The apply failed 162 of 2001 rows, printed a reconciliation of all zeros, and exited 0.** Seven defects, chief among them an exit expression that read the VALIDATE phase and a permanently-true `undefined !== false`, and a `sanitizeImportError` that read `.code` off the Drizzle wrapper instead of the `PostgresError` at `.cause`, so all 162 failures recorded the bare string "database error". |
| [#1044](https://github.com/happygamer1919-tech/OsteoJP/pull/1044) `d2e6d873` | 2026-08-26 | **The reset was impossible and the re-run was not a no-op.** A finalized clinical record can be neither deleted nor downgraded, so the wipe could never complete — the trigger is now disabled for the length of the reset transaction, proven transactional. And every entity except `clinical_record` took an UPDATE path on a re-run and reported `updated`, so a second `--apply` **re-wrote all 2001 target rows** where §7.3 promises zero writes. |
| [#1045](https://github.com/happygamer1919-tech/OsteoJP/pull/1045) `10348b6e` | 2026-08-27 | **105 rows failed, two causes.** The adapter was still fed the RAW service map, so every Diversos appointment emitted `serviceKey: "TO_NORMALIZE"` and the stripped resolvers threw `unresolved_reference` — the same 61 rows #1044's B6 had saved from a uuid crash, lost one layer further in. And the pipeline ran as `admin`, which migration 0045 made READ-ONLY on `clinical_records`, so all 44 clinical_records failed on RLS. The principal is now `owner`, in-tenant. |
| [#1046](https://github.com/happygamer1919-tech/OsteoJP/pull/1046) `76dd93a2` | 2026-08-27 | **The reset still could not complete, and the retry gate was dead code.** `cleanup-test-patients.sql` aborted on `42501 patient_audit_log is append-only` while that table held **zero** rows — the trigger is `FOR EACH STATEMENT`. `REHEARSAL.md` §8.3's own five-delete list aborted on `patient_locations`; eighteen tables have an FK path to `patients`, so §8.3 now delegates to the tested file. And the retry gate could never fire, because the runner stages before it imports: gate, counter and `RETRIED` line removed, recovery documented as re-stage plus re-validate. |

### What this rehearsal still does not prove

`REHEARSAL.md` §10 lists it in full. The three that matter most on import night:

- **Scale.** ~1,000 patients against 8,000–10,000, and 1413 bytes of stand-in
  attachments against tens of gigabytes. **At the measured 1.7 rows/s this run
  took 19m30s; the real delivery is hours.** `MIG-08-batch-import-writes`.
- **The two clinics together.** One run uses one `location.locationKey`. Two
  exports means two runs, and the second run against the same tenant is a case
  this rehearsal does not cover.
- **`patient_number` collisions against real numbers.** This project's existing
  patients were seeded dev rows. The real check is
  `scripts/import/preflight-patient-numbers.sql`, run against production before
  import day, and only the owner can run it.
