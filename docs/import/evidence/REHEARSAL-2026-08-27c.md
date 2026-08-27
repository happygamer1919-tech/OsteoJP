# Fisiozero import — the rehearsal, re-run to prove the cleanup guard

**This file is EVIDENCE, not a runbook.** The runbook is `docs/import/REHEARSAL.md`
and it is the thing that was executed. What follows is the transcript that
executing it produced, pasted verbatim, with every exit code including the zeros.

**It exists to answer one question, and it is not about speed.** `MIG-08` and
`MIG-09` made the import fast; this run proves the thing that stops it deleting
a patient nobody meant to delete. `cleanup-test-patients.sql` no longer carries a
hardcoded patient count, and **STEP 2 now refuses two different ways**. Both
refusals were provoked deliberately, on live data, before the real run.

The three earlier rehearsals are [2026-08-26](./REHEARSAL-2026-08-26.md)
(`MIG-02`, `MIG-03`, `MIG-04`), [2026-08-27](./REHEARSAL-2026-08-27.md)
(`MIG-08`) and [2026-08-27b](./REHEARSAL-2026-08-27b.md) (`MIG-09`).

**NOTHING HERE MAY BE EDITED TO READ BETTER.** The one liberty taken is the one
the blind rule requires: attachment filenames and storage object names are
counted, never listed — see `REHEARSAL.md` §0.1.

---

## Header

| | |
|---|---|
| **Date executed** | 2026-08-27 (Europe/Lisbon), third run of the day |
| **Executed by** | PURPLE, terminal, under CLAUDE.md *Exemption, ruled 2026-08-26* |
| **Repository SHA** | `b191dde2e42a62ce14e65e5c26984179f0642e29` on `main` (PR #1054) |
| **Previous rehearsals** | `76dd93a2` · `5ebbacf3` · `6909bf0c` |
| **Target project** | `djflfnnjvkbwnsgqwawj` — **non-production**, EU |
| **Production refs** | `dfotoodqvmjhbdcxyaxf` (live), `jaxmkwoxjcgzkwxgbayx` (retired). **Neither was reachable from the shell that ran this**, proven by `assert-not-prod.ts` before every phase |
| **Delivery** | the August 2026 **amostra**, vendor-confirmed synthetic test data |
| **Tenant** | `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560` — the fixed seed constant |

### The delivery, by sha256 — identical across all four rehearsals

```
12dd4f0771814fb282ecd7fa000d0c0ddefb59cbbc8a4041659cbbfd63c5248e  Episodios_Fisioterapia.csv
471b2241af11a52400e196e9587207e4f1febfa66d53ff1052dfb986011dcbb9  Episodios_Osteopatia.csv
a7b1fa5db50657199b4f7b4f83263a50813fc714ad0e96dbe608709ec5171a53  STANDIN-attachments.zip
4429974cd44f05914a7e900298f33e7b4d44be0f530ccd5eac609d858f444fe8  documentos.csv
eb98375a71ac9b98c5ff9646e3bea11c792330d45ae3dccf8d97df72deb02d83  marcacoes.csv
d7097b26b97598036fb67a4cea8d5d8c3f9f0e73ac92f400960f641c4e0ff6ea  pacientes.csv
```

---

## What this run is for: the guard, provoked twice

**33 WENT STALE.** `cleanup-test-patients.sql` said *"production holds 33
patients numbered 1–35"* from 2026-08-25. On **2026-08-27 production held 35**,
numbered **1 and 3–36**, newest created **2026-08-26 — the day before**. A
hardcoded expectation that is behind reads as a verified fact right up to the
moment it authorises deleting a row nobody meant to delete.

The count is now `app.expected_patients`, set by the owner on the day, **with no
default**. Both refusal paths were provoked on this run, against a live database
holding 50 seeded patients.

### Refusal 1 — unset. Provoked deliberately, first.

```
########## STEP 2, DELIBERATELY UNSET — expect a REFUSAL ##########
  [app.expected_patients = (unset)]
STEP 2 REFUSED: P0001 EXPECTED_PATIENTS is not set. Read STEP 1's `patients` count, confirm with the clinic that none of those rows is a real patient, and set `app.expected_patients` at the top of STEP 2. Nothing was deleted.
exit=1
```

**And the table was untouched**, re-read immediately after:

```
########## THE TABLE AFTER THE REFUSAL ##########
  patients                           50
  distinct_patient_numbers           50
  min_patient_number                 1
  max_patient_number                 50
  newest_created_at                  Thu Aug 27 2026 12:08:29
  ai_ingestion_requests              0
```

### Refusal 2 — a number that disagrees with the live count

**This is the case the guard actually exists for**, and it was provoked too even
though only the first was asked for. A row appearing between STEP 1 and the
transaction is the failure mode; an unset variable is only the beginner's one.

```
########## STEP 2 with a WRONG number (49) — expect a REFUSAL ##########
  [app.expected_patients = '49']
STEP 2 REFUSED: P0001 EXPECTED_PATIENTS is 49 but the tenant holds 50 patient(s). A row appeared or disappeared since STEP 1, or the number is a typo. Find out which before changing it. Nothing was deleted.
exit=1
```

**The guard re-counts INSIDE the transaction.** It does not trust STEP 1's
number, which is already stale by the time anyone reads it.

### Then, with the right number

```
########## STEP 2 with 50 — expect a COMMIT ##########
  [app.expected_patients = '50']
  COMMIT     0
STEP 2 COMMITTED
exit=0
```

### And `newest_created_at`, new in STEP 1

```
  patients                           50
  distinct_patient_numbers           50
  min_patient_number                 1
  max_patient_number                 50
  newest_created_at                  Thu Aug 27 2026 12:08:29
```

**A count cannot distinguish 50 seeded rows from 49 seeded plus one somebody
created this morning. This can.** On production it read `2026-08-26` — the day
before the owner confirmed the set — which is exactly the pattern the column
exists to surface.

---

## §9 — the transcript

### §1.1 The project

```
$ pnpm --filter @osteojp/db exec node scripts/check-pending-migrations.mjs 0
pending:                             0

OK: the pending set is exactly what was expected.
exit=0

$ SEED_DEV_CONFIRM=djflfnnjvkbwnsgqwawj pnpm --filter @osteojp/db seed:dev
exit=0
```

#### `cleanup-test-patients.sql`, verbatim from disk

```
----- STEP 1 -----
  patients                           50
  distinct_patient_numbers           50
  min_patient_number                 1
  max_patient_number                 50
  newest_created_at                  Thu Aug 27 2026 12:08:29
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

STEP 2  — refused unset, refused at 49, committed at 50. See above.

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
objects under <tenantId>/migration/fisiozero/  0
exit=0
```

### §1.3 The guard

```
  set  DATABASE_URL         ref=djflfnnjvkbwnsgqwawj
  set  SUPABASE_URL         ref=(not a postgres connection string)

OK - no checked variable names a production ref.
exit=0
```

### §2 The probe

`exit=0`. Structure identical to all three earlier runs; the sha256 block is in
the header above and matches byte for byte. The full per-column fill-rate output
is in [`REHEARSAL-2026-08-26.md`](./REHEARSAL-2026-08-26.md) §2.

### §3 The delivery conformance check

```
  note  pacientes.csv: 1000 row(s), 1000 distinct id_paciente
  note  marcacoes.csv: 1000 row(s)
  note  documentos.csv: 22 row(s)
  note  Episodios_Fisioterapia.csv: 30 row(s)
  note  Episodios_Osteopatia.csv: 14 row(s)
  note  estado seen: marcada=111  realizada=865  falta=24
  note  zip: 22 file entr(ies), 22 referenced name(s)

ACCEPTED - no conformance failure found.
exit=0
```

### §4.3 / §4.4

```
.gitignore:68:**/mapping-config.local.json	scripts/import/mapping-config.local.json
exit=0
OUTSIDE the repo - ok

§4.4  the unfilled template is REFUSED, exit=1
```

### §5 The byte copy

```
ATTACHMENT MAPPING WRITTEN
  entries    22
exit=0

ATTACHMENT BYTE COPY
====================
  uploaded   22 · skipped 0 · conflicts 0 · failures 0 · bytes 1413 · 2s
exit=0
objects under <tenantId>/migration/fisiozero/  22
exit=0

§5.3  uploaded 0 · skipped 22 · conflicts 0 · failures 0
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

STAGED     2001   2.7s   730.8 rows/s
VALIDATED  2001   FAILED 0   1.9s   1072.9 rows/s

PREVIEW - staged and validated only. NO TARGET TABLE WAS WRITTEN.
exit=0
```

**THE `Diversos` NOTE IS STILL HERE, AND THAT IS CORRECT.** Owner rulings B and
C (2026-08-27) map `Diversos` and `Consulta` onto production service
`b4f934fa-98e8-4177-ac2f-0fad0ea98f6b` — **a production uuid, which does not
exist in the rehearsal project**. Pointing the rehearsal at it would throw
`unresolved("serviceKey")` on all 61 rows. So the rehearsal keeps its own config
and the note stays; **the prod configs were proved by dry-run instead**, on the
same delivery, with `DATABASE_URL`, `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` all unset — no `TO_NORMALIZE` note, identical
ADAPTER OUTPUT, exit 0.

### §7.1 The live run

```
STAGED     2001   4.1s   491.3 rows/s
VALIDATED  2001   FAILED 0   1.9s   1062.7 rows/s

IMPORTED  patient             1000   skipped     0   failed    0   66.3s   15.1 rows/s
IMPORTED  clinical_episode      44   skipped     0   failed    0   1.1s   40.5 rows/s
IMPORTED  appointment          891   skipped     0   failed    0   3.6s   245.0 rows/s
IMPORTED  clinical_record       44   skipped     0   failed    0   1.3s   35.0 rows/s
IMPORTED  attachment            22   skipped     0   failed    0   1.1s   20.5 rows/s
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

TOTAL WALL CLOCK (whole command): 82s
```

**Every count identical to all three earlier rehearsals.** 82s against 84s on
2026-08-27b — run-to-run noise, and the control that says `MIG-09` was not
disturbed by this change.

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

LEDGER  every entity `imported`, zero failed, TOTAL 2001
exit=0
```

### §7.3 Idempotency

```
STAGED     2001   2.9s   684.1 rows/s
VALIDATED  2001   FAILED 0   0.7s   3073.7 rows/s

IMPORTED  patient                0   skipped  1000   failed    0   0.6s   1587.3 rows/s
IMPORTED  clinical_episode       0   skipped    44   failed    0   0.7s   62.8 rows/s
IMPORTED  appointment            0   skipped   891   failed    0   0.8s   1087.9 rows/s
IMPORTED  clinical_record        0   skipped    44   failed    0   0.9s   48.7 rows/s
IMPORTED  attachment             0   skipped    22   failed    0   0.7s   31.3 rows/s
SKIPPED   2001
exit=0
```

### §8 The reset

**The guard applies here too**, and this is the second live proof that it takes
whatever the real count is rather than a number baked into the file: after the
import the tenant held **1000** patients, not 50.

```
$ assert-not-prod.ts                      exit=0

----- STEP 1 -----
  patients                           1000
  distinct_patient_numbers           1000
  min_patient_number                 1
  max_patient_number                 1118
  newest_created_at                  Thu Aug 27 2026 12:09:53

-- STEP 2, with the live count (1000) --
  [app.expected_patients = '1000']
  COMMIT     0
STEP 2 COMMITTED
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

§8.4  objects removed  22 · objects left 0        exit=0
§8.5  $WORK now holds mapping-config.local.json only

AFTER (query 4):
  staging_rows 0 · patients 0 · appointments 0 · attachments 0
  clinical_episodes 0 · clinical_records 0 · appts_null_service 0 · tgenabled O
exit=0
```

---

## What four rehearsals still do not prove

`REHEARSAL.md` §10 in full. What remains:

- **Scale.** 2001 rows in 82s says nothing certain about 8,000–10,000 patients
  plus a decade of appointments. The unnumbered-patient proportion (118 of 1000
  here, ~59s of the 66.3s patient phase) is the part that does not accelerate.
- **The two clinics together.** One run uses one `location.locationKey`. Two
  exports means two runs, and the second against the same tenant is a case no
  rehearsal has covered.
- **The production service mapping.** Rulings B and C were proved by **dry-run
  only** — `b4f934fa-98e8-4177-ac2f-0fad0ea98f6b` exists in production and
  nowhere a rehearsal can reach. The first time those two labels resolve against
  a real catalogue row is the production §6 preview.
- **The count the guard will actually be given.** It was 35 on 2026-08-27 with
  the newest row a day old. **Sunday's number is not knowable from here**, which
  is the entire reason `PROD-RUN.md` §1.3c now makes reading it, and confirming
  it with Rodica, the first thing that happens.
- **Neither chunk fallback has fired on a real delivery.** Both are covered by
  DB-gated tests; nothing has failed in a rehearsal to exercise them end to end.
