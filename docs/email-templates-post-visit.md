# Post-Visit Email Templates

Status: Draft v1 — author: Max
Spec: brand voice guide (PT-PT register, institutional voice, clinical not cold)
Sender: [from-address]@osteojp.pt (pending Resend domain verification)
Locale: PT primary, EN secondary

## Constraints

- Encoding: UTF-8, full accents (no SMS-style stripping)
- Format: <decide — plain text / HTML / both>
- Subject line: ≤ 60 chars where possible (mobile preview)
- Placeholders: {{patient_first_name}}, {{appointment_date}}, {{practitioner_name}}, {{clinic_location}}, {{clinic_phone}}, {{booking_link}}, {{feedback_link}}
- Generic v1 only — no per-treatment-type clinical specifics (per lead decision; practitioners layer specifics later)
- Institutional voice — sender is OsteoJP, not the practitioner
- No medical advice, no aftercare instructions specific to a modality

## Scenarios

### 1. Post-visit thank you + general aftercare guidance

**PT — Subject:**

**PT — Body:**

**EN — Subject:**

**EN — Body:**

---

### 2. Feedback / satisfaction request

**PT — Subject:**

**PT — Body:**

**EN — Subject:**

**EN — Body:**

---

### 3. Follow-up booking prompt (when treatment plan suggests recurring visits)

**PT — Subject:**

**PT — Body:**

**EN — Subject:**

**EN — Body:**

---

## Open questions

- Should scenarios 1 and 2 be merged (thank you + feedback in one email) or kept separate?
- Timing: how long after the visit does each fire? Recommend: thank you same day, feedback +3 days, follow-up prompt only if treatment plan flags it
- Feedback mechanism: Google review link, internal form, NPS-style rating — which?
- Follow-up prompt: opt-in by practitioner per patient, or default-on for all multi-session treatment plans?
- "Obrigada" vs "Obrigado" — clinic-first-person signs off as institutional (gender-neutral via "OsteoJP" sign-off), so this may not come up; flag if it does (tied to voice guide §8 first-person mode question)
- Reply-to: monitored inbox for clinical follow-up questions, or noreply?
- Footer: unsubscribe link — required for transactional + marketing-adjacent post-visit emails