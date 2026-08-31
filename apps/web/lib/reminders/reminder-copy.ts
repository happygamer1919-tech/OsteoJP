// Reminder confirm-affordance copy — a CONFIG VALUE, not a hardcoded literal.
//
// SPEC §4.2: the 24h reminder gains a confirm affordance — the patient can reply
// with a keyword to confirm/cancel (parsed by inbound-classify.ts). The copy is
// derived HERE from the single keyword-config source of truth (INBOUND_KEYWORDS)
// so the words the reminder tells the patient to send can never drift from the
// words the classifier actually recognizes. The live 24h-with-confirm send path
// (deferred, gated OFF) consumes this constant instead of inlining a string.
//
// GSM-7 safe (no accents) so appending it to the SMS keeps it single-segment.

import type { Locale } from "@osteojp/i18n";

import { INBOUND_KEYWORDS } from "./inbound-classify";

/** The primary keyword the patient sends to confirm / cancel, upper-cased. */
export const CONFIRM_KEYWORD = INBOUND_KEYWORDS.confirm[0]!.toUpperCase(); // "SIM"
export const CANCEL_KEYWORD = INBOUND_KEYWORDS.cancel[0]!.toUpperCase(); // "NAO"

/**
 * The reminder's inbound-reply instruction line, per locale. Config value —
 * change the copy here, never at the send site. Reply keywords stay in pt-PT in
 * both locales because the classifier only recognizes the pt-PT keyword set.
 */
export const REMINDER_CONFIRM_INSTRUCTION: Record<Locale, string> = {
  pt: `Responda ${CONFIRM_KEYWORD} para confirmar ou ${CANCEL_KEYWORD} para cancelar`,
  en: `Reply ${CONFIRM_KEYWORD} to confirm or ${CANCEL_KEYWORD} to cancel`,
};

/** Accessor mirroring the templates.ts render* pattern (read config, no literal). */
export function reminderConfirmInstruction(locale: Locale): string {
  return REMINDER_CONFIRM_INSTRUCTION[locale];
}

/* ================================================================== */
/* Reply acknowledgements — NEW WORDING, NOT YET APPROVED              */
/* ================================================================== */
/*
 * W14-04: the answer the patient gets back after replying SIM or NAO.
 *
 * ==========================================================================
 * THESE THREE BODIES ARE NEW COPY AND JP HAS NOT SEEN THEM.
 * ==========================================================================
 * Every other patient-facing body in this app was approved by JP on
 * 2026-08-03 as part of docs/notifications-approval-packet.md, or (the 48h
 * email) re-approved on 2026-08-05. Nothing in that packet acknowledges a
 * reply, because when it was written the inbound path did not exist.
 *
 * They were registered `approved: false` for a month of calendar time and a day
 * of wall-clock, exactly as the fee-notice line still is. The gate refused every
 * send with `template_unapproved` and the patient received nothing, while the
 * inbound path went on confirming and cancelling appointments - the status
 * change was never gated on the acknowledgement, so the capability worked
 * silently rather than not at all.
 *
 * WRITING THEM BEFORE ASKING IS WHAT MADE THE APPROVAL CHEAP. The thing JP
 * approved is the exact string that sends, with its GSM-7 and single-segment
 * properties already proven, so "approved" required no follow-up work and no
 * second reading. That is the argument for registering unapproved copy rather
 * than leaving it unwritten until somebody has time to ask.
 *
 * pt-PT is the registered locale; the EN mirror travels with it, the same
 * convention notification-registry.ts documents for the other ten.
 */

/** Sent after a reply that moved the appointment `scheduled` -> `confirmed`. */
export const REPLY_ACK_CONFIRMED: Record<Locale, string> = {
  pt: "OsteoJP - Consulta confirmada. Obrigado.",
  en: "OsteoJP - Appointment confirmed. Thank you.",
};

/** Sent after a reply that moved the appointment `scheduled` -> `cancelled`. */
export const REPLY_ACK_CANCELLED: Record<Locale, string> = {
  pt: "OsteoJP - Consulta cancelada. Para remarcar contacte a clinica.",
  en: "OsteoJP - Appointment cancelled. Contact the clinic to rebook.",
};

/**
 * Sent after a reply that changed NOTHING — ambiguous wording, no matching
 * appointment, outside the reply window, or a confirm the database refused.
 *
 * ONE BODY FOR ALL OF THEM, deliberately. The distinctions are operational and
 * belong to reception; telling the sender which internal guard rail they hit
 * would leak whether a given phone number has an appointment at this clinic to
 * anyone who texts the number. It says a person will look, which is true in
 * every one of those cases.
 */
export const REPLY_ACK_REVIEW: Record<Locale, string> = {
  pt: "OsteoJP - Recebemos a sua mensagem. A recepcao vai confirmar consigo.",
  en: "OsteoJP - We received your message. Reception will get back to you.",
};

/** Template ids for the three acknowledgements. Registered, unapproved. */
export const REPLY_ACK_TEMPLATE_IDS = {
  confirmed: "reply_ack.confirmed.sms",
  cancelled: "reply_ack.cancelled.sms",
  review: "reply_ack.review.sms",
} as const;
