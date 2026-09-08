# Fisiozero migration record, August to September 2026

Status: COMPLETE. Both clinics live.
Last updated: 2026-09-07.

This document is the durable record of the Fisiozero migration. It exists because
the account of what happened lived only in chat sessions, and three separate times
during the CB import a handoff note was found to disagree with production. Where
this document and the database disagree, THE DATABASE IS RIGHT. Re-derive before
relying on any number here.

---

## 1. Final state on production

Verified 2026-09-07 by direct query.

| table | count |
|---|---|
| patients | 16426 |
| appointments | 88718 |
| clinical_episodes | 5635 |
| clinical_records | 5640 |
| attachments | 1104 |
| appointment_notes | 43399 |
| patient_locations, CB | 8005 |
| max patient_number | 16428 |
| migration_staging_rows | 117314 |

Of the patient total, 16405 arrived from the vendor and 21 were created live since
launch. Referential integrity is clean.

Ten ledger rows are permanently failed: patient 221754 plus its 1 episode, 1
clinical record and 7 appointments. Cause was a codigo_postal of 17 characters
against a varchar(16) column, on the LV run of 2026-08-30. JP ruled: leave it,
recreate by hand. STILL OUTSTANDING.

Consequence: every future reconciliation run exits 1 naming those ten rows. THAT
EXIT 1 IS NOT A FAILURE. Read the per-entity lines instead.

---

## 2. Timeline

**2026-08-30, Linda-a-Velha imported.** 8401 patients delivered, 1 failed.

**2026-09-01, platform launched** with LV data only.

**2026-09-06, Castelo Branco imported.** 8005 patients, 47110 appointments, 1653
episode rows, 853 documents. sha256 recorded on delivery. Zero codigo_postal over
16 characters.

**2026-09-07 morning, CB reported missing patients and missing history.** The
first claim was false, the second was true. See section 4.

**2026-09-07, appointment recovery.** 6372 previously withheld CB appointments
imported via a derived delivery. See section 3.

**2026-09-07, notes backfill.** 43366 rows moved into appointment_notes. See
section 5.

**2026-09-07 evening, health insurance backfill.** 275 patients. See section 6.

---

## 3. The derived-delivery recovery method

This is the most reusable thing in this document. It recovers withheld rows
without touching frozen import code.

The problem: 6374 CB appointments were withheld by the adapter because their end
time was not after their start time, or their status was unrecognised. The
adapter is frozen and must not be edited at runtime.

The method: build a NEW delivery directory that is a byte-for-byte copy of the
original, except for the single CSV holding the offending rows, which is rewritten
ONLY on those rows.

At `/Users/ivan/osteojp-migration/cb-recovery/`, marcacoes.csv was rewritten as:

| condition | rows | transform |
|---|---|---|
| fim equals inicio | 3904 | fim = inicio + 45 min |
| fim before inicio | 2432 | fim = inicio + 45 min, all same calendar day |
| estado 'cancelada' | 34 | to 'marcada', which ruling B then imports as cancelled |
| estado 'confirmada' | 15 | to 'realizada' |
| unparseable inicio | 1 | left withheld |

`MANIFEST-transformacoes.csv` records every changed row.

**Why it is safe.** The appointment sourceId derives from id_paciente plus inicio
plus terapeuta. The transform touches none of those three. Already-imported rows
therefore keep their identity and are SKIPPED by the ledger. Withheld rows were
never staged, so they arrive as new.

Result: 0 patients imported and 8005 skipped, 0 episodes and 1650 skipped, 0
records and 1650 skipped, 0 attachments and 853 skipped, 6372 appointments
imported and 40731 skipped. Runtime 19 seconds. No patient renumbered.

**Still available.** 2538 LV appointments remain withheld: 2231 with the time
defect and 307 with an unknown status, worth roughly 800 more notes. LV has not
complained. Ivan ruled: recover only if they report a gap. The method above is
proven and it is a fifteen-minute job.

---

## 4. The two CB complaints, resolved

**"Missing patients" was FALSE.** All 8005 delivered patients imported, zero
failed.

3291 CB patients have zero appointments because FISIOZERO SENT NONE FOR THEM. 3046
of those carry data_criacao in 2020. CB has operated since 2013 and moved onto
Fisiozero in 2020, bulk-loading the patient register WITHOUT the prior appointment
history. The 2013 to 2019 history was never in Fisiozero and is unrecoverable.

LV shows the same pattern at 2021 with a HIGHER zero-appointment share, 47.9
percent against CB's 41.1 percent, which is why LV never complained.

**"Missing history" was TRUE.** 6374 appointments withheld, recovered per section 3.

---

## 5. The notes backfill

CB reported that written history was invisible in the patient record.

Root cause: the import writes to `appointments.notes`. The patient history view at
`apps/web/lib/patients/note-revisions.ts` reads ONLY `appointment_notes`. The
agenda has a legacy fallback at `apps/web/lib/scheduling/data.ts:123`, which is
why notes appeared there and not in history.

Migration 0042 states explicitly: "NO BACKFILL here ... deferred as an owner-gated
step". JP approved the backfill.

An insert-select moved 43366 rows into `appointment_notes` with `author_user_id`
null, `episode_id` null, and `created_at` set to the appointment's `starts_at` so
history reads chronologically. Verified 43381 total at the time, 0 still missing.

`patient_note_revisions` is EMPTY. The other half of 0042's deferred backfill has
nothing to carry and is closed permanently.

---

## 6. Health insurance backfill, 2026-09-07

**Vendor data quality.** Eduardo's first export returned `seguro_saude` and
`numero_apolice` empty on all 16406 rows. His re-export of 2026-09-07 14:55 left
`seguro_saude` empty on every row and populated `numero_apolice` on 301 rows only,
277 CB and 24 LV, as free text mixing insurer and number in one string.

**Coverage was verified, not assumed.** Two independent checks:

- Appointment services. Only 37 distinct CB patients were ever seen under an
  insurance-funded service. The 277 insurance records exceed that sevenfold, so
  the records are not a subset of some larger hidden population.
- Distribution. Populated rows are scattered across the whole file, CB from row
  index 588 to 8001 in all four quarters, LV from 1318 to 8300. A truncated
  export would stop at a boundary. This one does not.

Conclusion: 275 is the true coverage. Nothing further is recoverable from the
vendor for this field. Insurance must be captured at the desk going forward.

**What was loaded.** 278 rows carrying a policy number, parsed into
`patients.health_insurance_numbers`, a jsonb list of `{insurer, number}` added by
migration 0051. Three entries were then cleared because they held a scheme name
and no number. Final state 275 entries across 23 insurer labels.

**The join.** `patients` carries NO vendor id column. The only bridge from a
Fisiozero `id_paciente` to a `patients` row is `migration_staging_rows`, matching
`source_id` where `entity_type` is patient and `status` is imported, giving
`imported_entity_id`.

**Residue, accepted.** 7 entries hold a number with no recoverable scheme name.
One reads `ADRR SOCIO` where `ADRR` was intended. One has the scheme glued to the
number with no separator. 98.9 percent clean; further parser passes were stopped
because each one introduced a new artefact while fixing an old one.

**Open commercial question for JP.** `MONTEPIO` and `MONTEPIO SAUDE` are held as
separate labels. Probably the same scheme. One-line update if he confirms.

---

## 7. Field completeness across the vendor data

Discovered while verifying insurance coverage. Insurance is not the outlier in
this dataset. Several fields are sparsely filled at both clinics.

| field | CB, of 8005 | LV, of 8417 |
|---|---|---|
| nome_completo | 8005 | 8417 |
| telefone | 6386 | 6545 |
| nif | 6226 | 6892 |
| data_nascimento | 5420 | 5340 |
| localidade | 3498 | 398 |
| morada | 2258 | 1953 |
| email | 862 | 1940 |
| numero_apolice | 277 | 24 |
| codigo_postal | 91 | 21 |
| seguro_saude | 0 | 0 |

**Two consequences worth acting on.**

Email reaches 11 percent of CB patients and 23 percent of LV patients. Any feature
assuming email delivery, portal invitations, confirmations, reminders by mail,
addresses at most a quarter of the patient base. SMS is not a preference here, it
is the only channel with reach.

Date of birth is missing on roughly a third of patients at both clinics. The 2288
cross-clinic duplicates pending JP's merge ruling were matched on exact name plus
date of birth, so that match could only run on the two thirds that have one. The
true duplicate count is probably higher than 2288.

---

## 8. Binding rulings

- Rows where the end time is not after the start time are withheld by the adapter.
  LV 2231, CB 6336. JP ruled proceed, then on 2026-09-07 ruled 45 MINUTES as the
  default duration for recovery. He first said 50; the clinic's own data showed 45
  on 14290 rows and he corrected to 45.
- `cancelada` imports as cancelled. `confirmada` imports as concluida/realizada.
  JP, 2026-09-07.
- Nothing maps to `confirmed`. Confirmation means a patient answered a reminder
  OsteoJP sent.
- Past-dated `marcada` imports as CANCELLED. Owner ruling B, 2026-08-25.
- Nine CB service labels mapped, JP option E. Five left unmapped and importing
  with no service: Seguro Medicare 110, Consulta 48, Seguro Multicare 40, Medicina
  fisica reabilitacao 28, Reavaliacao 26, plus 12 blank. 264 rows total.
- 49898 one-minute appointments across both clinics are COSMETIC. Ivan ruled:
  having the appointment on file with correct date, patient and therapist is what
  matters. DO NOT re-raise this as urgent.
- Patient 221754: leave it, recreate by hand. JP option A.
- No runtime change to `fisiozero.ts` or any frozen import path.

---

## 9. Defects found, recorded not fixed

### Code

1. **HIGHEST VALUE FIX.** `prod-import.ts:150` catches errors and prints only
   `(e as Error).name`, discarding message and stack. This made a production apply
   crash undiagnosable: the run died with a bare "FATAL: Error" after the PATIENT
   NUMBERS line, nothing was written, a retry succeeded, and the cause was never
   identified. One-line fix.
2. `fisiozero.ts:752` does NOT refuse on an unmapped terapeuta. It pushes to
   toReview and continues. Three documents claim it refuses: PROD-RUN.md,
   legacy-staff-accounts.sql, distinct-keys.mjs. Combined with defect 3 this would
   have silently discarded 91 percent of CB.
3. `reconciliation.ts:253-256` prints `to_review 0` unconditionally. Read the
   ADAPTER OUTPUT block instead.
4. Duplicate synthetic appointment ids are counted internally and NEVER surface in
   to_review. 4 rows on the first CB run, 6 more exposed by the recovery. Also 3
   episode rows absent from adapter output against the CSV count, unexplained.
5. The importer sinks a patient AND ALL ITS DEPENDENTS on a one-character
   postal_code overflow. This is what cost patient 221754 its 9 related rows.

### Runbook, docs/import/PROD-RUN.md at pinned commit 2a50a14f

6. Section 1.3c-bis "STOP IF ANYTHING STILL COMES BACK" on BLOCK 10 is false on a
   non-empty tenant and is contradicted by `preflight-patient-numbers.sql`'s own
   header.
7. Section 3.3b opens "skip unless BLOCK 13 exited 1" while its next paragraph
   names the preflight as an equally valid trigger.
8. Section 3.3b promises the flag's collision counts on the PREVIEW. Unreachable:
   the preview returns at `run-import.mjs:398`, the flag branch is at 427.
9. BLOCK 13 closes with "may proceed without the flag on this evidence", a false
   all-clear whenever the prior delivery carried blank vendor numbers, which LV did
   on all 8401 rows.
10. BLOCK 19's escape clause for conflicts on the second clinic assumes shared
    patients exist. They did not.
11. `--confirm` appears in `run-import.mjs`'s own "to run for real" hint but is
    REJECTED by `prod-import.ts` with exit 2. The phrase is stdin only.
12. Structurally the runbook assumes both clinics import in one weekend. Blocks 19,
    20 and 21 re-run Linda-a-Velha, which is wrong for a split migration and must
    be skipped.

---

## 10. Practice rules earned the hard way

**Never derive from a derived field when the source is available.** During the
insurance work the insurer was extracted by subtracting the parsed `numero` from
the raw string. `numero` came from a parser already known to be unreliable, so on
ten rows it subtracted the insurer along with the number. MEDICARE became `ME`,
and VITALE, SAFECARE and SERVICOS SOCIAIS vanished entirely. The raw string was
available the whole time.

**A summary count is not verification.** The insurer label list looked clean and
contained an entry whose "policy number" was the text CARTE EUROP. MALADIE. This
is the same failure as defect 3: a summary reporting success while the underlying
rows are wrong. Check the rows.

**Guard clauses make data scripts idempotent.** The insurance UPDATE carried
`where health_insurance_numbers = '[]'::jsonb`. An accidental re-run printed
`UPDATE 0` instead of clobbering rows that had since been corrected. Every
corrective UPDATE should carry a condition that makes a second run a no-op.

**`migration_staging_rows` is the sole surviving link to vendor identifiers.**
`patients` has no vendor id column. Without the ledger the insurance rows could
not have been attached at all, and no future vendor-side correction could be
either. This is a second and harder reason behind the never-delete rule, beyond
resume-versus-duplicate.

**Separate vendor gaps from import failures before telling the clinic anything.**
The CB "missing patients" alarm was a vendor gap from 2013 to 2019 and had nothing
to do with the import.

---

## 11. Environment notes

```
Tenant     3a2d0711-fbdb-4ce9-b940-b6a87e3d3560
Location LV de000002-0000-0000-0000-000000000001
Location CB de000002-0000-0000-0000-000000000002
Prod ref   dfotoodqvmjhbdcxyaxf   (rehearsal is djflfnnjvkbwnsgqwawj, NEVER use)
Bucket     clinical-attachments, private, 50 MB per-upload limit, prefix is the
           tenant uuid, 1103 migration objects
Worktree   /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
```

Standard opener for any terminal work:

```
export REPO=/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
export WORK=/Users/ivan/osteojp-migration/prod
export CBCFG=/Users/ivan/osteojp-migration/prod/mapping-config.CB.json
export LVCFG=/Users/ivan/osteojp-migration/prod/mapping-config.LV.json
cd "$REPO"
set -o allexport
source /Users/ivan/osteojp-secrets/new-prod.env
set +o allexport
```

Import command shape:

```
pnpm --filter @osteojp/db exec tsx scripts/prod-import.ts \
  --delivery "$CB" --config "$CBCFG" \
  --checkpoint "$WORK/checkpoint-cb.jsonl" \
  --reassign-conflicting-patient-numbers \
  --apply
```

Add `--dry-run` for a no-database preview. Omit `--apply` for the staged preview.
The confirmation phrase is TYPED on stdin, never passed as a flag:
`IMPORT FISIOZERO INTO PRODUCTION`

### Traps

- `set -o allexport`, never `set -a`. The short form errors in zsh.
- Quote `--include` for grep as `"--include=*.ts"` or zsh glob-expands it.
- NEVER put `!` inside a double-quoted psql `-c` string in zsh. History expansion
  fires inside double quotes and silently replaces `!~` with a fragment of an
  earlier command. Use `not (expr ~ 'pattern')` instead.
- `pnpm --filter` needs cwd equal to `$REPO`. Variables do not survive a new tab.
- BLOCK 11's guard PASSES when it prints REFUSED with exit 1.
- The Supabase SQL editor returns only the LAST statement's result and defaults to
  a 100-row limit with a "No limit" option. It also silently fails to accept very
  large pastes. For anything over about 100 lines, run the file with
  `psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f FILE` instead.
- Vendor CSV files carry a UTF-8 BOM. Open them as `utf-8-sig` in Python or the
  first column key silently becomes unreachable and reads as empty for every row.
- DO NOT DELETE `migration_staging_rows` on production under any circumstances.

---

## 12. Damage: both original pacientes.csv files were overwritten

Eduardo replaced `pacientes.csv` IN PLACE in Google Drive on 2026-09-07, and the
local originals were downloaded over before anyone noticed. Confirmed by sha256
mismatch. The 29 August and 6 September originals no longer exist in Drive either.
Every other file in both folders keeps its original date.

NOTHING IMPORTED IS AFFECTED. The database holds what the originals contained, the
ledger records it, and cb-recovery was built before the overwrite. `marcacoes.csv`,
both episode files and both `documentos.zip` are intact at their original
timestamps.

WHAT IS LOST: the ability to reproduce the exact patient file that produced the
import. Matters for audit only. The LV appointment recovery still works, because it
reads `marcacoes.csv` and needs `pacientes.csv` only to validate references, and
the new file is a superset.

### Current file layout

```
/Users/ivan/osteojp-migration/prod/          LV delivery, pacientes.csv REMOVED
/Users/ivan/osteojp-migration/cb/            CB delivery, pacientes.csv REMOVED
/Users/ivan/osteojp-migration/cb-recovery/   derived CB delivery plus MANIFEST
/Users/ivan/osteojp-migration/cb-v2/         new CB pacientes.csv, 2026-09-07
/Users/ivan/osteojp-migration/lv-v2/         new LV pacientes.csv, 2026-09-07
/Users/ivan/osteojp-migration/SEGUROS-para-conferir.csv
/Users/ivan/osteojp-migration/SEGUROS-update.sql
/Users/ivan/osteojp-migration/SEGUROS-fix.sql
/Users/ivan/osteojp-migration/cb/CB-reconciliacao-por-paciente.csv
```

sha256 of the new exports:

```
cb-v2  e48a5b6b5c2040d4b513b22a200be8801f05462c556fd942bf636f6d74f1d063
lv-v2  be74643961799010532fb4d1589aa3e42e2bed96fab85ce987f5343ea38aff61
```

---

## 13. Open items

**Awaiting a ruling from JP**

- 2288 people exist as two patient records, one per clinic, matched on exact name
  plus date of birth. Fisiozero issued them different `id_paciente`. Merge or keep.
  Note from section 7: the true count is probably higher, since a third of patients
  have no date of birth to match on.
- `MONTEPIO` versus `MONTEPIO SAUDE` as one label or two.

**Outstanding work**

- Patient 221754 to be recreated by hand: 7 appointments, 1 episode, 1 record.
- Defect 1, the swallowed error message in `prod-import.ts:150`. One line, and it
  should land before the next import run rather than after.
- 2538 LV withheld appointments. On demand only, if LV reports a gap.
- Credential rotation. The database password was exposed in an earlier chat.
- Eduardo acceptance, then vendor-side data deletion confirmation.
- ZZ TESTE portal recreation.
- `REMINDERS_LIVE_SEND` armed by Ivan only.
- Portuguese Twilio mobile number for the SIM/NAO reply flow.

**Closed, do not reopen**

- CB "missing patients": vendor gap, pre-2020, unrecoverable. Explained to the CB
  team.
- Health insurance: 275 records, verified complete against the vendor export.
- 49898 one-minute appointments: cosmetic, ruled.
- `patient_note_revisions` half of migration 0042's deferred backfill: nothing to
  carry.
