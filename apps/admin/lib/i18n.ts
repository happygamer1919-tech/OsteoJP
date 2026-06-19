// App-side locale accessor for the superadmin app. PT default, same typed keys
// as the rest of the platform (@osteojp/i18n). Admin is internal-staff-only;
// no language switcher is provided (intentional — EN/PT mixed is acceptable for
// an ops tool used exclusively by platform operators).
import { DEFAULT_LOCALE, getStrings, type Locale } from "@osteojp/i18n";

export const locale: Locale = DEFAULT_LOCALE;
export const s = getStrings(locale);
