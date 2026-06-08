// App-side locale accessor for the patient API app. PT default, same typed keys
// as the rest of the platform (@osteojp/i18n).
import { DEFAULT_LOCALE, getStrings, type Locale } from "@osteojp/i18n";

export const locale: Locale = DEFAULT_LOCALE;
export const s = getStrings(locale);
