# SMS Templates — OsteoJP

Transactional SMS for appointment lifecycle. PT (primary) + EN. Authored against
`docs/brand-voice.md`.

> **Status:** Staging draft in `docs/`. Canonical home is the notification layer
> once the scaffold lands. Sender ID is a placeholder pending external setup
> (see Constraints). The 48h/24h reminder templates (scenarios 2–3) match the
> shipped reminder code (`apps/web/lib/reminders/templates.ts`); the remaining
> scenarios are drafts for the wider notification layer and are not yet built.

---

## Constraints (read before editing)

- **160-character hard limit** per message (single SMS segment). All templates below
  validated against worst-case placeholder fills (longest location `Montemor-o-Novo`,
  phone `+351 210 000 000`) — longest rendered message is 111 chars.
- **No accented characters in PT.** Accents (ã, ç, é, õ…) push the message from GSM-7
  into UCS-2 encoding, which drops the per-segment limit from 160 → 70 chars and roughly
  doubles cost per message. So `marcação` → `marcacao`, `amanhã` → `amanha`. This is the
  one deliberate exception to the PT-PT vocabulary rule in the voice guide — it is a
  carrier/encoding constraint, not a typo. Applies to SMS only; email keeps full accents.
- **No emojis** (voice guide; also UCS-2 trigger).
- **Sender ID:** `OsteoJP` (placeholder). Alphanumeric sender IDs need registration with
  Twilio for Portugal before go-live; until then messages may fall back to a number.
- **"Você" form** — but transactional SMS is naturally impersonal, so most templates use
  no direct second-person pronoun. Where one appears, it is "a sua" / "você" register,
  never "tua/tu".
- **No reschedule link in SMS.** The reschedule short-link is a stateless, HMAC-signed
  token served at `<base>/r/<token>`. The signed token is too long to fit a single
  160-char GSM-7 segment, and a 2-segment SMS doubles cost — so SMS directs the patient
  to call the clinic (`{phone}`). The reschedule link lives in the **email** reminder only.

## Placeholders

| Token | Meaning | Example |
|---|---|---|
| `{patient_name}` | Patient first name | Madalena |
| `{date}` | Appointment date, dd/mm | 23/05 |
| `{time}` | Appointment time, HH:MM | 14:30 |
| `{clinic}` | Clinic location name | Linda-a-Velha |
| `{therapist}` | Practitioner name | Dr. João Pereira |
| `{phone}` | Clinic location phone | +351 210 000 000 |

`{patient_name}` and `{therapist}` are defined but unused in the current set — SMS stays
terse; names live in email. Kept in the table so the schema is stable if a template later
needs one.

---

## Templates

Each scenario lists PT then EN. "OsteoJP:" prefix doubles as in-body brand signal in case
the registered sender ID is not yet active.

### 1. Booking confirmation
Sent immediately after a booking is made.

- **PT:** `OsteoJP: marcacao confirmada para {date} as {time} em {clinic}. Para remarcar ligue {phone}`
- **EN:** `OsteoJP: appointment confirmed for {date} at {time} in {clinic}. To reschedule call {phone}`

### 2. Reminder — 48h before
First reminder, two days out. Gives reschedule runway.

- **PT:** `OsteoJP: lembrete da sua consulta a {date} as {time} em {clinic}. Para remarcar ligue {phone}`
- **EN:** `OsteoJP: reminder of your appointment on {date} at {time} in {clinic}. To reschedule call {phone}`

### 3. Reminder — 24h before
Second reminder, day before. "amanha" framing.

- **PT:** `OsteoJP: a sua consulta e amanha, {date}, as {time} em {clinic}. Para remarcar ligue {phone}`
- **EN:** `OsteoJP: your appointment is tomorrow, {date}, at {time} in {clinic}. To reschedule call {phone}`

### 4. Reschedule confirmation
Sent after a successful reschedule.

- **PT:** `OsteoJP: consulta remarcada para {date} as {time} em {clinic}. Para alterar ligue {phone}`
- **EN:** `OsteoJP: appointment moved to {date} at {time} in {clinic}. To change call {phone}`

### 5. Cancellation / no-show notice
Sent when an appointment is cancelled (by either side) or marked no-show.

- **PT:** `OsteoJP: a sua consulta de {date} as {time} foi cancelada. Para remarcar ligue {phone}`
- **EN:** `OsteoJP: your appointment on {date} at {time} has been cancelled. To rebook call {phone}`

### 6. Post-visit follow-up
Sent a few hours after the visit. No link — closes warmly without a CTA.

- **PT:** `OsteoJP: obrigada pela sua visita. Em caso de duvidas, contacte-nos. Cuide-se.`
- **EN:** `OsteoJP: thank you for your visit. If you have any questions, contact us. Take care.`

---

## Out of scope (per lead)

- Auth/transactional messages (signup, password reset) — separate bucket.
- Payment/invoice messages — deferred for launch.

## Open questions for lead

1. **48h reminder included** — I added it alongside 24h (two reminder templates). Two
   nudges with reschedule runway is the standard clinic no-show pattern. Confirm you want
   both, or drop to 24h-only.
2. **Reschedule link in SMS — RESOLVED (PR #79).** The reschedule route is
   `<base>/r/<token>` (stateless HMAC-signed token), but the signed token overflows a
   single 160-char GSM-7 segment, so SMS directs the patient to call the clinic
   (`{phone}`) and the reschedule link is email-only. SMS templates updated accordingly.
3. **Cancellation vs no-show** — currently one template. If no-show needs different wording
   (e.g. referencing a missed-appointment policy), split into two.
4. **"obrigada" (feminine)** — post-visit uses feminine "obrigada" assuming the clinic
   voice is feminine first-person. If the clinic signs as a neutral entity, switch to
   "obrigado/a" or rephrase. Tied to the open first-person-mode question in the voice guide §8.