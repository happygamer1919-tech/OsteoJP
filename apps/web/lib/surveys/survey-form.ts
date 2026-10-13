// THE SURVEY FORM'S FIELDS (SAT-01): reading them out of a POST and deciding
// whether they are an answer.
//
// PURE, and shared by the action and the form component: the action validates
// with it, and the component renders the state the action returns. Nothing here reads
// the code, the database or the clock.
//
// THE RULES ARE THE DATABASE'S (migration 0102's CHECKs), checked here first so
// a value the table would refuse comes back as a sentence beside its field and
// never as a failed insert: recommendation 0 to 10, satisfaction 1 to 5, a
// comment of at most 1000 characters, and a known consent label.

import { isSurveyConsentVersion, type SurveyConsentVersion } from "@osteojp/i18n";

export const SURVEY_NPS_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const SURVEY_RATING_VALUES = [1, 2, 3, 4, 5] as const;
export const SURVEY_COMMENT_MAX = 1000;

/**
 * The form's state between submits: which sentences to show, and nothing else.
 * `nps`, `rating` and `comment` mark a field (copy texts 22 to 24, under text
 * 21); `save` is the write that failed (text 25).
 *
 * NO ANSWER IS EVER IN IT. What the visitor entered stays in their browser's
 * own form: the state travels to the server with the next submit and a
 * framework may print an action's arguments, so a value kept here would be a
 * value written down.
 */
export type SurveyFormState = {
  errors: { nps?: true; rating?: true; comment?: true; save?: true };
};

export const EMPTY_SURVEY_FORM_STATE: SurveyFormState = { errors: {} };

export type ParsedSurveyForm =
  | {
      ok: true;
      answer: {
        nps: number;
        rating: number;
        comment: string | null;
        contactConsent: boolean;
        consentVersion: SurveyConsentVersion;
      };
    }
  | { ok: false; state: SurveyFormState };

/** One of the offered whole numbers, or null. `"7"` is 7; `"7.0"`, `" 7"` and `"07"` are not. */
function choiceOf(raw: string, allowed: readonly number[]): number | null {
  const found = allowed.find((n) => String(n) === raw);
  return found === undefined ? null : found;
}

/**
 * The comment as it will be stored and counted.
 *
 * A browser submits a textarea's line breaks as CR LF while its own
 * `maxlength` counts each as one, so a comment the page accepted at exactly
 * 1000 would arrive longer. Line breaks are folded to LF before counting. NUL
 * cannot be stored in a Postgres text value and is removed.
 */
function normaliseComment(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").replace(/\u0000/g, "");
}

/** Characters as Postgres counts them (`char_length`): code points, not UTF-16 units. */
function characterCount(text: string): number {
  return Array.from(text).length;
}

export function parseSurveyForm(formData: FormData): ParsedSurveyForm {
  const text = (name: string): string => {
    const v = formData.get(name);
    return typeof v === "string" ? v : "";
  };

  const comment = normaliseComment(text("comment"));
  const nps = choiceOf(text("nps"), SURVEY_NPS_VALUES);
  const rating = choiceOf(text("rating"), SURVEY_RATING_VALUES);
  const consentVersion = formData.get("consentVersion");

  const errors: SurveyFormState["errors"] = {};
  if (nps === null) errors.nps = true;
  if (rating === null) errors.rating = true;
  if (characterCount(comment) > SURVEY_COMMENT_MAX) errors.comment = true;
  // A label the page never rendered is not a field the visitor can correct. It
  // is reported as the save that did not happen, and nothing is written.
  if (!isSurveyConsentVersion(consentVersion)) errors.save = true;

  if (nps === null || rating === null || errors.comment || !isSurveyConsentVersion(consentVersion)) {
    return { ok: false, state: { errors } };
  }

  return {
    ok: true,
    answer: {
      nps,
      rating,
      // Blank or only whitespace is no comment. Otherwise stored as written.
      comment: comment.trim() === "" ? null : comment,
      contactConsent: formData.get("contactConsent") !== null,
      consentVersion,
    },
  };
}
