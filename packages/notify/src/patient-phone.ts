// PHONE-01 - what the staff patient form accepts as a phone number, what it
// stores, and whether an SMS can reach what is stored.
//
// Pure module: no DB, no env, no `server-only`. Unit-testable anywhere, and
// importable by a client component, which is the point: the form shows the
// normalised value BEFORE saving with the same function the server saves with.
//
// ==========================================================================
// IT DOES NOT REDEFINE THE PORTUGUESE RULE. IT CALLS IT.
// ==========================================================================
// `normalizePhonePT` (./phone.ts) is the single definition of a well-formed PT
// number and `phone-single-source.test.ts` refuses a second one. Every PT answer
// below is produced by calling it, so "the form accepted it" and "the reminder
// path can normalise it" are one fact, not two that happen to agree. What this
// file adds is what `normalizePhonePT` deliberately does not do: say WHY a number
// was refused, accept a foreign number, and classify the result.
//
// ==========================================================================
// A FOREIGN NUMBER IS ACCEPTED AND STORED, AND STILL GETS NO SMS.
// ==========================================================================
// The reminder path sends only to numbers `normalizePhonePT` accepts, so a
// foreign number is skipped there as `invalid_phone`. That is unchanged by this
// module (Q-PHONE-01-1 asks whether it should change). What changes is that the
// patient's record and the booking drawer SAY so, instead of the skip living in
// a log line nobody reads.

import { normalizePhonePT } from "./phone";
import { isSmsCapablePT } from "./sms-capability";

export type PatientPhoneKind = "pt_mobile" | "pt_landline" | "foreign";

/** Why a typed number was refused. Stable codes; the sentence is `message`. */
export type PatientPhoneRefusal =
  | "characters"
  | "plus_position"
  | "country_code"
  | "pt_length"
  | "pt_prefix"
  | "no_prefix_length"
  | "foreign_length";

export type PatientPhoneResult =
  /** Nothing typed. A patient may have no phone. */
  | { ok: true; kind: "none"; e164: null }
  | { ok: true; kind: PatientPhoneKind; e164: string }
  | { ok: false; reason: PatientPhoneRefusal; message: string };

/** The separators a person types between digit groups. Same set as `normalizePhonePT`. */
const SEPARATORS = /[\s.\-()]/g;

function refuse(reason: PatientPhoneRefusal, digits?: number): PatientPhoneResult {
  return { ok: false, reason, message: refusalMessage(reason, digits ?? 0) };
}

/**
 * The sentence for a refusal, pt-PT, naming what to fix. Same convention as the
 * NIF messages in apps/web/lib/patients/validation.ts: the server returns it and
 * the form shows it beside the box.
 */
export function refusalMessage(reason: PatientPhoneRefusal, digits: number): string {
  switch (reason) {
    case "characters":
      return "Telemóvel inválido: use apenas algarismos, espaços, pontos, hífenes, parênteses e um + no início.";
    case "plus_position":
      return "Telemóvel inválido: o + só pode estar no início do número.";
    case "country_code":
      return "Telemóvel inválido: falta o indicativo do país depois de + ou 00.";
    case "pt_length":
      return `Número português inválido: deve ter 9 dígitos depois do indicativo 351 (tem ${digits}).`;
    case "pt_prefix":
      return "Número português inválido: deve começar por 2 (fixo) ou 9 (telemóvel).";
    case "no_prefix_length":
      return `Telemóvel inválido: indique 9 dígitos, ou o número completo com o indicativo do país (+ ou 00). Tem ${digits} dígitos.`;
    case "foreign_length":
      return `Número estrangeiro inválido: deve ter entre 8 e 15 dígitos, incluindo o indicativo do país (tem ${digits}).`;
  }
}

function classifyPt(e164: string): PatientPhoneKind {
  return isSmsCapablePT(e164) ? "pt_mobile" : "pt_landline";
}

/**
 * Parse a phone number typed into the staff patient form.
 *
 * Accepted (separators - spaces, dots, hyphens, parentheses - stripped):
 *   "912345678", "212345678"       bare 9-digit PT subscriber (9 mobile, 2 fixed)
 *   "+351912345678"                 E.164
 *   "00351912345678"                international 00 prefix
 *   "351912345678"                  country code without + or 00 (what
 *                                   `normalizePhonePT` already accepts)
 *   "+447700900123", "0033612345678" foreign: a country code other than 351,
 *                                   8 to 15 digits in total, not starting 0
 *
 * The stored value is `e164`: `+` and digits, nothing else.
 */
export function parsePatientPhone(raw: string | null | undefined): PatientPhoneResult {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return { ok: true, kind: "none", e164: null };

  const compact = trimmed.replace(SEPARATORS, "");
  if (/[^\d+]/.test(compact)) return refuse("characters");
  if (compact.lastIndexOf("+") > 0) return refuse("plus_position");

  const international = compact.startsWith("+")
    ? compact.slice(1)
    : compact.startsWith("00")
      ? compact.slice(2)
      : null;

  if (international !== null) {
    if (international === "" || international.startsWith("0")) return refuse("country_code");
    if (international.startsWith("351")) {
      const subscriber = international.slice(3);
      if (subscriber.length !== 9) return refuse("pt_length", subscriber.length);
      const e164 = normalizePhonePT(compact);
      if (e164 === null) return refuse("pt_prefix");
      return { ok: true, kind: classifyPt(e164), e164 };
    }
    if (international.length < 8 || international.length > 15) {
      return refuse("foreign_length", international.length);
    }
    return { ok: true, kind: "foreign", e164: `+${international}` };
  }

  // No + and no 00. Either the 9-digit PT subscriber or 351 + subscriber, which
  // are the two unprefixed shapes `normalizePhonePT` accepts. Anything else has
  // no country the number could be read in.
  if (compact.length === 9 || /^351\d{9}$/.test(compact)) {
    const e164 = normalizePhonePT(compact);
    if (e164 === null) return refuse("pt_prefix");
    return { ok: true, kind: classifyPt(e164), e164 };
  }
  return refuse("no_prefix_length", compact.length);
}

/** Why an SMS will not reach a stored phone, or null when it will (or there is no phone). */
export type NoSmsReason = "landline" | "foreign" | "unparseable";

/**
 * The non-SMS marker, derived from the STORED value at read time.
 *
 * Read time rather than a stored flag, so it is right for the ~8,400 imported
 * patients whose phones are free text as well as for every number saved through
 * the form. A legacy value the form would refuse is `unparseable`: the reminder
 * path cannot normalise it either, so no SMS reaches it.
 *
 * No phone at all is null, not a marker: the ruling asks for a marker on a number
 * SMS cannot reach, and a missing number is already visible as a dash.
 */
export function noSmsReason(stored: string | null | undefined): NoSmsReason | null {
  const parsed = parsePatientPhone(stored);
  if (!parsed.ok) return "unparseable";
  switch (parsed.kind) {
    case "none":
    case "pt_mobile":
      return null;
    case "pt_landline":
      return "landline";
    case "foreign":
      return "foreign";
  }
}
