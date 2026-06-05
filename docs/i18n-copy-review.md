# i18n Copy Review — PT + EN

**Reviewed:** `packages/i18n/src/strings.pt.json` + `strings.en.json`
**Reviewer:** Max
**Date:** 2026-06-01
**Status:** Findings below — fixes applied directly to the strings files in this PR.

---

## Summary

Overall quality is good. PT is natural clinical Portuguese throughout. EN is clean. 14 issues found across both files: 4 corrections, 5 consistency improvements, 3 tone/register issues, 2 missing keys.

---

## Issues

### PT corrections

**PT-01 — `clinicalRecord.treatmentObjectives`: typo**
- Current: `"Objectivos"`
- Fix: `"Objetivos"` — the spelling *Objectivos* is pre-AO90 (old orthographic agreement). AO90 removed the silent *c*. The platform should use post-AO90 throughout.

**PT-02 — `patients.mergedBadge`: wrong word**
- Current: `"Unido"`
- Fix: `"Fundido"` — *Unido* means "united" in a general sense. In a clinical patient-record context, *Fundido* (merged/fused) is the correct term for a duplicate merge. Receptionists will understand *fundido* immediately; *unido* is ambiguous.

**PT-03 — `patients.merge`: inconsistent with badge**
- Current: `"Unir duplicado"`
- Fix: `"Fundir duplicado"` — follows from PT-02. Action label must match badge label.

**PT-04 — `patients.mergeSubmit`: inconsistent**
- Current: `"Unir neste utente"`
- Fix: `"Fundir neste utente"` — follows from PT-02/PT-03.

---

### EN corrections

**EN-01 — `clinicalRecord.cidCodes`: do not translate**
- Current: `"CID Codes"`
- Fix: `"ICD Codes"` — CID is the Portuguese acronym (Classificação Internacional de Doenças). The EN interface should use ICD (International Classification of Diseases), which is what EN-speaking practitioners know. The PT file correctly keeps *CID*; the EN file should use *ICD*.

**EN-02 — `patients.fieldSex`: ambiguous**
- Current: `"Sex"`
- Fix: `"Biological sex"` — in a clinical context, "Sex" alone is ambiguous (could be read as gender). "Biological sex" is the standard clinical EN term for this field. PT *Sexo* is correct as-is.

**EN-03 — `admin.settings.nif`: good but add context**
- Current: `"Tax ID (NIF)"`
- Keep as-is — this is correct. Flagging as reviewed and approved.

---

### Tone / register issues

**TONE-01 — `clinical.signLockConfirm`: too abrupt in PT**
- Current: `"Assinar bloqueia a ficha de forma definitiva. Continuar?"`
- Fix: `"Ao assinar, a ficha fica bloqueada de forma permanente e não poderá ser alterada. Deseja continuar?"` — the current version reads like a system message. A clinician signing a record is a significant act; the confirmation should be a complete sentence that matches the gravity.

**TONE-02 — `admin.staff.tempPasswordNotice`: EN is slightly informal**
- Current: `"Temporary password — deliver it to the new user over a secure channel:"`
- Fix: `"Temporary password — share it with the new staff member via a secure channel:"` — *deliver* sounds like a package; *share* is more natural for credentials. *new user* → *new staff member* is more precise in this context.

**TONE-03 — `appointment.deleteHint`: EN phrasing**
- Current: `"Appointments are never deleted — only cancelled."`
- Fix: `"Appointments are never permanently deleted — only cancelled."` — *never deleted* alone could be misread. *never permanently deleted* is clearer and matches the soft-delete behavior.

---

### Consistency issues

**CON-01 — `patients.noPayments` vs `patients.noUpcoming` vs `patients.noEpisodes`: inconsistent pattern**
- `noUpcoming`: `"Sem marcações futuras."` ✓
- `noEpisodes`: `"Sem episódios registados."` ✓
- `noPayments`: `"Sem pendentes."` ✗ — grammatically incomplete. Missing noun.
- Fix PT: `"Sem pagamentos pendentes."`
- Fix EN: current is `"Nothing pending."` → fix to `"No pending payments."`

**CON-02 — `agenda.newAppointment` vs `patients.newAppointment`: identical strings, different contexts**
- Both PT: `"Nova Marcação"` — OK, intentional.
- EN `agenda.newAppointment`: `"New Appointment"` ✓
- EN `patients.newAppointment`: `"New Appointment"` ✓
- No fix needed. Flagged as reviewed.

**CON-03 — `clinical.statusLocked` capitalisation in PT**
- PT: `"Bloqueada"` — correct, feminine to agree with *ficha* (feminine noun). ✓
- EN: `"Locked"` ✓
- No fix needed. Flagged as reviewed.

**CON-04 — `invoicing.totalPaid` / `totalPending` / `totalOverdue` duplicate status labels**
- These duplicate `invoicing.statusPaid` / `statusPending` / `statusOverdue`. They may be intentional (column header vs summary label) but worth flagging to Ivan — if they render in different contexts with different capitalisation needs, they should stay separate. If not, consolidate.
- No fix now — flag for lead.

---

### Missing keys

**MISS-01 — No `nav.clinical` key**
- The nav bar has a Clinical Records section (Stream C shipped) but there's no `nav.clinical` i18n key. If the nav link is hardcoded, it will break EN support.
- Add: PT `"Fichas Clínicas"`, EN `"Clinical Records"`

**MISS-02 — No `nav.admin` key**
- Same issue for the Admin nav link.
- Add: PT `"Administração"`, EN `"Administration"`

---

## Changes in this PR

Applied directly:

| Key | File | Change |
|-----|------|--------|
| `clinicalRecord.treatmentObjectives` | PT | `Objectivos` → `Objetivos` |
| `patients.mergedBadge` | PT | `Unido` → `Fundido` |
| `patients.merge` | PT | `Unir duplicado` → `Fundir duplicado` |
| `patients.mergeSubmit` | PT | `Unir neste utente` → `Fundir neste utente` |
| `clinicalRecord.cidCodes` | EN | `CID Codes` → `ICD Codes` |
| `patients.fieldSex` | EN | `Sex` → `Biological sex` |
| `clinical.signLockConfirm` | PT | rewritten (see TONE-01) |
| `admin.staff.tempPasswordNotice` | EN | `deliver` → `share`, `new user` → `new staff member` |
| `appointment.deleteHint` | EN | added `permanently` |
| `patients.noPayments` | PT + EN | added missing noun |
| `nav.clinical` | PT + EN | added missing key |
| `nav.admin` | PT + EN | added missing key |

Not applied (needs lead/owner decision):
- `invoicing.totalPaid/Pending/Overdue` deduplication (CON-04)
- `patients.fieldSex` EN — confirm `"Biological sex"` is acceptable to the owner clinically
