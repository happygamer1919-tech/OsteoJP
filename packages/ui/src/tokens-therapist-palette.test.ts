import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// W12-21 therapist agenda palette. The token layer is CSS-first (Tailwind v4
// @theme), so the contract is the generated CSS. Read theme.css from disk and
// assert the owner-approved palette proposal (2026-07-25) is present verbatim:
// each named token maps to its exact approved hex, and each hex clears WCAG AA
// (>=4.5:1) as name text on the light agenda surface (white). This is the
// regression guard for the proposal the owner visually approved, and the
// machine-verifiable AA proof the loop's DoD requires.
//
// Colour is never the only cue (the name + legend stay authoritative); AA here
// is the contrast floor for the coloured NAME text on white. The four other
// approved hues (green, blue, teal, purple) reuse EXISTING tokens as-is
// (v2-green-700 / v2-blue-700 / accent-2-700 / accent-1-700) and are guarded by
// tokens-v2.test.ts / tokens.test.ts, so they are not re-asserted here.
const themeCss = readFileSync(
  fileURLToPath(new URL("../theme.css", import.meta.url)),
  "utf8",
);

/**
 * theme.css with COMMENTS REMOVED (ACC-vacuous-guard-sweep).
 *
 * Every assertion below is a PRESENCE check on a bare literal - a hex, or an
 * rgba() string. On the raw file a COMMENT satisfies it, so a token deleted from
 * the CSS but still described in prose would keep this suite green.
 *
 * NOT HYPOTHETICAL, AND THE WORKED EXAMPLE IS IN THIS VERY FILE'S SUBJECT:
 * theme.css:307 reads "SPEC 3.1 lists #6E7A89, but that is 4.37:1 on white ..."
 * - a REJECTED value, recorded in a comment and deliberately absent from the
 * declarations. Assert that hex and the guard passes on the rejection notice.
 * Checked before changing anything: of 55 literals asserted across the three
 * tokens suites, ZERO are currently satisfied only by a comment. This removes
 * the class rather than fixing an instance.
 *
 * ABSENCE assertions deliberately keep using the RAW css: a comment naming a
 * superseded hex should make `.not.toContain` FAIL, because that is the
 * direction it is safe to be wrong in.
 */
const themeCode = themeCss.replace(/\/\*[\s\S]*?\*\//g, "");

// The 15 named tokens W12-21 ADDS + the W12-40 gray, with the approved hex for
// each. Order matches the proposal table (gray appended before ink, W12-40).
const THERAPIST_PALETTE: ReadonlyArray<readonly [token: string, hex: string]> = [
  ["--color-v2-forest-700", "#14532D"], // dark green
  ["--color-v2-chartreuse-700", "#5A7D00"], // yellow-green
  ["--color-v2-olive-700", "#556B2F"], // dark grey-green
  ["--color-v2-cyan-700", "#00697A"], // cyan
  ["--color-v2-navy-700", "#283593"], // dark blue
  ["--color-v2-violet-700", "#7E3FF2"], // bright purple
  ["--color-v2-magenta-700", "#A21CAF"], // magenta
  ["--color-v2-pink-700", "#BE185D"], // pink
  ["--color-v2-orange-700", "#B5480B"], // orange
  ["--color-v2-mustard-700", "#8A6D0B"], // mustard
  ["--color-v2-red-700", "#C0392B"], // red
  ["--color-v2-brick-700", "#9A3324"], // brick red
  ["--color-v2-wine-700", "#7B2D3A"], // wine
  ["--color-v2-brown-700", "#5D4037"], // dark brown
  ["--color-v2-gray-700", "#4B5563"], // gray (slate) — W12-40 (Samuel)
  ["--color-v2-ink-900", "#16221F"], // black (ink)
];

// WCAG 2.1 relative luminance + contrast ratio (sRGB).
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrastOnWhite(hex: string): number {
  const l = luminance(hex);
  return (1.0 + 0.05) / (l + 0.05); // white luminance = 1.0
}

describe("W12-21 therapist palette (approved proposal 2026-07-25)", () => {
  it("defines exactly the 15 W12-21 tokens + the W12-40 gray", () => {
    for (const [token] of THERAPIST_PALETTE) {
      expect(themeCss.includes(`${token}:`)).toBe(true);
    }
    expect(THERAPIST_PALETTE).toHaveLength(16);
  });

  it.each(THERAPIST_PALETTE)(
    "%s is the approved hex %s (verbatim in theme.css)",
    (token, hex) => {
      expect(themeCode).toContain(`${token}: ${hex};`);
    },
  );

  it.each(THERAPIST_PALETTE)(
    "%s (%s) passes WCAG AA (>=4.5:1) as name text on white",
    (_token, hex) => {
      expect(contrastOnWhite(hex)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("introduces no raw hex that shadows the brand accents (magenta/teal reserved)", () => {
    // The brand accents keep their canonical hexes; the new palette must not
    // redefine accent-1-700 (#8B1863) or accent-2-700 (#2F7E72).
    expect(themeCode).toContain("--color-accent-1-700: #8B1863;");
    expect(themeCode).toContain("--color-accent-2-700: #2F7E72;");
  });
});
