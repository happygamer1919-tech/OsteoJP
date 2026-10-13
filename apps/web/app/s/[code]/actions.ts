"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@osteojp/i18n";
import {
  RULES,
  checkDurableRateLimit,
  clientKeyFromHeaders,
  createDurableRateLimitStore,
} from "@osteojp/rate-limit";
import { isWellFormedSurveyCode } from "@/lib/surveys/survey-code";
import { parseSurveyForm, type SurveyFormState } from "@/lib/surveys/survey-form";
import { optOutSurvey, submitSurveyResponse } from "@/lib/surveys/survey-store";

// The two server actions behind /s/<code>: the answer, and the opt-out (S8).
//
// THE ONLY WRITES ON THIS SURFACE HAPPEN HERE. Opening the link renders a page
// and performs nothing, so a mail or SMS scanner that follows it spends nothing.
//
// WHAT IS NEVER WRITTEN DOWN: the code and the answers. No log line or error
// report carries either, and no answer enters a URL. The one log line below
// carries an error's class name and nothing else.

/** Every refusal goes to the one page a link that is not valid gets. */
function genericUrl(code: string): string {
  return `/s/${encodeURIComponent(code)}?r=generic`;
}

function localeOf(value: FormDataEntryValue | null): Locale {
  return (LOCALES as readonly string[]).includes(value as string) ? (value as Locale) : DEFAULT_LOCALE;
}

export async function submitSurveyAction(
  _previous: SurveyFormState,
  formData: FormData,
): Promise<SurveyFormState> {
  const code = String(formData.get("code") ?? "");

  // Shape first, and it costs no budget and no query: garbage that never
  // reaches the database cannot use up the allowance of a patient behind the
  // same address. The ordering /c/[code] and /r/[token] settled on.
  if (!isWellFormedSurveyCode(code)) redirect(genericUrl(code));

  // The fields next, BEFORE the limiter, and by the same rule: an incomplete
  // answer reaches no query and costs no budget. It is also what keeps the
  // limiter silent. An incomplete answer is given its marked fields whatever
  // the code is, so were it counted first, the post that stopped getting them
  // would show the moment the limit was reached.
  const parsed = parseSurveyForm(formData);
  if (!parsed.ok) return parsed.state;

  const verdict = await checkDurableRateLimit(
    clientKeyFromHeaders(await headers(), "s-code"),
    RULES.surveySubmit,
    createDurableRateLimitStore(),
  );
  if (!verdict.ok) {
    // NOT a 429 and not a sentence of its own (SR-30): a distinguishable "too
    // many attempts" would tell a prober their earlier attempts registered. It
    // is the page an invalid link gets. Only a complete answer comes this far,
    // and a complete answer to a bad code is sent to that page as well.
    redirect(genericUrl(code));
  }

  let outcome: "recorded" | "refused";
  try {
    outcome = await submitSurveyResponse({ code, answer: parsed.answer });
  } catch (err) {
    // The class name only. A database error's message can quote the row it
    // refused, and the row holds the comment.
    console.error("[surveys] the answer was not saved:", err instanceof Error ? err.name : "unknown");
    return { errors: { save: true } };
  }

  // Unknown, spent, expired and no longer eligible are one answer, and it is
  // the limiter's answer too.
  if (outcome !== "recorded") redirect(genericUrl(code));

  // The outcome travels as a query flag because there is no session: a code is
  // not a login. The language rides with it, since the code no longer resolves
  // to a clinic once it is answered.
  redirect(`/s/${encodeURIComponent(code)}?r=answered&l=${localeOf(formData.get("locale"))}`);
}

/**
 * "Não quero receber mais avaliações" (S8): the holder of a valid link stops
 * the surveys for the patient it was sent to.
 *
 * THE SAME ORDER AS THE ANSWER: the code's shape, the fields, the limiter, the
 * door. There are no fields: the opt-out posts the code and the page's language
 * and nothing else, so nothing the visitor had typed into the form above it
 * travels with it.
 *
 * THE SAME BUDGET AS THE ANSWER, on purpose. One address has one allowance on
 * this surface, whichever button it presses; a second rule would hand a prober
 * ten more guesses a minute.
 *
 * THE SAME REFUSAL AS THE ANSWER: a malformed code, the limiter and a code the
 * door does not take all go to the page an invalid link gets. Whether a code
 * could have opted somebody out is as invisible as whether it could have been
 * answered.
 */
export async function optOutSurveyAction(
  _previous: SurveyFormState,
  formData: FormData,
): Promise<SurveyFormState> {
  const code = String(formData.get("code") ?? "");

  if (!isWellFormedSurveyCode(code)) redirect(genericUrl(code));

  const verdict = await checkDurableRateLimit(
    clientKeyFromHeaders(await headers(), "s-code"),
    RULES.surveySubmit,
    createDurableRateLimitStore(),
  );
  if (!verdict.ok) redirect(genericUrl(code));

  let outcome: "recorded" | "refused";
  try {
    outcome = await optOutSurvey({ code });
  } catch (err) {
    // The class name only, as above. A request that was not saved must not
    // read as an invalid link: the visitor would believe it had been taken.
    console.error("[surveys] the opt-out was not saved:", err instanceof Error ? err.name : "unknown");
    return { errors: { save: true } };
  }

  if (outcome !== "recorded") redirect(genericUrl(code));

  // The code no longer resolves once it is spent, so the language rides along.
  redirect(`/s/${encodeURIComponent(code)}?r=optedout&l=${localeOf(formData.get("locale"))}`);
}
