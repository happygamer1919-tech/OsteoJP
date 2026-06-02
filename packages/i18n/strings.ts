import pt from "./src/strings.pt.json";
import en from "./src/strings.en.json";

export const LOCALES = ["pt", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pt";

// BCP-47 document language tag per locale. The app locale (`Locale`, e.g. "pt")
// is region-less; native date pickers in Firefox/Safari derive their format from
// the *document* `<html lang>`, so we resolve to a region-qualified tag here:
//   pt -> pt-PT  (dd/mm/aaaa)
//   en -> en-GB  (dd/mm/yyyy; EU clinic — avoids en-US mm/dd/yyyy)
// Single source of truth for the document language. Consumed by the root layout.
export const HTML_LANG: Record<Locale, string> = {
  pt: "pt-PT",
  en: "en-GB",
};

/**
 * BCP-47 tag for the document `<html lang>`. Defaults to DEFAULT_LOCALE.
 * Seam for per-locale switching: once a per-request/per-tenant locale exists,
 * pass it in — `htmlLang(resolvedLocale)`.
 */
export function htmlLang(locale: Locale = DEFAULT_LOCALE): string {
  return HTML_LANG[locale];
}

const dictionaries = { pt, en } as const;

export type StringKey = keyof typeof pt & keyof typeof en;

export function getStrings(locale: Locale): Readonly<Record<StringKey, string>> {
  return dictionaries[locale];
}

export function t(locale: Locale, key: StringKey): string {
  return dictionaries[locale][key];
}
