// SAT-01: THE ONE PLACE A SURVEY MESSAGE IS BUILT.
//
// templates.ts holds the approved texts. This module reads the one thing they
// need from the environment, the origin that serves /s/<code>, and hands back a
// finished email or SMS, or the reason there is not one.
//
// IT ANSWERS INSTEAD OF THROWING, for the reason sms-body.ts gives. The order
// of work for a send is: generate the code (touches nothing), build the body,
// and only then issue the send in the database and hand the body to the
// provider. A refusal that travels as a value lets the sender record why it
// sent nothing, and a body that was refused has cost no row and no code.
//
// THE HOST IS THE CONFIRM LINK'S HOST: one variable, read through
// confirm-code.ts, so the two patient links cannot name different origins. It
// is configuration, so its length is not this code's to bound, and that is why
// the SMS verdict is taken here on every body: the SMS is one GSM-7 segment or
// it is refused, never split into two billed parts.
//
// Nothing here sends, and nothing here asks whether a send is allowed. That is
// survey-mode.ts, and the sender asks it first.

import type { Locale } from "@osteojp/i18n";
import type { EnvSource } from "@osteojp/notify";

import { CONFIRM_LINK_BASE_VAR, confirmLinkHostOrNull } from "./confirm-code";
import {
  assembleSurveySms,
  renderSurveyEmail,
  smsCompliance,
  type RenderedEmail,
  type SurveyEmailContext,
} from "./templates";

/** The path of the answer page. `/c/` is the confirm page's; this is its neighbour. */
const SURVEY_PATH = "/s/";

/**
 * The two forms of one link: the whole address for the email, and the bare
 * `<host>/s/<code>` for the SMS. Null when the origin is not configured, which
 * is the one thing null means here.
 *
 * The email form keeps the origin exactly as it is configured, as the
 * reschedule link in dispatch.ts does; only a trailing slash is dropped.
 */
export function surveyLinks(
  code: string,
  env: EnvSource = process.env,
): { email: string; sms: string } | null {
  const host = confirmLinkHostOrNull(env);
  const base = env[CONFIRM_LINK_BASE_VAR]?.trim();
  if (host === null || !base) return null;
  return {
    email: `${base.replace(/\/+$/, "")}${SURVEY_PATH}${code}`,
    sms: `${host}${SURVEY_PATH}${code}`,
  };
}

function noLinkOrigin(channel: "email" | "sms"): string {
  return (
    `reminders/survey-${channel}: ${CONFIRM_LINK_BASE_VAR} is not set, so the survey link has no ` +
    "origin to point at; set it to the deployed app origin that serves /s/<code>"
  );
}

/**
 * An SMS body, or the reason there is not one. The shape of `SmsBodyResult` in
 * sms-body.ts, and the same three named kinds, because they need different
 * operator actions: two are a text that does not fit, one is a variable unset.
 */
export type SurveySmsResult =
  | { ok: true; body: string; length: number }
  | {
      ok: false;
      kind: "too_long" | "not_gsm7" | "no_link_origin";
      /** One sentence, safe to show an operator. Never a recipient, never a code. */
      refusal: string;
      /** The length that was refused, or null when nothing could be assembled. */
      length: number | null;
    };

export type SurveySmsBodyArgs = {
  locale: Locale;
  /** Terse dd/mm, as every SMS here prints the date. */
  appointmentDateShort: string;
  /** The plaintext code. A VALUE, NOT A ROW: nothing is written before a body exists. */
  code: string;
  env?: EnvSource;
};

export function renderSurveySmsBody(args: SurveySmsBodyArgs): SurveySmsResult {
  const links = surveyLinks(args.code, args.env ?? process.env);
  if (links === null) {
    return { ok: false, kind: "no_link_origin", refusal: noLinkOrigin("sms"), length: null };
  }

  const message = assembleSurveySms(args.locale, {
    appointmentDateShort: args.appointmentDateShort,
    surveyLinkBare: links.sms,
  });

  const verdict = smsCompliance(message);
  if (!verdict.ok) {
    return { ok: false, kind: verdict.kind, refusal: verdict.message, length: verdict.length };
  }
  return { ok: true, body: message, length: message.length };
}

/** An email, or the one reason there is not one: no origin for the link. */
export type SurveyEmailResult =
  | ({ ok: true } & RenderedEmail)
  | { ok: false; kind: "no_link_origin"; refusal: string };

export type SurveyEmailBodyArgs = {
  locale: Locale;
  ctx: Omit<SurveyEmailContext, "surveyLink">;
  /** The plaintext code, as for the SMS. */
  code: string;
  env?: EnvSource;
};

export function renderSurveyEmailBody(args: SurveyEmailBodyArgs): SurveyEmailResult {
  const links = surveyLinks(args.code, args.env ?? process.env);
  if (links === null) {
    return { ok: false, kind: "no_link_origin", refusal: noLinkOrigin("email") };
  }
  const rendered = renderSurveyEmail(args.locale, { ...args.ctx, surveyLink: links.email });
  return { ok: true, ...rendered };
}
