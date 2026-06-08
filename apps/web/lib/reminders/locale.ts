// Locale + Lisbon date/time formatting for reminders.
//
// Pure module. The clinic has no per-patient locale column in V1, so locale is
// resolved from tenant settings (jsonb) with the platform default as fallback,
// and an optional explicit patient preference that wins when present — the seam
// for a future patients.locale column without changing callers.

import { DEFAULT_LOCALE, LOCALES, type Locale } from "@osteojp/i18n";

const LISBON_TZ = "Europe/Lisbon";
const BCP47: Record<Locale, string> = { pt: "pt-PT", en: "en-GB" };

function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

function readLocaleField(settings: unknown): unknown {
  if (settings && typeof settings === "object" && "locale" in settings) {
    return (settings as { locale?: unknown }).locale;
  }
  return undefined;
}

/**
 * Resolve the locale for a reminder. Precedence:
 *   1. explicit patient preference (forward-compat; unused in V1)
 *   2. tenant default (tenants.settings.locale)
 *   3. platform default (pt)
 *
 * `tenantSettings` is the raw jsonb blob (typed `unknown` at the DB seam), so we
 * narrow defensively rather than trusting a shape.
 */
export function resolveLocale(
  tenantSettings: unknown,
  patientLocale?: unknown,
): Locale {
  if (isLocale(patientLocale)) return patientLocale;
  const tenantLocale = readLocaleField(tenantSettings);
  if (isLocale(tenantLocale)) return tenantLocale;
  return DEFAULT_LOCALE;
}

/** "HH:mm" Lisbon wall-clock for a UTC instant. */
export function formatTime(instant: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(BCP47[locale], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: LISBON_TZ,
  }).format(instant);
}

/** Long localised date for email, e.g. "23 de maio de 2026" / "23 May 2026". */
export function formatDateLong(instant: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(BCP47[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: LISBON_TZ,
  }).format(instant);
}

/** Terse "dd/mm" date for SMS (accent-free, single-segment friendly). */
export function formatDateShort(instant: Date): string {
  // en-GB gives zero-padded dd/mm/yyyy; take the day+month, drop the year.
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: LISBON_TZ,
  }).format(instant);
  return parts; // "23/05"
}
