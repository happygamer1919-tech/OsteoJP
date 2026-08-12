import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * contrast-aa.test.ts — the AA floor, computed rather than asserted in a comment.
 *
 * WHY THIS EXISTS. `theme.css` annotated five tokens "AA label text on light
 * surfaces (§3.4)" and `Button.tsx` repeated the claim for its ghost and
 * secondary variants. TWO OF THE FIVE DID NOT HOLD. The claims were true against
 * WHITE, which is the surface they were checked on, and this repo defines five
 * other light surfaces — including each scale's own hover and active tints.
 *
 * It cost a gate. PG9's axe scan reddened on `/portal/booking`, on the single
 * portal control rendered directly on the page background rather than inside a
 * white Card: v2-green-700 at 4.45:1 against a 4.5 threshold. Every other portal
 * screen passed the same scan, because their green labels sit on white.
 *
 * WHY A UNIT TEST AND NOT THE AXE RUN. Axe found it, and axe can only find it
 * where a rendered screen happens to combine the two — one screen out of eight,
 * on a run that costs seven minutes and needs a seeded database. This computes
 * it from the token values in milliseconds, on every commit, for combinations no
 * screen renders YET. The axe scan proves what IS on the screen; this proves what
 * the tokens permit anyone to put there next.
 *
 * CRITERION F, EXPLICITLY. Both arms below would pass on an empty input: an empty
 * claim list, or a token list that parsed to nothing. Each therefore asserts its
 * own input is non-empty FIRST, and the negative arm at the bottom proves the
 * ratio function can actually report a failure.
 */

const themeCss = readFileSync(
  fileURLToPath(new URL("../theme.css", import.meta.url)),
  "utf8",
);

const buttonTsx = readFileSync(
  fileURLToPath(new URL("./components/Button.tsx", import.meta.url)),
  "utf8",
);

/** WCAG 2.x relative luminance. sRGB, the 0.03928 knee, Rec.709 coefficients. */
function luminance(hex: string): number {
  const linear = (offset: number): number => {
    const v = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(1) + 0.7152 * linear(3) + 0.0722 * linear(5);
}

/** WCAG 2.x contrast ratio, 1:1 to 21:1. */
function ratio(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** SC 1.4.3, normal-size text. Large text (18.66px bold / 24px) is 3:1 and is
 *  deliberately NOT the threshold used here: a label token can land on either,
 *  and the smaller one is the guarantee worth making. */
const AA_NORMAL = 4.5;

/**
 * Read a `--color-<name>: #RRGGBB;` declaration out of theme.css.
 *
 * THROWS rather than returning null. A token that cannot be found is an unknown
 * case on a verdict path, and returning null would let the whole matrix quietly
 * compute against `undefined` — section 1.3's pattern, in the guard against
 * section 1.3's pattern.
 */
function token(name: string): string {
  const found = themeCss.match(
    new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})\\s*;`),
  );
  const hex = found?.[1];
  if (!hex) throw new Error(`theme.css defines no --color-${name}`);
  return hex;
}

/**
 * Every light surface a label token can be rendered on, as tokens rather than
 * literals so a surface being retuned re-runs the whole matrix.
 *
 * THE TINTS ARE IN THE LIST ON PURPOSE. `v2-green-50` and `-100` are the ghost
 * and secondary variants' OWN hover and active backgrounds, and 700-on-100 was
 * the worst pairing in the whole audit at 3.87:1 — a state axe never scans,
 * because a scan photographs the resting page.
 */
const LIGHT_SURFACES: Array<[string, string]> = [
  ["bg", token("bg")],
  ["surface", token("surface")],
  ["surface-muted", token("surface-muted")],
  ["v2-bg", token("v2-bg")],
  ["v2-surface", token("v2-surface")],
  ["v2-green-50", token("v2-green-50")],
  ["v2-green-100", token("v2-green-100")],
];

describe("AA contrast floor for label tokens", () => {
  it("the surface list is not empty and every entry parsed to a hex", () => {
    // Without this the two suites below iterate nothing and pass vacuously.
    expect(LIGHT_SURFACES.length).toBeGreaterThanOrEqual(7);
    for (const [name, hex] of LIGHT_SURFACES) {
      expect(hex, `${name} did not parse to a hex`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  /**
   * ARM 1 — THE ANNOTATION IS A PROMISE, AND IT IS KEPT.
   *
   * Any token annotated "AA label text on light surfaces" must clear 4.5:1 on
   * every one of them. green-700 and gold-700 carried that annotation and did
   * not; their comments now state what is actually true, so they are correctly
   * outside this set. Re-annotating either one turns this red.
   */
  it("every token annotated as AA label text clears 4.5:1 on every light surface", () => {
    const claimed = [
      ...themeCss.matchAll(
        /--color-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6});\s*\/\* AA label text on light surfaces/g,
      ),
    ].map((m) => ({ name: m[1] ?? "", hex: m[2] ?? "" }));

    // A regex that stopped matching would empty this list and pass silently —
    // the same vacuous shape the annotation itself hid.
    expect(claimed.length, "no token carries the AA-label annotation any more — either the annotation text changed, or the guard is now checking nothing").toBeGreaterThanOrEqual(3);

    const failures: string[] = [];
    for (const { name, hex } of claimed) {
      for (const [surface, surfaceHex] of LIGHT_SURFACES) {
        const r = ratio(hex, surfaceHex);
        if (r < AA_NORMAL) {
          failures.push(`${name} ${hex} on ${surface} ${surfaceHex} = ${r.toFixed(2)}:1`);
        }
      }
    }
    expect(
      failures,
      `these tokens claim "AA label text on light surfaces" and do not clear ${AA_NORMAL}:1:\n  ${failures.join("\n  ")}`,
    ).toEqual([]);
  });

  /**
   * ARM 2 — THE FIX ITSELF, NOT THE COMMENT DESCRIBING IT.
   *
   * Arm 1 would stay green if someone reverted Button to green-700 and simply
   * did not re-add the annotation. This reads the component and pins the actual
   * label token, so the regression that produced PG9's red cannot come back
   * quietly.
   */
  it("Button's ghost and secondary labels clear 4.5:1 on every light surface", () => {
    const variantsBlock = buttonTsx.match(/const VARIANTS[\s\S]*?\n\};/)?.[0];
    // Not `expect(...).not.toBeNull()`: a null here must stop the test, or the
    // loop below iterates nothing and this arm passes having read no component.
    if (!variantsBlock) throw new Error("Button.tsx no longer declares a VARIANTS map");

    for (const variant of ["secondary", "ghost"] as const) {
      const classes = variantsBlock.match(
        new RegExp(`\\n\\s*${variant}:\\s*\\n?\\s*"([^"]+)"`),
      )?.[1];
      if (!classes) throw new Error(`Button.tsx declares no ${variant} variant`);

      const label = classes.match(/(?:^|\s)text-(v2-[a-z]+-\d{2,3})(?:\s|$)/)?.[1];
      if (!label) {
        throw new Error(`${variant} declares no text-v2-* label colour: ${classes}`);
      }

      const hex = token(label);
      for (const [surface, surfaceHex] of LIGHT_SURFACES) {
        const r = ratio(hex, surfaceHex);
        expect(
          r,
          `Button ${variant} label is ${label} ${hex}, which is ${r.toFixed(2)}:1 on ${surface} ${surfaceHex} — below the ${AA_NORMAL}:1 AA floor. This is the exact defect PG9's axe scan found on /portal/booking.`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    }
  });

  /**
   * THE NEGATIVE ARM. Without it, a `ratio` that returned a large constant would
   * make both arms above pass forever — "the scanner returned no violations"
   * with no way to tell a clean result from a broken instrument.
   */
  it("the ratio function reports a real failure, and matches known values", () => {
    // The measurement that started this, to two decimals.
    expect(ratio("#4E7D6B", "#F7F9FB")).toBeCloseTo(4.45, 1);
    expect(ratio("#3C6052", "#F7F9FB")).toBeCloseTo(6.66, 1);
    // The two anchors of the scale: identical colours are 1:1, black on white 21:1.
    expect(ratio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(ratio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    // And it must actually fall below the floor for a pairing that does.
    expect(ratio("#4E7D6B", "#DCEDE5")).toBeLessThan(AA_NORMAL);
  });
});
