// @osteojp/i18n — strings.pt.json + strings.en.json + locale loader. PT primary, EN secondary.
export const PACKAGE_NAME = "@osteojp/i18n" as const;

export { LOCALES, DEFAULT_LOCALE, HTML_LANG, htmlLang, getStrings, t } from "./strings";
export type { Locale, StringKey } from "./strings";

export {
  getPortalStrings,
  // LANG-01: exported so a caller can VALIDATE an untrusted `?lang=` against
  // the union rather than casting a string into it. It has existed since the
  // portal dictionary was added and nothing could reach it.
  PORTAL_LOCALES,
  type PortalLocale,
  type PortalStrings,
} from "./portal-strings";

// INTAKE-01 / WF-19 - the version label of the guest intake consent text. The
// API validates against the list, the portal sends the current label, and the
// portal's consent copy pins its hash to it.
export {
  INTAKE_CONSENT_VERSIONS,
  CURRENT_INTAKE_CONSENT_VERSION,
  isIntakeConsentVersion,
  type IntakeConsentVersion,
} from "./src/intake-consent";

// SAT-01 - the version label of the satisfaction survey's page text. The page
// sends the current label, its action validates against the list, and a test in
// apps/web pins the hash of the texts to it.
export {
  SURVEY_CONSENT_VERSIONS,
  CURRENT_SURVEY_CONSENT_VERSION,
  SURVEY_CONSENT_VERSION_MAX_LENGTH,
  SURVEY_CONSENT_TEXT_KEYS,
  isSurveyConsentVersion,
  type SurveyConsentVersion,
} from "./src/survey-consent";
