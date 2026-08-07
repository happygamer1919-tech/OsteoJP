// The 50% no-show fee notice, and the DOUBLE GATE that governs it (W13-05).
//
// Pure module - no DB, no React, no `server-only`, no env read at import time.
// Fully unit-testable, which matters more here than anywhere else in the lane:
// this is the only piece of code that decides whether a fee is announced to a
// patient, and counsel's objection is about exactly that decision.
//
// ================================================================== //
// THE GATE IS PER-PATIENT ACCEPTANCE **AND** THE GLOBAL FLAG.
// ================================================================== //
//
// Never the flag alone. A global flag on its own would announce a fee to every
// patient the moment it was flipped, including patients who never accepted it -
// which is the precise thing counsel warned about, and the reason JP moved the
// acceptance step onto the ficha clinica in the first place.
//
// `shouldRenderFeeNotice` is the ONLY place that condition exists. Callers pass
// two booleans and consume one; nothing downstream re-tests either input. That
// is deliberate and is the loop's own halt condition: if the gate ever needs to
// be restated at a second site, the design is wrong and the loop halts rather
// than duplicating it. `renderSms` takes the ANSWER, never the inputs.
//
// ================================================================== //
// THE REGISTRY GATE IS THE THIRD LOCK, AND IT IS WHY THE ID CHANGES.
// ================================================================== //
//
// `packages/notify/gate.ts` resolves approval by TEMPLATE ID. If a fee-bearing
// message were sent under `reminder.24h.sms`, the gate would look up an APPROVED
// id and let unapproved copy through inside it - the approval gate doing its job
// on an id that no longer describes the body. So a fee-bearing send carries its
// own id, `FEE_NOTICE_TEMPLATE_ID`, registered `approved: false`. Until JP and
// counsel sign, the gate refuses it by name and the suppression log reads
// `template_unapproved`, which is the truthful reason.
//
// ================================================================== //
// SEGMENT BUDGET - MEASURED, NOT ASSUMED. THIS IS A REAL CONSTRAINT.
// ================================================================== //
//
// `assertSmsCompliant` THROWS above 160 chars, so an overlong fee line is not a
// cosmetic problem: it would fail the render, not truncate the message.
//
// Measured against the shipped 24h PT body filled with the approval packet's own
// sample data (10/09, 14:30, "Castelo Branco" - the longest prod clinic name per
// templates.ts:125 - and +351 272 000 000):
//
//   shipped 24h SMS, filled ................................. 99 chars
//   headroom to the 160-char single-segment limit ........... 61 chars
//   ...of which the joining newline takes ................... 1
//   SO THE FEE LINE MUST BE <= 60 CHARS.
//
// The packet's ORIGINAL line, "Falta sem aviso 24h: cobranca de 50%." is 37 and
// fits. But the packet (section "Variante B") records that counsel's REVISED
// wording replaces it and must refer to the accepted terms. Written as the
// natural full sentence -
//
//   "Falta sem aviso 24h: cobranca de 50%, nos termos aceites na marcacao."
//
// - that is 69 chars, total 169, and costs a SECOND SEGMENT. It does not fit.
// This is the halt condition WAVE-13.md LOOP 5 section 6 names, and the
// instruction there is to REPORT the measured count rather than trim approved
// copy. Nothing approved has been trimmed: the ten bodies are untouched and the
// line below is new, unapproved copy that JP has not yet seen.
//
// The shipped line is the terse revision, 53 chars, total 153, ONE segment,
// 7 chars of margin. `fee-notice.test.ts` measures all of this so the margin
// cannot be lost silently later, and the packet states the cost so JP chooses
// with it in front of him.

import type { Locale } from "@osteojp/i18n";
import type { EnvSource } from "@osteojp/notify";

/**
 * The flag. Default OFF, and OFF means anything other than the exact string
 * "true" - same fail-safe rule as REMINDERS_LIVE_SEND, for the same reason: a
 * typo in a Vercel env var must fail closed.
 *
 * It is committed nowhere as "true" and must not be. Arming it is a supervised
 * launch-day step under LAUNCH-01, after JP and counsel sign.
 */
export const FEE_NOTICE_FLAG = "REMINDERS_FEE_NOTICE_ENABLED" as const;

/**
 * The registry id a fee-bearing 24h SMS sends under. Registered
 * `approved: false`; see the header for why it is not `reminder.24h.sms`.
 */
export const FEE_NOTICE_TEMPLATE_ID = "reminder.24h.sms.fee_notice" as const;

/**
 * The clause JP ruled, EXACTLY as ruled (WAVE-13.md LOOP 5 step 6). It is
 * asserted character-for-character by a test rather than merely contained in the
 * body, because it is the phrase that ties the announcement to the thing the
 * patient actually signed. No accents: SMS is GSM-7 (see isGsm7).
 */
export const FEE_NOTICE_ACCEPTANCE_CLAUSE = "nos termos aceites na marcacao" as const;

/**
 * The fee line itself. UNAPPROVED copy - it reaches no patient until JP approves
 * the registry entry AND the flag is armed AND the patient has accepted.
 *
 * PT is authoritative (the clinic operates in pt-PT); EN is a faithful mirror.
 */
export const FEE_NOTICE_SMS: Record<Locale, string> = {
  pt: `Falta sem aviso: 50%, ${FEE_NOTICE_ACCEPTANCE_CLAUSE}.`,
  en: "Unnotified no-show: 50%, per the terms accepted at booking.",
};

/**
 * Is the global flag armed? Read at CALL time, never at module load, so tests
 * and env flips take effect without re-import - the same rule
 * `liveSendEnabled` follows.
 *
 * This answers only "is the switch on". It is HALF the gate and is never used
 * alone; `shouldRenderFeeNotice` is the whole gate.
 */
export function feeNoticeFlagEnabled(env: EnvSource = process.env): boolean {
  return env[FEE_NOTICE_FLAG] === "true";
}

/**
 * THE GATE. The single site where the fee-notice condition exists.
 *
 * Both inputs are required and both must be true. Written as an explicit `&&` of
 * two named booleans rather than a chain of early returns, so the whole rule is
 * one readable line and a future edit cannot drop half of it in a refactor
 * without the diff being obvious.
 */
export function shouldRenderFeeNotice(input: {
  /** The global switch. `feeNoticeFlagEnabled()`. */
  flagEnabled: boolean;
  /** THIS patient has a recorded row in `patient_terms_acceptances`. */
  patientHasAcceptedTerms: boolean;
}): boolean {
  return input.flagEnabled && input.patientHasAcceptedTerms;
}

/**
 * The template id a 24h SMS send must use, given the gate's answer. Keeps the
 * id and the body in step at the one call site that has both: a fee-bearing body
 * can never be sent under the approved plain id, because the id is derived from
 * the same boolean that put the line in the body.
 */
export function smsTemplateIdFor(offsetId: string, feeNotice: boolean): string {
  return feeNotice ? FEE_NOTICE_TEMPLATE_ID : `reminder.${offsetId}.sms`;
}
