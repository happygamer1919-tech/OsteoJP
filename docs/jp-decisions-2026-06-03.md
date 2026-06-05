# João Pedro — Confirmed Decisions (2026-06-03)

**Source:** Owner batch response to Max's message
**Status:** All items confirmed, decisions recorded, actions assigned

---

## 1. Clinic locations (both confirmed)

### Linda-a-Velha (primary / original)
- **Name:** OsteoJP
- **Address:** R. Afonso Duarte 7, 2795-246 Linda-a-Velha, Portugal
- **Phone:** +351 969 472 111
- **Hours:** Mon–Fri 8:00–20:00 · Sat 9:00–13:00 · Sun closed

### Castelo Branco
- **Name:** Clínica OsteoJP
- **Address:** R. Fernando Namora 6, 6000-228 Castelo Branco, Portugal
- **Phone:** +351 969 877 553
- **Hours:** Mon–Fri 9:00–20:00 · Sat closed · Sun closed

**Action (Ivan):** Add both locations to `/admin/locais` with hours. Update PDF templates footer to include Linda-a-Velha details alongside Castelo Branco.
**Action (Max):** Update `docs/pdf-templates` with correct location data once Ivan adds them to the system.

---

## 2. Patient portal — booking flow

**Decision:** Patient picks service + location + time. Therapist is assigned by reception or availability — not hard-booked by the patient.

Returning patients may express a soft preference for their usual therapist (the clinical episode already ties them to one), but it stays a **request, not a calendar lock**. Reception balances the agenda.

**Rationale:** Protects utilization. Matches how manual-therapy clinics operate in practice.

**Action (Ivan):** Portal booking flow: service → location → time slot. No therapist selector. Soft preference field ("preferred therapist") optional on returning patient booking, non-binding.

---

## 3. Reschedule cutoff

**Decision:** Default 24h self-service cutoff, enforced server-side, stored in tenant settings (already in place via #107 settings config). Configurable per tenant.

**Action:** None — already implemented. Confirm 24h is the value set in production settings.

---

## 4. Invoicing in patient portal

**Decision (V1):** Portal shows appointment history + paid/unpaid status from internal ledger only. No fatura-recibo in V1.

**Decision (Phase 4):** Fatura-recibo appears in portal after InvoiceXpress issuance. Issuance is the fiscal event, not record creation.

**Decision (cash):** Cash is a payment method, not an invoicing exemption. Every paid visit produces a fiscal document in Phase 4 regardless of payment method (cash, MB, card).

**Open (owner to confirm):** Whether protocol-discount visits and free visits are also invoiced fiscally. Owner to confirm before Phase 4 invoice logic is finalised.

**Action (Ivan):** V1 portal: internal ledger status only. Phase 4: fatura-recibo link post-issuance.
**Action (Max → JP):** Chase owner on protocol-discount + free visit invoicing decision.

---

## 5. Form structure — confirmed split

**Decision:** One shared general anamnese (identity, contacts, RGPD consent, health history, medication, allergies) filled once per new patient. Therapy-specific supplement only where clinically real.

| Therapy | Form type | Status |
|---|---|---|
| Osteopatia | Full supplement (done) | ✅ `osteopathy-v1.json` |
| Fisioterapia | Full supplement (done) | ✅ `physiotherapy-v1.json` (v3) |
| NESA | Own supplement (fields TBC by JP) | ⏳ Pending JP confirmation |
| Massagem Terapêutica | Pointer-wrapper + short contraindication screen | ✅ `massagem-terapeutica-v1.json` (update needed — add contraindication screen) |
| Pilates Terapêutico | Pointer-wrapper + short contraindication screen | ✅ `pilates-terapeutico-v1.json` (update needed) |
| RPG | Pointer-wrapper + short contraindication screen | ✅ `rpg-v1.json` (update needed) |

**Forms fire:** First visit or new episode — not every appointment. ✅ Confirmed.

**Action (Max):** Add short contraindication screen to massagem, pilates, RPG wrapper templates.
**Action (Max → JP):** Chase NESA-specific fields (protocol, stimulation parameters).
**Action (Ivan):** Implement shared general anamnese as a separate pre-intake form, fired once per new patient. Closes #100.

---

## 6. Partnership / protocol pricing

**Decision:** Staff-managed only. Patients cannot self-claim discounts. Price shown in portal already reflects the assigned protocol (correct net price). At most a quiet "tarifa protocolo" label — no toggle, no patient-facing discount selector.

**Pricing engine key:** `(service, location, partnership)` — partnership lists differ between Linda-a-Velha and Castelo Branco, so location-scoped.

**Open (owner to confirm):** Whether to show "tarifa protocolo" label or just the net price silently.

**Action (Ivan):** Pricing engine: key on `(service, location, partnership)`. No patient-facing discount UI.
**Action (Max → JP):** Chase on protocol label visibility decision.

---

## Summary of open items still pending from JP

| Item | Context |
|---|---|
| NESA-specific fields | Protocol, stimulation parameters — needed to complete `nesa-v1.json` |
| Protocol-discount + free visit invoicing | Needed before Phase 4 invoice logic is finalised |
| Protocol label visibility | Show "tarifa protocolo" or just net price silently in portal |
| ai_extractable Group A/B sign-off | Still pending from original batch |
| Sender display name | "OsteoJP" proposed — confirmation still pending |
