// W9-05 - deterministic per-therapist colour for the agenda card (CB QA item 7).
//
// CB could not tell therapists apart on the agenda: the card carried no
// therapist name, and at CB every card fell to the neutral service tint (their
// service names do not match the five hardcoded categories), so all cards looked
// the same. This assigns each therapist a STABLE colour: the same therapist id
// maps to the same hue on every render and across sessions.
//
// The rules this obeys (UI-STYLE.md, W5-25):
// - Colour is REINFORCEMENT, never the only cue. The therapist NAME (text) is
//   the authoritative identifier on the card; this colour is the spine + a dot
//   beside the name. Two therapists that hash to the same hue are still told
//   apart by their name.
// - AA: every hue is an existing v2 / accent token at the -700 step, documented
//   in theme.css as "AA label text on light surfaces (§3.4)". No new hex is
//   introduced, so packages/ui/src/tokens.test.ts and the canonical palette are
//   untouched (the loop's hard constraint).
// - The palette LEADS with accent-2 (teal) and accent-1 (purple), the two hues
//   the service tint does NOT use, so the first therapists get colours that
//   never collide with a service-category card body.

/**
 * The per-therapist palette: Tailwind BACKGROUND utilities used for the card's
 * left spine and the dot beside the therapist name. A background on a positioned
 * spine (not a border-left colour) avoids fighting the card's service-tint
 * border shorthand for `border-*-color` precedence. Ordered so the earliest
 * therapists get hues distinct from the five service-category tints.
 *
 * Every entry is an existing token at the -700 step. Keep this in sync with
 * UI-STYLE.md if a hue is added; never introduce a raw hex here.
 */
export const THERAPIST_COLORS = [
  { key: "teal", fill: "bg-accent-2-700" },
  { key: "purple", fill: "bg-accent-1-700" },
  { key: "blue", fill: "bg-v2-blue-700" },
  { key: "burgundy", fill: "bg-v2-burgundy-700" },
  { key: "green", fill: "bg-v2-green-700" },
  { key: "gold", fill: "bg-v2-gold-700" },
  { key: "lavender", fill: "bg-v2-lavender-700" },
] as const;

export type TherapistColor = (typeof THERAPIST_COLORS)[number];

/**
 * FNV-1a over the therapist id. A stable string hash (NOT Math.random, which
 * would reshuffle colours every render): the same id always yields the same
 * index. UUIDs differ across their whole length, so the low bits of this hash
 * spread them well across the palette.
 */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    // h * 16777619, kept in 32-bit unsigned range without BigInt.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The stable colour for a therapist. `null`/empty id -> the first palette entry,
 * a defined fallback rather than a crash (a card always has a primary therapist,
 * so this is defensive only).
 */
export function therapistColor(therapistId: string | null | undefined): TherapistColor {
  if (!therapistId) return THERAPIST_COLORS[0];
  return THERAPIST_COLORS[hashId(therapistId) % THERAPIST_COLORS.length]!;
}
