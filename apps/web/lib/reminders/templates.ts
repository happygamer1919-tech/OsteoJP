// Appointment notification message templates.
//
// Covers four notification types across two channels (email + SMS) and two
// locales (PT + EN):
//
//   confirmation  — sent immediately on appointment creation / reschedule
//   48h / 24h     — timed pre-appointment reminders (Stream E originals)
//   follow_up     — sent 24 h after appointment ends; thanks patient, invites rebooking
//   no_show       — sent when staff marks the appointment no-show
//
// Brand voice: neutral imperative, no "por favor"/"você". PT email uses full
// accents (UTF-8). PT SMS strips all accents to stay single-segment GSM-7.
//
// Pure module: no DB, no SDK, no `server-only`. Everything here is synchronous
// and side-effect free so it can be unit-tested without a network or a database.

import type { Locale } from "@osteojp/i18n";

// The fee line lives in its own module with its gate, not here, so that the ten
// approved bodies and the one unapproved line are never editable in the same
// breath. This file only knows how to APPEND it (W13-05).
import { FEE_NOTICE_SMS } from "./fee-notice";
// WF-18 B: the 24h SMS now tells the patient they may reply, and the words it
// tells them to send are DERIVED from the classifier's own keyword config
// rather than written here. See the 24h entry below.
import { REMINDER_CONFIRM_INSTRUCTION } from "./reminder-copy";

export type ReminderOffsetId = "48h" | "24h";

/** All notification kinds the pipeline can render and send. */
export type NotificationKind = "confirmation" | ReminderOffsetId | "follow_up" | "no_show";

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

export const EMAIL: Record<ReminderOffsetId, Record<Locale, EmailTemplate>> = {
  "48h": {
    pt: {
      subject:
        "Lembrete: consulta em 48 horas — {{appointment_date}}, {{appointment_time}}",
      body: `Olá {{patient_first_name}},

Lembrete da sua consulta em {{appointment_date}} às {{appointment_time}}, em {{clinic_location}}, com {{practitioner_name}}.

Para confirmar, remarcar ou cancelar: {{reschedule_link}}
Ou contacte: {{clinic_phone}}

— OsteoJP`,
    },
    en: {
      subject:
        "Reminder: appointment in 48 hours — {{appointment_date}}, {{appointment_time}}",
      body: `Dear {{patient_first_name}},

Reminder of your appointment on {{appointment_date}} at {{appointment_time}}, at our {{clinic_location}} clinic, with {{practitioner_name}}.

To confirm, reschedule or cancel: {{reschedule_link}}
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
// Layout (owner ruling 2026-07-11, Option A): a scannable multi-line body —
// header, appointment line, location, reschedule CTA. Line breaks (LF) are
// GSM-7-safe (one septet each), so the multi-line form stays single-segment.
// Verified against the longest prod clinic name ("Castelo Branco").
//
// Go-live deviation from the doc (Stream E): SMS points to the clinic PHONE, not
// the reschedule short-link. The signed reschedule token (see link-token.ts) is
// far too long to fit a single GSM-7 segment alongside this copy, and a
// two-segment SMS doubles cost. The reschedule LINK lives in the email reminder;
// SMS keeps the phone CTA. (docs/sms-templates.md updated to match.)

export const SMS: Record<ReminderOffsetId, Record<Locale, string>> = {
  "48h": {
    pt: "OsteoJP - Lembrete\nConsulta: {date} as {time}\nLocal: {clinic}\nRemarcar: {phone}",
    en: "OsteoJP - Reminder\nAppointment: {date} at {time}\nLocation: {clinic}\nReschedule: {phone}",
  },
  /**
   * ==================================================================
   * WF-18 B (JP, approved verbally to the owner 2026-09-01): the 24h SMS
   * GAINS THE REPLY INSTRUCTION. One appended line; nothing else changed.
   * ==================================================================
   *
   * WHY THIS LINE HAD TO WAIT FOR JP. The inbound reply capability shipped
   * on 2026-08-31 fully working, and this body never mentioned it - so a
   * patient could reply SIM and be heard, but was never told they could.
   * Amending a body JP approved on 2026-08-03 is a question, not an edit,
   * and it was carried as Q-W14-03 until he answered it.
   *
   * THE WORDS ARE NOT WRITTEN HERE. `REMINDER_CONFIRM_INSTRUCTION` derives
   * them from `INBOUND_KEYWORDS` - the same config the classifier matches
   * against - so the words the reminder tells the patient to send can never
   * drift from the words the platform actually recognises. That module was
   * built for exactly this line and had no consumer until now.
   *
   * IT COSTS THE FEE VARIANT ITS SINGLE SEGMENT, and that is stated rather
   * than discovered: see the note above `renderSms`.
   */
  "24h": {
    pt:
      "OsteoJP - Lembrete\nConsulta: amanha {date} as {time}\nLocal: {clinic}\nRemarcar: {phone}\n" +
      REMINDER_CONFIRM_INSTRUCTION.pt,
    en:
      "OsteoJP - Reminder\nAppointment: tomorrow {date} at {time}\nLocation: {clinic}\nReschedule: {phone}\n" +
      REMINDER_CONFIRM_INSTRUCTION.en,
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

/**
 * `feeNotice` is THE ANSWER from `fee-notice.ts` `shouldRenderFeeNotice`, never
 * its inputs. This function does not know what the flag is called and cannot see
 * whether the patient accepted, which is what keeps the double gate at exactly
 * one site (W13-05).
 *
 * The line is APPENDED. `SMS[offset][locale]` is not read differently, not
 * re-authored and not branched on: the ten approved bodies are byte-identical
 * whether the fee notice renders or not, which `templates.test.ts` asserts. The
 * fee line is conditional ADDITIONAL content, per LOOP 5 section 5.
 *
 * `assertSmsCompliant` runs AFTER the append, so an overlong fee line fails the
 * render loudly instead of costing a silent second segment. See the segment
 * budget in fee-notice.ts - the margin is 7 characters and a test measures it.
 */
export function renderSms(
  offset: ReminderOffsetId,
  locale: Locale,
  ctx: ReminderContext,
  feeNotice = false,
): string {
  const tpl = SMS[offset][locale];
  const base = fill(tpl, {
    date: ctx.appointmentDateShort,
    time: ctx.appointmentTime,
    clinic: ctx.clinicLocation,
    phone: ctx.clinicPhone,
  });
  const message = feeNotice ? `${base}\n${FEE_NOTICE_SMS[locale]}` : base;
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

/* ================================================================== */
/* Confirmation — sent immediately after booking / reschedule          */
/* ================================================================== */

export const CONFIRMATION_EMAIL: Record<Locale, EmailTemplate> = {
  pt: {
    subject: "Marcação confirmada — {{appointment_date}}, {{appointment_time}}",
    body: `Olá {{patient_first_name}},

A sua marcação está confirmada:

  Data:      {{appointment_date}} às {{appointment_time}}
  Local:     {{clinic_location}}
  Terapeuta: {{practitioner_name}}

Para remarcar ou cancelar: {{reschedule_link}}
Ou contacte: {{clinic_phone}}

— OsteoJP`,
  },
  en: {
    subject: "Appointment confirmed — {{appointment_date}}, {{appointment_time}}",
    body: `Dear {{patient_first_name}},

Your appointment is confirmed:

  Date:       {{appointment_date}} at {{appointment_time}}
  Location:   {{clinic_location}}
  Therapist:  {{practitioner_name}}

To reschedule or cancel: {{reschedule_link}}
Or contact us: {{clinic_phone}}

— OsteoJP`,
  },
};

// PT: no accents (GSM-7). "marcacao" = marcação, "as" = às. Multi-line layout
// mirrors the reminder SMS (owner ruling 2026-07-11, Option A).
export const CONFIRMATION_SMS: Record<Locale, string> = {
  pt: "OsteoJP - Marcacao confirmada\nConsulta: {date} as {time}\nLocal: {clinic}\nRemarcar: {phone}",
  en: "OsteoJP - Appointment confirmed\nAppointment: {date} at {time}\nLocation: {clinic}\nReschedule: {phone}",
};

export function renderConfirmationEmail(locale: Locale, ctx: ReminderContext): RenderedEmail {
  const tpl = CONFIRMATION_EMAIL[locale];
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
  assertNoUnfilledPlaceholders("email/confirmation", subject);
  assertNoUnfilledPlaceholders("email/confirmation", body);
  return { subject, body };
}

export function renderConfirmationSms(locale: Locale, ctx: ReminderContext): string {
  const message = fill(CONFIRMATION_SMS[locale], {
    date: ctx.appointmentDateShort,
    time: ctx.appointmentTime,
    clinic: ctx.clinicLocation,
    phone: ctx.clinicPhone,
  });
  assertNoUnfilledPlaceholders("sms/confirmation", message);
  assertSmsCompliant(message);
  return message;
}

/* ================================================================== */
/* Follow-up — sent 24 h after appointment ends                        */
/* ================================================================== */

/**
 * Context for the post-visit follow-up. Slimmer than ReminderContext: the visit
 * is over so no time, practitioner, or reschedule link is relevant.
 */
export type FollowUpContext = {
  patientFirstName: string;
  /** Localised long date of the visit, e.g. "23 de maio de 2026". */
  appointmentDateLong: string;
  /** Terse dd/mm for SMS. */
  appointmentDateShort: string;
  clinicPhone: string;
};

export const FOLLOW_UP_EMAIL: Record<Locale, EmailTemplate> = {
  pt: {
    subject: "Obrigado pela sua visita — {{appointment_date}}",
    body: `Olá {{patient_first_name}},

Obrigado pela visita de {{appointment_date}}. Ficamos ao dispor para qualquer questão.

Para marcar a próxima consulta contacte: {{clinic_phone}}

— OsteoJP`,
  },
  en: {
    subject: "Thank you for your visit — {{appointment_date}}",
    body: `Dear {{patient_first_name}},

Thank you for your visit on {{appointment_date}}. We remain available for any questions.

To book your next appointment contact us: {{clinic_phone}}

— OsteoJP`,
  },
};

// PT: "proxima" = próxima (no tilde/accent). Multi-line layout mirrors the other
// SMS (owner ruling 2026-07-11, Option A); the post-visit context has no clinic
// or time, so it uses a visit line + rebooking CTA rather than the 4-line form.
export const FOLLOW_UP_SMS: Record<Locale, string> = {
  pt: "OsteoJP - Obrigado pela sua visita\nVisita: {date}\nMarcar proxima consulta: {phone}",
  en: "OsteoJP - Thank you for your visit\nVisit: {date}\nBook next appointment: {phone}",
};

export function renderFollowUpEmail(locale: Locale, ctx: FollowUpContext): RenderedEmail {
  const tpl = FOLLOW_UP_EMAIL[locale];
  const tokens = {
    patient_first_name: ctx.patientFirstName,
    appointment_date: ctx.appointmentDateLong,
    clinic_phone: ctx.clinicPhone,
  };
  const subject = fill(tpl.subject, tokens);
  const body = fill(tpl.body, tokens);
  assertNoUnfilledPlaceholders("email/follow_up", subject);
  assertNoUnfilledPlaceholders("email/follow_up", body);
  return { subject, body };
}

export function renderFollowUpSms(locale: Locale, ctx: FollowUpContext): string {
  const message = fill(FOLLOW_UP_SMS[locale], {
    date: ctx.appointmentDateShort,
    phone: ctx.clinicPhone,
  });
  assertNoUnfilledPlaceholders("sms/follow_up", message);
  assertSmsCompliant(message);
  return message;
}

/* ================================================================== */
/* No-show — sent when staff marks appointment as no_show              */
/* ================================================================== */

/**
 * Context for the no-show notification. Includes time (for the email body) and
 * a reschedule link so the patient can rebook directly.
 */
export type NoShowContext = {
  patientFirstName: string;
  appointmentDateLong: string;
  appointmentDateShort: string;
  appointmentTime: string;
  clinicPhone: string;
  rescheduleLink: string;
};

export const NO_SHOW_EMAIL: Record<Locale, EmailTemplate> = {
  pt: {
    subject: "Sentimos a sua falta — consulta de {{appointment_date}}",
    body: `Olá {{patient_first_name}},

A sua consulta de {{appointment_date}} às {{appointment_time}} ficou por realizar.

Para remarcar: {{reschedule_link}}
Ou contacte: {{clinic_phone}}

— OsteoJP`,
  },
  en: {
    subject: "We missed you — appointment on {{appointment_date}}",
    body: `Dear {{patient_first_name}},

Your appointment on {{appointment_date}} at {{appointment_time}} was not attended.

To rebook: {{reschedule_link}}
Or contact us: {{clinic_phone}}

— OsteoJP`,
  },
};

// PT: "nao" = não, "as" = às. No accents in SMS. Multi-line layout mirrors the
// other SMS (owner ruling 2026-07-11, Option A); the no-show context has no
// clinic location, so it drops the "Local:" line.
export const NO_SHOW_SMS: Record<Locale, string> = {
  pt: "OsteoJP - Consulta nao realizada\nConsulta: {date} as {time}\nRemarcar: {phone}",
  en: "OsteoJP - Missed appointment\nAppointment: {date} at {time}\nRebook: {phone}",
};

export function renderNoShowEmail(locale: Locale, ctx: NoShowContext): RenderedEmail {
  const tpl = NO_SHOW_EMAIL[locale];
  const tokens = {
    patient_first_name: ctx.patientFirstName,
    appointment_date: ctx.appointmentDateLong,
    appointment_time: ctx.appointmentTime,
    clinic_phone: ctx.clinicPhone,
    reschedule_link: ctx.rescheduleLink,
  };
  const subject = fill(tpl.subject, tokens);
  const body = fill(tpl.body, tokens);
  assertNoUnfilledPlaceholders("email/no_show", subject);
  assertNoUnfilledPlaceholders("email/no_show", body);
  return { subject, body };
}

export function renderNoShowSms(locale: Locale, ctx: NoShowContext): string {
  const message = fill(NO_SHOW_SMS[locale], {
    date: ctx.appointmentDateShort,
    time: ctx.appointmentTime,
    phone: ctx.clinicPhone,
  });
  assertNoUnfilledPlaceholders("sms/no_show", message);
  assertSmsCompliant(message);
  return message;
}
