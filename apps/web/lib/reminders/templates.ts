// Appointment-reminder message templates.
//
// The COPY in this file is ported verbatim from the content authored by Max in
//   docs/email-templates-reminders.md  (scenarios 2 & 3 — the 48h / 24h reminders)
//   docs/sms-templates.md              (scenarios 2 & 3 — the 48h / 24h reminders)
// Do not reword it here — those docs are the source of truth for register and
// brand voice. This module only mechanises the placeholder fills and enforces
// the SMS carrier constraints documented alongside the copy.
//
// Pure module: no DB, no SDK, no `server-only`. Everything here is synchronous
// and side-effect free so it can be unit-tested without a network or a database.

import type { Locale } from "@osteojp/i18n";

export type ReminderOffsetId = "48h" | "24h";

/**
 * Everything a rendered reminder can reference. Email uses the full set; SMS
 * uses a terse subset (see docs/sms-templates.md — names live in email, SMS
 * stays inside one GSM-7 segment). One context type feeds both channels.
 */
export type ReminderContext = {
  patientFirstName: string;
  /** Localised long-ish date for email, e.g. "23 de maio de 2026". */
  appointmentDateLong: string;
  /** Terse dd/mm date for SMS, e.g. "23/05". */
  appointmentDateShort: string;
  /** "HH:mm" Lisbon wall-clock, e.g. "14:30". */
  appointmentTime: string;
  practitionerName: string;
  clinicLocation: string;
  clinicPhone: string;
  rescheduleLink: string;
};

export type RenderedEmail = { subject: string; body: string };

/* ================================================================== */
/* Email copy (docs/email-templates-reminders.md)                      */
/* ================================================================== */
//
// Placeholders use the {{token}} syntax exactly as authored in the doc. Full
// accents are intentional — email keeps UTF-8, only SMS strips them.

type EmailTemplate = { subject: string; body: string };

const EMAIL: Record<ReminderOffsetId, Record<Locale, EmailTemplate>> = {
  "48h": {
    pt: {
      subject:
        "Lembrete: consulta em 48 horas — {{appointment_date}}, {{appointment_time}}",
      body: `Olá {{patient_first_name}},

Lembrete da sua consulta em {{appointment_date}} às {{appointment_time}}, em {{clinic_location}}, com {{practitioner_name}}.

Para remarcar ou cancelar: {{reschedule_link}}
Ou contacte: {{clinic_phone}}

— OsteoJP`,
    },
    en: {
      subject:
        "Reminder: appointment in 48 hours — {{appointment_date}}, {{appointment_time}}",
      body: `Dear {{patient_first_name}},

Reminder of your appointment on {{appointment_date}} at {{appointment_time}}, at our {{clinic_location}} clinic, with {{practitioner_name}}.

To reschedule or cancel: {{reschedule_link}}
Or contact us: {{clinic_phone}}

— OsteoJP`,
    },
  },
  "24h": {
    pt: {
      subject:
        "Lembrete: consulta amanhã — {{appointment_time}}, {{clinic_location}}",
      body: `Olá {{patient_first_name}},

Lembrete da sua consulta amanhã, {{appointment_date}}, às {{appointment_time}}, em {{clinic_location}}, com {{practitioner_name}}.

Pedimos que chegue 10 minutos antes.

Para remarcar ou cancelar: {{reschedule_link}}
Ou contacte: {{clinic_phone}}

— OsteoJP`,
    },
    en: {
      subject:
        "Reminder: appointment tomorrow — {{appointment_time}}, {{clinic_location}}",
      body: `Dear {{patient_first_name}},

Reminder of your appointment tomorrow, {{appointment_date}}, at {{appointment_time}}, at our {{clinic_location}} clinic, with {{practitioner_name}}.

Please arrive 10 minutes early.

To reschedule or cancel: {{reschedule_link}}
Or contact us: {{clinic_phone}}

— OsteoJP`,
    },
  },
};

/* ================================================================== */
/* SMS copy (docs/sms-templates.md)                                    */
/* ================================================================== */
//
// {token} syntax as authored. NO ACCENTS — accents push GSM-7 → UCS-2 and drop
// the per-segment limit 160 → 70 (see the Constraints block in the doc). The
// copy below is already accent-free; renderSms() additionally asserts the
// finished message stays GSM-7 and inside one segment.
//
// Go-live deviation from the doc (Stream E): SMS points to the clinic PHONE, not
// the reschedule short-link. The signed reschedule token (see link-token.ts) is
// far too long to fit a single GSM-7 segment alongside this copy, and a
// two-segment SMS doubles cost. The reschedule LINK lives in the email reminder;
// SMS keeps the phone CTA. (docs/sms-templates.md to be updated to match.)

const SMS: Record<ReminderOffsetId, Record<Locale, string>> = {
  "48h": {
    pt: "OsteoJP: lembrete da sua consulta a {date} as {time} em {clinic}. Para remarcar ligue {phone}",
    en: "OsteoJP: reminder of your appointment on {date} at {time} in {clinic}. To reschedule call {phone}",
  },
  "24h": {
    pt: "OsteoJP: a sua consulta e amanha, {date}, as {time} em {clinic}. Para remarcar ligue {phone}",
    en: "OsteoJP: your appointment is tomorrow, {date}, at {time} in {clinic}. To reschedule call {phone}",
  },
};

/* ================================================================== */
/* Rendering                                                           */
/* ================================================================== */

function fill(template: string, tokens: Record<string, string>): string {
  // Single pass over the supplied tokens; supports both {{t}} and {t} forms so
  // each channel keeps its own authored placeholder syntax.
  let out = template;
  for (const [key, value] of Object.entries(tokens)) {
    out = out.split(`{{${key}}}`).join(value).split(`{${key}}`).join(value);
  }
  return out;
}

function assertNoUnfilledPlaceholders(channel: string, rendered: string): void {
  const leftover = rendered.match(/\{\{?[a-z_]+\}?\}/i);
  if (leftover) {
    throw new Error(
      `reminders/${channel}: unfilled placeholder ${leftover[0]} after render`,
    );
  }
}

export function renderEmail(
  offset: ReminderOffsetId,
  locale: Locale,
  ctx: ReminderContext,
): RenderedEmail {
  const tpl = EMAIL[offset][locale];
  const tokens = {
    patient_first_name: ctx.patientFirstName,
    appointment_date: ctx.appointmentDateLong,
    appointment_time: ctx.appointmentTime,
    practitioner_name: ctx.practitionerName,
    clinic_location: ctx.clinicLocation,
    clinic_phone: ctx.clinicPhone,
    reschedule_link: ctx.rescheduleLink,
  };
  const subject = fill(tpl.subject, tokens);
  const body = fill(tpl.body, tokens);
  assertNoUnfilledPlaceholders("email", subject);
  assertNoUnfilledPlaceholders("email", body);
  return { subject, body };
}

export function renderSms(
  offset: ReminderOffsetId,
  locale: Locale,
  ctx: ReminderContext,
): string {
  const tpl = SMS[offset][locale];
  const message = fill(tpl, {
    date: ctx.appointmentDateShort,
    time: ctx.appointmentTime,
    clinic: ctx.clinicLocation,
    phone: ctx.clinicPhone,
  });
  assertNoUnfilledPlaceholders("sms", message);
  assertSmsCompliant(message);
  return message;
}

/* ================================================================== */
/* SMS carrier compliance                                              */
/* ================================================================== */

/** Single-segment GSM-7 limit. Beyond this, carriers split into 153-char parts. */
export const SMS_SEGMENT_LIMIT = 160;

// GSM 03.38 basic + basic-extension charset. Anything outside this forces the
// message into UCS-2 (70-char segments). Accented PT letters are deliberately
// absent — that's the whole point of the no-accents rule in the SMS doc.
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà" +
  // basic extension chars (each costs 2 GSM-7 septets, but stays single-byte family)
  "\f^{}\\[~]|€";

const GSM7_SET = new Set(GSM7.split(""));

export function isGsm7(text: string): boolean {
  for (const ch of text) {
    if (!GSM7_SET.has(ch)) return false;
  }
  return true;
}

/**
 * Throws if a rendered SMS would not fit one GSM-7 segment — either too long or
 * containing a non-GSM-7 character (which would silently halve the limit and
 * double cost). Called at render time so a bad fill fails loud in tests/dev,
 * never silently at send.
 */
export function assertSmsCompliant(message: string): void {
  if (!isGsm7(message)) {
    const bad = [...message].find((ch) => !GSM7_SET.has(ch));
    throw new Error(
      `reminders/sms: non-GSM-7 character ${JSON.stringify(bad)} would force UCS-2 encoding`,
    );
  }
  if (message.length > SMS_SEGMENT_LIMIT) {
    throw new Error(
      `reminders/sms: message is ${message.length} chars, exceeds ${SMS_SEGMENT_LIMIT}-char single segment`,
    );
  }
}
