// @osteojp/i18n — strings.pt.json + strings.en.json + locale loader. PT primary, EN secondary.
export const PACKAGE_NAME = "@osteojp/i18n" as const;

export { LOCALES, DEFAULT_LOCALE, HTML_LANG, htmlLang, getStrings, t } from "./strings";
export type { Locale, StringKey } from "./strings";

export {
  getPortalStrings,
  type PortalLocale,
  type PortalStrings,
} from "./portal-strings";
