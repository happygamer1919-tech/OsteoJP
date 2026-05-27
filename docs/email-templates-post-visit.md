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

**PT — Subject:** A sua opinião sobre a consulta

**PT — Body:**
Olá {{patient_first_name}},

A sua opinião ajuda-nos a melhorar o cuidado que oferecemos.

Se tiver alguns minutos, partilhe a sua experiência da consulta de {{appointment_date}}: {{feedback_link}}

Obrigado pelo seu tempo.

— OsteoJP

**EN — Subject:** Your feedback on your appointment

**EN — Body:**
Dear {{patient_first_name}},

Your feedback helps us improve the care we provide.

If you have a few minutes, please share your experience from your appointment on {{appointment_date}}: {{feedback_link}}

Thank you for your time.

— OsteoJP

---

### 3. Follow-up booking prompt (when treatment plan suggests recurring visits)

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

## Open questions

- Should scenarios 1 and 2 be merged (thank you + feedback in one email) or kept separate?
- Timing: how long after the visit does each fire? Recommend: thank you same day, feedback +3 days, follow-up prompt only if treatment plan flags it
- Feedback mechanism: Google review link, internal form, NPS-style rating — which? `{{feedback_link}}` is placeholder until decided
- Follow-up prompt: opt-in by practitioner per patient, or default-on for all multi-session treatment plans?
- Aftercare guidance (scenario 1): the 3 bullets are deliberately generic (hydration, moderate activity, contact-on-worsening). Confirm with clinical lead these are safe across all modalities — osteopathy, physiotherapy, massage, NESA, pilates. If any modality needs a different baseline, scenario 1 should be split per-treatment-type and content authored by the practitioner team
- "Obrigado" sign-off (scenarios 1, 2): used masculine institutional form. Voice guide §8 still has an open question on first-person mode; institutional "OsteoJP" sign-off avoids the gender issue but "Obrigado" itself defaults masculine — flag if clinic prefers gender-neutral phrasing
- Reply-to: monitored inbox for clinical follow-up questions, or noreply? Scenario 1 invites clinical questions via phone — should it invite email reply too?
- Footer: unsubscribe link — required for transactional + marketing-adjacent post-visit emails (GDPR/clinic regs check)
- Frequency limits: if a patient has 8 sessions in their plan, do we send the thank-you after every single one, or only the first? Recommend: every one for the first 3, then drop to first-and-last