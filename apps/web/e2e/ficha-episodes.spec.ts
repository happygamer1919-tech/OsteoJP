/**
 * ficha-episodes.spec.ts - EPI-01a PR 1: the Registos tab groups a patient's
 * registos the way the Fisiozero ficha did.
 *
 * THE SHAPE UNDER TEST is what the importer writes (seed-e2e.mjs,
 * ensureFichaEpisodes): one closed episode per evaluation, titled only with the
 * specialty, one locked registo each, and ledger rows for both. Grouped by
 * episode id, three evaluations would read as three "episodes". Strategy's ruling
 * Q1 (a) groups the imported history one group per specialty per patient, so
 * this patient shows TWO groups: Osteopatia (two evaluations, newest group
 * first) and Fisioterapia (two, the first with a complaint longer than 120 characters), each with its dated evaluations beneath, and
 * every imported registo still opens.
 *
 * Runs as the THERAPIST (the patient is created_by the E2E therapist). Keeps a
 * screenshot at 1280 px and at 390 px for the report. Invented patient, invented
 * text: no real name appears.
 */
import { test, expect, type Page } from "@playwright/test";
import { FICHA_EPISODES as F, STORAGE } from "./fixtures";

const TAB = `/patients/${F.patientId}?tab=registos`;

async function openTab(page: Page) {
  await page.goto(TAB);
  const groups = page.getByTestId("record-group");
  await expect(groups).toHaveCount(2, { timeout: 12_000 });
  return groups;
}

test.describe("EPI-01a: the Registos tab, grouped (therapist)", () => {
  test.use({ storageState: STORAGE.therapist });

  test.describe("1280 px", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("one group per specialty, newest group first, dated evaluations beneath, all imported", async ({ page }, testInfo) => {
      const groups = await openTab(page);

      const osteo = groups.nth(0);
      await expect(osteo).toHaveAttribute("data-group-key", "imported:Osteopatia");
      await expect(osteo).toHaveAttribute("data-group-kind", "imported");
      await expect(osteo.getByTestId("record-group-date")).toHaveText(F.osteo1.lisbonDay);
      await expect(osteo.getByTestId("record-group-count")).toHaveText("2 avaliações");
      await expect(osteo.locator("summary")).toContainText("Importado");
      await expect(osteo.locator("summary")).toContainText(F.osteo1.excerpt);
      // The evaluations beneath, oldest to newest by the clinical date.
      await expect(osteo.getByTestId("record-row")).toHaveCount(2);
      await expect(osteo.getByTestId("record-row").nth(0)).toHaveAttribute("data-record-id", F.osteo1.recordId);
      await expect(osteo.getByTestId("record-row").nth(1)).toHaveAttribute("data-record-id", F.osteo2.recordId);
      await expect(osteo.getByTestId("record-row").nth(1)).toContainText(F.osteo2.excerpt);
      await expect(osteo.getByTestId("record-row").nth(0)).toContainText("Bloqueada");

      const fisio = groups.nth(1);
      await expect(fisio).toHaveAttribute("data-group-key", "imported:Fisioterapia");
      // Stored at 23:00 UTC on 9 June: the tab prints the Lisbon day.
      await expect(fisio.getByTestId("record-group-date")).toHaveText(F.fisioLong.lisbonDay);
      await expect(fisio.getByTestId("record-group-count")).toHaveText("2 avaliações");
      await expect(fisio.getByTestId("record-row")).toHaveCount(2);
      await expect(fisio.getByTestId("record-row").nth(0)).toHaveAttribute("data-record-id", F.fisioLong.recordId);
      await expect(fisio.getByTestId("record-row").nth(1)).toHaveAttribute("data-record-id", F.fisio.recordId);
      // The second one, stored at 23:00 UTC on 5 September, prints as 6 September.
      await expect(fisio.getByTestId("record-row").nth(1)).toContainText(F.fisio.excerpt);
      // The header carries the long complaint, cut at 120 characters with an ellipsis.
      await expect(fisio.locator("summary")).toContainText(F.fisioLong.excerptStart);
      await expect(fisio.locator("summary")).toContainText("…");

      await testInfo.attach("registos-grouped-1280", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    });

    test("every imported registo is reachable: each one opens its own record", async ({ page }) => {
      for (const id of [F.osteo1.recordId, F.fisioLong.recordId, F.fisio.recordId, F.osteo2.recordId]) {
        await openTab(page);
        const row = page.locator(`[data-record-id="${id}"]`);
        await expect(row).toBeVisible();
        await row.getByRole("link").first().click();
        await expect(page).toHaveURL(new RegExp(`/clinical/${id}$`), { timeout: 12_000 });
        await expect(page.getByTestId("imported-record-preview")).toBeVisible({ timeout: 12_000 });
      }
    });

    test("a group folds on its summary and opens again", async ({ page }) => {
      const groups = await openTab(page);
      const osteo = groups.nth(0);
      const first = osteo.getByTestId("record-row").first();
      await expect(first).toBeVisible();
      await osteo.locator("summary").click();
      await expect(first).toBeHidden();
      await osteo.locator("summary").click();
      await expect(first).toBeVisible();
    });
  });

  test.describe("390 px", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the groups fit the phone: no sideways page scroll, every row reachable", async ({ page }, testInfo) => {
      const groups = await openTab(page);
      await expect(groups.nth(0).getByTestId("record-row")).toHaveCount(2);
      await expect(groups.nth(1).getByTestId("record-row")).toHaveCount(2);
      // The longest complaint is on screen, cut, and the page still does not scroll sideways.
      await expect(groups.nth(1).locator("summary")).toContainText(F.fisioLong.excerptStart);
      const p = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(p.scrollWidth, `the page scrolls sideways: ${JSON.stringify(p)}`).toBeLessThanOrEqual(p.clientWidth);
      await testInfo.attach("registos-grouped-390", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    });
  });
});
