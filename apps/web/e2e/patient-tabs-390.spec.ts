/**
 * patient-tabs-390.spec.ts - EPI-01 M2, finding E (2026-10-01). At 390 px the
 * patient profile's tab bar did not fit: "Documentos" and "Faturação" ran off the
 * right edge and the WHOLE PAGE scrolled sideways (scrollWidth 569 > 390).
 *
 * The fix is in the shared Tabs (packages/ui): the row scrolls inside its own box,
 * labels stay on one line, and the selected tab is brought into view. These tests
 * assert the complaint itself, the page's own scrollWidth against its clientWidth,
 * not a floor on some width. Runs as admin, whose profile shows all six tabs.
 */
import { test, expect, type Page } from "@playwright/test";
import { PATIENTS } from "./fixtures";

const PROFILE = `/patients/${PATIENTS.maria.id}`;

/** The page's horizontal overflow: scrollWidth must not exceed clientWidth. */
async function pageOverflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

test.describe("390 px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the patient tab bar scrolls inside its own box and the page does not scroll sideways", async ({ page }) => {
    await page.goto(PROFILE);
    const box = page.locator("[data-tabs-scroller]").first();
    const tabs = box.getByRole("tab");
    await expect(tabs.first()).toBeVisible({ timeout: 12_000 });

    const p = await pageOverflow(page);
    expect(p.scrollWidth, `the page scrolls sideways: ${JSON.stringify(p)}`).toBeLessThanOrEqual(p.clientWidth);

    // The instrument: the row really is wider than the screen here, so the
    // assertion above is about a row that overflows, not one that happened to fit.
    const b = await box.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(b.scrollWidth, `the tab row fits at 390 px, so this test proves nothing: ${JSON.stringify(b)}`).toBeGreaterThan(
      b.clientWidth,
    );

    // Every label on one line: all tabs are the same height.
    const heights: number[] = [];
    for (let i = 0; i < (await tabs.count()); i++) {
      const r = await tabs.nth(i).boundingBox();
      expect(r, `tab ${i} has no box`).not.toBeNull();
      heights.push(Math.round(r!.height));
    }
    expect(new Set(heights).size, `a tab label wrapped: heights ${heights.join(", ")}`).toBe(1);

    // The last tab is reachable: clicking it selects it, and it is on screen.
    const last = tabs.last();
    const lastName = (await last.innerText()).trim();
    await last.click();
    await expect(page).toHaveURL(/[?&]tab=/, { timeout: 12_000 });
    const selected = page.locator("[data-tabs-scroller]").first().getByRole("tab", { name: lastName });
    await expect(selected).toHaveAttribute("aria-selected", "true");
    const r = await selected.boundingBox();
    expect(r).not.toBeNull();
    expect(r!.x, `the selected tab starts off screen: ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(0);
    expect(r!.x + r!.width, `the selected tab ends off screen: ${JSON.stringify(r)}`).toBeLessThanOrEqual(390);
  });

  test("a tab selected by the URL is scrolled into view on load", async ({ page }) => {
    // Documentos was off the right edge at 390 px before the fix.
    await page.goto(`${PROFILE}?tab=documentos`);
    const selected = page.locator("[data-tabs-scroller]").first().getByRole("tab", { selected: true });
    await expect(selected).toHaveText(/Documentos/, { timeout: 12_000 });
    // The server's HTML already marks Documentos selected, so the line above
    // passes BEFORE React hydrates and the Tabs effect scrolls the row. Measuring
    // then raced the effect (red on #1515's run of 2026-10-01: x 447 + 96 > 390).
    // Poll until the row has scrolled; if the effect never runs, this fails with
    // the last position seen.
    await expect
      .poll(
        async () => {
          const r = await selected.boundingBox();
          return r ? Math.round(r.x + r.width) : Number.POSITIVE_INFINITY;
        },
        { message: "the URL-selected tab never scrolled into view", timeout: 10_000 },
      )
      .toBeLessThanOrEqual(390);
    const r = await selected.boundingBox();
    expect(r).not.toBeNull();
    expect(r!.x, `the selected tab starts off screen: ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(0);
    const p = await pageOverflow(page);
    expect(p.scrollWidth, `the page scrolls sideways: ${JSON.stringify(p)}`).toBeLessThanOrEqual(p.clientWidth);
  });

  test("the help pages, the other user of the same Tabs, do not scroll sideways either", async ({ page }) => {
    await page.goto("/ajuda");
    await expect(page.locator("[data-tabs-scroller]").first().getByRole("tab").first()).toBeVisible({ timeout: 12_000 });
    const p = await pageOverflow(page);
    expect(p.scrollWidth, `the page scrolls sideways: ${JSON.stringify(p)}`).toBeLessThanOrEqual(p.clientWidth);
  });
});

test.describe("1440 px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("nothing changes on a wide screen: the row fits and does not scroll", async ({ page }) => {
    await page.goto(PROFILE);
    const box = page.locator("[data-tabs-scroller]").first();
    await expect(box.getByRole("tab").first()).toBeVisible({ timeout: 12_000 });
    const b = await box.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(b.scrollWidth, `the tab row scrolls at 1440 px: ${JSON.stringify(b)}`).toBeLessThanOrEqual(b.clientWidth);
  });
});
