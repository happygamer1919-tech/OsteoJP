import pt from "./src/strings.pt.json";
import en from "./src/strings.en.json";

export const LOCALES = ["pt", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pt";

const dictionaries = { pt, en } as const;

export type StringKey = keyof typeof pt & keyof typeof en;

export function getStrings(locale: Locale): Readonly<Record<StringKey, string>> {
  return dictionaries[locale];
}

export function t(locale: Locale, key: StringKey): string {
  return dictionaries[locale][key];
}
