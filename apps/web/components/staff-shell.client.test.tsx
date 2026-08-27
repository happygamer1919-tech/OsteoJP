import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ROLES } from "@osteojp/auth";
import { navItemsForRole } from "@/lib/nav/nav-items";

/**
 * ==========================================================================
 * EVERY SIDEBAR DESTINATION HAS ITS OWN ICON AND ITS OWN COLOUR.
 * ==========================================================================
 * WHAT WENT WRONG, AND WHY IT WENT WRONG SILENTLY.
 *
 * `ICON_BY_HREF` held seven entries against a nav of ten, with `?? FileText` as
 * the fallback. Four real destinations — Recuperação, Faturação, Estatísticas
 * and Horários — therefore rendered the SAME generic document glyph, and every
 * icon in the panel was the same grey because the icon inherits the row's text
 * colour.
 *
 * NOTHING COULD HAVE CAUGHT THAT. The fallback is a `??`, so a missing entry is
 * not an error, not a warning and not a visual break: the row renders, the link
 * works, and the icon looks deliberate. Three of the four arrived one at a time
 * as new nav entries shipped, each of them a one-line addition to
 * `nav-items.ts` by somebody who had no reason to open this file.
 *
 * SO THE GUARD IS ON THE JOIN, NOT ON THE MAP. It reads the real nav for every
 * real role and requires each href to be mapped. A future nav entry fails here
 * on the day it is added, which is the only moment anybody is in a position to
 * choose its icon.
 */

const SHELL = readFileSync(
  join(import.meta.dirname, "staff-shell.client.tsx"),
  "utf8",
);

/** `"/href": { icon: Name, className: "text-token" }` out of the map. */
const ENTRIES = [
  ...SHELL.matchAll(
    /"(\/[^"]*)":\s*\{\s*icon:\s*(\w+),\s*className:\s*"text-([\w-]+)"\s*\}/g,
  ),
].map((m) => ({ href: m[1] ?? "", icon: m[2] ?? "", token: m[3] ?? "" }));

/** Every href that appears in the sidebar for at least one role. */
const NAV_HREFS = [...new Set(ROLES.flatMap((r) => navItemsForRole(r).map((i) => i.href)))];

describe("the sidebar icon map", () => {
  it("parsed to real entries", () => {
    // LEARNINGS entry 5. Two empty lists agree perfectly: without this, a regex
    // that stopped matching would report a clean sweep over zero icons.
    expect(ENTRIES.length).toBeGreaterThanOrEqual(10);
    expect(NAV_HREFS.length).toBeGreaterThanOrEqual(9);
  });

  it("maps EVERY href the nav can render, for every role", () => {
    const mapped = new Set(ENTRIES.map((e) => e.href));
    const missing = NAV_HREFS.filter((h) => !mapped.has(h));
    expect(
      missing,
      `these sidebar destinations would fall back to the generic FileText glyph:\n  ${missing.join("\n  ")}\n` +
        "Add an entry to NAV_ICON in staff-shell.client.tsx choosing its icon and its colour.",
    ).toEqual([]);
  });

  it("gives every destination a DISTINCT icon", () => {
    // The defect, stated directly. Four hrefs shared `FileText`, and sharing a
    // glyph is worse than having none: it asserts a relationship that is not
    // there.
    const byIcon = new Map<string, string[]>();
    for (const e of ENTRIES) byIcon.set(e.icon, [...(byIcon.get(e.icon) ?? []), e.href]);
    const shared = [...byIcon].filter(([, hrefs]) => hrefs.length > 1);
    expect(
      shared.map(([icon, hrefs]) => `${icon}: ${hrefs.join(", ")}`),
      "these destinations share one glyph",
    ).toEqual([]);
  });

  it("gives every destination a DISTINCT colour", () => {
    const byToken = new Map<string, string[]>();
    for (const e of ENTRIES) byToken.set(e.token, [...(byToken.get(e.token) ?? []), e.href]);
    const shared = [...byToken].filter(([, hrefs]) => hrefs.length > 1);
    expect(
      shared.map(([token, hrefs]) => `${token}: ${hrefs.join(", ")}`),
      "these destinations share one colour",
    ).toEqual([]);
  });

  it("never uses v2-gold-700, which theme.css records as failing AA", () => {
    // "Gold = revenue" would have fitted Faturação, and it is the one hue in the
    // palette carrying an open contrast card. Named here so a future edit that
    // reaches for the obvious token is stopped by a test that says why.
    expect(ENTRIES.map((e) => e.token)).not.toContain("v2-gold-700");
  });

  it("colours the ICON and never the row", () => {
    // The row owns the label's contrast and the active-state cue, both measured.
    // A hue on the row would put a per-destination colour in front of that.
    expect(SHELL).toContain("iconClassName: mapped?.className");
    expect(SHELL).not.toMatch(/navItemClass|className:\s*mapped\?\.className\s*,\s*\n\s*active/);
  });
});
