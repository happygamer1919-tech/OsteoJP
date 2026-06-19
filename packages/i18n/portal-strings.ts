// Portal-specific locale loader. The portal uses a nested JSON structure
// (auth.login_title, booking.title, …) distinct from the staff-platform flat
// keys. PT-PT is the default; EN is provided for completeness.
import pt from "./src/portal/strings.pt.json";
import en from "./src/portal/strings.en.json";

export const PORTAL_LOCALES = ["pt", "en"] as const;
export type PortalLocale = (typeof PORTAL_LOCALES)[number];

// The shape is inferred from the PT file (canonical source of truth).
export type PortalStrings = typeof pt;

const portalDictionaries = { pt, en } as const satisfies Record<
  PortalLocale,
  PortalStrings
>;

/**
 * Return the portal string dictionary for the given locale.
 * Defaults to "pt" (pt-PT) — the DEFAULT_LOCALE of the platform.
 *
 * Usage in server components:
 *   import { getPortalStrings } from "@osteojp/i18n";
 *   const s = getPortalStrings();
 *   // s.auth.login_title, s.booking.title, …
 */
export function getPortalStrings(
  locale: PortalLocale = "pt",
): Readonly<PortalStrings> {
  return portalDictionaries[locale];
}
