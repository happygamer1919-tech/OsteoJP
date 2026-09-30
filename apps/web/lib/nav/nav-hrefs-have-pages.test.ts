import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ROLES } from "@osteojp/auth";
import { navItemsForRole } from "./nav-items";

/**
 * ==========================================================================
 * EVERY SIDEBAR ENTRY OPENS A PAGE THAT EXISTS.
 * ==========================================================================
 * A nav entry is one line in `nav-items.ts`. The page it opens is a different
 * file, often in a different pull request. Nothing else ties the two together:
 * the link renders, typecheck passes, and the person who clicks it gets
 * "page not found".
 *
 * G1 made that concrete. The menu entry "Ajuda" (G1, PR 6) is written before
 * the /ajuda pages (G1, PR 3) are on main, and the owner merges it by hand. A
 * merge condition written only in a PR body is prose; this test is the same
 * condition as a check. While /ajuda has no page, the entry's branch is red
 * here, and it turns green only once the page is on main AND merged into it.
 *
 * The walk reads the App Router tree the way Next does for a static URL: a
 * `page.*` file makes its folder a route, a route group "(x)" and a parallel
 * slot "@x" add no URL segment, and a private folder "_x" is never a route.
 */

const APP_DIR = join(import.meta.dirname, "..", "..", "app");
const PAGE_FILE = /^page\.(tsx|ts|jsx|js|mdx)$/;

function routesWithAPage(dir: string, segments: readonly string[] = []): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && PAGE_FILE.test(entry.name)) {
      out.push(`/${segments.join("/")}`);
    } else if (entry.isDirectory() && !entry.name.startsWith("_")) {
      const addsNoSegment = /^\(.*\)$/.test(entry.name) || entry.name.startsWith("@");
      out.push(
        ...routesWithAPage(
          join(dir, entry.name),
          addsNoSegment ? segments : [...segments, entry.name],
        ),
      );
    }
  }
  return out;
}

const ROUTES = new Set(routesWithAPage(APP_DIR));

/** Every href that appears in the sidebar for at least one role. */
const NAV_HREFS = [...new Set(ROLES.flatMap((r) => navItemsForRole(r).map((i) => i.href)))];

describe("sidebar entries and the pages they open", () => {
  it("the walk found the app's real pages (a walk over nothing would pass every href)", () => {
    expect(ROUTES.size).toBeGreaterThanOrEqual(20);
    expect(ROUTES.has("/dashboard")).toBe(true);
    expect(ROUTES.has("/clinical/review")).toBe(true);
    expect(ROUTES.has("/rota-que-nao-existe")).toBe(false);
    expect(NAV_HREFS.length).toBeGreaterThanOrEqual(10);
  });

  it("every href the sidebar can render, for every role, has a page", () => {
    const missing = NAV_HREFS.filter((h) => !ROUTES.has(h));
    expect(
      missing,
      `these sidebar entries open no page, so a click lands on "page not found":\n  ${missing.join("\n  ")}\n` +
        "Merge the page first (on the G1 menu entry: PR 3 of G1 on main, then main into this branch), " +
        "or do not add the entry yet.",
    ).toEqual([]);
  });
});
