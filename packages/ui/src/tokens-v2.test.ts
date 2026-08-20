import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The v2 token layer is CSS-first (Tailwind v4 @theme appended to theme.css),
// so the contract is the generated CSS itself. Read theme.css from disk and
// assert the SPEC-v2-foundation.md values are present verbatim. This guards the
// foundation (V2-W0-01) against drift: every accent base, the glass tokens, the
// v2 radius/shadow, and the greeting size must match the spec exactly.
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

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("SPEC-v2-foundation §3 palette (OsteoJP theme)", () => {
  it.each([
    ["v2-bg", "#F7F8FA"],
    ["v2-surface", "#FFFFFF"],
    ["v2-text-primary", "#223042"],
    ["v2-text-secondary (AA-corrected)", "#66727F"],
    ["Portuguese Blue base", "#5B8FD9"],
    ["Moldavian Burgundy base", "#A44B58"],
    ["Wellness Green base", "#7AB79F"],
    ["Soft Lavender base", "#A786E8"],
    ["Warm Gold base", "#D5A25A"],
  ])("theme.css defines the %s hex %s", (_role, hex) => {
    expect(themeCode).toContain(hex);
  });

  it.each([
    ["blue 700 (AA label)", "#345C9C"],
    ["burgundy 700 (AA label)", "#6E303A"],
    ["green 700 (AA label)", "#4E7D6B"],
    ["lavender 700 (AA label)", "#6E4FAB"],
    ["gold 700 (AA label)", "#946A34"],
  ])("theme.css defines the %s step %s", (_role, hex) => {
    expect(themeCode).toContain(hex);
  });
});

describe("SPEC-v2-foundation §4 glass system", () => {
  it("defines the glass card fill, nav fill, border, and active tint", () => {
    expect(themeCode).toContain("rgba(255, 255, 255, 0.72)"); // card bg §4.1
    expect(themeCode).toContain("rgba(255, 255, 255, 0.75)"); // nav opacity 75%
    expect(themeCode).toContain("rgba(255, 255, 255, 0.45)"); // card/nav border
    expect(themeCode).toContain("rgba(122, 183, 159, 0.15)"); // active nav glass
  });

  it("defines the blur radii and the no-backdrop fallback fill (§4.4)", () => {
    expect(themeCode).toContain("blur(24px)"); // card blur
    expect(themeCode).toContain("blur(20px)"); // nav blur
    expect(themeCode).toContain("rgba(255, 255, 255, 0.92)"); // fallback fill
    expect(themeCode).toContain("@supports not");
  });

  it("defines the v2 radius and the single float shadow", () => {
    expect(themeCode).toContain("--radius-v2: 24px");
    expect(themeCode).toContain("--radius-v2-kpi: 28px");
    expect(themeCode).toContain("--shadow-v2-float: 0 8px 30px rgba(0, 0, 0, 0.05)");
  });

  it("exposes the glass, nav, and hover-lift composite utilities", () => {
    expect(themeCode).toContain("@utility glass-card");
    expect(themeCode).toContain("@utility glass-nav");
    expect(themeCode).toContain("@utility hover-lift");
  });
});

describe("SPEC-v2-foundation §5 typography", () => {
  it("defines the 42px / 600 greeting token", () => {
    expect(themeCode).toContain("--text-v2-greeting: 42px");
    expect(themeCode).toContain("--text-v2-greeting--font-weight: 600");
  });
});

describe("heritage-v2 edge assets (SPEC §6.1 / assets.md)", () => {
  const embroidery = read("./assets/heritage/v2/embroidery-left.svg");
  const azulejo = read("./assets/heritage/v2/azulejo-right.svg");

  it("colour the left band burgundy and the right band blue", () => {
    expect(embroidery).toContain("#A44B58");
    expect(azulejo).toContain("#5B8FD9");
  });

  it("are viewBox-only (no fixed width/height, so they scale to any edge)", () => {
    for (const svg of [embroidery, azulejo]) {
      const openTag = svg.slice(svg.indexOf("<svg"), svg.indexOf(">") + 1);
      expect(openTag).toContain("viewBox");
      expect(openTag).not.toMatch(/\swidth=/);
      expect(openTag).not.toMatch(/\sheight=/);
    }
  });

  it("are decorative-only (aria-hidden) per the frame contract", () => {
    expect(embroidery).toContain('aria-hidden="true"');
    expect(azulejo).toContain('aria-hidden="true"');
  });
});
