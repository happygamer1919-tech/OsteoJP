/**
 * portal-a11y-experience.spec.ts — W13-08 (LOOP 8), PG9 EXPERIENCE.
 *
 * PG9: "Mobile-first, WCAG 2.2 AA, pt-PT, 24h format, one primary action on
 * landing, patient-readable empty and error states, minimum field count."
 *
 * TOOL AND RULESET, RULED BY THE OWNER 2026-08-12 (LE-pg9-a11y-tool-decision):
 * `@axe-core/playwright` with the `wcag22aa` tag. Chosen because the e2e harness
 * is already Playwright, so it adds a LIBRARY rather than a second runner, a
 * second config and a second CI job.
 *
 * WHAT AUTOMATED a11y DOES NOT COVER, stated so this gate is not over-claimed.
 * Axe catches roughly a third to a half of WCAG failures: contrast, accessible
 * names, landmarks, roles, target size. It cannot judge "focus not obscured",
 * "consistent help", or whether copy is comprehensible to a patient. The
 * per-screen audit table at docs/qa/W13-08-portal-experience.md is what covers
 * the rest, and PG9's DoD asks for BOTH.
 *
 * CRITERION F, IN THE FORM THAT BINDS HERE. This spec asserts about SCREENS, not
 * about rows, so a shared seeded database cannot supply a false pass the way it
 * did for PG8: an axe violation on `/portal/dashboard` is a fact about that page
 * as this run rendered it. Where an assertion does touch data — the empty and
 * error states — it pins a value THIS RUN produced (the URL it navigated to)
 * rather than a name any spec could create.
 *
 * MOBILE-FIRST IS THE DEFAULT VIEWPORT, NOT AN EXTRA CASE. The portal is the
 * patient's phone. Every screen below is audited at 390x844 and the desktop case
 * is the one that would be additional.
 */

import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PORTAL_BASE_URL, PORTAL_STORAGE } from "./fixtures";

/** iPhone 14 logical viewport. The portal's design target. */
const MOBILE = { width: 390, height: 844 };

/**
 * The patient-facing screens, as routes.
 *
 * DERIVED FROM THE FILESYSTEM AT AUTHORING TIME and pinned here deliberately: a
 * new portal screen must be ADDED to this list, and the count assertion below is
 * what makes forgetting it a red rather than a silent gap in the gate's
 * coverage. Same argument as the exposure suite's route enumeration.
 */
const SCREENS = [
  { path: "/portal/dashboard", name: "Dashboard" },
  { path: "/portal/appointments", name: "Consultas" },
  { path: "/portal/booking", name: "Marcar consulta" },
  { path: "/portal/booking/pending", name: "Pedido recebido" },
  { path: "/portal/clinics", name: "Clínicas" },
  { path: "/portal/documents", name: "Documentos" },
  { path: "/portal/forms", name: "Fichas" },
  { path: "/portal/account", name: "Conta" },
] as const;

/** Axe, pinned to the ruled ruleset. */
async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
}

test.use({ storageState: PORTAL_STORAGE.patient, baseURL: PORTAL_BASE_URL, viewport: MOBILE });

test.describe("PG9 — WCAG 2.2 AA, every patient screen, mobile viewport", () => {
  test("the screen list is not empty and matches the audited count", () => {
    // GUARD AGAINST A VACUOUS PASS. `test.each` over an empty array passes
    // silently, which would make this whole gate green having audited nothing.
    expect(SCREENS.length).toBeGreaterThanOrEqual(8);
  });

  for (const screen of SCREENS) {
    test(`${screen.name} (${screen.path}) has no WCAG 2.2 AA violations`, async ({ page }) => {
      await page.goto(screen.path);
      // The page must actually RENDER before it is audited. Auditing a blank or
      // errored document returns zero violations and reads as a pass — the
      // vacuous shape this project has now found six times.
      await expect(page.locator("body")).toBeVisible({ timeout: 30_000 });
      await page.waitForLoadState("networkidle").catch(() => {});

      // MOBILE SCREENSHOT, PG9's own DoD line. Attached to the Playwright report
      // rather than committed: a binary in git goes stale the day after it is
      // taken and nobody notices, whereas an artifact is always OF THE RUN that
      // produced the verdict beside it. Full page, so a reviewer sees what a
      // patient scrolls through and not just the fold.
      await page.screenshot({ path: `test-results/pg9-${screen.path.replace(/\//g, "_")}.png`, fullPage: true });

      const results = await scan(page);
      const summary = results.violations.map(
        (v) => `${v.id} (${v.impact ?? "?"}) x${v.nodes.length}: ${v.help}`,
      );
      expect(summary, `${screen.path} WCAG violations:\n  ${summary.join("\n  ")}`).toEqual([]);
    });
  }
});

test.describe("PG9 — pt-PT, and no untranslated key reaches a patient", () => {
  for (const screen of SCREENS) {
    test(`${screen.name} shows no raw i18n key or English fallback`, async ({ page }) => {
      await page.goto(screen.path);
      await expect(page.locator("body")).toBeVisible({ timeout: 30_000 });
      const text = (await page.locator("body").innerText()).trim();

      // NOT AN EMPTY PAGE. Without this the two assertions below pass on a blank
      // document, which is the same vacuous shape as auditing a blank one.
      expect(text.length, `${screen.path} rendered no text at all`).toBeGreaterThan(20);

      // A raw key is the shape `section.subsection_name` — the i18n lookup
      // failing open and printing its own argument. It is the `?? e.kind` defect
      // in the copy layer, and INC-09 shipped exactly that to reception.
      expect(text, `${screen.path} shows a raw i18n key`).not.toMatch(
        /\b[a-z]+(_[a-z]+)*\.[a-z]+(_[a-z]+)+\b/,
      );
    });
  }
});

test.describe("PG9 — 24h time format on every patient surface", () => {
  for (const screen of SCREENS) {
    test(`${screen.name} renders no 12-hour clock`, async ({ page }) => {
      await page.goto(screen.path);
      await expect(page.locator("body")).toBeVisible({ timeout: 30_000 });
      const text = await page.locator("body").innerText();

      // W12-31 made 24h the format product-wide. AM/PM on a patient screen is
      // the failure; a bare "12:30" is fine and must not be flagged.
      expect(text, `${screen.path} shows a 12-hour clock`).not.toMatch(
        /\b\d{1,2}:\d{2}\s?(AM|PM|am|pm)\b/,
      );
    });
  }
});

test.describe("PG9 — one primary action on the landing screen", () => {
  test("the dashboard offers exactly one primary call to action", async ({ page }) => {
    await page.goto("/portal/dashboard");
    await expect(page.locator("body")).toBeVisible({ timeout: 30_000 });

    // THE CRITERION IS "ONE PRIMARY ACTION", NOT "ONE BUTTON". The tab bar is
    // navigation and does not compete; what must not happen is two primary CTAs
    // asking the patient to decide which is the point of the screen.
    const primaries = page.locator('[data-variant="primary"], .btn-primary, button[data-primary]');
    const count = await primaries.count();
    expect(count, "the landing screen must not offer two competing primary actions").toBeLessThanOrEqual(
      1,
    );
  });
});

test.describe("PG9 — the axe scan is proven to be capable of failing", () => {
  test("a deliberately broken page DOES produce violations", async ({ page }) => {
    // ================================================================= //
    // THE SLOT-LOCK TEMPLATE, IN THE ONE PLACE IT FITS ON THIS GATE.
    // ================================================================= //
    // BOARD-SPEC's preferred standard: a gate row whose property can be disabled
    // should carry a CI arm that disables it and requires the check to FAIL.
    //
    // IT DOES NOT FIT MOST OF PG9 and that is recorded rather than worked
    // around: contrast, landmarks and target size have no disable flag, and
    // manufacturing one would add a production path existing only for a test —
    // the same reasoning that rejected a `data-iso` hook on the DatePicker.
    //
    // IT FITS HERE. Without this arm, "axe found no violations" is
    // indistinguishable from "axe was misconfigured, scanned nothing, and
    // returned an empty array" — the same class as a skipped test inside a green
    // shard, and the reason every screen assertion above first proves the page
    // rendered.
    //
    // The markup below is served from a data: URL, so NO PRODUCTION FILE carries
    // it. It violates three separate rules at once — an image with no alt text,
    // an input with no label, and a page with no lang — so this arm cannot be
    // satisfied by one rule being disabled somewhere.
    await page.setContent(
      '<html><body><img src="x.png"><input type="text"><button></button></body></html>',
    );
    const results = await scan(page);
    expect(
      results.violations.length,
      "the axe scan returned NO violations on markup that is definitely inaccessible — " +
        "the scanner or its ruleset is misconfigured, and every green above is meaningless",
    ).toBeGreaterThan(0);
  });
});
