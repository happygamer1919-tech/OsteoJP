// AGENDA-MOBILE-WEEK - the colour of a SERVICE on the phone's week grid.
//
// WHY A NEW RULE AND NOT THE THERAPIST COLOUR. Below 640px the week is a
// compressed grid whose blocks are coloured by SERVICE (the owner's ruling for
// the phone). The desktop grid keeps colouring by THERAPIST (W11-00 v3, W9-05),
// and nothing here touches that: this module is read only by the phone grid.
//
// WHY A HASH AND NOT A COLUMN. `services` has no colour column, and adding one is
// a migration plus a picker plus a write path, which this card excludes. The
// name-category mapping in marcacoes-view.tsx is not reused either: it knows five
// service names, and the therapist-color.ts header records that at CB every card
// fell to its neutral fallback because CB's names match none of them. So each
// service id is hashed (the same FNV-1a the therapist colour uses) onto a palette
// of EXISTING theme tokens. Same id, same colour, on every render and across
// sessions. Default Q-B6-3, logged for the owner.
//
// WHAT A COLLISION COSTS. Seven hues; two services can land on one. The phone
// grid shows a legend of the services in the week, name beside swatch, and every
// block carries its service in its accessible name, so colour is never the only
// cue (the standing rule in therapist-color.ts and UI-STYLE.md).
//
// AA. The fill is a -100 tint and the block text is `text-v2-text-primary`, the
// pairing marcacoes-view.tsx documents as at least 11:1 on every -100 tint. The
// -600 stripe and swatch are decoration beside text, never the carrier.

import { hashId } from "./therapist-color";

export type ServiceColor = {
  key: string;
  /** Block background. */
  fill: string;
  /** Left stripe colour on the block (the block sets the stripe WIDTH). */
  stripe: string;
  /** Legend swatch. */
  swatch: string;
};

/**
 * Seven hues, every one an existing token family with -100 and -600 steps in
 * packages/ui/theme.css. Literal class strings on purpose: Tailwind generates a
 * utility only when it finds the whole class name in the source.
 */
export const SERVICE_COLORS: readonly ServiceColor[] = [
  { key: "teal", fill: "bg-accent-2-100", stripe: "border-l-accent-2-600", swatch: "bg-accent-2-600" },
  { key: "purple", fill: "bg-accent-1-100", stripe: "border-l-accent-1-600", swatch: "bg-accent-1-600" },
  { key: "blue", fill: "bg-v2-blue-100", stripe: "border-l-v2-blue-600", swatch: "bg-v2-blue-600" },
  { key: "burgundy", fill: "bg-v2-burgundy-100", stripe: "border-l-v2-burgundy-600", swatch: "bg-v2-burgundy-600" },
  { key: "gold", fill: "bg-v2-gold-100", stripe: "border-l-v2-gold-600", swatch: "bg-v2-gold-600" },
  { key: "green", fill: "bg-v2-green-100", stripe: "border-l-v2-green-600", swatch: "bg-v2-green-600" },
  { key: "lavender", fill: "bg-v2-lavender-100", stripe: "border-l-v2-lavender-600", swatch: "bg-v2-lavender-600" },
];

/** A row with no service: neutral, and the legend says "Sem serviço". */
export const SERVICE_COLOR_NONE: ServiceColor = {
  key: "none",
  fill: "bg-surface-muted",
  stripe: "border-l-v2-text-secondary",
  swatch: "bg-v2-text-secondary",
};

/** The stable colour for a service id; null or empty is the neutral colour. */
export function serviceColor(serviceId: string | null | undefined): ServiceColor {
  if (!serviceId) return SERVICE_COLOR_NONE;
  return SERVICE_COLORS[hashId(serviceId) % SERVICE_COLORS.length]!;
}
