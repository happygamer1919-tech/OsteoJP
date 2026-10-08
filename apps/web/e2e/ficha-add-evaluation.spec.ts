/**
 * ficha-add-evaluation.spec.ts - EPI-01b piece 1 (strategy dispatch S-1002-D
 * P2.2): "+ Avaliação" on an episode group of the Registos tab.
 *
 * THE RULES UNDER TEST (design note section 1, Q7 default):
 *   - on an APP episode group it files the new registo IN THAT EPISODE;
 *   - on an IMPORTED group it files the registo in the patient's OPEN APP
 *     EPISODE OF THAT SPECIALTY, and opens one, titled "<specialty> (<Lisbon
 *     date>)", only when there is none (strategy ruling R31); the imported
 *     episode is left as it was. TWO CLICKS, ONE EPISODE: the R31 describe below,
 *     on a patient of its own (ADD_EVALUATION_REUSE), where the second click
 *     comes from a page loaded before the first, so the page cannot be what
 *     decides;
 *   - the "Sem episódio" group has none (a judgment, not a ruling);
 *   - only an author who may write for the patient sees it: the owner does; an
 *     admin reads the same groups with no button, and reception has no
 *     Registos tab at all. (A care-team therapist, who reads but neither treats
 *     nor created the patient, is pinned in page-add-evaluation.test.tsx: the
 *     seed has no care team.)
 *
 * The patient is seed-e2e.mjs's ensureAddEvaluationFixture (ADD_EVALUATION): an
 * invented patient with one group of each kind, created_by the E2E therapist.
 * Every run ADDS registos and episodes to it, so each assertion follows the ids
 * the run itself created, never a group's total. The role arms first prove the
 * page opened (a 404 would also show no button).
 *
 * TWO ADMINS, BECAUSE ONE OF THEM SEES NO REGISTOS. The suite's admin storage
 * state is "E2E Admin", who holds no clinic on purpose; 0045 shows an admin
 * clinical rows only for patients at their own clinics, so that admin opens an
 * EMPTY Registos tab, and "no button" there proves nothing about a group. It is
 * kept (the dispatch names the suite's storage states) and says so. The arm that
 * proves it is the seeded Linda-a-Velha admin (USERS.adminRevenueLv, logs in
 * with E2E_PASSWORD like the revenue spec): the patient's clinic is Linda-a-Velha,
 * so this admin reads every group, and still has no button. Screenshots at 1280 px and
 * 390 px are attached for the report. Invented names only.
 *
 * EPI-01b piece 3, ONE ARM: "PDF do episódio". The seeded app episode holds a
 * draft and a locked registo, so its group offers the button and says the file
 * leaves the draft out; pressing it downloads one PDF named after the episode.
 * "Sem episódio" is not an episode and offers none. Which registos the file
 * holds, per role and status, is pinned in the unit and DB-backed suites
 * (episode-export*.test.ts).
 *
 * EXPORT-01: THE IMPORTED GROUP HAS THE BUTTON TOO, AND AN IMPORTED REGISTO HAS
 * "Transferir PDF". The owner arm at the foot of this file presses both on the
 * seeded LOCKED imported registo (the one registo of its kind a DB-gated suite
 * cannot create), and reads the two downloaded files: each holds the field
 * names and the values the registo's own page shows, under the page's heading.
 * A second owner arm presses "Exportar ficha" and reads the one PDF of the
 * whole patient: each group under its heading page, and no draft.
 *
 * THAT ARM IS A REAL DOWNLOAD, AND IT NEEDS NOTHING ANOTHER SPEC LEFT BEHIND.
 * The app renders the file, stores it in the `clinical-attachments` bucket and
 * sends the browser to a signed URL. The bucket is provisioned by the seed
 * (seed-e2e.mjs, ensureAttachmentsBucket), so the arm passes on a fresh
 * database whichever shard it lands on. It downloads bytes its own click made
 * the app write: the seeded documents of other fixtures hold no bytes
 * (fixtures.ts, IMPORTED_DOCUMENTS) and are still never downloaded. Playwright
 * accepts downloads by default and the config does not turn that off; the file
 * is read from the path Playwright saved it to and must begin as a PDF does.
 */
import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { drawnLines, squash, words } from "../lib/clinical/report/drawn-lines-test-fixture";
import { ADD_EVALUATION as F, ADD_EVALUATION_REUSE as R, E2E_PASSWORD, STORAGE, USERS } from "./fixtures";

const TAB = `/patients/${F.patientId}?tab=registos`;
const APP_KEY = `episode:${F.appEpisode.episodeId}`;
const IMPORTED_KEY = `imported:${F.imported.specialty}`;
const NEW_RECORD_URL = /\/clinical\/([0-9a-f-]{36})$/;
/** R31: the label says both outcomes, so it is true whether the episode is reused or opened. */
const importedLabel = (specialty: string) => `Nova avaliação de ${specialty}, no episódio aberto ou num novo`;

/** The clinic's calendar day, dd/mm/yyyy, as the server titles a new episode. */
const lisbonToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date()).split("-").reverse().join("/");

const group = (page: Page, key: string) => page.locator(`[data-testid="record-group"][data-group-key="${key}"]`);
const addButton = (page: Page) => page.getByTestId("record-group-add-evaluation");

async function openTab(page: Page) {
  await page.goto(TAB);
  await expect(group(page, APP_KEY)).toBeVisible({ timeout: 15_000 });
}

/** Click a group's "+ Avaliação" and return the id of the registo it opened. */
async function addEvaluation(page: Page, key: string): Promise<string> {
  await group(page, key).getByTestId("record-group-add-evaluation").click();
  await expect(page).toHaveURL(NEW_RECORD_URL, { timeout: 30_000 });
  return NEW_RECORD_URL.exec(page.url())![1]!;
}

test.describe("EPI-01b: '+ Avaliação' on an episode group (therapist)", () => {
  test.use({ storageState: STORAGE.therapist, viewport: { width: 1280, height: 900 } });

  test("each group of the right kind offers it, and 'Sem episódio' does not", async ({ page }) => {
    await openTab(page);
    await expect(group(page, APP_KEY).getByRole("button", { name: `Nova avaliação neste episódio: ${F.appEpisode.title}` })).toBeVisible();
    await expect(
      group(page, IMPORTED_KEY).getByRole("button", { name: importedLabel(F.imported.specialty) }),
    ).toBeVisible();
    // The "Sem episódio" group is there, with its registo, and has no button.
    const none = group(page, "none");
    await expect(none.locator(`[data-record-id="${F.noEpisode.recordId}"]`)).toBeVisible();
    await expect(none.getByTestId("record-group-add-evaluation")).toHaveCount(0);
    // The visible label reads "+ Avaliação": a plus icon and the word.
    await expect(group(page, APP_KEY).getByTestId("record-group-add-evaluation")).toHaveText("Avaliação");
  });

  test("piece 3: the app episode offers 'PDF do episódio' and it downloads; the imported group offers its own; 'Sem episódio' offers none", async ({ page }) => {
    await openTab(page);
    const app = group(page, APP_KEY);
    await expect(app.locator(`[data-record-id="${F.appEpisode.finalizedRecordId}"]`)).toContainText("Bloqueada");
    const pdf = app.getByRole("button", { name: `Transferir o PDF do episódio: ${F.appEpisode.title}` });
    await expect(pdf).toBeVisible();
    await expect(pdf).toHaveText("PDF do episódio");
    // The episode also holds a draft: the group says the file leaves it out.
    await expect(app.getByTestId("record-group-episode-pdf-partial")).toBeVisible();

    // EXPORT-01: the imported group has its own button (the group's, by its
    // specialty), never the app episode's.
    await expect(group(page, IMPORTED_KEY).locator(`[data-record-id="${F.imported.recordId}"]`)).toBeVisible();
    await expect(group(page, IMPORTED_KEY).getByTestId("record-group-episode-pdf")).toHaveCount(0);
    await expect(
      group(page, IMPORTED_KEY).getByRole("button", { name: `Transferir o PDF do episódio: ${F.imported.specialty}` }),
    ).toBeVisible();
    await expect(group(page, IMPORTED_KEY).getByTestId("record-group-imported-pdf")).toHaveCount(1);
    // Not an episode: no button, on a group that really rendered its registo.
    await expect(group(page, "none").locator(`[data-record-id="${F.noEpisode.recordId}"]`)).toBeVisible();
    await expect(group(page, "none").getByTestId("record-group-episode-pdf")).toHaveCount(0);

    // The signed URL names the file (Content-Disposition), so the browser
    // downloads it and the tab stays on the ficha.
    const downloading = page.waitForEvent("download", { timeout: 30_000 });
    await pdf.click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(`relatorio-episodio-${F.appEpisode.episodeId.slice(0, 8)}.pdf`);
    expect(await download.failure()).toBeNull();
    expect(readFileSync(await download.path()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // The tab is still the ficha: the group is there, with no error line.
    await expect(app.getByTestId("record-group-episode-pdf-error")).toHaveCount(0);
    await expect(pdf).toBeVisible();
  });

  test("on an APP episode it files the new registo in that episode", async ({ page }) => {
    await openTab(page);
    const id = await addEvaluation(page, APP_KEY);

    await openTab(page);
    const row = group(page, APP_KEY).locator(`[data-record-id="${id}"]`);
    await expect(row).toBeVisible();
    await expect(row).toContainText("Rascunho");
    // The seeded registo is still in the same group, with the new one beneath it.
    await expect(group(page, APP_KEY).locator(`[data-record-id="${F.appEpisode.recordId}"]`)).toBeVisible();
  });

  test("on an IMPORTED group it files the registo in an OPEN APP episode of the specialty, never the imported one", async ({ page }, testInfo) => {
    await openTab(page);
    const imported = group(page, IMPORTED_KEY);
    await expect(imported.getByTestId("record-row")).toHaveCount(1);

    const dayBefore = lisbonToday();
    const id = await addEvaluation(page, IMPORTED_KEY);
    const dayAfter = lisbonToday();

    await openTab(page);
    // The new registo sits in an APP episode group, never the imported one.
    const row = page.locator(`[data-record-id="${id}"]`);
    await expect(row).toBeVisible();
    const newGroup = page.getByTestId("record-group").filter({ has: row });
    await expect(newGroup).toHaveCount(1);
    await expect(newGroup).toHaveAttribute("data-group-kind", "episode");
    const key = (await newGroup.getAttribute("data-group-key"))!;
    expect(key).toMatch(/^episode:[0-9a-f-]{36}$/);
    expect(key).not.toBe(APP_KEY);
    const title = (await newGroup.locator("summary").innerText()).match(/Osteopatia \((\d{2}\/\d{2}\/\d{4})\)/);
    expect(title, "the group is labelled with the specialty and a date").not.toBeNull();
    // R31: an open Osteopatia episode an earlier run (or a retry) opened is
    // REUSED, and keeps the day it was opened. Only an episode this click opened
    // (it holds this registo and no other) must carry today's Lisbon date.
    if ((await newGroup.getByTestId("record-row").count()) === 1) {
      expect([dayBefore, dayAfter]).toContain(title![1]);
    }
    await expect(newGroup.locator("summary")).not.toContainText("Importado");

    // The imported group is exactly as it was: one registo, still imported.
    await expect(imported.getByTestId("record-row")).toHaveCount(1);
    await expect(imported.locator(`[data-record-id="${F.imported.recordId}"]`)).toBeVisible();
    await expect(imported.locator("summary")).toContainText("Importado");

    await testInfo.attach("EPI-01b-add-1280", {
      path: await shot(page, testInfo.outputPath("EPI-01b-add-1280.png")),
      contentType: "image/png",
    });

    // The episode itself: open, titled with the specialty and the date, holding the registo.
    await page.goto(`/clinical/episodes/${key.slice("episode:".length)}`);
    await expect(page.getByRole("heading", { name: `Osteopatia (${title![1]})` })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Aberto", { exact: true })).toBeVisible();
    await expect(page.locator(`a[href="/clinical/${id}"]`)).toBeVisible();
  });
});

test.describe("EPI-01b R31: two clicks on an imported group, ONE episode (therapist)", () => {
  test.use({ storageState: STORAGE.therapist, viewport: { width: 1280, height: 900 } });

  const TAB_R = `/patients/${R.patientId}?tab=registos`;
  const KEY_R = `imported:${R.imported.specialty}`;
  const appGroups = (page: Page) => page.locator('[data-testid="record-group"][data-group-kind="episode"]');

  test("two separate submissions, the second from a page loaded before the first: both registos are in ONE app episode of the specialty", async ({
    page,
    context,
  }) => {
    // Two tabs on the same Registos tab, BOTH loaded before any click. The
    // second is stale by the time it is clicked: it was drawn when the patient
    // had (on a fresh database) no app episode at all.
    await page.goto(TAB_R);
    await expect(group(page, KEY_R)).toBeVisible({ timeout: 15_000 });
    await expect(group(page, KEY_R).getByRole("button", { name: importedLabel(R.imported.specialty) })).toBeVisible();
    const stale = await context.newPage();
    await stale.goto(TAB_R);
    await expect(group(stale, KEY_R)).toBeVisible({ timeout: 15_000 });
    const appGroupsOnTheStalePage = await appGroups(stale).count();

    // Click 1, then click 2 on the page that never saw click 1.
    const first = await addEvaluation(page, KEY_R);
    await expect(appGroups(stale)).toHaveCount(appGroupsOnTheStalePage); // still the old drawing
    const second = await addEvaluation(stale, KEY_R);
    expect(second).not.toBe(first);
    await stale.close();

    // The patient has exactly ONE app episode, of the specialty, holding BOTH.
    await page.goto(TAB_R);
    await expect(group(page, KEY_R)).toBeVisible({ timeout: 15_000 });
    await expect(appGroups(page)).toHaveCount(1);
    const one = appGroups(page);
    await expect(one.locator("summary")).toContainText(/Fisioterapia \(\d{2}\/\d{2}\/\d{4}\)/);
    await expect(one.locator("summary")).not.toContainText("Importado");
    await expect(one.locator(`[data-record-id="${first}"]`)).toBeVisible();
    await expect(one.locator(`[data-record-id="${second}"]`)).toBeVisible();
    await expect(one.locator(`[data-record-id="${first}"]`)).toContainText("Rascunho");
    await expect(one.locator(`[data-record-id="${second}"]`)).toContainText("Rascunho");
    const key = (await one.getAttribute("data-group-key"))!;
    expect(key).toMatch(/^episode:[0-9a-f-]{36}$/);
    expect(key).not.toBe(`episode:${R.imported.episodeId}`);

    // The imported group is exactly as it was: one registo, still imported, neither new one in it.
    const imported = group(page, KEY_R);
    await expect(imported.getByTestId("record-row")).toHaveCount(1);
    await expect(imported.locator(`[data-record-id="${R.imported.recordId}"]`)).toBeVisible();
    await expect(imported.locator("summary")).toContainText("Importado");
    // And nothing fell into "Sem episódio".
    await expect(group(page, "none")).toHaveCount(0);

    // The episode itself: open, and holding both registos.
    await page.goto(`/clinical/episodes/${key.slice("episode:".length)}`);
    await expect(page.getByRole("heading", { name: /Fisioterapia \(\d{2}\/\d{2}\/\d{4}\)/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Aberto", { exact: true })).toBeVisible();
    await expect(page.locator(`a[href="/clinical/${first}"]`)).toBeVisible();
    await expect(page.locator(`a[href="/clinical/${second}"]`)).toBeVisible();
  });
});

test.describe("EPI-01b: the owner, an author with the tenant's patients, sees it (R4 round 1)", () => {
  test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 900 } });

  test("both kinds of group offer '+ Avaliação' to the owner; 'Sem episódio' does not", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(USERS.owner);
    await page.locator('input[name="password"]').fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /Iniciar sessão/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    await openTab(page);
    await expect(group(page, APP_KEY).getByRole("button", { name: `Nova avaliação neste episódio: ${F.appEpisode.title}` })).toBeVisible();
    await expect(
      group(page, IMPORTED_KEY).getByRole("button", { name: importedLabel(F.imported.specialty) }),
    ).toBeVisible();
    await expect(group(page, "none").locator(`[data-record-id="${F.noEpisode.recordId}"]`)).toBeVisible();
    await expect(group(page, "none").getByTestId("record-group-add-evaluation")).toHaveCount(0);
  });
});

test.describe("EPI-01b: the action is not offered to roles that may not author", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test.describe("admin (the suite's storage state: no clinic, so RLS shows it no registo)", () => {
    test.use({ storageState: STORAGE.admin });

    test("opens the Registos tab, with no '+ Avaliação' and no 'Nova ficha'", async ({ page }) => {
      await page.goto(TAB);
      await expect(page.getByRole("heading", { name: F.patientName })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("tabpanel", { name: "Registos clínicos" })).toBeVisible();
      await expect(addButton(page)).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Nova ficha" })).toHaveCount(0);
    });
  });

  test.describe("admin at the patient's clinic (reads every group)", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("reads the same groups and registos, with no '+ Avaliação'", async ({ page }) => {
      await page.goto("/login");
      await page.locator('input[name="email"]').fill(USERS.adminRevenueLv);
      await page.locator('input[name="password"]').fill(E2E_PASSWORD);
      await page.getByRole("button", { name: /Iniciar sessão/i }).click();
      await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

      await openTab(page);
      // Positive control: this admin really reads the groups a button would sit in.
      await expect(group(page, IMPORTED_KEY).locator(`[data-record-id="${F.imported.recordId}"]`)).toBeVisible();
      await expect(group(page, APP_KEY).locator(`[data-record-id="${F.appEpisode.recordId}"]`)).toBeVisible();
      await expect(group(page, "none").locator(`[data-record-id="${F.noEpisode.recordId}"]`)).toBeVisible();
      await expect(addButton(page)).toHaveCount(0);
    });
  });

  test.describe("reception", () => {
    test.use({ storageState: STORAGE.reception });

    test("opens the ficha, has no Registos tab, and no '+ Avaliação'", async ({ page }) => {
      await page.goto(TAB);
      await expect(page.getByRole("heading", { name: F.patientName })).toBeVisible({ timeout: 15_000 });
      // The tab locator works (Resumo is there); Registos clínicos is not.
      await expect(page.getByRole("tab", { name: "Resumo" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Registos clínicos" })).toHaveCount(0);
      await expect(page.getByTestId("record-group")).toHaveCount(0);
      await expect(addButton(page)).toHaveCount(0);
    });
  });
});

test.describe("EPI-01b: '+ Avaliação' at phone width (therapist, 390 px)", () => {
  test.use({ storageState: STORAGE.therapist, viewport: { width: 390, height: 844 } });

  test("every group's button is on screen and the page does not scroll sideways", async ({ page }, testInfo) => {
    await openTab(page);
    for (const key of [APP_KEY, IMPORTED_KEY]) {
      const button = group(page, key).getByTestId("record-group-add-evaluation");
      await expect(button).toBeVisible();
      const box = (await button.boundingBox())!;
      expect(box.x, `${key}: the button starts on screen`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${key}: the button ends on screen`).toBeLessThanOrEqual(390);
    }
    const p = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(p.scrollWidth, `the page scrolls sideways: ${JSON.stringify(p)}`).toBeLessThanOrEqual(p.clientWidth);
    await testInfo.attach("EPI-01b-add-390", {
      path: await shot(page, testInfo.outputPath("EPI-01b-add-390.png")),
      contentType: "image/png",
    });
  });
});

/** A full-page screenshot written under the test's output dir (uploaded with test-results). */
async function shot(page: Page, path: string): Promise<string> {
  await page.screenshot({ path, fullPage: true });
  return path;
}

test.describe("EXPORT-01, gate G1: the owner exports an imported registo and an imported group", () => {
  test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 900 } });

  test("each has an export action, and each PDF holds the fields the registo's page shows", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(USERS.owner);
    await page.locator('input[name="password"]').fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /Iniciar sessão/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    // THE SCREEN: the imported registo's own page, with its read-only notice and
    // every stored field under its source name.
    await page.goto(`/clinical/${F.imported.recordId}`);
    const preview = page.getByTestId("imported-record-preview");
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).toContainText("Conteúdo importado");
    await expect(preview).toContainText("Apenas leitura.");
    const names = (await preview.locator("dt").allInnerTexts()).map((t) => t.trim());
    const values = (await preview.locator("dd").allInnerTexts()).map((t) => t.trim());
    // Positive control: the seeded content is on the screen, under its vendor names.
    expect(names.sort()).toEqual(["especialidade", "motivos"]);
    expect(values).toContain("Dorsalgia antiga, inventada");
    const notice = squash(await preview.locator("p").first().innerText());

    /** What a downloaded file must hold: the screen's heading, notice, names and values. */
    const holdsTheScreen = async (path: string) => {
      const bytes = readFileSync(path);
      expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      const lines = (await drawnLines(bytes)).flat();
      expect(lines).toContain("Conteúdo importado");
      expect(words(lines)).toContain(notice);
      for (const name of names) expect(lines, name).toContain(name);
      for (const value of values) expect(words(lines), value).toContain(squash(value));
      // Not annulled: no mark.
      expect(lines.filter((line) => line.includes("ANULADO"))).toEqual([]);
    };

    // THE REGISTO'S ACTION: "Transferir PDF" on the imported registo.
    const registoPdf = page.getByTestId("record-export").getByRole("button", { name: "Transferir PDF" });
    await expect(registoPdf).toBeVisible();
    const registoDownloading = page.waitForEvent("download", { timeout: 30_000 });
    await registoPdf.click();
    const registoDownload = await registoDownloading;
    expect(registoDownload.suggestedFilename()).toBe(`relatorio-clinico-${F.imported.recordId.slice(0, 8)}.pdf`);
    expect(await registoDownload.failure()).toBeNull();
    await holdsTheScreen(await registoDownload.path());

    // THE GROUP'S ACTION: "PDF do episódio" on the imported group of the tab.
    await openTab(page);
    const imported = group(page, IMPORTED_KEY);
    await expect(imported.locator(`[data-record-id="${F.imported.recordId}"]`)).toContainText("Bloqueada");
    const groupPdf = imported.getByRole("button", { name: `Transferir o PDF do episódio: ${F.imported.specialty}` });
    await expect(groupPdf).toBeVisible();
    await expect(groupPdf).toHaveText("PDF do episódio");
    const groupDownloading = page.waitForEvent("download", { timeout: 30_000 });
    await groupPdf.click();
    const groupDownload = await groupDownloading;
    expect(groupDownload.suggestedFilename()).toBe(`relatorio-episodio-importado-${F.patientId.slice(0, 8)}.pdf`);
    expect(await groupDownload.failure()).toBeNull();
    await holdsTheScreen(await groupDownload.path());
    await expect(imported.getByTestId("record-group-imported-pdf-error")).toHaveCount(0);
  });

  test("'Exportar ficha' downloads ONE PDF of the whole patient: each group under its heading, oldest first, and no draft", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(USERS.owner);
    await page.locator('input[name="password"]').fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /Iniciar sessão/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    // THE SCREEN: one button on the Registos tab, and, because the tab shows
    // the seeded drafts, the line saying the file leaves drafts out.
    await openTab(page);
    const exportFicha = page.getByTestId("ficha-export");
    await expect(exportFicha).toHaveCount(1);
    await expect(exportFicha).toHaveText("Exportar ficha");
    await expect(page.getByTestId("ficha-export-partial")).toBeVisible();
    // Positive control: the seeded draft is on the tab the file is made from.
    await expect(group(page, APP_KEY).locator(`[data-record-id="${F.appEpisode.recordId}"]`)).toContainText("Rascunho");

    const downloading = page.waitForEvent("download", { timeout: 60_000 });
    await exportFicha.click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(`relatorio-ficha-${F.patientId.slice(0, 8)}.pdf`);
    expect(await download.failure()).toBeNull();
    await expect(page.getByTestId("ficha-export-error")).toHaveCount(0);

    const bytes = readFileSync(await download.path());
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const pages = await drawnLines(bytes);
    const text = pages.map((lines) => words(lines));
    const pageWith = (needle: string) => text.findIndex((t) => t.includes(needle));
    const headingPage = (lines: string[]) => pages.findIndex((p) => p.length === lines.length && p.every((l, i) => l === lines[i]));

    // The imported history is the oldest group: its heading opens the file,
    // and its locked registo follows, printed as its own page shows it.
    expect(pages[0]).toEqual(["Episódio", F.imported.specialty, "Importado"]);
    expect(pageWith("Dorsalgia antiga, inventada")).toBe(1);
    expect(pages[1]).toContain("Conteúdo importado");
    expect(pages[1]).toContain("motivos");
    // The app episode, under its own heading, with its locked registo.
    const appHeading = headingPage(["Episódio", F.appEpisode.title]);
    expect(appHeading).toBeGreaterThan(1);
    expect(pageWith("Dor cervical em melhoria, inventada")).toBe(appHeading + 1);
    // The episode's DRAFT is on no page.
    expect(pageWith("Dor cervical ao acordar, inventada")).toBe(-1);
    // Nothing here is annulled: no mark.
    expect(pages.flat().filter((line) => line.includes("ANULADO"))).toEqual([]);
  });
});
