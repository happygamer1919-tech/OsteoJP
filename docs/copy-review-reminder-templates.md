# Copy Review — Email & SMS Reminder Templates
**Reviewer:** Max  
**Date:** 2026-06-02  
**Files reviewed:** `docs/email-templates-reminders.md`, `docs/sms-templates.md`  
**Reference:** `docs/brand-voice.md`  
**Status:** Issues logged below — review only. None of the recommended fixes are applied in this PR; the copy fixes (EMAIL-01/02/03, SMS-02) and the owner decisions (EMAIL-04/05, SMS-03) are deferred to a follow-up PR pending João Pedro's decisions.

---

## Overall verdict

Both files are well-structured and largely on-brand. PT register is correct throughout (formal "você" / "a sua", no emojis, no filler). SMS character constraints are handled correctly. A small number of fixes needed before go-live, plus two owner decisions required.

---

## Email Templates — Issues

### EMAIL-01 — Scenario 6 (no-show): "não foi realizada" is ambiguous
**Severity:** 🟡 Medium  
**PT current:** `"a sua consulta de {{appointment_date}} às {{appointment_time}}, em {{clinic_location}}, não foi realizada."`  
**Problem:** "não foi realizada" means the appointment was not carried out — but it doesn't clearly communicate that the patient missed it. Could be read as a clinic-side cancellation.  
**Fix:** `"a sua consulta de {{appointment_date}} às {{appointment_time}}, em {{clinic_location}}, não foi realizada — não registámos a sua presença."`  
**EN current:** `"was not attended"` — this is fine, keep.

---

### EMAIL-02 — Scenario 5 (cancellation): subject line missing clinic location
**Severity:** 🟢 Low  
**PT current subject:** `"Consulta cancelada — {{appointment_date}}, {{appointment_time}}"`  
**Inconsistency:** All other subject lines include `{{clinic_location}}`. The cancellation subject drops it. Minor but inconsistent — if a patient has multiple clinics, they won't know which cancellation this refers to.  
**Fix:** `"Consulta cancelada — {{appointment_date}}, {{appointment_time}}, {{clinic_location}}"`  
**Same fix applies to EN subject.**

---

### EMAIL-03 — "10 minutes early" on reschedule confirmation is redundant
**Severity:** 🟢 Low  
**Route:** Scenario 4 (reschedule confirmation)  
**Current PT:** `"Pedimos que chegue 10 minutos antes."` included in reschedule confirmation.  
**Problem:** If the patient is rescheduling, they have already attended at least one appointment and know the clinic's arrival policy. Repeating it on a reschedule confirmation is unnecessary clutter. Brand voice §2.6: brevity over filler.  
**Fix:** Remove the "10 minutes early" line from scenario 4 only. Keep it on scenarios 1 (first booking) and 3 (24h reminder, where it's a useful last-minute prompt).

---

### EMAIL-04 — Open format decision blocks go-live
**Severity:** 🔴 Blocker (decision needed)  
**The file has:** `"Format: <decide — plain text / HTML / both>"`  
**This must be decided before Resend is configured.** Recommendation: plain text for v1 (faster to ship, no rendering issues across email clients, matches the terse clinical tone). HTML can be added in v1.1 with OsteoJP branding.  
**Action:** Ivan/João Pedro to decide. Suggest plain text for launch.

---

### EMAIL-05 — Sender display name decision blocks go-live
**Severity:** 🔴 Blocker (decision needed)  
**The file has:** `"Sender: 'OsteoJP' or 'OsteoJP — Linda-a-Velha' (location-specific per clinic?)"`  
**Recommendation:** Use `"OsteoJP"` as the sender display name for v1 — simpler, no per-location configuration needed. Location is already in the email body via `{{clinic_location}}`.  
**Action:** Ivan/João Pedro to confirm.

---

## SMS Templates — Issues

### SMS-01 — Scenario 3 (24h): "e" should be "é" — but SMS can't use accents
**Note:** The template correctly writes `"a sua consulta e amanha"` (dropping accent on "é" and "amanhã" for GSM-7 encoding). This is correct per the constraints section. **No fix needed** — flagging as reviewed and confirmed intentional.

### SMS-02 — Scenario 6 (post-visit): "obrigada" assumes feminine clinic voice
**Severity:** 🟡 Medium — owner decision needed  
**Current:** `"OsteoJP: obrigada pela sua visita."`  
**Problem:** "obrigada" is feminine. The clinic signs as "OsteoJP" (institutional, gender-neutral). Feminine "obrigada" assumes the message is from a female person, not an institution.  
**Fix options:**
- `"obrigado/a"` — neutral but slightly awkward in SMS
- `"agradecemos a sua visita"` — institutional, no gender, cleaner ✅ recommended  
**Proposed PT fix:** `"OsteoJP: agradecemos a sua visita. Em caso de duvidas, contacte-nos. Cuide-se."`  
**EN stays as-is** — "thank you" is gender-neutral.

### SMS-03 — Scenario 5 (cancellation): one template for cancellation AND no-show
**Severity:** 🟢 Low  
**Current:** Single template covers both clinic-initiated cancellation and patient no-show.  
**Problem:** The wording `"foi cancelada"` is correct for a clinic or patient cancellation, but for a no-show it's technically inaccurate — the appointment wasn't cancelled, it was missed.  
**Recommendation:** Split into two templates for clarity, or accept the current wording as "good enough" for v1. João Pedro to decide.  
**If split:**
- Cancellation: `"OsteoJP: a sua consulta de {date} as {time} foi cancelada. Para remarcar: {link}"`
- No-show: `"OsteoJP: nao registamos a sua presenca na consulta de {date} as {time}. Para remarcar: {link}"`

### SMS-04 — `{reschedule_link}` placeholder name differs from email templates
**Severity:** 🟢 Low — consistency  
**SMS uses:** `{link}`  
**Email uses:** `{{reschedule_link}}`  
**These are different template engines or just inconsistent naming.** Ivan to confirm which placeholder format the Inngest/Resend pipeline actually uses, and align both docs to match.

---

## i18n Pending Items (from previous copy review — CON-04 and EN-02)

### I18N-01 — `invoicing.totalPaid/Pending/Overdue` deduplication (CON-04)
**Current state:** These three keys duplicate `invoicing.statusPaid/Pending/Overdue` exactly:

| Key | PT | EN |
|---|---|---|
| `invoicing.statusPaid` | `Pago` | `Paid` |
| `invoicing.totalPaid` | `Pago` | `Paid` |
| `invoicing.statusPending` | `Pendente` | `Pending` |
| `invoicing.totalPending` | `Pendente` | `Pending` |
| `invoicing.statusOverdue` | `Vencido` | `Overdue` |
| `invoicing.totalOverdue` | `Vencido` | `Overdue` |

**Recommendation:** If `total*` keys are used for summary row labels (e.g. "Total Paid: €120") and `status*` for column/badge labels, they should stay separate — different contexts may need different capitalisation or surrounding text in future. If they truly render identically, consolidate to `status*` only and remove `total*`.  
**Action:** Ivan to confirm which keys are actually rendered and where. No change until confirmed.

### I18N-02 — `patients.fieldSex` EN: "Biological sex" confirmation
**Current EN value:** `"Biological sex"` (applied in PR #55)  
**Status:** Applied but flagged as pending owner confirmation.  
**Recommendation:** "Biological sex" is the correct clinical EN term for this field — it distinguishes from gender identity, which is standard in clinical intake forms. Consider confirmed unless João Pedro objects.  
**Action:** Max to confirm with João Pedro. If approved, close this item.

---

## Summary of actions

| # | Item | Owner | Urgency |
|---|---|---|---|
| EMAIL-01 | No-show PT wording — clarify patient missed it | Max (copy fix) | Before go-live |
| EMAIL-02 | Cancellation subject — add `{{clinic_location}}` | Max (copy fix) | Before go-live |
| EMAIL-03 | Remove "10 min early" from reschedule confirmation | Max (copy fix) | Before go-live |
| EMAIL-04 | Format decision: plain text vs HTML | João Pedro / Ivan | **Blocks go-live** |
| EMAIL-05 | Sender display name decision | João Pedro / Ivan | **Blocks go-live** |
| SMS-02 | "obrigada" → "agradecemos a sua visita" | Max (copy fix) | Before go-live |
| SMS-03 | Cancellation vs no-show split decision | João Pedro | Before go-live |
| SMS-04 | Align `{link}` vs `{{reschedule_link}}` placeholder | Ivan | Before go-live |
| I18N-01 | `invoicing.total*` dedup — confirm usage | Ivan | Low priority |
| I18N-02 | Confirm "Biological sex" with owner | Max → João Pedro | Low priority |
