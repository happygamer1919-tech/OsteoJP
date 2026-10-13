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
import { submitSurveyResponse } from "@/lib/surveys/survey-store";

// The one server action behind /s/<code>: the answer.
//
// THE ONLY WRITE ON THIS SURFACE HAPPENS HERE. Opening the link renders a page
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
