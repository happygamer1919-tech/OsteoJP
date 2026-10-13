/**
 * SAT-01 - which text the satisfaction survey was answered under.
 *
 * THE INTAKE MECHANISM, REUSED (intake-consent.ts). Every answer stores
 * `appointment_survey_responses.consent_version`: the LABEL of the page text the
 * patient was shown, never the text. The label covers what an answer means and
 * what the patient was told about it: the three questions with their scale
 * ends, the sentence saying who reads the answers, and the contact permission
 * sentence, in either locale. SURVEY_CONSENT_TEXT_KEYS below is that list.
 *
 * THE RULE: when any of those texts changes, ADD a new label to the end of this
 * list and never edit an old one. Old rows keep the label they were answered
 * under. A test in apps/web pins the sha256 of the texts to
 * CURRENT_SURVEY_CONSENT_VERSION, so an edit under an unchanged label fails.
 *
 * A LABEL IS AT MOST 64 CHARACTERS: migration 0102's CHECK on the column. The
 * same test refuses a longer one, so a label that the database would reject
 * cannot be added here.
 *
 * WHY THE PAGE'S ACTION ACCEPTS EVERY LISTED LABEL AND NOT ONLY THE CURRENT
 * ONE. A page rendered just before a label is added posts the label of the text
 * it SHOWED. Storing that older label is the truthful record.
 */
export const SURVEY_CONSENT_VERSIONS = ["sat01-survey-2026-10-02"] as const;

export type SurveyConsentVersion = (typeof SURVEY_CONSENT_VERSIONS)[number];

/** The label the page sends today: always the LAST entry above. */
export const CURRENT_SURVEY_CONSENT_VERSION: SurveyConsentVersion =
  SURVEY_CONSENT_VERSIONS[SURVEY_CONSENT_VERSIONS.length - 1]!;

/** The longest label the database accepts (0102, `consent_version_length`). */
export const SURVEY_CONSENT_VERSION_MAX_LENGTH = 64;

/**
 * The strings a label names, in the order they are hashed. Keys of
 * strings.pt.json and strings.en.json.
 */
export const SURVEY_CONSENT_TEXT_KEYS = [
  "survey.page.whoReads",
  "survey.page.q1",
  "survey.page.q1Low",
  "survey.page.q1High",
  "survey.page.q2",
  "survey.page.q2Low",
  "survey.page.q2High",
  "survey.page.q3",
  "survey.page.contactConsent",
] as const;

/** Validates an untrusted value against the list rather than casting into it. */
export function isSurveyConsentVersion(value: unknown): value is SurveyConsentVersion {
  return (
    typeof value === "string" &&
    (SURVEY_CONSENT_VERSIONS as readonly string[]).includes(value)
  );
}
