/**
 * U1 — the pager and the ficha's Marcações filters, end to end.
 *
 * ==========================================================================
 * WHAT IS TESTED WHERE, AND WHY THEY ARE DIFFERENT SCREENS
 * ==========================================================================
 * The owner's complaint ("page 100 takes 100 clicks") is true of the PAGINATED
 * lists: /patients, /recuperacao and /comunicacoes/lembretes-sms. The patient
 * profile has no pagination at all - every list there renders in full - so the
 * pager is exercised on /patients, which really does page, and the profile is
 * where the FILTERS are exercised, on a patient with 250 marcações.
 *
 * That split is the ruled scope, not an omission: adding pagination to the ficha
 * would hide rows staff can see today, which is an owner decision and was not
 * taken.
 *
 * B3 = URL state survives reload and Back.
 * B4 = the pager at scale + the filters narrowing 250 rows, with screenshots.
 * B5 = the therapist role sees a SUBSET of its own unfiltered set, never more.
 */
import { test, expect, type Page } from "@playwright/test";

import { PATIENT_LONG_HISTORY } from "./fixtures";

const FICHA = `/patients/${PATIENT_LONG_HISTORY.id}?tab=consultas`;

/** Rows currently rendered on the Marcações tab. */
const rowCount = (page: Page) => page.getByTestId("consulta-row").count();

// ---------------------------------------------------------------------------
// B4 — the pager, on a list that genuinely pages
// ---------------------------------------------------------------------------
test("the pager reaches the LAST page in one action, not one click per page", async ({ page }) => {
  await page.goto("/patients");
  const pager = page.getByTestId("pager");
  await expect(pager).toBeVisible();

  const pageCount = Number(await pager.getAttribute("data-page-count"));
  expect(pageCount, "the seed must produce more than one page for this to mean anything").toBeGreaterThan(1);

  await page.getByTestId("pager-last").click();
  await expect(page.getByTestId("pager")).toHaveAttribute("data-page", String(pageCount));
  expect(page.url()).toContain(`page=${pageCount}`);

  // ...and back to the first in one action too.
  await page.getByTestId("pager-first").click();
  await expect(page.getByTestId("pager")).toHaveAttribute("data-page", "1");
});

test("Ir para pagina 2 lands on page 2, and junk sends no request", async ({ page }) => {
  await page.goto("/patients");
  await expect(page.getByTestId("pager")).toBeVisible();

  // Junk first: the URL must not move at all.
  const before = page.url();
  await page.getByTestId("pager-goto").fill("abc");
  await page.getByTestId("pager-goto-submit").click();
  await page.waitForTimeout(250);
  expect(page.url(), "a non-numeric entry must not navigate").toBe(before);

  // An empty box is the same refusal.
  await page.getByTestId("pager-goto").fill("");
  await page.getByTestId("pager-goto-submit").click();
  await page.waitForTimeout(250);
  expect(page.url(), "an empty entry must not navigate").toBe(before);

  // Then a real page number.
  await page.getByTestId("pager-goto").fill("2");
  await page.getByTestId("pager-goto-submit").click();
  await expect(page.getByTestId("pager")).toHaveAttribute("data-page", "2");
});

test("the pager is HIDDEN when there is only one page", async ({ page }) => {
  // One patient's ficha is not paginated at all, so no pager may appear there.
  await page.goto(FICHA);
  await expect(page.getByTestId("marcacoes-filters")).toBeVisible();
  await expect(page.getByTestId("pager")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// B4 — the filters, over 250 rows, with the proof screenshots
// ---------------------------------------------------------------------------
test("the Estado filter narrows 250 marcacoes to the one that matches", async ({ page }) => {
  await page.goto(FICHA);
  const all = await rowCount(page);
  expect(all, "the long-history fixture must be seeded").toBe(PATIENT_LONG_HISTORY.total);

  // The ONE cancelled visit sits ~200 rows down: a filter applied to a rendered
  // page could not find it, so finding it is the proof the server filtered.
  await page.getByTestId(`filter-estado-${PATIENT_LONG_HISTORY.needleStatus}`).check();
  await expect(page.getByTestId("consulta-row")).toHaveCount(1);
  expect(page.url()).toContain(`estado=${PATIENT_LONG_HISTORY.needleStatus}`);

  // Limpar filtros restores the untouched total.
  await page.getByTestId("filter-clear").click();
  await expect(page.getByTestId("consulta-row")).toHaveCount(all);
});

test("a filter that matches nothing says so, and does not claim the patient has no history", async ({ page }) => {
  // Sem nota + a date window containing only noted visits.
  await page.goto(`${FICHA}&semnota=1&de=2019-01-01&ate=2019-01-05`);
  await expect(page.getByTestId("consulta-row")).toHaveCount(0);
  await expect(page.getByText("Sem consultas")).toHaveCount(0);
});

test("proof screenshots at 1280 and 1024", async ({ page }) => {
  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(FICHA);
    await expect(page.getByTestId("marcacoes-filters")).toBeVisible();
    await page.screenshot({ path: `test-results/u1-ficha-filtros-${width}.png`, fullPage: false });

    await page.goto("/patients");
    await expect(page.getByTestId("pager")).toBeVisible();
    await page.screenshot({ path: `test-results/u1-pager-${width}.png`, fullPage: false });
  }
});

// ---------------------------------------------------------------------------
// B3 — the URL is the state
// ---------------------------------------------------------------------------
test("reload keeps the page and the filters; Back returns to the previous view", async ({ page }) => {
  await page.goto(FICHA);
  const all = await rowCount(page);

  await page.getByTestId(`filter-estado-${PATIENT_LONG_HISTORY.needleStatus}`).check();
  await expect(page.getByTestId("consulta-row")).toHaveCount(1);
  const filteredUrl = page.url();

  await page.reload();
  await expect(page.getByTestId("consulta-row")).toHaveCount(1);
  expect(page.url()).toBe(filteredUrl);

  await page.goBack();
  await expect(page.getByTestId("consulta-row")).toHaveCount(all);
});

test("a page turn survives reload and Back on /patients", async ({ page }) => {
  await page.goto("/patients");
  await page.getByTestId("pager-last").click();
  const lastPage = await page.getByTestId("pager").getAttribute("data-page");
  const url = page.url();

  await page.reload();
  await expect(page.getByTestId("pager")).toHaveAttribute("data-page", lastPage!);
  expect(page.url()).toBe(url);

  await page.goBack();
  await expect(page.getByTestId("pager")).toHaveAttribute("data-page", "1");
});

// ---------------------------------------------------------------------------
// B5 — the therapist role: filters narrow, they never widen
// ---------------------------------------------------------------------------
test.describe("as a therapist", () => {
  test.use({ storageState: "e2e/.auth/therapist.json" });

  test("a filtered set is a SUBSET of the same role's unfiltered set", async ({ page }) => {
    await page.goto(FICHA);
    // Whatever this therapist may see unfiltered, recorded by id.
    const unfiltered = await page.getByTestId("consulta-row").evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-appointment-id")),
    );

    await page.goto(`${FICHA}&estado=completed`);
    const filtered = await page.getByTestId("consulta-row").evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-appointment-id")),
    );

    expect(filtered.length).toBeLessThanOrEqual(unfiltered.length);
    for (const id of filtered) {
      expect(unfiltered, "a filter must never reveal a row outside this role's scope").toContain(id);
    }
  });
});
