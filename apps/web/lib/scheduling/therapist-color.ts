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
 * The per-therapist palette. Each hue exposes two Tailwind utilities on the SAME
 * token (no new palette, no raw hex):
 * - `fill` (BACKGROUND) - used pre-W11-00v3 for the card spine + dot.
 * - `text` (TEXT COLOUR) - used by the W11-00 v3 Fisiozero list: the appointment
 *   is a single line of the patient name coloured in the therapist's hue.
 *
 * Every entry is an existing token at the -700 step (documented in theme.css as
 * "AA label text on light surfaces (§3.4)"), so the name text meets AA on the
 * light grid surface and `packages/ui/src/tokens.test.ts` stays green. Ordered
 * so the earliest therapists get hues distinct from the five service tints. Keep
 * in sync with UI-STYLE.md if a hue is added; never introduce a raw hex here.
 */
export const THERAPIST_COLORS = [
  { key: "teal", fill: "bg-accent-2-700", text: "text-accent-2-700" },
  { key: "purple", fill: "bg-accent-1-700", text: "text-accent-1-700" },
  { key: "blue", fill: "bg-v2-blue-700", text: "text-v2-blue-700" },
  { key: "burgundy", fill: "bg-v2-burgundy-700", text: "text-v2-burgundy-700" },
  { key: "green", fill: "bg-v2-green-700", text: "text-v2-green-700" },
  { key: "gold", fill: "bg-v2-gold-700", text: "text-v2-gold-700" },
  { key: "lavender", fill: "bg-v2-lavender-700", text: "text-v2-lavender-700" },
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

/**
 * W12-21 SELECTABLE therapist palette (owner-approved 2026-07-25) — the full set
 * a colour picker offers when assigning a (member, location) colour in Equipa
 * (W12-40-Q2). It is the 15 net-new named tokens PLUS the 4 reused hues
 * (green/blue/teal/purple), i.e. the exact palette proposal the owner approved.
 *
 * Every entry is an EXISTING token utility at the -700 (or -900 for ink) step —
 * NO raw hex here (brand hard constraint) — and its name text clears WCAG AA on
 * white, machine-guarded by packages/ui/src/tokens-therapist-palette.test.ts.
 * As with the FNV palette above, colour is REINFORCEMENT: `label` (the
 * Portuguese colour name) is the authoritative cue, never the hue alone (W9-05).
 *
 * The value persisted in `staff_locations.color` is the `key`; `null`/absent
 * means "no explicit colour" and the agenda keeps the deterministic FNV colour.
 */
export const THERAPIST_PALETTE = [
  { key: "teal", fill: "bg-accent-2-700", text: "text-accent-2-700", label: "Turquesa" },
  { key: "purple", fill: "bg-accent-1-700", text: "text-accent-1-700", label: "Roxo" },
  { key: "blue", fill: "bg-v2-blue-700", text: "text-v2-blue-700", label: "Azul" },
  { key: "green", fill: "bg-v2-green-700", text: "text-v2-green-700", label: "Verde" },
  { key: "forest", fill: "bg-v2-forest-700", text: "text-v2-forest-700", label: "Verde-escuro" },
  { key: "chartreuse", fill: "bg-v2-chartreuse-700", text: "text-v2-chartreuse-700", label: "Verde-lima" },
  { key: "olive", fill: "bg-v2-olive-700", text: "text-v2-olive-700", label: "Azeitona" },
  { key: "cyan", fill: "bg-v2-cyan-700", text: "text-v2-cyan-700", label: "Ciano" },
  { key: "navy", fill: "bg-v2-navy-700", text: "text-v2-navy-700", label: "Azul-marinho" },
  { key: "violet", fill: "bg-v2-violet-700", text: "text-v2-violet-700", label: "Violeta" },
  { key: "magenta", fill: "bg-v2-magenta-700", text: "text-v2-magenta-700", label: "Magenta" },
  { key: "pink", fill: "bg-v2-pink-700", text: "text-v2-pink-700", label: "Rosa" },
  { key: "orange", fill: "bg-v2-orange-700", text: "text-v2-orange-700", label: "Laranja" },
  { key: "mustard", fill: "bg-v2-mustard-700", text: "text-v2-mustard-700", label: "Mostarda" },
  { key: "red", fill: "bg-v2-red-700", text: "text-v2-red-700", label: "Vermelho" },
  { key: "brick", fill: "bg-v2-brick-700", text: "text-v2-brick-700", label: "Telha" },
  { key: "wine", fill: "bg-v2-wine-700", text: "text-v2-wine-700", label: "Vinho" },
  { key: "brown", fill: "bg-v2-brown-700", text: "text-v2-brown-700", label: "Castanho" },
  { key: "ink", fill: "bg-v2-ink-900", text: "text-v2-ink-900", label: "Tinta" },
] as const;

export type TherapistPaletteColor = (typeof THERAPIST_PALETTE)[number];

const PALETTE_BY_KEY: ReadonlyMap<string, TherapistPaletteColor> = new Map(
  THERAPIST_PALETTE.map((c) => [c.key, c]),
);

/** True when `key` is one of the W12-21 palette keys (the setStaffColor allowlist). */
export function isTherapistPaletteColor(key: string): boolean {
  return PALETTE_BY_KEY.has(key);
}

/** The palette entry for a stored key, or null when unset/unknown (→ FNV fallback). */
export function paletteColorByKey(
  key: string | null | undefined,
): TherapistPaletteColor | null {
  if (!key) return null;
  return PALETTE_BY_KEY.get(key) ?? null;
}
