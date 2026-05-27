# Appointment Reminder Email Templates

Status: Draft v1 — author: Max
Spec: brand voice guide (PT-PT register, clinic-first-person, warm/concise)
Sender: [from-address]@osteojp.pt (pending Resend domain verification)
Locale: PT primary, EN secondary

## Constraints

- Encoding: UTF-8, full accents (no SMS-style stripping)
- Format: <decide — plain text / HTML / both>
- Subject line: ≤ 60 chars where possible (mobile preview)
- Placeholders: {{patient_first_name}}, {{appointment_date}}, {{appointment_time}}, {{practitioner_name}}, {{clinic_location}}, {{reschedule_link}}, {{cancel_link}}
- No clinical specifics in v1 (per lead decision — generic, practitioners layer specifics later)

## Scenarios

### 1. Booking confirmation

**PT — Subject:**

**PT — Body:**

**EN — Subject:**

**EN — Body:**

---

### 2. 48h reminder

**PT — Subject:**

**PT — Body:**

**EN — Subject:**

**EN — Body:**

---

### 3. 24h reminder

**PT — Subject:**

**PT — Body:**

**EN — Subject:**

**EN — Body:**

---

### 4. Reschedule confirmation

**PT — Subject:**

**PT — Body:**

**EN — Subject:**

**EN — Body:**

---

### 5. Cancellation / no-show

**PT — Subject:**

**PT — Body:**

**EN — Subject:**

**EN — Body:**

---

## Open questions

- Format decision: plain text only, HTML + plaintext fallback, or plaintext now / HTML later
- Sender display name: "OsteoJP" or "OsteoJP — Linda-a-Velha" (location-specific per clinic?)
- Cancellation vs no-show: same template with conditional copy, or two separate templates
- Reply-to: monitored inbox or noreply
- 48h reminder: keep alongside 24h (matches SMS PR #18) or drop
- Footer: unsubscribe link required for transactional? GDPR/clinic regs check needed