// App-side locale accessor. The platform defaults to Portuguese; per-user /
// per-patient locale selection is a later concern. Importing the dictionary
// here keeps every component on the same typed string keys.
import { DEFAULT_LOCALE, getStrings, type Locale } from "@osteojp/i18n";

export const locale: Locale = DEFAULT_LOCALE;
export const s = getStrings(locale);
