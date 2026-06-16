/**
 * V2 accent families (SPEC-v2-foundation §3.2) and their tint class maps for
 * glass primitives. Centralised here so the icon-circle tints are written as
 * LITERAL utility strings (Tailwind's scanner needs literals, not interpolated
 * class names) and every v2 primitive maps accents the same way.
 *
 * The icon sits on the 100-tint circle in the 700 step. Icons are graphical
 * objects (WCAG 3:1), and 700-on-100 clears that comfortably while matching the
 * §3.4 rule that any accent used as text on a light surface is 700 or darker.
 */
export type V2Accent = "blue" | "burgundy" | "green" | "lavender" | "gold";

export interface V2AccentTint {
  /** Icon-circle background (100 tint). */
  circle: string;
  /** Icon colour (700 step — AA-safe as text, ≥3:1 as a graphical object). */
  icon: string;
}

export const V2_ACCENT_TINT: Record<V2Accent, V2AccentTint> = {
  blue: { circle: "bg-v2-blue-100", icon: "text-v2-blue-700" },
  burgundy: { circle: "bg-v2-burgundy-100", icon: "text-v2-burgundy-700" },
  green: { circle: "bg-v2-green-100", icon: "text-v2-green-700" },
  lavender: { circle: "bg-v2-lavender-100", icon: "text-v2-lavender-700" },
  gold: { circle: "bg-v2-gold-100", icon: "text-v2-gold-700" },
};
