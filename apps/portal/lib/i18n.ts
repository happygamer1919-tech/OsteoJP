// Portal-side locale accessor. The portal defaults to Portuguese (pt-PT);
// per-patient locale selection is a later concern. Importing the portal
// dictionary here keeps every component on the same typed nested string keys.
import {
  getPortalStrings,
  type PortalLocale,
  type PortalStrings,
} from "@osteojp/i18n";

export const locale: PortalLocale = "pt";
export const s: Readonly<PortalStrings> = getPortalStrings(locale);
