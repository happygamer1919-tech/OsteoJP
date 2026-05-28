// @osteojp/i18n — strings.pt.json + strings.en.json + locale loader. PT primary, EN secondary.
export const PACKAGE_NAME = "@osteojp/i18n" as const;

export { LOCALES, DEFAULT_LOCALE, getStrings, t } from "./strings.js";
export type { Locale, StringKey } from "./strings.js";
