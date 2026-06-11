# Migration Notes — Fisiozero → OsteoJP

**Maintained by:** Max — append-only. Never delete entries. Update as batches run.  
**Sources:** Fisiozero (primary), Stylus.pt (scheduling), manual clinic records  
**Target:** OsteoJP platform (Supabase EU Frankfurt, tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`)  
**Phase:** 5 — explicitly deprioritised. This file is a preparation stub.

---

## Status

| Location | Patients | Appointments | Clinical records | Status |
|---|---|---|---|---|
| Linda-a-Velha | — | — | — | Not started |
| Castelo Branco | — | — | — | Not started |

---

## Known edge cases

### Duplicate patients
Fisiozero does not enforce uniqueness on patient name + date of birth. Duplicates exist — same person registered multiple times across locations or by different receptionists. Resolution: use the `merge_patient` function in the staff platform. Do not delete records.

### Missing fields
Several Fisiozero patient records have incomplete mandatory fields (NIF, date of birth). These must be resolved with JP or the patient before the record can be considered complete in OsteoJP. Flag these in the reconciliation report.

### Orphan appointments
Appointments in Fisiozero that reference deleted or merged patients. These will fail the importer's foreign key check. Resolution: create a placeholder patient record marked `migrated_orphan = true` and attach the appointment to it for audit purposes.

### Clinical record attachments
Fisiozero stores attachments as file paths on a local server — not in cloud storage. These must be manually downloaded and re-uploaded to Supabase Storage before the clinical record is considered fully migrated. Volume is unknown until scraping runs.

### Therapy type mapping
Fisiozero uses free-text event types. The importer must map these to OsteoJP service IDs. Known mappings:

| Fisiozero event type | OsteoJP service |
|---|---|
| Osteopatia | osteopatia |
| Fisioterapia | fisioterapia |
| RPG | rpg |
| Massagem / Massagem Terapêutica | massagem-terapeutica |
| Pilates / Pilates Terapêutico | pilates-terapeutico |
| NESA | nesa |
| (unknown / blank) | Flag for manual review |

### Stylus.pt scheduling data
Stylus.pt is the current scheduling tool for some appointment types. It does not export a structured API — data must be scraped. Scope and volume unknown until Phase 5 begins.

---

## Migration batch log

> Append each batch here as it runs. Format: date, batch ID, record counts, anomalies found.

*(No batches run yet — Phase 5 not started.)*

---

## Reconciliation sign-off procedure

1. Max runs spot-check against random patient sample (10% of batch)
2. Max documents findings in this file under the batch entry
3. Max briefs JP on anomalies requiring clinical judgment
4. JP reviews and signs off batch
5. Max marks batch as accepted and updates the status table above

---

## Open questions for Phase 5

- What is the total patient record count in Fisiozero across both locations?
- Are historical clinical records (pre-2020) in scope for migration or archive-only?
- What is the cutover date? (Affects which records need full migration vs read-only archive)
- Does Stylus.pt have an export function or does it require scraping?
- Who at the clinic owns the Fisiozero server credentials for scraper access?
