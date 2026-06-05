# Post-Visit Email Templates

Status: Draft v2 — author: Max — copy review 2026-06-02
Spec: brand voice guide (PT-PT register, institutional voice, clinical not cold)
Sender: [from-address]@osteojp.pt (pending Resend domain verification)
Locale: PT primary, EN secondary

## Constraints

- Encoding: UTF-8, full accents (no SMS-style stripping)
- Format: HTML with plain-text fallback (multipart) — confirmed by lead 2026-06-02
- Subject line: ≤ 60 chars where possible (mobile preview)
- Placeholders: {{patient_first_name}}, {{appointment_date}}, {{practitioner_name}}, {{clinic_location}}, {{clinic_phone}}, {{booking_link}}, {{feedback_link}}
- Generic v1 only — no per-treatment-type clinical specifics (per lead decision; practitioners layer specifics later)
- Institutional voice — sender is OsteoJP, not the practitioner
- No medical advice, no aftercare instructions specific to a modality

---

## Scenarios

### 1. Post-visit thank you + general aftercare guidance
Fires same day as the visit, a few hours after the appointment end time.

**PT — Subject:** A sua consulta — recomendações gerais

**PT — Body:**
Olá {{patient_first_name}},

Obrigado por ter escolhido a OsteoJP para a sua consulta de {{appointment_date}}.

Após a consulta, recomendamos:

- Hidratação adequada nas 24 horas seguintes
- Atividade física moderada — evite esforços intensos no próprio dia
- Em caso de desconforto persistente ou agravamento dos sintomas, contacte-nos

Se {{practitioner_name}} indicou recomendações específicas durante a consulta, essas têm prioridade sobre estas orientações gerais.

Para qualquer questão clínica: {{clinic_phone}}

— OsteoJP

**EN — Subject:** Your appointment — general recommendations

**EN — Body:**
Dear {{patient_first_name}},

Thank you for choosing OsteoJP for your appointment on {{appointment_date}}.

After your appointment, we recommend:

- Adequate hydration over the following 24 hours
- Moderate physical activity — avoid intense exertion on the same day
- In case of persistent discomfort or worsening symptoms, contact us

If {{practitioner_name}} provided specific recommendations during your appointment, those take priority over these general guidelines.

For any clinical questions: {{clinic_phone}}

— OsteoJP

---

### 2. Feedback / satisfaction request
Fires 3 days after the visit. Separate from scenario 1 to avoid a double send on the same day.

**PT — Subject:** A sua opinião sobre a consulta

**PT — Body:**
Olá {{patient_first_name}},

A sua opinião ajuda-nos a melhorar o cuidado que oferecemos.

Se tiver alguns minutos, partilhe a sua experiência da consulta de {{appointment_date}}: {{feedback_link}}

— OsteoJP

**EN — Subject:** Your feedback on your appointment

**EN — Body:**
Dear {{patient_first_name}},

Your feedback helps us improve the care we provide.

If you have a few minutes, please share your experience from your appointment on {{appointment_date}}: {{feedback_link}}

— OsteoJP

---

### 3. Follow-up booking prompt
Fires only when the treatment plan flags recurring visits and no next appointment is already booked. Not sent by default to every patient.

**PT — Subject:** Próxima consulta — agendamento

**PT — Body:**
Olá {{patient_first_name}},

O plano de tratamento definido por {{practitioner_name}} prevê consultas de seguimento.

Para agendar a próxima consulta: {{booking_link}}
Ou contacte: {{clinic_phone}}

— OsteoJP

**EN — Subject:** Next appointment — scheduling

**EN — Body:**
Dear {{patient_first_name}},

The treatment plan set out by {{practitioner_name}} includes follow-up appointments.

To book your next appointment: {{booking_link}}
Or contact us: {{clinic_phone}}

— OsteoJP

---

## Decisions resolved (2026-06-02)

| Question | Decision |
|---|---|
| Scenarios 1 + 2 merged or separate? | Separate — different timing, different CTA, cleaner to maintain |
| Timing | Scenario 1: same day. Scenario 2: +3 days. Scenario 3: only if treatment plan flags and no next appt booked |
| Format | HTML + plain-text fallback (multipart) — confirmed by lead |
| "Obrigado" gender | Kept as institutional masculine — OsteoJP signs as a clinic entity, masculine is the PT default for institutional sign-offs. If owner prefers neutral, rephrase to "A equipa OsteoJP agradece a sua visita" |
| Frequency limits | Scenario 1 fires after every visit v1. Scenario 2 fires after first visit of each episode only — avoids feedback fatigue on multi-session plans |

## Open questions (still pending owner/lead)

- **Feedback mechanism:** Google review link, internal satisfaction form, or NPS-style rating? `{{feedback_link}}` is placeholder until decided.
- **Aftercare guidance (scenario 1):** The 3 bullets are deliberately generic. Clinical lead to confirm these are safe across all modalities — osteopathy, physiotherapy, massage, NESA, pilates. If any modality needs different baseline guidance, scenario 1 should be split per-treatment-type.
- **Reply-to address:** Monitored inbox or noreply? Scenario 1 invites clinical questions via phone — confirm whether email reply should also be enabled.
- **GDPR / unsubscribe footer:** Required for post-visit emails? Scenarios 2 (feedback) and 3 (booking prompt) have a marketing-adjacent CTA — legal check needed on whether an unsubscribe link is required under Portuguese/EU regs.
