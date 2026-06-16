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
    expect(themeCss).toContain(hex);
  });

  it.each([
    ["blue 700 (AA label)", "#345C9C"],
    ["burgundy 700 (AA label)", "#6E303A"],
    ["green 700 (AA label)", "#4E7D6B"],
    ["lavender 700 (AA label)", "#6E4FAB"],
    ["gold 700 (AA label)", "#946A34"],
  ])("theme.css defines the %s step %s", (_role, hex) => {
    expect(themeCss).toContain(hex);
  });
});

describe("SPEC-v2-foundation §4 glass system", () => {
  it("defines the glass card fill, nav fill, border, and active tint", () => {
    expect(themeCss).toContain("rgba(255, 255, 255, 0.72)"); // card bg §4.1
    expect(themeCss).toContain("rgba(255, 255, 255, 0.75)"); // nav opacity 75%
    expect(themeCss).toContain("rgba(255, 255, 255, 0.45)"); // card/nav border
    expect(themeCss).toContain("rgba(122, 183, 159, 0.15)"); // active nav glass
  });

  it("defines the blur radii and the no-backdrop fallback fill (§4.4)", () => {
    expect(themeCss).toContain("blur(24px)"); // card blur
    expect(themeCss).toContain("blur(20px)"); // nav blur
    expect(themeCss).toContain("rgba(255, 255, 255, 0.92)"); // fallback fill
    expect(themeCss).toContain("@supports not");
  });

  it("defines the v2 radius and the single float shadow", () => {
    expect(themeCss).toContain("--radius-v2: 24px");
    expect(themeCss).toContain("--radius-v2-kpi: 28px");
    expect(themeCss).toContain("--shadow-v2-float: 0 8px 30px rgba(0, 0, 0, 0.05)");
  });

  it("exposes the glass, nav, and hover-lift composite utilities", () => {
    expect(themeCss).toContain("@utility glass-card");
    expect(themeCss).toContain("@utility glass-nav");
    expect(themeCss).toContain("@utility hover-lift");
  });
});

describe("SPEC-v2-foundation §5 typography", () => {
  it("defines the 42px / 600 greeting token", () => {
    expect(themeCss).toContain("--text-v2-greeting: 42px");
    expect(themeCss).toContain("--text-v2-greeting--font-weight: 600");
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
