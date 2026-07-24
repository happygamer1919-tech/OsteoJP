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
