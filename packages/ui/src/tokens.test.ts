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

describe("brand-tokens.md canonical hexes", () => {
  it.each([
    ["accent-2 teal base", "#45B9A7"],
    ["accent-1 magenta base", "#8B1863"],
    ["primary grey-blue base", "#98B2C2"],
    ["text-primary / neutral-900", "#1A2733"],
  ])("theme.css defines the %s hex %s", (_role, hex) => {
    expect(themeCss).toContain(hex);
  });

  it("does not reintroduce the superseded approximations", () => {
    expect(themeCss).not.toContain("#3DAEB3");
    expect(themeCss).not.toContain("#8E2C7A");
  });
});
