import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The token layer is CSS-first (Tailwind v4 @theme), so the contract is the
// generated CSS itself. Read theme.css from disk and assert the canonical brand
// hexes (sampled from Logotipo_OsteoJP_2023.pdf @ 300 DPI, docs/brand-tokens.md)
// are present verbatim. This is the regression guard against the superseded
// approximations (#3DAEB3 teal, #8E2C7A magenta) creeping back in.
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

describe("brand-tokens.md canonical hexes", () => {
  it.each([
    ["accent-2 teal base", "#45B9A7"],
    ["accent-1 magenta base", "#8B1863"],
    ["primary grey-blue base", "#98B2C2"],
    ["text-primary / neutral-900", "#1A2733"],
  ])("theme.css defines the %s hex %s", (_role, hex) => {
    expect(themeCode).toContain(hex);
  });

  it("does not reintroduce the superseded approximations", () => {
    expect(themeCss).not.toContain("#3DAEB3");
    expect(themeCss).not.toContain("#8E2C7A");
  });
});
