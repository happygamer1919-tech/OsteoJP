/**
 * timing-panel-navigation.spec.ts - THE PANEL REFUSES TO REPORT ANOTHER PAGE'S
 * TIMING, IN A REAL BROWSER, ON A REAL SOFT NAVIGATION.
 *
 * ==========================================================================
 * WHY THIS EXISTS, AND IT IS NOT HYPOTHETICAL
 * ==========================================================================
 * `readClientTiming` used to return a full reading whenever a navigation entry
 * existed. After a client-side navigation that entry belongs to the PREVIOUS
 * document, so the panel reported the previous page's TTFB and a "Total sentido"
 * equal to the age of the tab. The staff shell navigates with next/link, so
 * clicking *Pacientes* in the sidebar produces exactly that.
 *
 * On 2026-09-05 the owner logged out, logged in, clicked Pacientes and felt
 * about five seconds - the same order of magnitude the panel would have
 * invented. An instrument that confirms the hypothesis by accident is worse
 * than no instrument.
 *
 * ==========================================================================
 * WHAT THIS FILE ASSERTS THAT THE UNIT TEST CANNOT
 * ==========================================================================
 * `classifyNavigation` is unit-tested in app/_components/timing-panel.test.tsx
 * and that covers the URL rule. Only a browser can prove the rest: that a
 * navigation with no new document really does leave the old navigation entry in
 * place, that the panel really renders the refusal, and that the SERVER rows survive it - the
 * refusal is scoped to the client half and must not throw away numbers that are
 * still true.
 *
 * It runs on `chromium`, the project e2e.yml invokes, so it holds on every PR.
 */

import { test, expect, type Page } from "@playwright/test";
import { STORAGE } from "./fixtures";

const PANEL = { role: "region" as const, name: "Medição de desempenho" };

/** The four rows that may only ever describe THIS document. */
const CLIENT_ROWS = ["Primeiro byte (TTFB)", "Transferência", "Hidratação", "Total sentido"];

async function openPanel(page: Page) {
  const panel = page.getByRole(PANEL.role, { name: PANEL.name });
  await panel.waitFor({ state: "attached", timeout: 30_000 });
  await panel.getByRole("button", { expanded: false }).click();
  return panel;
}

test.describe("the timing panel says which navigation it is measuring", () => {
  test.use({ storageState: STORAGE.admin });

  test("a FULL document load reports the four client rows and says so on its face", async ({
    page,
  }) => {
    await page.goto("/patients?medicao=1");
    const panel = await openPanel(page);

    await expect(panel).toContainText("carregamento completo");
    await expect(panel).not.toContainText("NAVEGAÇÃO INTERNA");
    for (const row of CLIENT_ROWS) {
      await expect(panel.getByText(row, { exact: true })).toBeVisible();
    }
    await expect(panel.getByTestId("timing-panel-soft-nav")).toHaveCount(0);
  });

  test("a SOFT navigation refuses the client numbers and names both pages", async ({ page }) => {
    // THE NEGATIVE ARM. A real navigation by the app's own router, not a
    // simulated one: the whole defect is a property of how Next navigates, so
    // faking the navigation would test something else.
    //
    // IT IS THE PATIENTS FILTER BAR AND NO LONGER A SIDEBAR LINK, because the panel
    // is on request (owner ruling, 2026-09-19) and no link in the shell carries
    // `?medicao=1`. The filter bar rebuilds the URL from the current parameters
    // and `router.replace`s it, which keeps the parameter and is exactly a
    // navigation with no new document. THREE CHARACTERS, because search-rule.ts
    // does not navigate on fewer (MIN_SEARCH_LENGTH), and an empty result is
    // fine: the heading and the db:patients-list span are there either way.
    // The filter-bar navigation is also the case the first version of this test
    // could not see: the SAME component instance survives it, so a reading taken
    // once at mount would have stayed on screen saying "carregamento completo"
    // over a request it never measured.
    //
    // WHAT THIS NO LONGER COVERS, stated rather than implied: a FIRST MOUNT reached
    // by a cross-route soft navigation. No in-app link can reach a panel that way
    // any more, and there the instance does NOT survive; the URL rule behind it is
    // still unit-tested, and the arm below covers the re-mount.
    await page.goto("/patients?medicao=1");
    await expect(page.getByRole(PANEL.role, { name: PANEL.name })).toContainText(
      "carregamento completo",
    );
    await page.getByRole("search").getByRole("searchbox").fill("sil");
    await page.waitForURL(/[?&]q=sil(&|$)/, { timeout: 30_000 });
    expect(page.url(), "the search dropped the parameter, so no panel can follow it").toContain(
      "medicao=1",
    );

    // THE PREMISE: this really is /patients, really rendered. A refusal on a
    // page that failed to load would prove nothing.
    await expect(page.getByRole("heading", { name: "Pacientes", exact: true })).toBeVisible();

    const panel = page.getByRole(PANEL.role, { name: PANEL.name });
    await panel.waitFor({ state: "attached", timeout: 30_000 });

    // ON THE FACE, before anything is expanded. The owner should not have to
    // open it to learn that the numbers inside would be meaningless.
    await expect(panel).toContainText("NAVEGAÇÃO INTERNA");
    await expect(panel).not.toContainText("total sentido");
    await expect(panel).not.toContainText("carregamento completo");

    await panel.getByRole("button", { expanded: false }).click();

    await expect(panel.getByTestId("timing-panel-soft-nav")).toBeVisible();
    await expect(panel.getByTestId("timing-panel-soft-nav")).toContainText("navegação interna");
    // It names the document the numbers WOULD have come from, which is the only
    // thing that makes the refusal actionable.
    // THE FIRST <code> IS THE DOCUMENT THE BROWSER NUMBERS BELONG TO, the second is
    // the current URL, which CONTAINS the first as a prefix: so a substring match
    // on the whole cell would pass with the document URL empty or wrong.
    const urls = panel.getByTestId("timing-panel-soft-nav").locator("code");
    await expect(urls.first()).toHaveText(/\/patients\?medicao=1$/);
    await expect(urls.nth(1)).toHaveText(/\/patients\?medicao=1&q=sil$/);

    // NOT ONE of the four client rows may be present.
    for (const row of CLIENT_ROWS) {
      await expect(
        panel.getByText(row, { exact: true }),
        `"${row}" is rendered after a soft navigation, so the previous document's timing is on screen`,
      ).toHaveCount(0);
    }

    // AND THE SERVER HALF SURVIVES. The refusal is about what the BROWSER knows;
    // the server spans were produced by this page's own render and are still
    // true. Throwing them away too would be a second conflation.
    await expect(panel.getByText("Função do servidor", { exact: true })).toBeVisible();
    await expect(panel.getByText("db:patients-list", { exact: true })).toBeVisible();
  });

  test("a RE-MOUNTED panel on the same URL does not claim a document load (away, then Back)", async ({
    page,
  }) => {
    // THE ONE CASE THE URL RULE CANNOT SEE. Leaving /patients unmounts the panel;
    // Back mounts a NEW instance on a URL equal to the navigation entry's, so
    // `classifyNavigation` answers "document" and the total would be the age of
    // the tab. `documentLoadClaimed` in timing-panel.tsx is what refuses it, and
    // without this arm deleting that guard leaves every other test green.
    await page.goto("/patients?medicao=1");
    const first = page.getByRole(PANEL.role, { name: PANEL.name });
    await expect(first, "the control: the first instance IS a document load").toContainText(
      "carregamento completo",
    );

    await page.locator('a[href="/agenda"]').first().click();
    await page.waitForURL(/\/agenda(\?|$)/, { timeout: 30_000 });
    await page.goBack();
    await page.waitForURL(/\/patients\?medicao=1$/, { timeout: 30_000 });

    const again = page.getByRole(PANEL.role, { name: PANEL.name });
    await again.waitFor({ state: "attached", timeout: 30_000 });
    await expect(again).toContainText("NAVEGAÇÃO INTERNA");
    await expect(again).not.toContainText("carregamento completo");
  });

  test("the panel's own anchor does not make it refuse", async ({ page }) => {
    // The hash edge case, end to end: `#medicao` changes location.href and
    // nothing else. A raw string comparison would refuse here, which would train
    // the reader to ignore refusals.
    await page.goto("/patients?medicao=1#medicao");
    const panel = await openPanel(page);
    await expect(panel).toContainText("carregamento completo");
    await expect(panel.getByText("Total sentido", { exact: true })).toBeVisible();
  });

  test("the panel is above the table, not below 8,413 rows of it", async ({ page }) => {
    // REQUIREMENT (c), pinned. It sat at the bottom of the page and the owner
    // could not find it. A later tidy-up moving it back would restore exactly
    // that, and nothing else would go red.
    await page.goto("/patients?medicao=1");
    const panel = page.getByRole(PANEL.role, { name: PANEL.name });
    await expect(panel).toBeVisible();

    const table = page.locator("table").first();
    await expect(table).toBeVisible();

    const panelBefore = await page.evaluate(() => {
      const p = document.querySelector('[aria-label="Medição de desempenho"]');
      const t = document.querySelector("table");
      if (!p || !t) return null;
      // DOCUMENT_POSITION_FOLLOWING: `t` comes after `p` in document order.
      return Boolean(p.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(panelBefore, "the timing panel must precede the patients table in the document").toBe(
      true,
    );
  });
});
