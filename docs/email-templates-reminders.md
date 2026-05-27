# Appointment Reminder Email Templates

Status: Draft v1 — author: Max
Spec: brand voice guide (PT-PT register, clinic-first-person, warm/concise)
Sender: [from-address]@osteojp.pt (pending Resend domain verification)
Locale: PT primary, EN secondary

## Constraints

- Encoding: UTF-8, full accents (no SMS-style stripping)
- Format: <decide — plain text / HTML / both>
- Subject line: ≤ 60 chars where possible (mobile preview)
- Placeholders: {{patient_first_name}}, {{appointment_date}}, {{appointment_time}}, {{practitioner_name}}, {{clinic_location}}, {{clinic_phone}}, {{reschedule_link}}
- No clinical specifics in v1 (per lead decision — generic, practitioners layer specifics later)

## Scenarios

### 1. Booking confirmation

**PT — Subject:** Consulta confirmada — {{appointment_date}}, {{appointment_time}}, {{clinic_location}}

**PT — Body:**
Olá {{patient_first_name}},

A sua consulta está confirmada para {{appointment_date}} às {{appointment_time}}, em {{clinic_location}}, com {{practitioner_name}}.

Pedimos que chegue 10 minutos antes para preenchimento do formulário de admissão.

Para remarcar ou cancelar: {{reschedule_link}}
Ou contacte: {{clinic_phone}}

— OsteoJP

**EN — Subject:** Appointment confirmed — {{appointment_date}}, {{appointment_time}}, {{clinic_location}}

**EN — Body:**
Dear {{patient_first_name}},

Your appointment is confirmed for {{appointment_date}} at {{appointment_time}}, at our {{clinic_location}} clinic, with {{practitioner_name}}.

Please arrive 10 minutes early to complete your intake form.

To reschedule or cancel: {{reschedule_link}}
Or contact us: {{clinic_phone}}

— OsteoJP

---

### 2. 48h reminder

**PT — Subject:** Lembrete: consulta em 48 horas — {{appointment_date}}, {{appointment_time}}

**PT — Body:**
Olá {{patient_first_name}},

Lembrete da sua consulta em {{appointment_date}} às {{appointment_time}}, em {{clinic_location}}, com {{practitioner_name}}.

Para remarcar ou cancelar: {{reschedule_link}}
Ou contacte: {{clinic_phone}}

— OsteoJP

**EN — Subject:** Reminder: appointment in 48 hours — {{appointment_date}}, {{appointment_time}}

**EN — Body:**
Dear {{patient_first_name}},

Reminder of your appointment on {{appointment_date}} at {{appointment_time}}, at our {{clinic_location}} clinic, with {{practitioner_name}}.

To reschedule or cancel: {{reschedule_link}}
Or contact us: {{clinic_phone}}

— OsteoJP

---

### 3. 24h reminder

**PT — Subject:** Lembrete: consulta amanhã — {{appointment_time}}, {{clinic_location}}

**PT — Body:**
Olá {{patient_first_name}},

Lembrete da sua consulta amanhã, {{appointment_date}}, às {{appointment_time}}, em {{clinic_location}}, com {{practitioner_name}}.

Pedimos que chegue 10 minutos antes.

Para remarcar ou cancelar: {{reschedule_link}}
Ou contacte: {{clinic_phone}}

— OsteoJP

**EN — Subject:** Reminder: appointment tomorrow — {{appointment_time}}, {{clinic_location}}

**EN — Body:**
Dear {{patient_first_name}},

Reminder of your appointment tomorrow, {{appointment_date}}, at {{appointment_time}}, at our {{clinic_location}} clinic, with {{practitioner_name}}.

Please arrive 10 minutes early.

To reschedule or cancel: {{reschedule_link}}
Or contact us: {{clinic_phone}}

— OsteoJP

---

### 4. Reschedule confirmation

**PT — Subject:** Consulta remarcada — {{appointment_date}}, {{appointment_time}}, {{clinic_location}}

**PT — Body:**
Olá {{patient_first_name}},

A sua consulta foi remarcada para {{appointment_date}} às {{appointment_time}}, em {{clinic_location}}, com {{practitioner_name}}.

Pedimos que chegue 10 minutos antes.

Para alterar novamente ou cancelar: {{reschedule_link}}
Ou contacte: {{clinic_phone}}

— OsteoJP

**EN — Subject:** Appointment rescheduled — {{appointment_date}}, {{appointment_time}}, {{clinic_location}}

**EN — Body:**
Dear {{patient_first_name}},

Your appointment has been rescheduled to {{appointment_date}} at {{appointment_time}}, at our {{clinic_location}} clinic, with {{practitioner_name}}.

Please arrive 10 minutes early.

To change again or cancel: {{reschedule_link}}
Or contact us: {{clinic_phone}}

— OsteoJP

---

### 5. Cancellation

**PT — Subject:** Consulta cancelada — {{appointment_date}}, {{appointment_time}}

**PT — Body:**
Olá {{patient_first_name}},

A sua consulta de {{appointment_date}} às {{appointment_time}}, em {{clinic_location}}, foi cancelada.

Para agendar uma nova consulta: {{reschedule_link}}
Ou contacte: {{clinic_phone}}

— OsteoJP

**EN — Subject:** Appointment cancelled — {{appointment_date}}, {{appointment_time}}

**EN — Body:**
Dear {{patient_first_name}},

Your appointment on {{appointment_date}} at {{appointment_time}}, at our {{clinic_location}} clinic, has been cancelled.

To book a new appointment: {{reschedule_link}}
Or contact us: {{clinic_phone}}

— OsteoJP

---

### 6. No-show

**PT — Subject:** Consulta não realizada — {{appointment_date}}, {{appointment_time}}

**PT — Body:**
Olá {{patient_first_name}},

Registámos que a sua consulta de {{appointment_date}} às {{appointment_time}}, em {{clinic_location}}, não foi realizada.

Para agendar uma nova consulta: {{reschedule_link}}
Ou contacte: {{clinic_phone}}

— OsteoJP

**EN — Subject:** Missed appointment — {{appointment_date}}, {{appointment_time}}

**EN — Body:**
Dear {{patient_first_name}},

We've noted that your appointment on {{appointment_date}} at {{appointment_time}}, at our {{clinic_location}} clinic, was not attended.

To book a new appointment: {{reschedule_link}}
Or contact us: {{clinic_phone}}

— OsteoJP

---

## Open questions

- Format decision: plain text only, HTML + plaintext fallback, or plaintext now / HTML later
- Sender display name: "OsteoJP" or "OsteoJP — Linda-a-Velha" (location-specific per clinic?)
- Reply-to address: monitored inbox or noreply?
- 48h reminder: keep alongside 24h (matches SMS PR #18) or drop
- No-show template: include a charge-policy/late-cancellation-fee line? (Owner/lead decision — currently neutral)
- "10 minutes early" instruction: keep on every confirmation/reminder or only on first booking? Voice guide §6.2 uses it on the confirmation example; redundancy on reminders may be acceptable but worth confirming
- Footer: unsubscribe link required for transactional? GDPR/clinic regs check needed
- Phone fallback: `{{clinic_phone}}` resolved per-location — confirm placeholder name matches what lead will wire in the email service