/**
 * ficha-add-episode.spec.ts - EPI-01b piece 2: "+ Episódio" on the patient's
 * Registos tab.
 *
 * THE RULES UNDER TEST:
 *   - a therapist who may write for the patient opens a NEW open episode from
 *     the Registos tab. They pick a specialty from the closed list and nothing
 *     else: the form has no text field, and the title is a specialty and a
 *     date, by ruling, built by the server ("<specialty> (<Lisbon date>)");
 *   - the therapist lands back on the tab with the new group drawn and focused,
 *     and "+ Avaliação" on it files the registo in that episode;
 *   - when the patient already has an open episode of that specialty, nothing
 *     is opened: the tab shows that episode and asks. "Cancelar" opens nothing;
 *     the explicit confirmation opens another;
 *   - the owner and reception do not see the control (the action refuses them
 *     as well: episodes.create-guard.test.ts and episodes.create.db.test.ts).
 *
 * The patient is seed-e2e.mjs's ensureAddEpisodeFixture (ADD_EPISODE): an
 * invented patient with no episode and no registo, created_by the E2E
 * therapist. Every run ADDS open episodes to it, so on a database earlier runs
 * have used the first click may be answered with the confirmation: `openEpisode`
 * follows either path, and each assertion follows the ids the run itself
 * created, never a total. Invented names only.
 */
import { test, expect, type Page } from "@playwright/test";
import { ADD_EPISODE as F, E2E_PASSWORD, STORAGE, USERS } from "./fixtures";

const TAB = `/patients/${F.patientId}?tab=registos`;
const OPENED_URL = /[?&]episodio=([0-9a-f-]{36})/;
const NEW_RECORD_URL = /\/clinical\/([0-9a-f-]{36})$/;

/** The clinic's calendar day, dd/mm/yyyy, as the server titles a new episode. */
const lisbonToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date()).split("-").reverse().join("/");

const group = (page: Page, episodeId: string) =>
  page.locator(`[data-testid="record-group"][data-group-key="episode:${episodeId}"]`);
const episodeGroups = (page: Page) => page.locator('[data-testid="record-group"][data-group-kind="episode"]');
const form = (page: Page) => page.getByTestId("add-episode-form");
const confirmPanel = (page: Page) => page.getByTestId("add-episode-confirm");

async function openTab(page: Page) {
  await page.goto(TAB);
  await expect(page.getByRole("heading", { name: F.patientName })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("tabpanel", { name: "Registos clínicos" })).toBeVisible();
}

/** Pick a specialty and press "+ Episódio". */
async function submit(page: Page, specialty: string) {
  await page.getByTestId("add-episode-specialty").selectOption(specialty);
  await page.getByTestId("add-episode-submit").click();
}

/**
 * Open a new episode of `specialty` and return its id. If the patient already
 * has an open one (an earlier run, or an earlier test of this run), the tab
 * asks first, and this confirms.
 */
async function openEpisode(page: Page, specialty: string): Promise<string> {
  await submit(page, specialty);
  await expect(page).toHaveURL(/[?&](episodio=[0-9a-f-]{36}|m=episodioAberto)/, { timeout: 30_000 });
  if (!OPENED_URL.test(page.url())) {
    await expect(confirmPanel(page)).toContainText(new RegExp(`${specialty}( \\(\\d{2}/\\d{2}/\\d{4}\\))?`));
    await page.getByTestId("add-episode-confirm-submit").click();
    await expect(page).toHaveURL(OPENED_URL, { timeout: 30_000 });
  }
  return OPENED_URL.exec(page.url())![1]!;
}

test.describe("EPI-01b piece 2: '+ Episódio' on the Registos tab (therapist)", () => {
  test.use({ storageState: STORAGE.therapist, viewport: { width: 1280, height: 900 } });

  test("the control: a specialty from the closed list and '+ Episódio'; nothing can be typed", async ({ page }) => {
    await openTab(page);
    await expect(form(page)).toBeVisible();
    const select = page.getByLabel("Especialidade do novo episódio");
    await expect(select).toBeVisible();
    await expect(select.locator("option")).toHaveText(["Escolher especialidade", "Osteopatia", "Fisioterapia"]);
    await expect(page.getByRole("button", { name: "Abrir um novo episódio da especialidade escolhida" })).toBeVisible();
    await expect(page.getByTestId("add-episode-submit")).toHaveText("Episódio");
    // No field takes text: the only inputs are hidden, and there is no textarea.
    await expect(form(page).locator('input:not([type="hidden"]), textarea, [contenteditable]')).toHaveCount(0);
    // One entry point: the header no longer has a "Novo episódio" button. By
    // its exact name: "+ Episódio"'s own accessible name contains those words.
    await expect(page.getByRole("button", { name: "Novo episódio", exact: true })).toHaveCount(0);
    // With no specialty chosen the browser keeps the form: nothing is posted.
    await page.getByTestId("add-episode-submit").click();
    await expect(page).toHaveURL(new RegExp(`/patients/${F.patientId}\\?tab=registos$`));
  });

  test("it opens a new episode titled by the server, lands on its group, and '+ Avaliação' files into it", async ({ page }, testInfo) => {
    await openTab(page);
    const dayBefore = lisbonToday();
    const id = await openEpisode(page, "Fisioterapia");
    const dayAfter = lisbonToday();

    // The new group: titled with the specialty and today's Lisbon date, no evaluation yet.
    const fresh = group(page, id);
    await expect(fresh).toBeVisible({ timeout: 15_000 });
    const title = (await fresh.locator("summary").innerText()).match(/Fisioterapia \((\d{2}\/\d{2}\/\d{4})\)/);
    expect(title, "the group is labelled with the specialty and a date").not.toBeNull();
    expect([dayBefore, dayAfter]).toContain(title![1]);
    await expect(fresh.getByTestId("record-group-count")).toHaveText("Sem avaliações");
    await expect(fresh.getByTestId("record-row")).toHaveCount(0);
    await expect(fresh.locator("summary")).not.toContainText("Importado");
    // The tab says what happened, and the focus is on the new group.
    await expect(page.getByTestId("add-episode-opened")).toHaveText(
      `Episódio aberto: Fisioterapia (${title![1]}). Pode registar a primeira avaliação.`,
    );
    await expect(fresh.locator("summary")).toBeFocused();
    await testInfo.attach("EPI-01b-episode-1280", {
      path: await shot(page, testInfo.outputPath("EPI-01b-episode-1280.png")),
      contentType: "image/png",
    });

    // "+ Avaliação" on the new group files the registo in THAT episode.
    await fresh.getByRole("button", { name: `Nova avaliação neste episódio: Fisioterapia (${title![1]})` }).click();
    await expect(page).toHaveURL(NEW_RECORD_URL, { timeout: 30_000 });
    const recordId = NEW_RECORD_URL.exec(page.url())![1]!;

    await openTab(page);
    const row = group(page, id).locator(`[data-record-id="${recordId}"]`);
    await expect(row).toBeVisible();
    await expect(row).toContainText("Rascunho");
    await expect(group(page, id).getByTestId("record-group-count")).toHaveText("1 avaliação");
    await expect(page.getByTestId("record-group").filter({ has: page.locator(`[data-record-id="${recordId}"]`) })).toHaveCount(1);

    // The episode itself: open, titled with the specialty and the date, holding the registo.
    await page.goto(`/clinical/episodes/${id}`);
    await expect(page.getByRole("heading", { name: `Fisioterapia (${title![1]})` })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Aberto", { exact: true })).toBeVisible();
    await expect(page.locator(`a[href="/clinical/${recordId}"]`)).toBeVisible();
  });

  test("an open episode of the specialty is shown first: 'Cancelar' opens nothing, the confirmation opens another", async ({ page }) => {
    await openTab(page);
    // Make sure one is open, and that it is the most recently opened of its specialty.
    const first = await openEpisode(page, "Osteopatia");
    await openTab(page);
    await expect(group(page, first)).toBeVisible();
    const before = await episodeGroups(page).count();

    // The same request again: nothing is opened, and the tab shows the open one.
    await submit(page, "Osteopatia");
    await expect(page).toHaveURL(/[?&]m=episodioAberto&esp=Osteopatia$/, { timeout: 30_000 });
    const panel = confirmPanel(page);
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Já existe um episódio de Osteopatia aberto" })).toBeFocused();
    await expect(page.getByTestId("add-episode-confirm-existing")).toHaveText(
      /^Episódio aberto: Osteopatia \(\d{2}\/\d{2}\/\d{4}\)\. Não foi aberto nenhum episódio novo\.$/,
    );
    await expect(panel.locator('input[name="confirmOpenEpisodeId"]')).toHaveValue(first);
    await expect(page.getByTestId("add-episode-confirm-view")).toHaveAttribute("href", `#episodio-${first}`);
    await expect(episodeGroups(page)).toHaveCount(before);

    // "Cancelar": back on the tab, and still nothing opened.
    await page.getByTestId("add-episode-confirm-cancel").click();
    await expect(page).toHaveURL(new RegExp(`/patients/${F.patientId}\\?tab=registos$`));
    await expect(confirmPanel(page)).toHaveCount(0);
    await expect(episodeGroups(page)).toHaveCount(before);

    // Ask again and confirm: another episode is opened, and the first is still there.
    await submit(page, "Osteopatia");
    await expect(confirmPanel(page)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Abrir outro episódio de Osteopatia" }).click();
    await expect(page).toHaveURL(OPENED_URL, { timeout: 30_000 });
    const second = OPENED_URL.exec(page.url())![1]!;
    expect(second).not.toBe(first);
    await expect(group(page, second)).toBeVisible({ timeout: 15_000 });
    await expect(group(page, second).locator("summary")).toContainText(/Osteopatia \(\d{2}\/\d{2}\/\d{4}\)/);
    await expect(group(page, first)).toBeVisible();
    await expect(episodeGroups(page)).toHaveCount(before + 1);
  });
});

test.describe("EPI-01b piece 2: '+ Episódio' is the therapist's alone", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test.describe("the owner (an author, with the tenant's patients)", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("opens the Registos tab, with 'Nova ficha' and no '+ Episódio'", async ({ page }) => {
      await page.goto("/login");
      await page.locator('input[name="email"]').fill(USERS.owner);
      await page.locator('input[name="password"]').fill(E2E_PASSWORD);
      await page.getByRole("button", { name: /Iniciar sessão/i }).click();
      await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

      await openTab(page);
      // Positive control: the tab's author controls are drawn for the owner.
      await expect(page.getByRole("link", { name: "Nova ficha" })).toBeVisible();
      await expect(form(page)).toHaveCount(0);
      await expect(page.getByTestId("add-episode-submit")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Novo episódio", exact: true })).toHaveCount(0);
    });
  });

  test.describe("reception", () => {
    test.use({ storageState: STORAGE.reception });

    test("opens the ficha, has no Registos tab, and no '+ Episódio' anywhere", async ({ page }) => {
      await page.goto(TAB);
      await expect(page.getByRole("heading", { name: F.patientName })).toBeVisible({ timeout: 15_000 });
      // The tab locator works (Resumo is there); Registos clínicos is not.
      await expect(page.getByRole("tab", { name: "Resumo" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Registos clínicos" })).toHaveCount(0);
      await expect(form(page)).toHaveCount(0);
      await expect(page.getByTestId("add-episode-submit")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Novo episódio", exact: true })).toHaveCount(0);
    });
  });
});

test.describe("EPI-01b piece 2: '+ Episódio' at phone width (therapist, 390 px)", () => {
  test.use({ storageState: STORAGE.therapist, viewport: { width: 390, height: 844 } });

  test("the select and the button are on screen and the page does not scroll sideways", async ({ page }, testInfo) => {
    await openTab(page);
    for (const testId of ["add-episode-specialty", "add-episode-submit"]) {
      const control = page.getByTestId(testId);
      await expect(control).toBeVisible();
      const box = (await control.boundingBox())!;
      expect(box.x, `${testId} starts on screen`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${testId} ends on screen`).toBeLessThanOrEqual(390);
    }
    const p = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(p.scrollWidth, `the page scrolls sideways: ${JSON.stringify(p)}`).toBeLessThanOrEqual(p.clientWidth);
    await testInfo.attach("EPI-01b-episode-390", {
      path: await shot(page, testInfo.outputPath("EPI-01b-episode-390.png")),
      contentType: "image/png",
    });
  });
});

/** A full-page screenshot written under the test's output dir (uploaded with test-results). */
async function shot(page: Page, path: string): Promise<string> {
  await page.screenshot({ path, fullPage: true });
  return path;
}
